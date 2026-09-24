"""Executive intelligence summary service.

Ownership: S4. Contract: docs/API_CONTRACT.md §3.16.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import (
    AIInteraction, Anomaly, DQResult, Model, Prediction, Recommendation,
    SHAPExplanation, User, WorkflowRun,
)
from app.domain.data import json_safe
from app.domain.trust_service import gate_payload, latest_gate


def _cost_cols(df_aware_defaults=None):
    pass


def summary(db: Session, dataset_id: str, actor: User | None = None,
            persist: bool = True) -> dict:
    dq = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).first()
    gate = latest_gate(db, dataset_id)
    model = db.query(Model).filter(Model.dataset_id == dataset_id) \
        .order_by(Model.created_at.desc()).first()
    anomalies = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id).all()
    recs = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id) \
        .order_by(Recommendation.created_at.desc()).limit(10).all()
    preds = db.query(Prediction).filter(Prediction.dataset_id == dataset_id) \
        .order_by(Prediction.created_at.desc()).all()
    shap = db.query(SHAPExplanation).order_by(SHAPExplanation.created_at.desc()).first()
    run = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()

    from app.db.models import Benchmark
    bench = db.query(Benchmark).filter(Benchmark.dataset_id == dataset_id) \
        .order_by(Benchmark.created_at.desc()).first()

    totals = sum(float(p.predicted_value or 0) for p in preds)
    carbon = totals * 0.5
    cost = totals * 0.28
    top_rec = recs[0] if recs else None
    recs_sorted = sorted(recs, key=lambda r: 0 if r.priority == "critical" else
                         1 if r.priority == "high" else 2 if r.priority == "medium" else 3)
    top3 = recs_sorted[:3]
    shap_drivers = list((shap.global_importance or {}).keys())[:5] if shap and shap.global_importance \
        else list((model.feature_importances or {}).keys())[:5] if model and model.feature_importances else []

    dq_score = dq.score if dq else None
    verdict = gate.verdict if gate else "unknown"
    trust_score = gate.trust_score if gate else None
    best_name = model.algorithm if model else None
    best_r2 = (model.metrics or {}).get("r2") if model else None
    by_type = {}
    for a in anomalies:
        by_type[a.anomaly_type] = by_type.get(a.anomaly_type, 0) + 1
    savings_kwh = sum(r.estimated_savings_kwh or 0 for r in recs)
    savings_pct = sum(r.estimated_savings_percent or 0 for r in recs)
    leaderboard = (bench.results or {}) if bench else {}

    headline = (f"Trust {trust_score:.0f}/100 ({verdict}) with DQ {dq_score:.0f} "
                f"and best model {best_name or 'n/a'}" if trust_score and dq_score else
                "Run more pipeline stages to unlock the executive summary.")

    out = {
        "headline": headline,
        "trust": {"verdict": verdict, "trust_score": trust_score, "gate": gate_payload(gate) if gate else None},
        "dq_score": dq_score,
        "best_model": {"name": best_name, "r2": best_r2,
                       "metrics": (model.metrics or {}) if model else {}},
        "anomaly_summary": {"total": len(anomalies), "by_type": by_type},
        "recommendations": json_safe([{
            "title": r.title, "category": r.category, "priority": r.priority,
            "savings_kwh": r.estimated_savings_kwh, "savings_percent": r.estimated_savings_percent,
            "confidence": r.confidence, "status": r.status,
        } for r in top3]),
        "total_savings_kwh": round(savings_kwh, 2),
        "total_savings_percent": round(savings_pct, 2),
        "top_recommendation": ({"title": top_rec.title, "category": top_rec.category,
                               "savings_kwh": top_rec.estimated_savings_kwh,
                               "savings_percent": top_rec.estimated_savings_percent} if top_rec else None),
        "shap_drivers": shap_drivers,
        "totals": {"forecast_kwh": round(totals, 2), "co2_kg": round(carbon, 2), "cost": round(cost, 2)},
        "leaderboard": leaderboard,
        "pipeline": {"completed": len(run.stages_completed or []) if run else 0,
                     "total_stages": run.total_stages if run else 17,
                     "status": run.status if run else "not_started"},
    }
    if persist and actor:
        db.add(AIInteraction(user_id=actor.id, dataset_id=dataset_id,
                             workflow_run_id=run.id if run else None,
                             role="system", content="executive_center summary",
                             meta={"summary": json_safe(out)}))
        db.commit()
    return out


def executive_center_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    out = summary(db, dataset_id, persist=False)
    return {"output": out,
            "confidence": round(float(out["trust"]["trust_score"] or 0) / 100.0, 3) if out["trust"]["trust_score"] else None,
            "decision": out["headline"]}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("executive_center")(executive_center_stage)