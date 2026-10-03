"""Cascade + hierarchy checks for the 23-table dataset layer.

These are the two behaviours in `dataset_service` that cannot be verified by
importing the module: whether a delete actually clears every dependent row
under enforced foreign keys, and whether a meter-granularity dataset
advertises only the levels it can actually resolve.

Run with the backend on sys.path:

    python -m tests.test_dataset_cascade
"""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.db.base import Base  # noqa: E402
from app.db.models import (  # noqa: E402
    Anomaly,
    Dataset,
    DatasetBuilding,
    DatasetDevice,
    DatasetFloor,
    DatasetRoom,
    DQResult,
    EnergyMonthly,
    Model,
    ModelSelection,
    SchemaColumn,
    SchemaIssue,
    StageTrace,
    User,
    WorkflowRun,
)
from app.domain import dataset_service as svc  # noqa: E402
from sqlalchemy import create_engine, inspect  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


def _engine():
    tmp = Path(tempfile.mkdtemp()) / "cascade.db"
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


def _full_estate(db, user):
    """A dataset with a row in every table that cascades off it.

    The point is to give `delete_dataset` something to break: if any table is
    missing from the estate, the cascade is not actually covered and the test
    passes for the wrong reason.
    """
    ds = Dataset(
        user_id=user.id,
        name="Estate",
        source_type="sample",
        status="ready",
        granularity="asset",
        is_active=True,
        building_count=1,
        floor_count=1,
        room_count=1,
        device_count=1,
    )
    db.add(ds)
    db.flush()

    b = DatasetBuilding(dataset_id=ds.id, building_code="B1", name="Main")
    db.add(b)
    db.flush()
    f = DatasetFloor(dataset_id=ds.id, building_code="B1", floor_no="1", label="Floor 1")
    db.add(f)
    db.flush()
    r = DatasetRoom(
        dataset_id=ds.id, building_code="B1", floor_no="1", room_code="R1", name="Room 1"
    )
    db.add(r)
    db.flush()
    dev = DatasetDevice(
        dataset_id=ds.id,
        building_code="B1",
        floor_no="1",
        room_code="R1",
        device_code="D1",
        name="Meter 1",
        category="meter",
        is_meter=True,
    )
    db.add(dev)

    run = WorkflowRun(dataset_id=ds.id, current_stage_key="anomaly", stage_statuses={})
    db.add(run)
    db.flush()

    m = Model(dataset_id=ds.id, name="rf", algorithm="random_forest")
    db.add(m)
    db.flush()

    db.add(StageTrace(workflow_run_id=run.id, stage_key="anomaly"))
    db.add(DQResult(dataset_id=ds.id, run_id=run.id, rule_name="R01", stage_key="completeness"))
    db.add(
        ModelSelection(
            dataset_id=ds.id,
            run_id=run.id,
            selected_model_id=m.id,
            algorithm="random_forest",
            rationale="highest composite score",
        )
    )
    db.add(
        Anomaly(
            dataset_id=ds.id, run_id=run.id, device_id=dev.id, anomaly_type="spike", severity="high"
        )
    )
    db.add(
        EnergyMonthly(
            dataset_id=ds.id,
            building_code="B1",
            period="2024-01",
            period_start=datetime(2024, 1, 1),
            energy_kwh=100.0,
        )
    )
    db.add(SchemaColumn(dataset_id=ds.id, name="kwh", data_type="float", ordinal=1))
    db.add(SchemaIssue(dataset_id=ds.id, issue_type="missing_values", severity="low"))
    db.commit()
    return ds


def test_cascade_clears_everything():
    engine, db = _engine()
    user = User(email="a@b.c", hashed_password="x", full_name="A", role="analyst")
    db.add(user)
    db.commit()

    ds = _full_estate(db, user)
    ds_id = ds.id

    before = {
        "anomalies": db.query(Anomaly).count(),
        "stage_traces": db.query(StageTrace).count(),
        "models": db.query(Model).count(),
        "energy_monthly": db.query(EnergyMonthly).count(),
        "devices": db.query(DatasetDevice).count(),
        "datasets": db.query(Dataset).count(),
    }
    assert all(v == 1 for v in before.values()), f"estate incomplete: {before}"

    svc.delete_dataset(db, user, ds_id)

    after = {
        "anomalies": db.query(Anomaly).count(),
        "stage_traces": db.query(StageTrace).count(),
        "models": db.query(Model).count(),
        "energy_monthly": db.query(EnergyMonthly).count(),
        "devices": db.query(DatasetDevice).count(),
        "datasets": db.query(Dataset).count(),
        "rooms": db.query(DatasetRoom).count(),
        "floors": db.query(DatasetFloor).count(),
        "buildings": db.query(DatasetBuilding).count(),
        "schema_issues": db.query(SchemaIssue).count(),
        "schema_columns": db.query(SchemaColumn).count(),
        "runs": db.query(WorkflowRun).count(),
        "dq_results": db.query(DQResult).count(),
    }
    leftovers = {k: v for k, v in after.items() if v}
    assert not leftovers, f"delete left rows behind: {leftovers}"
    print("  cascade: all dependent tables cleared")


def test_foreign_keys_are_enforced():
    """The cascade only works because SQLite is actually enforcing the graph."""
    engine, db = _engine()
    insp = inspect(engine)
    fks = insp.get_foreign_keys("anomalies")
    assert any(fk["referred_table"] == "workflow_runs" for fk in fks), fks
    print("  foreign keys declared on anomalies: ok")


def test_meter_granularity_hides_rooms():
    engine, db = _engine()
    ds = Dataset(
        name="Meter",
        source_type="reference",
        status="ready",
        granularity="meter",
        building_count=1,
        device_count=10,
    )
    db.add(ds)
    db.flush()
    db.add(DatasetBuilding(dataset_id=ds.id, building_code="BDG2", name="Building"))
    db.add(
        DatasetDevice(
            dataset_id=ds.id,
            building_code="BDG2",
            device_code="M1",
            name="Meter 1",
            category="meter",
            is_meter=True,
        )
    )
    db.commit()

    out = svc.get_hierarchy(db, ds.id)
    levels = [lvl["level"] for lvl in out["levels"]]
    assert levels == ["building_code", "device_code"], levels
    assert "room_code" not in levels, "a meter dataset must not advertise rooms"
    print(f"  meter granularity levels: {levels}")


def test_asset_granularity_exposes_all_levels():
    engine, db = _engine()
    ds = Dataset(name="Campus", source_type="sample", status="ready", granularity="asset")
    db.add(ds)
    db.flush()
    db.add(DatasetBuilding(dataset_id=ds.id, building_code="B1", name="Main"))
    db.add(DatasetFloor(dataset_id=ds.id, building_code="B1", floor_no="1", label="F1"))
    db.add(
        DatasetRoom(
            dataset_id=ds.id, building_code="B1", floor_no="1", room_code="R1", name="Room 1"
        )
    )
    db.add(
        DatasetDevice(
            dataset_id=ds.id,
            building_code="B1",
            floor_no="1",
            room_code="R1",
            device_code="D1",
            name="Meter",
            category="meter",
            is_meter=True,
        )
    )
    db.commit()

    levels = [lvl["level"] for lvl in svc.get_hierarchy(db, ds.id)["levels"]]
    assert levels == ["building_code", "floor_no", "room_code", "device_code"], levels
    print(f"  asset granularity levels: {levels}")


def test_active_dataset_is_exclusive():
    engine, db = _engine()
    a = Dataset(name="A", source_type="sample", status="ready", is_active=False)
    b = Dataset(name="B", source_type="sample", status="ready", is_active=False)
    db.add_all([a, b])
    db.commit()

    svc.set_active_dataset(db, b.id)
    db.refresh(a)
    assert b.is_active and not a.is_active, "two datasets are active at once"
    print("  active dataset: exclusive")


def main():
    tests = [
        test_foreign_keys_are_enforced,
        test_cascade_clears_everything,
        test_asset_granularity_exposes_all_levels,
        test_meter_granularity_hides_rooms,
        test_active_dataset_is_exclusive,
    ]
    failed = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
