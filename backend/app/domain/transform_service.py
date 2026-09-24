"""Transformation pipeline service (replay chain: raw + all prior ops).

Ownership: S3. Contract: docs/API_CONTRACT.md §3.6.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Transformation
from app.domain.data import preview_payload, json_safe, read_dataset, save_processed, snapshot
from app.domain.dataset_service import audit

OPS = ("drop_columns", "fill_missing", "encode_categorical", "normalize",
       "outlier_clip", "resample", "rename_columns")


def _payload(t: Transformation) -> dict:
    return {
        "id": t.id, "dataset_id": t.dataset_id, "operation": t.operation,
        "params": t.params or {}, "columns_affected": t.columns_affected or [],
        "rows_affected": t.rows_affected, "before_snapshot": t.before_snapshot or {},
        "after_snapshot": t.after_snapshot or {}, "applied": bool(t.applied),
        "applied_at": t.applied_at.isoformat() if t.applied_at else None,
    }


def _apply_op(df: pd.DataFrame, op: str, params: dict) -> pd.DataFrame:
    p = params or {}
    df = df.copy()
    if op == "drop_columns":
        cols = [c for c in p.get("columns", []) if c in df.columns]
        return df.drop(columns=cols) if cols else df
    if op == "fill_missing":
        strategy = p.get("strategy", "mean")
        cols = p.get("columns")
        target = [c for c in (cols or df.columns) if c in df.columns]
        if strategy in ("mean", "median", "zero"):
            for c in target:
                if pd.api.types.is_numeric_dtype(df[c]):
                    fill = df[c].mean() if strategy == "mean" else df[c].median() if strategy == "median" else 0.0
                    df[c] = df[c].fillna(fill)
                else:
                    df[c] = df[c].fillna("")
        elif strategy == "ffill":
            df[target] = df[target].ffill().bfill()
        return df
    if op == "encode_categorical":
        method = p.get("method", "label")
        cols = [c for c in p.get("columns", []) if c in df.columns]
        s = (df[cols].astype(str))
        for c in cols:
            if method == "onehot":
                dummies = pd.get_dummies(df[c], prefix=c)
                df = pd.concat([df.drop(columns=c), dummies], axis=1)
            else:
                codes, _ = pd.factorize(df[c])
                df[c] = codes
        return df
    if op == "normalize":
        method = p.get("method", "minmax")
        cols = [c for c in p.get("columns", []) if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
        for c in cols:
            s = pd.to_numeric(df[c], errors="coerce")
            if method == "minmax":
                lo, hi = s.min(), s.max()
                df[c] = (s - lo) / (hi - lo) if hi > lo else s
            else:
                m, sd = s.mean(), s.std()
                df[c] = (s - m) / sd if sd > 0 else s
        return df
    if op == "outlier_clip":
        method = p.get("method", "iqr")
        threshold = float(p.get("threshold", 3.0))
        cols = [c for c in p.get("columns", []) if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
        for c in cols:
            s = pd.to_numeric(df[c], errors="coerce")
            if method == "iqr":
                q1, q3 = s.quantile(0.25), s.quantile(0.75)
                lo, hi = q1 - threshold * (q3 - q1), q3 + threshold * (q3 - q1)
            else:
                m, sd = s.mean(), s.std()
                lo, hi = m - threshold * sd, m + threshold * sd
            df[c] = s.clip(lower=lo, upper=hi)
        return df
    if op == "resample":
        rule = p.get("rule", "1h")
        agg = p.get("agg", "mean")
        ts_col = "timestamp" if "timestamp" in df.columns else df.columns[0]
        df[ts_col] = pd.to_datetime(df[ts_col])
        df = df.set_index(ts_col)
        g = {c: (agg if pd.api.types.is_numeric_dtype(df[c]) else "first") for c in df.columns}
        df = df.resample(rule).agg(g).reset_index()
        df[ts_col] = df[ts_col].astype(str)
        return df
    if op == "rename_columns":
        df = df.rename(columns={str(k): str(v) for k, v in (p.get("mapping") or {}).items()})
        return df
    raise ValueError(f"Unsupported operation '{op}'. Choose from {OPS}")


def apply(db: Session, dataset_id: str, operation: str, params: dict | None = None):
    if operation not in OPS:
        raise ValueError(f"Unsupported operation '{operation}'. Choose from {list(OPS)}")
    from app.db.models import Dataset
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    raw = read_dataset(ds)
    t0 = time.time()

    trail = db.query(Transformation).filter(Transformation.dataset_id == dataset_id,
                                            Transformation.applied.is_(True)) \
        .order_by(Transformation.applied_at.asc()).all()
    df = raw.copy()
    for t in trail:
        df = _apply_op(df, t.operation, t.params or {})
    df = _apply_op(df, operation, params or {})

    before = snapshot(raw, 25)
    after = snapshot(df, 25)
    n_before = int(raw.shape[0]); n_after = int(df.shape[0])
    numeric = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    nulls_before = int(raw.isna().sum().sum()) if len(raw.columns) else 0
    nulls_after = int(df.isna().sum().sum()) if len(df.columns) else 0

    from app.domain.data import js_type
    def _jsonable_df(x):
        out = {}
        for c in numeric[:3]:
            s = pd.to_numeric(x[c], errors="coerce")
            out[c] = {"mean": float(s.mean()) if s.notna().any() else None,
                      "std": float(s.std()) if s.std() == s.std() else None}
        return out
    mean_b = _jsonable_df(raw); mean_a = _jsonable_df(df)
    diff = {"rows_changed": n_before - n_after,
            "columns_changed": len([c for c in raw.columns if c not in df.columns])}
    if mean_b and mean_a:
        diff["mean_delta"] = {c: round((mean_a[c]["mean"] or 0) - (mean_b[c]["mean"] or 0), 4)
                              for c in mean_b if c in mean_a and (mean_b[c]["mean"] is not None)}
        diff["std_delta"] = {c: round((mean_a[c]["std"] or 0) - (mean_b[c]["std"] or 0), 4)
                             for c in mean_b if c in mean_a and (mean_b[c]["std"] is not None)}
    diff["nulls_before"] = nulls_before
    diff["nulls_after"] = nulls_after

    save_processed(dataset_id, df)
    row = Transformation(
        dataset_id=dataset_id, operation=operation, params=json_safe(params or {}),
        columns_affected=[c for c in (params or {}).get("columns", []) if c in raw.columns]
        if (params or {}).get("columns") else numeric,
        rows_affected=int(abs(n_before - n_after)) if n_after != n_before else n_after,
        before_snapshot=json_safe(before), after_snapshot=json_safe(after),
        applied=True, applied_at=datetime.now(timezone.utc),
    )
    db.add(row)
    audit(db, None, "execute", "transformation", dataset_id, {"operation": operation, "params": params or {}})
    db.commit()
    db.refresh(row)
    return {"transformation": _payload(row), "diff_summary": diff,
            "preview": preview_payload(df, 100, 0)}


def list_transformations(db: Session, dataset_id: str):
    rows = db.query(Transformation).filter(Transformation.dataset_id == dataset_id) \
        .order_by(Transformation.applied_at.asc()).all()
    return {"transformations": json_safe([_payload(r) for r in rows])}


def transformation_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    op = params.get("operation")
    if not op:
        return {"output": {"transformations": list_transformations(db, dataset_id), "note": "no op given — list only"},
                "confidence": None, "decision": "Listed existing transformations"}
    result = apply(db, dataset_id, op, params.get("params") or {})
    return {"output": result, "confidence": None,
            "decision": f"Applied {op}; {result['diff_summary']['rows_changed']} rows changed"}


from datetime import datetime, timezone
from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("transformation")(transformation_stage)