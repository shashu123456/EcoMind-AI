"""Shared dataframe / dataset access helpers.

Single source of truth for reading raw CSVs, reading/writing the processed
copy, JSON-safe serialization, snapshots and target-column inference.

Contract: docs/API_CONTRACT.md ("Dataset I/O conventions").
All values returned to the API must be JSON-safe (no NaN / Inf / numpy
scalars / Timestamps). Use `js_type` before returning floats.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from app.core.config import settings
from app.db.models import Dataset

ENERGY_VALUE_COLUMNS = ("energy_kwh", "energy_consumption_kwh", "kwh", "demand_kw", "power_kw", "energy_kwh_total")
TIMESTAMP_LIKE = ("timestamp", "datetime", "datetime_utc", "measured_at", "reading_time", "date", "time")


# ─────────────────────────────────────────────
# JSON safety
# ─────────────────────────────────────────────
def js_type(v):
    """Convert a value to a JSON-serializable primitive."""
    if v is None:
        return None
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        v2 = float(v)
        return v2 if math.isfinite(v2) else None
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, (np.ndarray,)):
        return v.tolist()
    if isinstance(v, (pd.Series,)):
        return v.map(js_type).tolist()
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, float):
        return float(v)
    if isinstance(v, (tuple, list)):
        return [js_type(x) for x in v]
    if isinstance(v, dict):
        return {str(k): js_type(x) for k, x in v.items()}
    return v


def json_safe(value):
    """Deep convert a nested structure to JSON-safe primitives."""
    return js_type(value)


# ─────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────
def raw_file_path(dataset: Dataset) -> Path:
    if dataset.file_path:
        p = Path(dataset.file_path)
        if p.exists():
            return p
    return settings.sample_dir / "bdg2_energy_30day.csv"


def processed_file_path(dataset_id: str) -> Path:
    return settings.processed_dir / f"{dataset_id}.csv"


def exists_processed(dataset_id: str) -> bool:
    return processed_file_path(dataset_id).exists()


# ─────────────────────────────────────────────
# Read / write
# ─────────────────────────────────────────────
def read_dataset(dataset: Dataset, use_processed: bool = False) -> pd.DataFrame:
    """Load the dataset. If use_processed=True and a processed copy exists, read it."""
    if use_processed and exists_processed(dataset.id):
        return read_csv(processed_file_path(dataset.id))
    return read_csv(raw_file_path(dataset))


def read_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    for c in df.columns:
        if c in TIMESTAMP_LIKE or c.lower().endswith("_at"):
            try:
                df[c] = pd.to_datetime(df[c], errors="coerce")
            except Exception:
                pass
    return df


def save_processed(dataset_id: str, df: pd.DataFrame) -> Path:
    path = processed_file_path(dataset_id)
    df.to_csv(path, index=False)
    return path


# ─────────────────────────────────────────────
# Column helpers
# ─────────────────────────────────────────────
def numeric_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]


def categorical_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in numeric_columns(df)]


def timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for c in df.columns:
        if str(c).lower() in TIMESTAMP_LIKE or pd.api.types.is_datetime64_any_dtype(df[c]):
            return c
    for c in df.columns:
        if str(c).lower().startswith(("timestamp", "time", "date")):
            return c
    return None


def guess_target(df: pd.DataFrame) -> Optional[str]:
    """Best candidate target column (energy value), else most numeric column."""
    for c in df.columns:
        if str(c).lower() in ENERGY_VALUE_COLUMNS and pd.api.types.is_numeric_dtype(df[c]):
            return c
    ts = timestamp_column(df)
    excluded = set()
    if ts:
        excluded.add(ts)
    for c in ("asset_id", "asset_type", "is_anomaly", "id"):
        excluded.add(c)
    numeric = [c for c in numeric_columns(df) if c not in excluded]
    if not numeric:
        return None
    return max(numeric, key=lambda c: float(df[c].abs().mean() or 0))


# ─────────────────────────────────────────────
# Snapshots / previews
# ─────────────────────────────────────────────
def column_stats(df: pd.DataFrame, column: str) -> dict:
    s = df[column]
    base: dict = {
        "name": str(column),
        "dtype": str(s.dtype),
        "null_count": int(s.isnull().sum()),
        "unique_count": int(s.nunique()),
        "sample_values": [js_type(v) for v in s.dropna().head(5).tolist()],
    }
    if pd.api.types.is_numeric_dtype(s):
        try:
            base.update({
                "mean": js_type(float(s.mean())),
                "std": js_type(float(s.std())),
                "min": js_type(float(s.min())),
                "max": js_type(float(s.max())),
                "median": js_type(float(s.median())),
                "q25": js_type(float(s.quantile(0.25))),
                "q75": js_type(float(s.quantile(0.75))),
                "skewness": js_type(float(s.skew())) if s.count() > 2 else None,
                "kurtosis": js_type(float(s.kurt())) if s.count() > 2 else None,
            })
        except Exception:
            pass
    return base


def snapshot(df: pd.DataFrame, max_rows: int = 25) -> dict:
    """Compact JSON-safe summary for before/after transformation snapshots."""
    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": [column_stats(df, c) for c in df.columns][:max_rows],
        "columns_fast": {
            c: {"dtype": str(df[c].dtype), "nulls": int(df[c].isnull().sum()), "nunique": int(df[c].nunique())}
            for c in df.columns[:50]
        },
    }


def preview_payload(df: pd.DataFrame, limit: int = 100, start: int = 0) -> dict:
    """Row-oriented preview payload for the Raw Preview / tables."""
    lim = max(1, min(int(limit), 5000))
    start = max(0, int(start))
    df2 = df.iloc[start:start + lim]
    rows = []
    for _, row in df2.iterrows():
        rows.append({str(c): js_type(row[c]) for c in df.columns})
    return {
        "rows": rows,
        "columns": [{"name": str(c), "data_type": str(dt)} for c, dt in zip(df.columns, df.dtypes)],
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "start": start,
        "limit": lim,
        "returned": len(rows),
    }


def missing_summary(df: pd.DataFrame) -> dict:
    total = len(df)
    missing = {str(c): int(df[c].isnull().sum()) for c in df.columns}
    return {
        "total_rows": total,
        "missing_by_column": missing,
        "rows_with_missing": int(df.isnull().any(axis=1).sum()),
        "missing_cells": int(df.isnull().sum().sum()),
    }


def null_rate(df: pd.DataFrame, column: str) -> float:
    return float(df[column].isnull().mean() or 0.0)