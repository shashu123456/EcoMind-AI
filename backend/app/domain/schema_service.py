"""Schema discovery service.

Ownership: S3. Contract: docs/API_CONTRACT.md §3.4.
"""

from __future__ import annotations

import time

import pandas as pd
from app.db.models import Dataset, SchemaColumn
from app.domain.data import column_stats, json_safe
from app.domain.dataset_service import audit
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session


def _payload(c: SchemaColumn) -> dict:
    return {
        "id": c.id,
        "dataset_id": c.dataset_id,
        "name": c.name,
        "data_type": c.data_type,
        "nullable": bool(c.nullable),
        "unique_count": c.unique_count,
        "null_count": c.null_count,
        "sample_values": json_safe(c.sample_values or []),
        "statistics": json_safe(c.statistics or {}),
        "semantic_type": c.semantic_type,
    }


NORMAL = {"timestamp", "datetime", "date"}
ENERGY = {"energy_kwh", "energy", "power_kw", "power", "load", "meter_reading", "consumption"}
DEVICE = {"asset_id", "device_id", "meter_id", "room", "location", "site", "asset_type"}
THERMAL = {"temperature_c", "temp_c", "temperature", "humidity_pct", "humidity"}


def infer_semantic(name: str) -> str:
    low = name.lower().strip()
    if low in NORMAL or "timestamp" in low or "datetime" in low:
        return "energy_timestamp"
    if low in ENERGY or "kwh" in low or "kw" in low:
        return "energy_value"
    if low in DEVICE or low.startswith("asset"):
        return "device_id"
    if low in THERMAL or "temp" in low or "humid" in low:
        return "temperature"
    return "generic"


def discover(db: Session, dataset_id: str) -> dict:
    from app.domain.dataset_service import load_dataframe

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    _, df = load_dataframe(db, dataset_id, use_processed=False)
    t0 = time.time()
    warnings = []
    columns = []
    drop = set()
    for name in df.columns:
        col = df[name]
        stats = column_stats(df, name)
        n_null = int(stats.get("null_count", 0))
        n_unique = int(stats.get("unique_count", 0))
        data_type = str(col.dtype)
        if pd.api.types.is_datetime64_any_dtype(col.dtype):
            data_type = "datetime"
        elif pd.api.types.is_bool_dtype(col.dtype):
            data_type = "boolean"
        semantic = infer_semantic(name)
        sample = [json_safe(v) for v in col.dropna().head(5).tolist()]
        props = {
            "name": name,
            "data_type": data_type,
            "nullable": n_null > 0,
            "unique_count": n_unique,
            "null_count": n_null,
            "sample_values": sample,
            "statistics": stats,
            "semantic_type": semantic,
        }
        columns.append(props)
        if n_null == len(col):
            drop.add(name)
            warnings.append(f"Column '{name}' is entirely empty and was flagged for removal.")
        if "energy_value" == semantic and stats.get("std") == 0:
            warnings.append(f"Column '{name}' has zero variance (constant sensor output).")

    # Upsert
    existing = {
        c.name: c for c in db.query(SchemaColumn).filter(SchemaColumn.dataset_id == dataset_id)
    }
    for props in columns:
        if props["name"] in existing:
            sc = existing[props["name"]]
            sc.data_type = props["data_type"]
            sc.nullable = props["nullable"]
            sc.unique_count = props["unique_count"]
            sc.null_count = props["null_count"]
            sc.sample_values = props["sample_values"]
            sc.statistics = props["statistics"]
            sc.semantic_type = props["semantic_type"]
        else:
            db.add(SchemaColumn(dataset_id=dataset_id, **props))
    ds.status = "ready"
    audit(
        db,
        None,
        "update",
        "dataset",
        dataset_id,
        {"action": "schema_discovery", "columns": len(columns)},
    )
    db.commit()
    return {
        "columns": json_safe(columns),
        "discovered_at": time.time(),
        "source": "inferred",
        "warnings": warnings,
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
        "dropped_columns": sorted(drop),
    }


def list_schema(db: Session, dataset_id: str):
    rows = (
        db.query(SchemaColumn)
        .filter(SchemaColumn.dataset_id == dataset_id)
        .order_by(SchemaColumn.name.asc())
        .all()
    )
    return {"columns": json_safe([_payload(c) for c in rows])}


@register_stage_runner("schema")
def schema_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = discover(db, dataset_id)
    return {
        "output": result,
        "confidence": None,
        "decision": f"Discovered {len(result['columns'])} columns; {len(result['warnings'])} warnings",
    }
