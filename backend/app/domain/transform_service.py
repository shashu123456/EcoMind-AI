"""Transformation stage: turn a raw upload into a modelling-ready frame.

Ownership: S3. Contract: docs/API_CONTRACT.md §3.6.

The stage writes one processed CSV per dataset
(``settings.processed_dir/{dataset_id}.csv``) and every later stage reads that
file rather than the raw upload. There is exactly one derived truth on disk.

Two decisions worth stating, because both were decided against the obvious
alternative:

**Physical units are preserved.** The default applied pipeline normalises,
encodes and derives features; it never rescales ``energy_kwh``. A file of
z-scores would make the anomaly screen report "2.4 kWh" for a spike and the
forecast price a rupee bill off negative energy. Scaling is available, but only
for columns a caller names explicitly (``params.scale_columns``), so a number
that reaches a user-facing rupee or kg figure is a number that came off a meter.

**A step that was not asked for stays ``pending``, and says so.** The old
transformation screen showed five green steps regardless of what ran. Here the
trace records which steps actually changed something, and a caller who enables
aggregation gets a real row count reduction with the grain written down.

Callers may override the applied set::

    {"steps": ["normalization", "encoding", "feature_creation", "aggregation"],
     "grain": ["building_code", "floor_no"],
     "scale_columns": ["power_kw"]}
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from app.core.config import settings
from app.db.models import Dataset
from app.domain.data import json_safe, read_csv, save_processed
from app.domain.dataset_service import audit, load_dataframe
from app.domain.feature_service import AUTO_FEATURES, derive_frame
from app.domain.snapshots import latest_snapshot, snapshot
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

#: Applied in this order when the caller names no steps. Order is not cosmetic:
#: encoding must see tidy values, and features must be derived from normalised
#: timestamps or `hour_of_day` is silently wrong.
DEFAULT_STEPS = ("normalization", "encoding", "feature_creation")
ALL_STEPS = ("normalization", "encoding", "feature_creation", "scaling", "aggregation")

STEP_META = {
    "normalization": (
        "Normalisation",
        "Tidy timestamps to ISO-8601 and trim hierarchy keys so every later "
        "stage parses the same values the same way.",
    ),
    "encoding": (
        "Encoding",
        "Replace low-cardinality text categories with stable integer codes. "
        "Hierarchy keys are identifiers, not categories, and are left readable.",
    ),
    "feature_creation": (
        "Feature Creation",
        "Derive the temporal, lag, rolling and ratio columns the model needs "
        "from the timestamp and the energy target.",
    ),
    "scaling": (
        "Scaling",
        "Rescale the named columns to comparable ranges. Applied only to "
        "columns the caller names: the energy target stays in kWh.",
    ),
    "aggregation": (
        "Aggregation",
        "Roll the readings up to the requested grain. Applied only when a "
        "grain is given, and the grain is recorded in the step output.",
    ),
}

#: Columns that identify an asset. Encoding these would make the drill-down
#: unreadable and would break the anomaly stage's device grouping.
#:
#: `device_category` belongs here even though it looks like a textbook category
#: — it is the only readable statement of what a meter is. Encoding it replaced
#: "hvac"/"lighting"/"meter" with 0/1/2 in the processed copy, and because the
#: value was then an int64 going into a `String` column it landed in SQLite as
#: an eight-byte BLOB, so every label, icon and filter on the anomaly and
#: recommendation pages silently decoded to garbage. `model_service` already
#: treated it as an identifier; this step disagreed with it, and this step was
#: the one with the destructive side effect.
IDENTIFIER_COLUMNS = (
    "building_code",
    "floor_no",
    "room_code",
    "device_code",
    "device_category",
    "device_type",
    "timestamp",
    "datetime",
)

#: Above this many distinct values a text column is not a category, it is an
#: identifier the dataset happens to store as text.
CATEGORY_MAX_CARDINALITY = 32


def _step_result(
    step_key: str,
    order: int,
    status: str,
    *,
    affected: list[str] | None = None,
    rows_changed: int = 0,
    fields: list[dict] | None = None,
    note: str | None = None,
    applied_at: str | None = None,
) -> dict:
    label, purpose = STEP_META[step_key]
    return {
        "step_key": step_key,
        "order": order,
        "label": label,
        "purpose": purpose,
        "status": status,
        "affected_columns": list(affected or []),
        "rows_changed": int(rows_changed),
        "fields": fields or [],
        "note": note,
        "applied_at": applied_at,
    }


def _field(column: str, before, after, unit: str | None = None) -> dict:
    """A single field-level before/after, for the step's change table."""
    changed = False
    try:
        changed = (before != after) and not (pd.isna(before) and pd.isna(after))
    except (TypeError, ValueError):
        changed = before != after
    return {
        "column_name": column,
        "before_value": None if before is None else _scalar(before),
        "after_value": None if after is None else _scalar(after),
        "changed": bool(changed),
        "unit_before": unit,
        "unit_after": unit,
    }


def _scalar(v):
    """A JSON-safe, short scalar for a before/after cell."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        f = float(v)
        return None if pd.isna(f) else round(f, 6)
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat()
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    s = str(v)
    return s if len(s) <= 80 else s[:77] + "..."


# ── steps ────────────────────────────────────────────────────────────────


def _step_normalization(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
    from app.domain.feature_utils import find_ts_column

    out = df.copy()
    fields: list[dict] = []
    rows_changed = 0
    ts_col = find_ts_column(out)

    if ts_col:
        before = out[ts_col].astype(str)
        parsed = pd.to_datetime(out[ts_col], errors="coerce")
        if parsed.notna().any():
            tidy = parsed.dt.strftime("%Y-%m-%dT%H:%M:%S")
            changed = int((tidy != before).sum())
            out[ts_col] = tidy
            rows_changed += changed
            fields.append(
                _field(
                    ts_col,
                    before.iloc[0] if len(before) else None,
                    tidy.iloc[0] if len(tidy) else None,
                    "ISO-8601",
                )
            )
        else:
            fields.append(_field(ts_col, "unparseable", "unparseable"))

    for col in ("building_code", "floor_no", "room_code", "device_code", "device_category"):
        if col not in out.columns:
            continue
        before_vals = out[col].astype(str)
        tidy = before_vals.str.strip()
        # A hierarchy key that arrived numeric has to be *coerced*, not just
        # trimmed. `floor_no` of 1 is an int64 column whose `astype(str)` is
        # already `"1"` with nothing to strip, so a strip-only check reported no
        # change and never assigned — leaving an int64 in a column every later
        # stage stores in a `String` field. Assigning whenever the dtype is not
        # already object is what stops that.
        was_text = out[col].dtype == object
        changed = int((tidy != before_vals).sum()) + (
            0 if was_text else int(out[col].notna().sum())
        )
        if changed:
            out[col] = tidy
            rows_changed += changed
        fields.append(
            _field(
                col,
                before_vals.iloc[0] if len(before_vals) else None,
                tidy.iloc[0] if len(tidy) else None,
                unit=(f"{out[col].dtype} -> object" if changed else None),
            )
        )

    return out, _step_result(
        "normalization",
        0,
        "done",
        affected=[
            c
            for c in ([ts_col] if ts_col else [])
            + [
                c
                for c in (
                    "building_code",
                    "floor_no",
                    "room_code",
                    "device_code",
                    "device_category",
                )
                if c in out.columns
            ]
        ],
        rows_changed=rows_changed,
        fields=fields,
        note="Already tidy; nothing rewritten." if not rows_changed else None,
    )


def _step_encoding(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
    out = df.copy()
    fields: list[dict] = []
    rows_changed = 0
    affected: list[str] = []

    for col in out.columns:
        if col in IDENTIFIER_COLUMNS:
            continue
        if pd.api.types.is_numeric_dtype(out[col]):
            continue
        values = out[col].dropna().astype(str)
        cardinality = int(values.nunique())
        if cardinality == 0 or cardinality > CATEGORY_MAX_CARDINALITY:
            continue
        before = values.iloc[0] if len(values) else None
        codes = {v: i for i, v in enumerate(sorted(values.unique()))}
        out[col] = out[col].astype(str).map(codes)
        rows_changed += len(out)
        affected.append(col)
        fields.append(_field(col, before, codes.get(before)))

    note = None
    if not affected:
        note = (
            "Every non-numeric column is either an identifier or too "
            "high-cardinality to be a category; nothing to encode."
        )
    return out, _step_result(
        "encoding",
        1,
        "done" if affected else "pending",
        affected=affected,
        rows_changed=rows_changed,
        fields=fields,
        note=note,
    )


def _step_feature_creation(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
    out = derive_frame(df)
    added = [c for c in out.columns if c not in df.columns]
    fields = [_field(c, None, out[c].iloc[0] if len(out) else None) for c in added[:12]]
    note = None
    if not added:
        note = "Target or timestamp missing, so no derived feature could be built."
    return out, _step_result(
        "feature_creation",
        2,
        "done" if added else "pending",
        affected=added,
        rows_changed=int(len(out)) if added else 0,
        fields=fields,
        note=note,
    )


def _step_scaling(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
    """Min-max rescale, restricted to columns the caller named.

    Opt-in on purpose. ``energy_kwh`` in a processed file must stay in kWh,
    because every rupee, kg-CO2 and kWh figure downstream is read straight off
    this file.
    """
    requested = [c for c in (params.get("scale_columns") or []) if c in df.columns]
    if not requested:
        return df.copy(), _step_result(
            "scaling",
            3,
            "pending",
            affected=[],
            note=(
                "Not applied. The energy target is left in kWh so forecast, "
                "anomaly and savings figures stay in physical units. Pass "
                "scale_columns to rescale named columns."
            ),
        )

    out = df.copy()
    fields: list[dict] = []
    changed_rows = 0
    for col in requested:
        s = pd.to_numeric(out[col], errors="coerce")
        lo, hi = float(s.min(skipna=True)), float(s.max(skipna=True))
        if not np.isfinite(lo) or not np.isfinite(hi) or hi == lo:
            fields.append(_field(col, _scalar(lo), _scalar(lo), "constant"))
            continue
        scaled = ((s - lo) / (hi - lo)).round(6)
        out[col] = scaled
        changed_rows += int((s.notna()).sum())
        fields.append(
            _field(
                col,
                _scalar(s.median(skipna=True)),
                _scalar(scaled.median(skipna=True)),
                f"[{lo:g}, {hi:g}] -> [0, 1]",
            )
        )
    return out, _step_result(
        "scaling", 3, "done", affected=requested, rows_changed=changed_rows, fields=fields
    )


def _step_aggregation(df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
    grain = [c for c in (params.get("grain") or []) if c in df.columns]
    if not grain:
        return df.copy(), _step_result(
            "aggregation",
            4,
            "pending",
            affected=[],
            note=(
                "Not applied. Anomalies are found per device, so the default "
                "grain is the metered reading itself. Pass grain to roll up, "
                'e.g. ["building_code", "floor_no"].'
            ),
        )

    ts_col = next((c for c in ("timestamp", "datetime") if c in df.columns), None)
    keys = list(grain) + ([ts_col] if ts_col else [])
    numeric = [c for c in df.columns if c not in keys and pd.api.types.is_numeric_dtype(df[c])]
    other = [c for c in df.columns if c not in keys and c not in numeric]

    rows_in = len(df)
    out = df.groupby(keys, dropna=False, observed=True)
    parts = [out[numeric].mean().round(6)] if numeric else []
    if other:
        parts.append(out[other].first())
    rolled = pd.concat(parts, axis=1).reset_index() if parts else df[keys].drop_duplicates()

    fields = [
        _field(
            c,
            _scalar(df[c].median(skipna=True)),
            _scalar(rolled[c].median(skipna=True)) if c in rolled.columns else None,
            "mean per group",
        )
        for c in numeric[:12]
    ]
    return rolled, _step_result(
        "aggregation",
        4,
        "done",
        affected=list(grain),
        rows_changed=max(0, rows_in - len(rolled)),
        fields=fields,
        note=f"Grouped by {', '.join(keys)}; {rows_in} rows -> {len(rolled)}.",
    )


STEP_FUNCTIONS = {
    "normalization": _step_normalization,
    "encoding": _step_encoding,
    "feature_creation": _step_feature_creation,
    "scaling": _step_scaling,
    "aggregation": _step_aggregation,
}


# ── service ──────────────────────────────────────────────────────────────


def plan_steps(requested: list[str] | None) -> list[str]:
    """Resolve a caller's step list, keeping the canonical order.

    Order is enforced regardless of how the caller listed them: encoding before
    feature creation, scaling before aggregation. A step outside ``ALL_STEPS``
    is dropped rather than guessed at.
    """
    wanted = set(requested) if requested else set(DEFAULT_STEPS)
    return [s for s in ALL_STEPS if s in wanted]


def describe_steps() -> list[dict]:
    """The five steps as the frontend lists them, before anything runs."""
    plan = plan_steps(None)
    return [
        {
            "step_key": key,
            "order": plan.index(key),
            "label": STEP_META[key][0],
            "purpose": STEP_META[key][1],
            "default_applied": key in DEFAULT_STEPS,
        }
        for key in ALL_STEPS
    ]


def apply_transformation(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Run the requested steps, write the processed file, return the result."""
    params = params or {}
    t0 = time.time()
    _, df = load_dataframe(db, dataset_id, use_processed=False)
    rows_in = int(len(df))

    plan = plan_steps(params.get("steps"))
    out = df
    steps: list[dict] = []
    for key in ALL_STEPS:
        if key not in plan:
            steps.append(
                _step_result(
                    key, ALL_STEPS.index(key), "pending", note="Not selected for this run."
                )
            )
            continue
        out, result = STEP_FUNCTIONS[key](out, params)
        result["order"] = ALL_STEPS.index(key)
        result["applied_at"] = datetime.now(timezone.utc).isoformat()
        steps.append(result)

    processed = settings.processed_dir / f"{dataset_id}.csv"
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    # `save_processed`, not a bare to_csv: it also writes the dtype sidecar that
    # stops the CSV round-trip from turning the normalised hierarchy keys back
    # into integers. See `data.read_processed`.
    save_processed(dataset_id, out)

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds:
        ds.column_count = int(out.shape[1])
        ds.status = "ready"

    now = datetime.now(timezone.utc)
    features = [
        {
            "name": name,
            "description": desc,
            "source_columns": list(sources),
            "data_type": str(out[name].dtype) if name in out.columns else "unknown",
            "created_at": now.isoformat(),
        }
        for name, _kind, sources, desc in AUTO_FEATURES
        if name in out.columns
    ]

    result = {
        "dataset_id": dataset_id,
        "steps": steps,
        "features": features,
        "rows_in": rows_in,
        "rows_out": int(len(out)),
        "columns_in": int(df.shape[1]),
        "columns_out": int(out.shape[1]),
        "applied_steps": plan,
        "processed_file": str(processed),
        "applied_at": now.isoformat(),
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
    }
    # The result is snapshotted so the page can show what the last run did
    # without re-deriving it from the file, and so a file that was later
    # overwritten still has the record of what wrote it.
    snapshot(
        db,
        dataset_id,
        "transformation",
        result,
        row_count=result["rows_out"],
        run_id=params.get("run_id"),
    )
    audit(
        db,
        None,
        "execute",
        "transformation",
        dataset_id,
        {"applied_steps": plan, "rows_in": rows_in, "rows_out": result["rows_out"]},
    )
    db.commit()
    return result


def transformation_state(db: Session, dataset_id: str) -> dict:
    """What transformation last produced, for the page and the run detail."""
    processed = settings.processed_dir / f"{dataset_id}.csv"
    stored = latest_snapshot(db, "transformation", dataset_id)
    if stored:
        return {**stored, "status": "complete", "processed_exists": processed.exists()}
    return {
        "dataset_id": dataset_id,
        "status": "not_run",
        "processed_exists": processed.exists(),
        "steps": [],
        "features": [],
        "rows_in": 0,
        "rows_out": 0,
    }


def derived_feature_rows(db: Session, dataset_id: str) -> list[dict]:
    """The derived columns present in the processed file, if it exists."""
    processed = settings.processed_dir / f"{dataset_id}.csv"
    if not processed.exists():
        return []
    df = read_csv(processed)
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for name, _kind, sources, desc in AUTO_FEATURES:
        if name not in df.columns:
            continue
        out.append(
            {
                "name": name,
                "description": desc,
                "source_columns": list(sources),
                "data_type": str(df[name].dtype),
                "created_at": now,
            }
        )
    return out


@register_stage_runner("transformation")
def transformation_stage(run, db: Session, params: dict) -> dict:
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = apply_transformation(db, dataset_id, params)
    result["run_id"] = run.id

    applied = [s["step_key"] for s in result["steps"] if s["status"] == "done"]
    pending = [s["step_key"] for s in result["steps"] if s["status"] != "done"]
    detail = f"{len(result['features'])} derived features"
    if pending:
        detail += f"; {', '.join(pending)} not applied"
    return {
        "output": json_safe(result),
        "confidence": None,
        "decision": (
            f"Transformation wrote {result['rows_out']} of {result['rows_in']} rows "
            f"across {result['columns_out']} columns to the processed file "
            f"({', '.join(applied) or 'no steps'}): {detail}."
        ),
    }
