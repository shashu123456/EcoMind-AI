"""AI Confidence Gate service (trust score).

Ownership: S4. Formula locked in app.workflow.stages.TRUST_WEIGHTS:
0.40*prediction_confidence + 0.25*dq_score + 0.20*model_relevance + 0.15*shap_stability.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import (
    ConfidenceGate, DQResult, Model, Prediction, SHAPExplanation, WorkflowRun,
)
from app.workflow.stages import TRUST_WEIGHTS, trust_verdict


def _latest_run_for(db: Session, dataset_id: str) -> WorkflowRun | None:
    return db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()


def _factors(db: Session, dataset_id: str, overrides: dict | None = None):
    oj = overrides or {}

    pred_conf = oj.get("prediction_confidence")
    if pred_conf is None:
        pred = db.query(Prediction).filter(Prediction.dataset_id == dataset_id) \
            .order_by(Prediction.created_at.desc()).first()
        pred_conf = round((pred.confidence or 0.0) * 100, 1) if pred else None

    dq_score = oj.get("dq_score")
    if dq_score is None:
        dq = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
            .order_by(DQResult.ran_at.desc()).first()
        dq_score = round(dq.score, 1) if dq else None

    model_rel = oj.get("model_relevance")
    if model_rel is None:
        best = db.query(Model).filter(Model.dataset_id == dataset_id, Model.is_active.is_(True)) \
            .order_by(Model.created_at.desc()).first()
        if best is None:
            best = db.query(Model).filter(Model.dataset_id == dataset_id) \
                .order_by(Model.created_at.desc()).first()
        model_rel = round((best.metrics or {}).get("r2", 0) * 100, 1) if best else None

    shap_stab = oj.get("shap_stability")
    if shap_stab is None:
        sh = db.query(SHAPExplanation).order_by(SHAPExplanation.created_at.desc()).first()
        shap_stab = None
        if sh and isinstance(sh.global_importance, dict):
            val = sh.global_importance.get("__stability_index")
            if val is not None:
                shap_stab = round(float(val), 1)

    return {
        "prediction_confidence": pred_conf,
        "dq_score": dq_score,
        "model_relevance": model_rel,
        "shap_stability": shap_stab,
    }


def evaluate(db: Session, dataset_id: str, overrides: dict | None = None) -> ConfidenceGate:
    f = _factors(db, dataset_id, overrides)
    present = {k: v for k, v in f.items() if v is not None}
    if not present:
        raise ValueError("No factor data available yet. Run prediction, dq, model and shap stages first.")
    score = sum((present.get(k) or 0.0) * w for k, w in TRUST_WEIGHTS.items() if k in present)
    run = _latest_run_for(db, dataset_id)
    import json as _json
    gate = ConfidenceGate(
        workflow_run_id=run.id if run else None,
        prediction_confidence=f["prediction_confidence"],
        dq_score=f["dq_score"],
        model_relevance=f["model_relevance"],
        shap_stability=f["shap_stability"],
        trust_score=round(score, 1),
        verdict=trust_verdict(score),
        factors=present,
        reasoning=_json.dumps({
            "explanation": "Weighted fusion of prediction confidence, DQ score, model relevance and SHAP stability.",
            "weights": TRUST_WEIGHTS,
            "missing_factors": [k for k in TRUST_WEIGHTS if f[k] is None],
        }),
    )
    db.add(gate)
    db.commit()
    db.refresh(gate)
    return gate


def latest_gate(db: Session, dataset_id: str) -> ConfidenceGate | None:
    return db.query(ConfidenceGate).order_by(ConfidenceGate.created_at.desc()).first()


def gate_payload(g: ConfidenceGate) -> dict:
    reason = g.reasoning
    if isinstance(reason, str):
        try:
            import json as _j
            reason = _j.loads(reason)
        except Exception:
            reason = {"raw": reason}
    return {
        "trust_score": round(float(g.trust_score or 0), 1),
        "verdict": g.verdict,
        "prediction_confidence": g.prediction_confidence,
        "dq_score": g.dq_score,
        "model_relevance": g.model_relevance,
        "shap_stability": g.shap_stability,
        "factors": g.factors or {},
        "reasoning": reason or {},
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "workflow_run_id": g.workflow_run_id,
    }


def confidence_gate_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    gate = evaluate(db, dataset_id, params.get("overrides"))
    output = {"gate": gate_payload(gate)}
    return {"output": output, "confidence": round(float(gate.trust_score or 0) / 100, 2),
            "decision": f"Trust verdict: {gate.verdict} ({gate.trust_score:.1f}/100)"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("confidence_gate")(confidence_gate_stage)