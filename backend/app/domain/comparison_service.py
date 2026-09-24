"""Raw vs Processed comparison service (the 6th stage research axis).

Ownership: S4. Contract: docs/API_CONTRACT.md §3.13.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import ComparisonChart, Model, RawProcessedComparison, WorkflowRun
from app.domain.data import json_safe
from app.domain.dataset_service import load_dataframe, audit
from app.domain.feature_utils import (
    build_ml_matrix, build_model, metrics_dict, time_ordered_split,
)
from app.domain.model_service import model_payload


def _comparison_payload(c: RawProcessedComparison) -> dict:
    return {
        "id": c.id, "workflow_run_id": c.workflow_run_id,
        "raw_model_id": c.raw_model_id, "processed_model_id": c.processed_model_id,
        "metrics": c.metrics or {}, "improvement": c.improvement or {},
        "feature_count_raw": c.feature_count_raw, "feature_count_processed": c.feature_count_processed,
        "shap_divergence": c.shap_divergence, "conclusion": c.conclusion or "",
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _shap_stability(X, model, y_dummy) -> float:
    try:
        import shap
        ex = shap.TreeExplainer(model)
        sv = ex.shap_values(X.sample(min(200, len(X))))
        if isinstance(sv, list):
            sv = np.mean(sv, axis=0)
        a = np.abs(sv).mean(axis=0)
        order = np.argsort(a)
        corr = np.corrcoef(order.astype(float), np.arange(len(order)))[0, 1]
        return round(float(max(0.0, corr)) * 100, 1) if not np.isnan(corr) else 70.0
    except Exception:
        return 70.0


def run_comparison(db: Session, run: WorkflowRun, params: dict | None = None) -> dict:
    p = params or {}
    dataset_id = p.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    target = p.get("target_column") or "energy_kwh"
    algorithm = p.get("algorithm") or "xgboost"

    _, proc_df = load_dataframe(db, dataset_id, use_processed=True)
    _, raw_df = load_dataframe(db, dataset_id, use_processed=False)

    if target not in proc_df.columns:
        target = "energy_kwh" if "energy_kwh" in proc_df.columns else next(
            (c for c in proc_df.columns if c in ("power_kw", "energy")), None)
        if not target:
            raise ValueError("No usable target column in processed dataset")

    t0 = time.time()
    Xr, yr, fr = build_ml_matrix(raw_df, target, derive=True)
    Xp, yp, fp = build_ml_matrix(proc_df, target, derive=True)
    common = sorted(set(fr).intersection(fp))
    Xr, Xp = Xr[common], Xp[common]

    shared_p = p.get("hyperparameters") or {}
    mr = build_model(algorithm, shared_p)
    mp = build_model(algorithm, shared_p)
    Xr_a, Xr_b, yr_a, yr_b = time_ordered_split(Xr, yr)
    Xp_a, Xp_b, yp_a, yp_b = time_ordered_split(Xp, yp)

    mr.fit(Xr_a, yr_a)
    mp.fit(Xp_a, yp_a)
    m_raw = metrics_dict(yr_b, mr.predict(Xr_b))
    m_proc = metrics_dict(yp_b, mp.predict(Xp_b))

    stab_raw = _shap_stability(Xr, mr, yr)
    stab_proc = _shap_stability(Xp, mp, yp)
    m_raw["shap_stability"] = stab_raw
    m_proc["shap_stability"] = stab_proc

    def delta(key, higher_better=True):
        a, b = m_raw.get(key, 0), m_proc.get(key, 0)
        if a == 0:
            return 0.0
        raw_abs = b - a
        if higher_better:
            return round(raw_abs, 4)
        return round(-(raw_abs) / max(abs(a), 1e-9) * 100, 2)

    improvement = {
        "r2_delta": round(m_proc["r2"] - m_raw["r2"], 4),
        "rmse_delta_pct": delta("rmse"),
        "mae_delta_pct": delta("mae"),
        "mape_delta_pct": delta("mape"),
        "shap_stability_delta": round(stab_proc - stab_raw, 1),
    }

    model_cache = {}
    for tag, X_, y_, m_ in (("raw", Xr, yr, mr), ("processed", Xp, yp, mp)):
        row = Model(
            dataset_id=dataset_id,
            name=f"{tag} model ({algorithm})",
            algorithm=algorithm,
            task_type="regression",
            version=1,
            metrics=m_raw if tag == "raw" else m_proc,
            feature_importances={},
            training_time_seconds=0.0,
            training_rows=int(len(X_)),
            status="trained",
            is_active=False,
        )
        db.add(row)
        db.flush()
        model_cache[tag] = row.id

    divergence = round(abs(stab_raw - stab_proc) + abs(m_raw["r2"] - m_proc["r2"]), 4)
    conclusion = "Processed data produced a superior model." if (m_proc["r2"] > m_raw["r2"] and stab_proc >= stab_raw) else \
        ("Processed data improved predictive accuracy but reduced explanation stability." if m_proc["r2"] > m_raw["r2"] else \
         "Raw data matched or beat cleaned data here -- possible over-cleaning or already-high quality input.")

    comp = RawProcessedComparison(
        workflow_run_id=run.id,
        raw_model_id=model_cache["raw"],
        processed_model_id=model_cache["processed"],
        metrics={"raw": m_raw, "processed": m_proc},
        improvement=improvement,
        feature_count_raw=len(common),
        feature_count_processed=len(common),
        shap_divergence=divergence,
        conclusion=conclusion,
    )
    db.add(comp)
    db.flush()

    metric_keys = ["r2", "rmse", "mae", "mape", "shap_stability"]
    radar = {"labels": metric_keys,
             "series": [{"name": "raw", "data": [round(m_raw.get(k, 0), 3) for k in metric_keys]},
                        {"name": "processed", "data": [round(m_proc.get(k, 0), 3) for k in metric_keys]}]}
    improvement_inverted = {k: -v for k, v in improvement.items()}  # positive = better upward
    bar = {"labels": list(improvement.keys()),
           "series": [{"name": "improvement", "data": [round(v, 3) for v in improvement.values()]}]}
    db.add(ComparisonChart(workflow_run_id=run.id, chart_type="radar", title="Raw vs Processed metrics",
                           data=radar, config={"metrics": metric_keys}, comparison_type="raw_vs_processed"))
    db.add(ComparisonChart(workflow_run_id=run.id, chart_type="bar", title="Improvement delta",
                           data=bar, config={"keys": list(improvement.keys())}, comparison_type="raw_vs_processed"))
    audit(db, None, "execute", "comparison", run.id, {"raw_model": model_cache["raw"],
                                                      "processed_model": model_cache["processed"]})
    db.commit()
    db.refresh(comp)
    return {"comparison": _comparison_payload(comp)}


def get_comparison(db: Session, run_id: str):
    c = db.query(RawProcessedComparison).filter(RawProcessedComparison.workflow_run_id == run_id) \
        .order_by(RawProcessedComparison.created_at.desc()).first()
    return {"comparison": _comparison_payload(c) if c else None}


def charts(db: Session, run_id: str):
    rows = db.query(ComparisonChart).filter(ComparisonChart.workflow_run_id == run_id) \
        .order_by(ComparisonChart.created_at.asc()).all()
    return {"charts": [{"id": r.id, "chart_type": r.chart_type, "title": r.title,
                        "data": r.data or {}, "config": r.config or {},
                        "comparison_type": r.comparison_type} for r in rows]}


def raw_vs_processed_stage(run, db: Session, params: dict):
    result = run_comparison(db, run, params)
    c = result["comparison"]
    imp = c["improvement"]
    return {"output": result,
            "confidence": round(float(max(0.0, min(1.0, 0.5 + imp.get("r2_delta", 0)))), 3),
            "decision": c["conclusion"]}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("raw_vs_processed")(raw_vs_processed_stage)