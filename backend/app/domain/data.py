"""Shared dataframe / dataset access helpers.

Single source of truth for reading raw CSVs, reading/writing the processed
copy, JSON-safe serialization, snapshots and target-column inference.

Contract: docs/API_CONTRACT.md ("Dataset I/O conventions").
All values returned to the API must be JSON-safe (no NaN / Inf / numpy
scalars / Timestamps). Use `js_type` before returning floats.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from app.core.config import settings
from app.db.models import Dataset
from fastapi import HTTPException

ENERGY_VALUE_COLUMNS = (
    "energy_kwh",
    "energy_consumption_kwh",
    "kwh",
    "demand_kw",
    "power_kw",
    "energy_kwh_total",
)
TIMESTAMP_LIKE = (
    "timestamp",
    "datetime",
    "datetime_utc",
    "measured_at",
    "reading_time",
    "date",
    "time",
)


# ─────────────────────────────────────────────
# JSON safety
# ─────────────────────────────────────────────
def js_type(v):
    """Convert a value to a JSON-serializable primitive."""
    if v is None:
        return None
    if isinstance(v, bytes):
        # SQLite hands back BLOB as `bytes` whenever a text column was written
        # from a value pandas typed as bytes rather than str — `device_category`
        # on the processed frame is the one that actually does it. Every other
        # branch below returns `v` unchanged, so a bytes value used to fall
        # straight through `json_safe` and surface as "Object of type bytes is
        # not JSON serializable" from whichever snapshot write happened to be
        # first. Decoding here fixes it once for every caller instead of
        # patching bytes out of each payload.
        return v.decode("utf-8", "replace")
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
    """The dataset's own uploaded file.

    No sample-file fallback. The old version returned
    `sample_dir / "bdg2_energy_30day.csv"` whenever the stored path was missing,
    so a dataset whose file had been deleted silently produced another
    building's numbers — a wrong answer that looked like a right one. A missing
    file is now an error the caller has to see.
    """
    if not dataset.file_path:
        raise HTTPException(409, f"Dataset '{dataset.id}' has no stored file.")
    p = Path(dataset.file_path)
    if not p.exists():
        raise HTTPException(409, f"File for dataset '{dataset.id}' is missing: {p.name}")
    return p


def processed_file_path(dataset_id: str) -> Path:
    return settings.processed_dir / f"{dataset_id}.csv"


def dtypes_file_path(dataset_id: str) -> Path:
    return settings.processed_dir / f"{dataset_id}.dtypes.json"


def exists_processed(dataset_id: str) -> bool:
    return processed_file_path(dataset_id).exists()


# ─────────────────────────────────────────────
# Read / write
# ─────────────────────────────────────────────
def read_dataset(dataset: Dataset, use_processed: bool = False) -> pd.DataFrame:
    """Load the dataset. If use_processed=True and a processed copy exists, read it."""
    if use_processed and exists_processed(dataset.id):
        return read_processed(dataset.id)
    return read_csv(raw_file_path(dataset))


def _coerce_timestamps(df: pd.DataFrame) -> pd.DataFrame:
    for c in df.columns:
        if c in TIMESTAMP_LIKE or c.lower().endswith("_at"):
            try:
                df[c] = pd.to_datetime(df[c], errors="coerce")
            except Exception:
                pass
    return df


def read_csv(path: Path) -> pd.DataFrame:
    """Read a CSV, transparently handling gzip by extension or magic bytes.

    `.csv.gz` uploads are a real input case (meters export gzipped), and pandas
    only picks the gzip reader from the extension — a gzipped upload saved under
    a plain `.csv` name would otherwise raise a bare UnicodeDecodeError.
    """
    p = Path(path)
    gz = p.suffix.lower() == ".gz"
    if not gz and p.exists():
        with open(p, "rb") as fh:
            gz = fh.read(2) == b"\x1f\x8b"
    df = pd.read_csv(p, compression="gzip" if gz else "infer")
    return _coerce_timestamps(df)


def read_processed(dataset_id: str) -> pd.DataFrame:
    """Read a processed file, restoring the column types it was written with.

    CSV carries no types, so pandas re-infers every column on read. A hierarchy
    key normalised to the string `"2"` is written as `2` and comes back as
    int64 — which is how an 8-byte binary blob ended up stored in the
    `floor_no` string column of 639 anomaly rows, and why every one of them
    reported a floor of `\\x02\\x00\\x00...`. The normalisation step had done its
    job; the file format threw the result away on the way out.

    The sidecar written by `save_processed` is the contract that survives the
    round trip, so a processed dataset reads back as the frame that was written
    rather than as pandas' guess at it. A missing sidecar (a file written before
    this existed) degrades to the old behaviour rather than failing.
    """
    path = processed_file_path(dataset_id)
    sidecar = dtypes_file_path(dataset_id)
    dtype: dict[str, str] = {}
    if sidecar.exists():
        try:
            recorded = json.loads(sidecar.read_text(encoding="utf-8"))
            # Only string columns need pinning. Numerics are safe to re-infer, and
            # forcing an int64 column that now holds a float would raise.
            dtype = {k: "string" for k, v in (recorded or {}).items() if v == "object"}
        except Exception:
            dtype = {}
    df = pd.read_csv(path, dtype=dtype or None, low_memory=False)
    for c in list(dtype):
        if c in df.columns:
            df[c] = df[c].astype(object)
    return _coerce_timestamps(df)


def save_processed(dataset_id: str, df: pd.DataFrame) -> Path:
    """Write the processed CSV and the sidecar that records its column types.

    See `read_processed` for why the sidecar is not optional.
    """
    path = processed_file_path(dataset_id)
    df.to_csv(path, index=False)
    try:
        sidecar = {c: str(df[c].dtype) for c in df.columns}
        dtypes_file_path(dataset_id).write_text(json.dumps(sidecar, indent=1), encoding="utf-8")
    except Exception:
        # A missing sidecar costs type fidelity on the next read; failing the
        # whole stage over it would cost the user their transformation.
        pass
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
            base.update(
                {
                    "mean": js_type(float(s.mean())),
                    "std": js_type(float(s.std())),
                    "min": js_type(float(s.min())),
                    "max": js_type(float(s.max())),
                    "median": js_type(float(s.median())),
                    "q25": js_type(float(s.quantile(0.25))),
                    "q75": js_type(float(s.quantile(0.75))),
                    "skewness": js_type(float(s.skew())) if s.count() > 2 else None,
                    "kurtosis": js_type(float(s.kurt())) if s.count() > 2 else None,
                }
            )
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
            c: {
                "dtype": str(df[c].dtype),
                "nulls": int(df[c].isnull().sum()),
                "nunique": int(df[c].nunique()),
            }
            for c in df.columns[:50]
        },
    }


def preview_payload(df: pd.DataFrame, limit: int = 100, start: int = 0) -> dict:
    """Row-oriented preview payload for the Raw Preview / tables."""
    lim = max(1, min(int(limit), 5000))
    start = max(0, int(start))
    df2 = df.iloc[start : start + lim]
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
