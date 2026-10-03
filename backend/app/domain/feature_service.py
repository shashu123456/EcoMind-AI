"""Feature derivation over a dataframe.

Ownership: S3.

Pure by design: this module takes a dataframe and returns a dataframe. The old
version wrote one `features` row per derived column and exposed
`/api/v1/datasets/{id}/features`, which made a derived column a database row —
so the set of features was a second, separately-maintained truth that could
drift from the columns actually present in the processed file. Now the
transformed dataframe is the only record of what was derived, and the
`feature_utils.build_ml_matrix` contract is what downstream stages read.

`AUTO_FEATURES` stays as the catalogue of what this module derives and why,
which is what the transformation stage reports to the user.
"""

from __future__ import annotations

import pandas as pd
from app.domain.feature_utils import find_ts_column

#: (name, kind, sources, description) — the catalogue the transformation stage
#: shows, so "which derived columns exist and what went into them" is answerable
#: without a features table.
AUTO_FEATURES: list[tuple[str, str, list[str], str]] = [
    ("hour_of_day", "temporal", ["timestamp"], "Hour of day (0-23) extracted from timestamp"),
    ("day_of_week", "temporal", ["timestamp"], "Day of week (0=Monday..6=Sunday)"),
    ("is_weekend", "boolean", ["timestamp"], "1 when the sample falls on a weekend"),
    ("month", "temporal", ["timestamp"], "Calendar month (1-12)"),
    (
        "rolling_mean_24h",
        "numerical",
        ["target", "timestamp"],
        "24-hour trailing mean of the target",
    ),
    ("rolling_std_24h", "numerical", ["target", "timestamp"], "24-hour trailing std of the target"),
    ("lag_1h", "numerical", ["target"], "Target value lagged by one hour"),
    ("diff_1h", "numerical", ["target"], "First difference of the target (t - t-1h)"),
    ("load_factor", "numerical", ["target", "power"], "Load factor = energy / max power per day"),
    ("energy_density", "numerical", ["target", "occupancy"], "Energy per occupant"),
]

TARGET_CANDIDATES = ("energy_kwh", "energy_consumption_kwh", "power_kw")


def target_column(df: pd.DataFrame) -> str | None:
    """First known energy column present, else None (never the timestamp)."""
    for c in TARGET_CANDIDATES:
        if c in df.columns and pd.api.types.is_numeric_dtype(df[c]):
            return c
    return None


def _engineer_one(df: pd.DataFrame) -> pd.DataFrame:
    ts_col = find_ts_column(df)
    target = target_column(df)
    out = df.copy()
    if ts_col:
        t = pd.to_datetime(out[ts_col], errors="coerce")
        out["hour_of_day"] = t.dt.hour
        out["day_of_week"] = t.dt.dayofweek
        out["is_weekend"] = (t.dt.dayofweek >= 5).astype("int64")
        out["month"] = t.dt.month
        if target:
            s = pd.to_numeric(out[target], errors="coerce")
            out["rolling_mean_24h"] = s.rolling(24, min_periods=1).mean()
            out["rolling_std_24h"] = s.rolling(24, min_periods=1).std().fillna(0)
            out["lag_1h"] = s.shift(1)
            out["diff_1h"] = s.diff(1)
            pw = "power_kw" if "power_kw" in out.columns else None
            if pw and pd.api.types.is_numeric_dtype(out[pw]):
                daymax = out.groupby(out[ts_col].astype(str).str[:10])[pw].transform("max")
                out["load_factor"] = (s / daymax).replace([float("inf")], 1.0)
            occ = "occupancy_count" if "occupancy_count" in out.columns else None
            if occ and pd.api.types.is_numeric_dtype(out[occ]):
                out["energy_density"] = s / out[occ].replace(0, 1)
    return out


def derive_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Derive the AUTO_FEATURES catalogue that this frame can support."""
    return _engineer_one(df)


def derived_features(df: pd.DataFrame) -> list[dict]:
    """Which catalogue entries were actually derived, for stage output."""
    return [
        {
            "name": name,
            "feature_type": ftype,
            "source_columns": list(sources),
            "description": desc,
            "derived": name in df.columns,
        }
        for name, ftype, sources, desc in AUTO_FEATURES
    ]


def feature_summary(df: pd.DataFrame) -> dict:
    """Counts + the derived column names, for the transformation stage output."""
    rows = derived_features(df)
    names = [r["name"] for r in rows if r["derived"]]
    return {
        "derived": names,
        "skipped": [r["name"] for r in rows if not r["derived"]],
        "derived_count": len(names),
        "column_count": int(len(df.columns)),
        "catalogue": rows,
    }
