"""Data Quality Intelligence Engine (primary research contribution).

Ownership: S3. Contract: docs/API_CONTRACT.md §3.5.
Checks: completeness, accuracy, consistency, timeliness, validity. Returns 0-100 overall score.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import DQResult, Dataset
from app.domain.data import column_stats, json_safe
from app.domain.dataset_service import audit

SEMANTIC_BOUNDS = {
    "voltage_v": (200.0, 260.0),
    "power_factor": (0.6, 1.0),
    "humidity_pct": (0.0, 100.0),
    "temperature_c": (-20.0, 60.0),
    "occupancy_count": (0.0, 500.0),
}
DIMENSIONS = ["completeness", "accuracy", "consistency", "timeliness", "validity"]

SEVERITY_ORDER = {"info": 0, "warning": 1, "critical": 2}


def _row_payload(r: DQResult) -> dict:
    return {
        "id": r.id, "dataset_id": r.dataset_id, "rule_name": r.rule_name,
        "rule_category": r.rule_category, "dimension": r.dimension,
        "score": round(float(r.score or 0.0), 1), "details": r.details or {},
        "severity": r.severity, "passed": bool(r.passed),
        "ran_at": r.ran_at.isoformat() if r.ran_at else None,
    }


def run_dq(db: Session, dataset_id: str) -> dict:
    from app.domain.dataset_service import load_dataframe
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    df, _ = load_dataframe(db, dataset_id, use_processed=False) if False else (None, None)
    _, df = (None, load_dataframe(db, dataset_id, use_processed=False)[1])
    df = df.copy()
    t0 = time.time()
    n = len(df)
    results = []

    def add(rule_name, category, dimension, score, details, severity):
        results.append({
            "rule_name": rule_name, "rule_category": category, "dimension": dimension,
            "score": round(float(score), 1), "details": details, "severity": severity,
            "passed": score >= (80 if severity in ("info", "warning") else 70),
        })

    # ── completeness ─────────────────────────────
    nulls = df.isna().sum()
    total_cells = df.shape[0] * df.shape[1]
    null_cells = int(nulls.sum())
    comp = 100.0 * (1 - null_cells / max(total_cells, 1))
    per_col = (100.0 * (1 - nulls / max(n, 1))).to_dict()
    cols_with_nulls = [c for c, v in per_col.items() if v < 100.0]
    add("completeness", "missing_values", "completeness", comp,
        {"null_cells": null_cells, "total_cells": total_cells, "global_null_rate": round(null_cells / max(total_cells, 1), 4),
         "columns_with_gaps": cols_with_nulls,
         "per_column": {c: round(v, 1) for c, v in per_col.items() if v < 100.0}},
        "critical" if comp < 80 else "warning" if comp < 95 else "info")

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
    add("validity_semantic_bounds", "range_check", "validity",
        100.0 * bounds_hits / max(bounds_total, 1),
        {"checked_columns": list(SEMANTIC_BOUNDS.keys()), "total_checked": bounds_total,
         "passing": bounds_hits, "out_of_range": invalid_cols, "bounds": SEMANTIC_BOUNDS},
        "critical" if invalid_cols else "info")

    # ── consistency (duplicates + volatile type mixing) ──
    dup_rows = int(df.duplicated().sum()) if len(df) else 0
    dup_rate = dup_rows / max(n, 1)
    add("consistency_duplicates", "duplicate_detection", "consistency",
        100.0 * (1 - dup_rate),
        {"duplicate_rows": dup_rows, "duplicate_rate": round(dup_rate, 4)},
        "critical" if dup_rate > 0.05 else "warning" if dup_rate > 0.01 else "info")

    # read consistency: monotonicity check on timestamp
    mono_bad = 0
    if "timestamp" in df.columns:
        try:
            ts = pd.to_datetime(df["timestamp"], errors="coerce")
            mono_bad = int((ts.diff().dt.total_seconds() <= 0).sum())
        except Exception:
            pass
    add("consistency_monotonic_timestamps", "temporal_monotonicity", "consistency",
        100.0 if mono_bad == 0 else 100.0 * (1 - mono_bad / max(n, 1)),
        {"non_monotonic_rows": mono_bad}, "warning" if mono_bad else "info")

    # identifier validity
    if "asset_id" in df.columns:
        ids = df["asset_id"].astype(str)
        id_null = int(ids.isin(["", "nan", "None"]).sum())
        id_rate = id_null / max(n, 1)
        add("validity_identifiers", "identifier_check", "validity",
            100.0 * (1 - id_rate),
            {"blank_ids": id_null, "unique_assets": int(ids.nunique())},
            "warning" if id_rate > 0 else "info")

    # ── accuracy (statistical outliers via IQR + zscore) ──
    numeric_cols = [c for c in df.columns
                    if pd.api.types.is_numeric_dtype(df[c]) and not pd.api.types.is_bool_dtype(df[c])]
    outlier_summary = {}
    total_out, total_in = 0, 0
    for col in numeric_cols:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(s) < 10:
            continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        if iqr <= 0:
            continue
        lo, hi = q1 - 3.0 * iqr, q3 + 3.0 * iqr
        bad = int(((s < lo) | (s > hi)).sum())
        total_out += bad
        total_in += int(s.notna().sum())
        if bad:
            outlier_summary[col] = bad
    iqr_rate = total_out / max(total_in, 1)
    add("accuracy_outliers_iqr", "outlier_detection", "accuracy",
        100.0 * (1 - min(iqr_rate, 0.5)),
        {"checked_columns": numeric_cols, "outliers": outlier_summary, "outlier_count": total_out,
         "outlier_rate": round(iqr_rate, 4)}, "warning" if iqr_rate > 0.05 else "info")

    # ts z-score for energy target
    z_bad = 0
    target = "energy_kwh" if "energy_kwh" in df.columns else ("power_kw" if "power_kw" in df.columns else None)
    if target:
        s = pd.to_numeric(df[target], errors="coerce").dropna()
        z = (s - s.mean()).abs() / s.std() if s.std() else pd.Series(0.0, index=s.index)
        z_bad = int((z > 5).sum())
    add("accuracy_zscore", "statistical_outlier", "accuracy",
        100.0 * (1 - z_bad / max(n, 1)),
        {"target_column": target, "extreme_points": z_bad, "threshold": 5.0, "method": "z-score"},
        "warning" if z_bad else "info")

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
                gap_summary = {"median_interval_seconds": float(med),
                               "missed_intervals": missed, "time_range_seconds": float((ts.max() - ts.min()).total_seconds())}
        except Exception:
            pass
    add("timeliness_temporal_gaps", "temporal_gaps", "timeliness",
        100.0 * (1 - gaps_total / max(n, 1)),
        gap_summary or {"note": "no timestamp column"},
        "warning" if gaps_total > n * 0.01 else "info")

    # fixed rules from schema semantic types
    if "voltage_v" in df.columns:
        v = pd.to_numeric(df["voltage_v"], errors="coerce")
        if v.notna().sum() > 0 and v.std() == 0:
            add("sensor_failure_constant", "sensor_health", "accuracy", 30.0,
                {"sensor": "voltage_v", "reason": "constant reading (sensor failure)"}, "critical")

    # persist
    db.query(DQResult).filter(DQResult.dataset_id == dataset_id).delete()
    now = datetime.now(timezone.utc)
    for r in results:
        db.add(DQResult(dataset_id=dataset_id, rule_name=r["rule_name"],
                        rule_category=r["rule_category"], dimension=r["dimension"],
                        score=r["score"], details=r["details"], severity=r["severity"],
                        passed=r["passed"], ran_at=now))
    db.flush()

    by_dim, sev_counts = {}, {}
    for r in results:
        by_dim[r["dimension"]] = round((by_dim.get(r["dimension"], 0) + r["score"]) * 1.0, 1)
        sev_counts[r["severity"]] = sev_counts.get(r["severity"], 0) + 1
    for d in by_dim:
        cnt = sum(1 for r in results if r["dimension"] == d)
        by_dim[d] = round(by_dim[d] / cnt, 1)
    weights = {d: 0.25 for d in DIMENSIONS}
    overall = round(sum(by_dim.get(d, 100.0) * weights[d] for d in DIMENSIONS), 1)
    audit(db, None, "execute", "dq", dataset_id, {"overall_score": overall, "checks": len(results)})
    db.commit()

    stored = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).all()
    return {
        "overall_score": overall,
        "results": [_row_payload(s) for s in stored],
        "passed_count": sum(1 for r in results if r["passed"]),
        "failed_count": sum(1 for r in results if not r["passed"]),
        "by_dimension": {k: round(v, 1) for k, v in by_dim.items()},
        "severity_counts": sev_counts,
        "summary": "Data is high quality." if overall >= 85 else
                   "Data quality is acceptable with a few issues to review." if overall >= 70 else
                   "Data has significant quality issues that may degrade model performance.",
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
        "ran_at": now.isoformat(),
    }


def last_result(db: Session, dataset_id: str) -> dict | None:
    r = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).first()
    if not r:
        return None
    rows = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).all()
    by_dim, sev_counts = {}, {}
    for x in rows:
        by_dim[x.dimension] = by_dim.get(x.dimension, 0) + x.score
        sev_counts[x.severity] = sev_counts.get(x.severity, 0) + 1
    total = sum(by_dim.values())
    cnt = len(by_dim)
    return {"overall_score": round(total / cnt, 1) if cnt else None,
            "results": [_row_payload(x) for x in rows],
            "passed_count": sum(1 for x in rows if x.passed),
            "failed_count": sum(1 for x in rows if not x.passed),
            "by_dimension": {k: round(v, 1) for k, v in by_dim.items()},
            "severity_counts": sev_counts,
            "ran_at": r.ran_at.isoformat() if r.ran_at else None}


def dq_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = run_dq(db, dataset_id)
    return {"output": result, "confidence": round(float(result["overall_score"]) / 100.0, 3),
            "decision": f"DQ overall {result['overall_score']:.1f}/100 ({result['summary']})"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("dq_engine")(dq_stage)