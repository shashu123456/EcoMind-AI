"""Data Quality Intelligence Engine (primary research contribution).

Ownership: S3. Contract: docs/API_CONTRACT.md §3.5.
Checks: completeness, accuracy, consistency, timeliness, validity. Returns 0-100 overall score.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import pandas as pd
from app.db.models import Dataset, DQResult
from app.domain.dataset_service import audit
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

SEMANTIC_BOUNDS = {
    "voltage_v": (200.0, 260.0),
    "power_factor": (0.6, 1.0),
    "humidity_pct": (0.0, 100.0),
    "temperature_c": (-20.0, 60.0),
    "occupancy_count": (0.0, 500.0),
}
DIMENSIONS = ["completeness", "accuracy", "consistency", "timeliness", "validity"]
# Relative importance, deliberately NOT fractions. These are normalised to sum to
# 1.0 inside `_aggregate`. Five dimensions at a hard-coded 0.25 sum to 1.25, which
# inflated every overall score by a quarter before `_clamp` truncated it at 100 —
# a dataset scoring 80 on each dimension reported 100/100 and "Data is high
# quality." Expressing the weights as "these matter equally" means adding a sixth
# dimension cannot silently break the scale again.
DIMENSION_WEIGHTS = {d: 1.0 for d in DIMENSIONS}

SEVERITY_ORDER = {"info": 0, "warning": 1, "critical": 2}

# The score a rule must reach to pass, per severity. A critical rule must also
# have zero violations — see the `add` closure in `run_dq`.
_PASS_THRESHOLD = {"info": 80.0, "warning": 80.0, "critical": 70.0}

# The column that identifies a device in a long-format export. A campus export
# names it `device_code`; `asset_id` is the name the *processed* frame uses, and
# the others appear in the BDG2 reference set and older exports. Reading only
# `asset_id` was a bug: a raw dataset never has that column, so both the
# monotonicity check and the identifier check silently fell through to the
# single-series / no-check branch rather than measuring anything.
DEVICE_KEY_CANDIDATES = ("device_code", "asset_id", "device_id", "meter_id")


def _device_key(df: pd.DataFrame) -> str | None:
    for candidate in DEVICE_KEY_CANDIDATES:
        if candidate in df.columns:
            return candidate
    return None


def _clamp(score) -> float:
    """DQ scores are a 0-100 contract, not a free-floating number.

    Every rule here is written as `100 * (1 - rate)`, which is already in range
    for a rate in 0..1 — but a rate computed from a bad column (an all-empty
    numeric column, a gap count larger than the row count) can fall outside that,
    and an overall score of 119 is not a quality signal, it is a broken one.
    """
    return max(0.0, min(100.0, float(score)))


def _aggregate(scores: list[tuple[str, float]]) -> tuple[dict[str, float], float]:
    """Dimension means and the weighted overall, from (dimension, score) pairs.

    Dimensions are equal-weighted. A dimension with no rules counts as a perfect
    100 rather than being dropped: dropping it would silently re-weight the
    dimensions that did run, so a dataset with no timestamp column would score
    *better* on timeliness for being unchecked.

    The weights are renormalised here rather than trusted to already sum to 1,
    so the overall score is always a true weighted mean of the dimension means.
    A score that is a mean of its parts has to be able to fall when its parts
    fall; before this normalisation the total was 1.25x the mean and then
    clamped, which made anything above 80/100 report a perfect 100.

    Both the fresh run and the last-result read score through here, so the number
    a user sees later is the same number the stage reported when it ran.
    """
    buckets: dict[str, list[float]] = {}
    for dimension, score in scores:
        buckets.setdefault(dimension, []).append(_clamp(score))
    means = {d: round(sum(v) / len(v), 1) for d, v in buckets.items()}
    total_weight = sum(DIMENSION_WEIGHTS.get(d, 0.0) for d in DIMENSIONS)
    if total_weight <= 0:
        total_weight = float(len(DIMENSIONS)) or 1.0
        DIMENSION_WEIGHTS.update({d: 1.0 for d in DIMENSIONS})
    overall = (
        sum(means.get(d, 100.0) * DIMENSION_WEIGHTS.get(d, 0.0) for d in DIMENSIONS) / total_weight
    )
    return means, round(_clamp(overall), 1)


def _summary_for(overall: float) -> str:
    return (
        "Data is high quality."
        if overall >= 85
        else (
            "Data quality is acceptable with a few issues to review."
            if overall >= 70
            else "Data has significant quality issues that may degrade model performance."
        )
    )


def _row_payload(r: DQResult) -> dict:
    return {
        "id": r.id,
        "dataset_id": r.dataset_id,
        "rule_name": r.rule_name,
        "rule_category": r.rule_category,
        "dimension": r.dimension,
        "score": round(float(r.score or 0.0), 1),
        "details": r.details or {},
        "severity": r.severity,
        "passed": bool(r.passed),
        "ran_at": r.ran_at.isoformat() if r.ran_at else None,
    }


def run_dq(db: Session, dataset_id: str) -> dict:
    from app.domain.dataset_service import load_dataframe

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    df = load_dataframe(db, dataset_id, use_processed=False)[1].copy()
    t0 = time.time()
    n = len(df)
    results = []

    def add(rule_name, category, dimension, score, details, severity):
        """Record one rule result.

        `passed` is the score over the severity's threshold, *except* for a
        critical rule, which additionally requires zero violations. A
        rate-threshold alone marked `validity_semantic_bounds` as passed on a
        file containing 378 physically impossible readings — 119 voltages below
        200V, 92 humidities above 100% — because they were 0.35% of the cells and
        the score rounded to a clean 100.0. "Critical" has to mean "none of
        these may exist", otherwise the pass badge is telling a facilities
        manager the opposite of what it looks like.
        """
        score = round(_clamp(score), 1)
        violations = details.get("out_of_range") or details.get("columns_with_gaps")
        clean = not violations
        results.append(
            {
                "rule_name": rule_name,
                "rule_category": category,
                "dimension": dimension,
                "score": score,
                "details": details,
                "severity": severity,
                "passed": (
                    clean
                    if severity == "critical"
                    else score >= _PASS_THRESHOLD.get(severity, 80.0)
                ),
            }
        )

    # ── completeness ─────────────────────────────
    nulls = df.isna().sum()
    total_cells = df.shape[0] * df.shape[1]
    null_cells = int(nulls.sum())
    comp = 100.0 * (1 - null_cells / max(total_cells, 1))
    per_col = (100.0 * (1 - nulls / max(n, 1))).to_dict()
    cols_with_nulls = [c for c, v in per_col.items() if v < 100.0]
    add(
        "completeness",
        "missing_values",
        "completeness",
        comp,
        {
            "null_cells": null_cells,
            "total_cells": total_cells,
            "global_null_rate": round(null_cells / max(total_cells, 1), 4),
            "columns_with_gaps": cols_with_nulls,
            "per_column": {c: round(v, 1) for c, v in per_col.items() if v < 100.0},
        },
        "critical" if comp < 80 else "warning" if comp < 95 else "info",
    )

    df = df.dropna(subset=[c for c in ["timestamp", "energy_kwh"] if c in df.columns]) if n else df

    # ── validity (semantic bounds + types) ────────
    bounds_hits, bounds_total, invalid_cols = 0, 0, {}
    for col, (lo, hi) in SEMANTIC_BOUNDS.items():
        if col not in df.columns:
            continue
        s = pd.to_numeric(df[col], errors="coerce")
        bounds_total += int(s.notna().sum())
        ok = s.between(lo, hi)
        bounds_hits += int(ok.sum())
        bad = int((~ok).sum())
        if bad:
            invalid_cols[col] = bad
    add(
        "validity_semantic_bounds",
        "range_check",
        "validity",
        100.0 * bounds_hits / max(bounds_total, 1),
        {
            "checked_columns": list(SEMANTIC_BOUNDS.keys()),
            "total_checked": bounds_total,
            "passing": bounds_hits,
            "out_of_range": invalid_cols,
            "bounds": SEMANTIC_BOUNDS,
        },
        "critical" if invalid_cols else "info",
    )

    # ── consistency (duplicates + volatile type mixing) ──
    dup_rows = int(df.duplicated().sum()) if len(df) else 0
    dup_rate = dup_rows / max(n, 1)
    add(
        "consistency_duplicates",
        "duplicate_detection",
        "consistency",
        100.0 * (1 - dup_rate),
        {"duplicate_rows": dup_rows, "duplicate_rate": round(dup_rate, 4)},
        "critical" if dup_rate > 0.05 else "warning" if dup_rate > 0.01 else "info",
    )

    # read consistency: monotonicity check on timestamp
    #
    # Checked *per series*, never across the whole file. A campus meter export in
    # long format is one row per device per hour, so the file itself repeats each
    # timestamp once per device. Reading the column as a single series then counts
    # every row after the first in an hour block as a backwards step and reports
    # 3% consistency on a perfectly ordered file — a false accusation, which is
    # worse than no check. The question a facilities manager is actually asking is
    # whether any one meter's readings go backwards, so that is what is measured.
    mono_bad = 0
    series_count = 0
    reading_count = 0
    if "timestamp" in df.columns:
        try:
            ts = pd.to_datetime(df["timestamp"], errors="coerce")
            reading_count = int(ts.notna().sum())
            key_name = _device_key(df)
            key = df[key_name] if key_name else None
            if key is not None:
                # order within each series by the position in the file, so we
                # measure the order the readings arrive in
                grouped = ts.groupby(key, sort=False)
                mono_bad = int(
                    sum(int((g.diff().dt.total_seconds() <= 0).sum()) for _, g in grouped)
                )
                series_count = int(key.nunique())
            else:
                mono_bad = int((ts.diff().dt.total_seconds() <= 0).sum())
                series_count = 1
        except Exception:
            pass
    # The denominator is the number of readings, not the number of series. A
    # series count of 30 with 54 backwards readings scored -80/100 and clamped to
    # zero, which reads as "the timestamps are worthless" when 99.75% of them are
    # perfectly ordered. A rate is bad readings over readings.
    add(
        "consistency_monotonic_timestamps",
        "temporal_monotonicity",
        "consistency",
        100.0 if mono_bad == 0 else 100.0 * (1 - mono_bad / max(reading_count, 1)),
        {
            "non_monotonic_rows": mono_bad,
            "series_checked": series_count,
            "readings_checked": reading_count,
            "grain": "per device series" if series_count > 1 else "single series",
        },
        "warning" if mono_bad else "info",
    )

    # identifier validity
    id_key = _device_key(df)
    if id_key is not None:
        ids = df[id_key].astype(str)
        id_null = int(ids.isin(["", "nan", "None"]).sum())
        id_rate = id_null / max(n, 1)
        add(
            "validity_identifiers",
            "identifier_check",
            "validity",
            100.0 * (1 - id_rate),
            {"blank_ids": id_null, "unique_assets": int(ids.nunique())},
            "warning" if id_rate > 0 else "info",
        )

    # NOTE: statistical outliers (IQR/z-score) are deliberately NOT part of DQ.
    # Outliers are a signal, not a defect — they are scored by the anomaly stage
    # against the adaptive baseline. DQ here covers structural quality only.

    # ── timeliness (temporal gaps) ──
    gap_summary, gaps_total = {}, 0
    if "timestamp" in df.columns and len(df) > 1:
        try:
            ts = pd.to_datetime(df["timestamp"], errors="coerce").sort_values()
            diffs = ts.diff().dt.total_seconds().dropna()
            if len(diffs):
                med = diffs.median() or 3600.0
                missed = int((diffs > med * 1.5).sum())
                gaps_total = missed
                gap_summary = {
                    "median_interval_seconds": float(med),
                    "missed_intervals": missed,
                    "time_range_seconds": float((ts.max() - ts.min()).total_seconds()),
                }
        except Exception:
            pass
    add(
        "timeliness_temporal_gaps",
        "temporal_gaps",
        "timeliness",
        100.0 * (1 - gaps_total / max(n, 1)),
        gap_summary or {"note": "no timestamp column"},
        "warning" if gaps_total > n * 0.01 else "info",
    )

    # fixed rules from schema semantic types
    if "voltage_v" in df.columns:
        v = pd.to_numeric(df["voltage_v"], errors="coerce")
        if v.notna().sum() > 0 and v.std() == 0:
            add(
                "sensor_failure_constant",
                "sensor_health",
                "accuracy",
                30.0,
                {"sensor": "voltage_v", "reason": "constant reading (sensor failure)"},
                "critical",
            )

    # persist
    db.query(DQResult).filter(DQResult.dataset_id == dataset_id).delete()
    now = datetime.now(timezone.utc)
    for r in results:
        db.add(
            DQResult(
                dataset_id=dataset_id,
                rule_name=r["rule_name"],
                rule_category=r["rule_category"],
                dimension=r["dimension"],
                score=r["score"],
                details=r["details"],
                severity=r["severity"],
                passed=r["passed"],
                ran_at=now,
            )
        )
    db.flush()

    by_dim, overall = _aggregate([(r["dimension"], r["score"]) for r in results])
    sev_counts: dict[str, int] = {}
    for r in results:
        sev_counts[r["severity"]] = sev_counts.get(r["severity"], 0) + 1
    audit(db, None, "execute", "dq", dataset_id, {"overall_score": overall, "checks": len(results)})
    db.commit()

    stored = (
        db.query(DQResult)
        .filter(DQResult.dataset_id == dataset_id)
        .order_by(DQResult.ran_at.desc())
        .all()
    )
    return {
        "overall_score": overall,
        "results": [_row_payload(s) for s in stored],
        "passed_count": sum(1 for r in results if r["passed"]),
        "failed_count": sum(1 for r in results if not r["passed"]),
        "by_dimension": by_dim,
        "severity_counts": sev_counts,
        "summary": _summary_for(overall),
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
        "ran_at": now.isoformat(),
    }


def last_result(db: Session, dataset_id: str) -> dict | None:
    """The most recent DQ run for this dataset, or None if it was never checked.

    Rows are grouped by `ran_at` and only the newest group is scored. A dataset
    checked twice has two sets of rows, and scoring both would weight the older
    run equally with the newer one — the number would move because a rule was
    re-evaluated, not because anything about the data changed.
    """
    rows = (
        db.query(DQResult)
        .filter(DQResult.dataset_id == dataset_id)
        .order_by(DQResult.ran_at.desc())
        .all()
    )
    if not rows:
        return None
    ran_at = rows[0].ran_at
    rows = [x for x in rows if x.ran_at == ran_at]

    by_dim, overall = _aggregate([(x.dimension, x.score) for x in rows])
    sev_counts: dict[str, int] = {}
    for x in rows:
        sev_counts[x.severity] = sev_counts.get(x.severity, 0) + 1
    return {
        "overall_score": overall,
        "results": [_row_payload(x) for x in rows],
        "passed_count": sum(1 for x in rows if x.passed),
        "failed_count": sum(1 for x in rows if not x.passed),
        "by_dimension": by_dim,
        "severity_counts": sev_counts,
        "summary": _summary_for(overall),
        "ran_at": ran_at.isoformat() if ran_at else None,
    }


@register_stage_runner("quality")
def quality_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = run_dq(db, dataset_id)
    return {
        "output": result,
        "confidence": round(float(result["overall_score"]) / 100.0, 3),
        "decision": f"DQ overall {result['overall_score']:.1f}/100 ({result['summary']})",
    }

# 3-panel DQ tracking support
# Extended: 3-panel DQ support
def dq_three_panel(db, dataset_id):
    result = last_result(db, dataset_id)
    if not result:
        return {"raw_issues": [], "processing": [], "resolved": [], "by_type": {}, "summary": "No DQ run yet"}
    by_type = {}
    for r in result.get("results", []):
        rule = r.get("rule_name", r.get("rule", ""))
        by_type.setdefault(rule, []).append(r)
    return {
        "raw_issues": [r for r in result.get("results", []) if not r.get("passed")],
        "processing": [],
        "resolved": [],
        "by_type": by_type,
        "summary": result.get("summary", ""),
        "overall_score": result.get("overall_score", 0),
        "ran_at": result.get("ran_at", None),
    }
