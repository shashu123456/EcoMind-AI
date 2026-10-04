"""Dataset domain service + library/import stage runners.

Every function here treats the estate as **codes**, not surrogate ids. A reading
carries `building_code` / `floor_no` / `room_code` / `device_code`, so a filter,
a drill-down and a stored anomaly all quote the same four values. Introducing a
second identity (an integer `device_id` meaning the same thing) would mean every
page translating between them, and every translation is a place for the two to
disagree.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from app.core.config import settings
from app.db.models import (
    AnalyticsSnapshot,
    Anomaly,
    Dataset,
    DatasetBuilding,
    DatasetDevice,
    DatasetFloor,
    DatasetRoom,
    DQRepair,
    DQResult,
    EnergyMonthly,
    Forecast,
    Model,
    ModelSelection,
    QualityScore,
    Recommendation,
    Report,
    SchemaColumn,
    SchemaIssue,
    StageTrace,
    User,
    WorkflowRun,
)
from app.domain.data import json_safe, preview_payload, read_csv, read_processed
from app.domain.hierarchy import (
    GRANULARITY_ASSET,
    GRANULARITY_METER,
    HIERARCHY_LEVELS_ASSET,
    LEVEL_LABELS,
    METER_CATEGORY,
    levels_for,
)
from app.workflow.stages import register_stage_runner
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

HIERARCHY_KEYS = HIERARCHY_LEVELS_ASSET


# ─────────────────────────────────────────────
# Payload
# ─────────────────────────────────────────────
def _dataset_payload(ds: Dataset) -> dict:
    """The library's view of a dataset.

    Counts are stored rather than counted at read time: `building_count` is four
    rows in `dataset_buildings`, but the library renders all of them for every
    dataset on every load, and the library is the first page anyone sees.
    """
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "source_type": ds.source_type,
        "file_path": ds.file_path,
        "file_size_bytes": ds.file_size_bytes,
        "row_count": ds.row_count,
        "column_count": ds.column_count,
        "granularity": ds.granularity or GRANULARITY_ASSET,
        "is_active": bool(ds.is_active),
        "building_count": ds.building_count or 0,
        "floor_count": ds.floor_count or 0,
        "room_count": ds.room_count or 0,
        "device_count": ds.device_count or 0,
        "hourly_row_count": ds.hourly_row_count or 0,
        "monthly_row_count": ds.monthly_row_count or 0,
        "defect_rate": ds.defect_rate,
        "anomaly_rate": ds.anomaly_rate,
        "badges": ds.badges or {},
        "provenance": ds.provenance or {},
        "doi": ds.doi,
        "source_url": ds.source_url,
        "license": ds.license,
        "notes": ds.notes,
        "status": ds.status,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
        "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
    }


def summary_payload(ds: Dataset) -> dict:
    return {
        "id": ds.id,
        "name": ds.name,
        "source_type": ds.source_type,
        "granularity": ds.granularity or GRANULARITY_ASSET,
        "row_count": ds.row_count,
        "column_count": ds.column_count,
        "device_count": ds.device_count or 0,
        "status": ds.status,
    }


def audit(
    db: Session, user: User | None, action: str, rtype: str, rid: str, details: dict | None = None
) -> None:
    from app.db.models import AuditLog

    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            resource_type=rtype,
            resource_id=rid,
            details=json_safe(details or {}),
        )
    )


# ─────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────
def list_datasets(db: Session, source_type: str | None = None, user: User | None = None) -> dict:
    q = db.query(Dataset)
    if source_type:
        q = q.filter(Dataset.source_type == source_type)
    datasets = [json_safe(_dataset_payload(d)) for d in q.order_by(Dataset.created_at.desc()).all()]
    return {"datasets": datasets}


def get_dataset(db: Session, dataset_id: str) -> dict:
    ds = _require(db, dataset_id)
    return json_safe(_dataset_payload(ds))


def _require(db: Session, dataset_id: str) -> Dataset:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


def set_active_dataset(db: Session, dataset_id: str) -> dict:
    """Make one dataset the active one.

    The whole journey is scoped to a single dataset: statuses, the selected
    model and every filter belong to it. Clearing the flag on every other row
    here is what makes that invariant enforceable in the database rather than
    only in the browser, where a second tab could otherwise disagree.
    """
    ds = _require(db, dataset_id)
    db.query(Dataset).filter(Dataset.id != dataset_id).update(
        {Dataset.is_active: False}, synchronize_session=False
    )
    ds.is_active = True
    db.commit()
    db.refresh(ds)
    return json_safe(_dataset_payload(ds))


def active_dataset(db: Session) -> dict | None:
    ds = db.query(Dataset).filter(Dataset.is_active.is_(True)).first()
    return json_safe(_dataset_payload(ds)) if ds else None


def register_upload(db: Session, user: User, file: UploadFile) -> dict:
    fname = (file.filename or "upload.csv").lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(422, "Only .csv or .xlsx uploads are supported")

    import io

    raw = file.file.read()
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(422, f"File too large (max {settings.max_upload_mb}MB)")

    ds = Dataset(
        user_id=user.id if user else None,
        name=file.filename or "upload.csv",
        description="Uploaded dataset",
        source_type="upload",
        status="loading",
        granularity=GRANULARITY_ASSET,
        provenance={
            "origin": "User upload",
            "license": "Unknown",
            "collection_method": "Manual upload",
            "temporal_range": "",
            "geographic_scope": "",
            "version": "1.0",
            "citation": "",
        },
    )
    db.add(ds)
    db.flush()

    try:
        df = (
            pd.read_csv(io.BytesIO(raw))
            if fname.endswith(".csv")
            else pd.read_excel(io.BytesIO(raw))
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(422, f"Could not parse file into a table ({exc})")

    if df.empty:
        db.rollback()
        raise HTTPException(422, "Uploaded file is empty")
    if len(df) > settings.max_rows:
        db.rollback()
        raise HTTPException(422, f"Too many rows (max {settings.max_rows})")

    path = settings.uploads_dir / f"{ds.id}.csv"
    df.to_csv(path, index=False)
    ds.file_path = str(path)
    ds.file_size_bytes = path.stat().st_size
    ds.row_count = int(len(df))
    ds.column_count = int(len(df.columns))
    ds.status = "ready"
    _store_hierarchy(db, ds, df)
    audit(db, user, "create", "dataset", ds.id, {"source": "upload", "rows": ds.row_count})
    db.commit()
    db.refresh(ds)
    return json_safe(_dataset_payload(ds))


def delete_dataset(db: Session, user: User | None, dataset_id: str) -> dict:
    """Delete a dataset and everything that was derived from it.

    The order below is not alphabetical and not incidental. `base.py` enables
    `PRAGMA foreign_keys=ON`, so SQLite enforces every relationship in the
    schema, and the schema contains a cycle: `workflow_runs` points at `models`
    for the selected model, while `models` points back at the dataset. A child
    row therefore has to go before the row it references, which means walking
    the graph in dependency order rather than iterating over a list of tables.
    """
    ds = _require(db, dataset_id)

    run_ids = [
        r.id for r in db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id).all()
    ]
    model_ids = [m.id for m in db.query(Model).filter(Model.dataset_id == dataset_id).all()]

    # 1. Anomalies first: they point at the dataset, the run and the device.
    db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id).delete(synchronize_session=False)

    # 2. Anything hanging off a run. StageTrace names the column
    # `workflow_run_id` while every other run-scoped table calls it `run_id`.
    if run_ids:
        db.query(StageTrace).filter(StageTrace.workflow_run_id.in_(run_ids)).delete(
            synchronize_session=False
        )
        for model in (
            DQResult,
            DQRepair,
            QualityScore,
            ModelSelection,
            Forecast,
            Recommendation,
            Report,
            AnalyticsSnapshot,
        ):
            db.query(model).filter(model.run_id.in_(run_ids)).delete(synchronize_session=False)

    # 4. Runs point at models, so they must go first.
    db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id).delete(
        synchronize_session=False
    )

    # 5. Then the models themselves, which the run rows referenced.
    db.query(Model).filter(Model.dataset_id == dataset_id).delete(synchronize_session=False)

    # 6. Run-scoped tables that may hold rows with no run (nullable run_id).
    for model in (
        DQResult,
        DQRepair,
        QualityScore,
        ModelSelection,
        Forecast,
        Recommendation,
        Report,
        AnalyticsSnapshot,
    ):
        db.query(model).filter(model.dataset_id == dataset_id).delete(synchronize_session=False)

    # 7. The estate, deepest level first.
    for model in (DatasetDevice, DatasetRoom, DatasetFloor, DatasetBuilding):
        db.query(model).filter(model.dataset_id == dataset_id).delete(synchronize_session=False)

    # 8. Preparation artefacts.
    db.query(SchemaIssue).filter(SchemaIssue.dataset_id == dataset_id).delete(
        synchronize_session=False
    )
    db.query(SchemaColumn).filter(SchemaColumn.dataset_id == dataset_id).delete(
        synchronize_session=False
    )
    db.query(EnergyMonthly).filter(EnergyMonthly.dataset_id == dataset_id).delete(
        synchronize_session=False
    )

    audit(db, user, "delete", "dataset", dataset_id, {"name": ds.name})
    db.delete(ds)
    db.commit()
    _unlink_files(ds)
    return {"ok": True}


def _unlink_files(ds: Dataset) -> None:
    """Remove files after the row is gone.

    After `db.commit()` the dataset row no longer exists, so it is captured
    before deletion. A file that cannot be removed is left alone: losing the
    database row is the authoritative outcome, and a locked file must not roll
    the transaction back into a state the caller thinks already succeeded.
    """
    for p in (
        Path(ds.file_path) if ds.file_path else None,
        settings.processed_dir / f"{ds.id}.csv",
    ):
        if p and p.exists():
            try:
                p.unlink()
            except OSError:
                pass


def preview_dataset(db: Session, dataset_id: str, limit: int = 100, start: int = 0) -> dict:
    ds = _require(db, dataset_id)
    df = read_csv(_dataset_path(ds))
    return json_safe(preview_payload(df, limit=limit, start=start))


def dataset_content(
    db: Session, dataset_id: str, limit: int = 100, offset: int = 0, fmt: str = "rows"
) -> dict:
    return preview_dataset(db, dataset_id, limit=limit, start=offset)


def refresh_dataset(db: Session, user: User | None, dataset_id: str) -> dict:
    ds = _require(db, dataset_id)
    df = read_csv(_dataset_path(ds))
    ds.row_count = int(len(df))
    ds.column_count = int(len(df.columns))
    path = Path(ds.file_path) if ds.file_path else None
    if path and path.exists():
        ds.file_size_bytes = int(path.stat().st_size)
    ds.status = "ready"
    _store_hierarchy(db, ds, df)
    audit(db, user, "update", "dataset", dataset_id, {"refresh": "file rescanned"})
    db.commit()
    db.refresh(ds)
    return json_safe(_dataset_payload(ds))


# ─────────────────────────────────────────────
# Hierarchy
# ─────────────────────────────────────────────
def _store_hierarchy(db: Session, ds: Dataset, df: pd.DataFrame) -> None:
    """Record the estate described by a reading file.

    Only levels present in the file are stored, and a dataset is rebuilt from
    scratch each time. The alternative — an upsert per level — leaves a stale
    room behind when a file is re-imported without it, and a device that points
    at a room which no longer exists is worse than a missing device.
    """
    present = set(df.columns)
    if not {"building_code", "device_code"} <= present:
        # An upload without the estate columns is a single anonymous asset.
        _store_flat_asset(db, ds, df)
        return

    _clear_hierarchy(db, ds.id)

    building_codes = [str(v) for v in df["building_code"].dropna().unique()]
    for code in building_codes:
        db.add(
            DatasetBuilding(dataset_id=ds.id, building_code=code, name=code, building_type="office")
        )

    if "floor_no" in present:
        floors = df[["building_code", "floor_no"]].drop_duplicates()
        for _, row in floors.iterrows():
            db.add(
                DatasetFloor(
                    dataset_id=ds.id,
                    building_code=str(row.building_code),
                    floor_no=str(row.floor_no),
                    label=f"Floor {row.floor_no}",
                )
            )

    if {"floor_no", "room_code"} <= present:
        rooms = df[["building_code", "floor_no", "room_code"]].drop_duplicates()
        for _, row in rooms.iterrows():
            db.add(
                DatasetRoom(
                    dataset_id=ds.id,
                    building_code=str(row.building_code),
                    floor_no=str(row.floor_no),
                    room_code=str(row.room_code),
                    name=str(row.room_code),
                )
            )

    if "device_code" in present:
        devices = df[["building_code", "floor_no", "room_code", "device_code"]].drop_duplicates()
        for _, row in devices.iterrows():
            db.add(
                DatasetDevice(
                    dataset_id=ds.id,
                    building_code=str(row.building_code),
                    floor_no=str(row.floor_no) if "floor_no" in present else None,
                    room_code=str(row.room_code) if "room_code" in present else None,
                    device_code=str(row.device_code),
                    name=str(row.device_code),
                    category=METER_CATEGORY,
                    is_meter=True,
                )
            )

    ds.building_count = len(building_codes)
    # Sessions are built with autoflush=False, so a query would not see the rows
    # added above. Flush explicitly: without it every count below reads zero and
    # the dataset silently reports itself as a flat meter with no estate.
    db.flush()
    ds.floor_count = int(db.query(DatasetFloor).filter(DatasetFloor.dataset_id == ds.id).count())
    ds.room_count = int(db.query(DatasetRoom).filter(DatasetRoom.dataset_id == ds.id).count())
    ds.device_count = int(db.query(DatasetDevice).filter(DatasetDevice.dataset_id == ds.id).count())
    ds.granularity = GRANULARITY_ASSET if ds.room_count else GRANULARITY_METER


def _store_flat_asset(db: Session, ds: Dataset, df: pd.DataFrame) -> None:
    """Treat an unlabelled upload as one building with one meter."""
    _clear_hierarchy(db, ds.id)
    db.add(
        DatasetBuilding(
            dataset_id=ds.id,
            building_code="SITE-01",
            name=ds.name or "Site",
            building_type="campus",
        )
    )
    db.add(
        DatasetDevice(
            dataset_id=ds.id,
            building_code="SITE-01",
            device_code="METER-01",
            name="Main meter",
            category=METER_CATEGORY,
            is_meter=True,
        )
    )
    ds.building_count = 1
    ds.floor_count = 0
    ds.room_count = 0
    ds.device_count = 1
    ds.granularity = GRANULARITY_METER


def _clear_hierarchy(db: Session, dataset_id: str) -> None:
    for model in (DatasetDevice, DatasetRoom, DatasetFloor, DatasetBuilding):
        db.query(model).filter(model.dataset_id == dataset_id).delete(synchronize_session=False)


def get_hierarchy(db: Session, dataset_id: str) -> dict:
    """The estate, shaped for the drill-down controls.

    `levels` lists only the levels this dataset can actually resolve. A
    meter-level reference dataset returns building and device and nothing
    between them — BDG2 meters whole buildings and has no room instrumentation,
    so offering a room panel would mean inventing rooms. The shell renders
    drill panels straight off this list, so what is absent here is absent from
    the interface.
    """
    ds = _require(db, dataset_id)
    granularity = ds.granularity or GRANULARITY_ASSET

    resolvable = levels_for(granularity)
    # level -> (model holding it, the column that stores the code)
    sources = {
        "building_code": (DatasetBuilding, DatasetBuilding.building_code),
        "floor_no": (DatasetFloor, DatasetFloor.floor_no),
        "room_code": (DatasetRoom, DatasetRoom.room_code),
        "device_code": (DatasetDevice, DatasetDevice.device_code),
    }

    levels: list[dict] = []
    for level in HIERARCHY_LEVELS_ASSET:
        if level not in resolvable:
            continue
        model, column = sources[level]
        values = [
            str(v)
            for (v,) in db.query(column)
            .filter(model.dataset_id == dataset_id)
            .distinct()
            .order_by(column)
            .all()
        ]
        values = [v for v in dict.fromkeys(values) if v not in (None, "")]
        if values:
            levels.append(
                {
                    "level": level,
                    "label": LEVEL_LABELS[level],
                    "values": values,
                    "drillable": level != HIERARCHY_LEVELS_ASSET[-1],
                }
            )

    buildings = (
        db.query(DatasetBuilding)
        .filter(DatasetBuilding.dataset_id == dataset_id)
        .order_by(DatasetBuilding.building_code)
        .all()
    )
    floors = (
        db.query(DatasetFloor)
        .filter(DatasetFloor.dataset_id == dataset_id)
        .order_by(DatasetFloor.floor_no)
        .all()
    )
    rooms = (
        db.query(DatasetRoom)
        .filter(DatasetRoom.dataset_id == dataset_id)
        .order_by(DatasetRoom.room_code)
        .all()
    )
    devices = (
        db.query(DatasetDevice)
        .filter(DatasetDevice.dataset_id == dataset_id)
        .order_by(DatasetDevice.device_code)
        .all()
    )

    # The flat `levels` above answer "which codes exist". They cannot answer
    # "which rooms belong to this building", and a scope control that offers
    # every room in the estate while the user has chosen one building will
    # happily produce a scope that matches nothing. So the tree is built from
    # the same rows and nested properly.
    def _devices_for(building: str, floor: str | None, room: str | None) -> list[dict]:
        out = []
        for d in devices:
            if d.building_code != building:
                continue
            if floor is not None and d.floor_no != floor:
                continue
            if room is not None and d.room_code != room:
                continue
            out.append(
                {
                    "code": d.device_code,
                    "name": d.name,
                    "category": d.category,
                    "rated_kw": d.rated_kw,
                    "is_critical": bool(d.is_critical),
                    "is_meter": bool(d.is_meter),
                }
            )
        return out

    tree = []
    for b in buildings:
        b_floors = []
        for f in [f for f in floors if f.building_code == b.building_code]:
            f_rooms = []
            for r in [
                r
                for r in rooms
                if r.building_code == b.building_code and r.floor_no == f.floor_no
            ]:
                f_rooms.append(
                    {
                        "code": r.room_code,
                        "name": r.name,
                        "room_type": r.room_type,
                        "area_sqm": r.area_sqm,
                        "occupancy_capacity": r.occupancy_capacity,
                        # Devices on a meter may carry no floor/room; those are
                        # attached to the building so they stay reachable rather
                        # than vanishing from the tree.
                        "devices": _devices_for(
                            b.building_code, f.floor_no, r.room_code
                        )
                        or _devices_for(b.building_code, f.floor_no, None),
                    }
                )
            b_floors.append(
                {
                    "floor_no": f.floor_no,
                    "label": f.label,
                    "floor_type": f.floor_type,
                    "area_sqm": f.area_sqm,
                    "rooms": f_rooms,
                    "devices": _devices_for(b.building_code, f.floor_no, None),
                }
            )
        tree.append(
            {
                "code": b.building_code,
                "name": b.name,
                "building_type": b.building_type,
                "gross_area_sqm": b.gross_area_sqm,
                "commissioned_year": b.commissioned_year,
                "rated_kw": b.rated_kw,
                "floors": b_floors,
                "devices": _devices_for(b.building_code, None, None),
            }
        )

    return json_safe(
        {
            "dataset_id": dataset_id,
            "granularity": granularity,
            "levels": levels,
            "buildings": [
                {
                    "code": b.building_code,
                    "name": b.name,
                    "building_type": b.building_type,
                    "gross_area_sqm": b.gross_area_sqm,
                    "commissioned_year": b.commissioned_year,
                    "rated_kw": b.rated_kw,
                    "floors": [
                        {
                            "floor_no": f.floor_no,
                            "label": f.label,
                            "floor_type": f.floor_type,
                            "area_sqm": f.area_sqm,
                        }
                        for f in floors
                        if f.building_code == b.building_code
                    ],
                }
                for b in buildings
            ],
            "tree": tree,
        }
    )


def _dataset_path(ds: Dataset) -> Path:
    """Where this dataset's readings live.

    There is no fallback. The previous version silently returned a bundled
    30-day BDG2 sample when a dataset's own file was missing, which meant a
    broken import looked like a working one — with entirely different numbers.
    """
    if ds.file_path:
        p = Path(ds.file_path)
        if p.exists():
            return p
        raise HTTPException(409, f"Dataset file is missing from disk: {ds.file_path}")
    raise HTTPException(409, "This dataset has no file on disk")


def load_dataframe(
    db: Session, dataset_id: str, use_processed: bool = False
) -> tuple[Dataset, pd.DataFrame]:
    ds = _require(db, dataset_id)
    processed = settings.processed_dir / f"{dataset_id}.csv"
    if use_processed and processed.exists():
        return ds, read_processed(dataset_id)
    return ds, read_csv(_dataset_path(ds))


# ─────────────────────────────────────────────
# Stage runners
# ─────────────────────────────────────────────
@register_stage_runner("library")
def library_stage(run, db: Session, params: dict) -> dict:
    datasets = list_datasets(db)["datasets"]
    return {
        "output": {"datasets": datasets},
        "confidence": None,
        "decision": f"Dataset library contains {len(datasets)} dataset(s).",
    }


@register_stage_runner("import")
def import_stage(run, db: Session, params: dict) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == run.dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    from app.domain.data import column_stats

    df = read_csv(_dataset_path(ds))
    output = {
        **summary_payload(ds),
        "provenance": ds.provenance or {},
        "columns": [column_stats(df, c) for c in df.columns[:20]],
    }
    return {
        "output": json_safe(output),
        "confidence": None,
        "decision": f"Dataset '{ds.name}' ({ds.row_count} rows, {ds.column_count} cols) is ready for the pipeline.",
    }
