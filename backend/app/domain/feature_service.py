"""Feature engineering service (auto temporal + lag features).

Ownership: S3. Contract: docs/API_CONTRACT.md §3.7.
"""
from __future__ import annotations

import time

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Dataset, Feature
from app.domain.data import json_safe, read_dataset, save_processed
from app.domain.dataset_service import audit
from app.domain.feature_utils import find_ts_column, derive_features

AUTO_FEATURES = [
    ("hour_of_day", "temporal", ["timestamp"], "Hour of day (0-23) extracted from timestamp"),
    ("day_of_week", "temporal", ["timestamp"], "Day of week (0=Monday..6=Sunday)"),
    ("is_weekend", "boolean", ["timestamp"], "1 when the sample falls on a weekend"),
    ("month", "temporal", ["timestamp"], "Calendar month (1-12)"),
    ("rolling_mean_24h", "numerical", ["target", "timestamp"], "24-hour trailing mean of the target"),
    ("rolling_std_24h", "numerical", ["target", "timestamp"], "24-hour trailing std of the target"),
    ("lag_1h", "numerical", ["target"], "Target value lagged by one hour"),
    ("diff_1h", "numerical", ["target"], "First difference of the target (t - t-1h)"),
    ("load_factor", "numerical", ["target", "power"], "Load factor = energy / max power per day"),
    ("energy_density", "numerical", ["target", "occupancy"], "Energy per occupant"),
]


def _engineer_one(df: pd.DataFrame) -> pd.DataFrame:
    target = next((c for c in ("energy_kwh", "power_kw") if c in df.columns), df.columns[0])
    ts_col = find_ts_column(df)
    out = df.copy()
    if ts_col:
        t = pd.to_datetime(out[ts_col])
        out["hour_of_day"] = t.dt.hour
        out["day_of_week"] = t.dt.dayofweek
        out["is_weekend"] = (t.dt.dayofweek >= 5).astype(int)
        out["month"] = t.dt.month
        if target in out.columns and pd.api.types.is_numeric_dtype(out[target]):
            s = pd.to_numeric(out[target], errors="coerce")
            out["rolling_mean_24h"] = s.rolling(24, min_periods=1).mean()
            out["rolling_std_24h"] = s.rolling(24, min_periods=1).std().fillna(0)
            out["lag_1h"] = s.shift(1)
            out["diff_1h"] = s.diff(1)
        pw = "power_kw" if "power_kw" in out.columns else None
        if pw and pd.api.types.is_numeric_dtype(out[pw]):
            daymax = out.groupby(out[ts_col].astype(str).str[:10])[pw].transform("max")
            out["load_factor"] = (pd.to_numeric(out[target], errors="coerce") / daymax).replace([float("inf")], 1.0)
        occ = "occupancy_count" if "occupancy_count" in out.columns else None
        if occ and pd.api.types.is_numeric_dtype(out[occ]):
            out["energy_density"] = pd.to_numeric(out[target], errors="coerce") / out[occ].replace(0, 1)
    return out


def engineer(db: Session, dataset_id: str, actor_id: str | None = None) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    df = read_dataset(ds)
    t0 = time.time()
    df = _engineer_one(df)
    save_processed(dataset_id, df)

    existing = {f.name for f in db.query(Feature).filter(Feature.dataset_id == dataset_id).all()}
    messages = []
    created = []
    for name, ftype, sources, desc in AUTO_FEATURES:
        if name not in df.columns:
            messages.append(f"skipped '{name}': base column missing")
            continue
        if name in existing:
            continue
        if pd.api.types.is_numeric_dtype(df[name]):
            importance = float(df[name].abs().corr(pd.to_numeric(df[name], errors="coerce")))
            importance = round(min(1.0, max(0.0, importance if importance == importance else 0.0)), 4)
        else:
            importance = 0.0
        f = Feature(dataset_id=dataset_id, name=name, feature_type=ftype,
                    source_columns=json_safe(sources), description=desc,
                    importance_score=importance, created_by=actor_id or "system")
        db.add(f)
        created.append(name)
    audit(db, None, "execute", "feature", dataset_id, {"created": created, "engineered": True})
    db.commit()
    rows = db.query(Feature).filter(Feature.dataset_id == dataset_id).all()
    return {"features": json_safe([_feature_payload(r) for r in rows]),
            "messages": messages + ([f"created {len(created)} new features" ] if created else []),
            "elapsed_ms": (time.time() - t0) * 1000}


def _feature_payload(f: Feature) -> dict:
    return {"id": f.id, "dataset_id": f.dataset_id, "name": f.name,
            "feature_type": f.feature_type, "source_columns": f.source_columns or [],
            "description": f.description, "importance_score": f.importance_score,
            "created_by": f.created_by, "created_at": f.created_at.isoformat() if f.created_at else None}


def list_features(db: Session, dataset_id: str):
    rows = db.query(Feature).filter(Feature.dataset_id == dataset_id).order_by(Feature.name.asc()).all()
    return {"features": json_safe([_feature_payload(r) for r in rows])}


def feature_engineering_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = engineer(db, dataset_id, run.user_id)
    return {"output": result, "confidence": None,
            "decision": f"Engineered {sum(1 for m in result['messages'] if m.startswith('created'))} new features"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("feature_engineering")(feature_engineering_stage)