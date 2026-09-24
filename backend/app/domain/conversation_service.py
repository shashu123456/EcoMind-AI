"""Deterministic rule-based AI assistant (no external LLM).

Ownership: S2. Contract: docs/API_CONTRACT.md §3.17.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import (
    AIInteraction, Anomaly, ConfidenceGate, DQResult, Dataset, Model,
    ModelRegistry, Prediction, Recommendation, SHAPExplanation, StageTrace,
    User, WorkflowRun,
)
from app.domain.data import json_safe


def gather_facts(db: Session, dataset_id: str | None = None) -> dict:
    facts = {
        "dataset_count": db.query(Dataset).count(),
        "anomaly_total": db.query(Anomaly).count(),
        "model_count": db.query(Model).count(),
        "report_count": 0,
        "dataset": None,
        "dq": None,
        "predictions": None,
        "anomalies": None,
        "recommendations": None,
        "shap": None,
        "trust": None,
        "run": None,
    }
    # avoid import-time coupling
    from app.db.models import Report
    facts["report_count"] = db.query(Report).count()

    if not dataset_id:
        ds = db.query(Dataset).order_by(Dataset.created_at.desc()).first()
        if not ds:
            return facts
        dataset_id = ds.id
    facts["dataset"] = dataset_id
    facts["dq"] = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).first()
    facts["predictions"] = db.query(Prediction).filter(Prediction.dataset_id == dataset_id) \
        .order_by(Prediction.created_at.desc()).first()
    facts["anomalies"] = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id) \
        .order_by(Anomaly.created_at.desc()).first()
    facts["recommendations"] = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id) \
        .order_by(Recommendation.created_at.desc()).first()
    facts["shap"] = db.query(SHAPExplanation).order_by(SHAPExplanation.created_at.desc()).first()
    facts["run"] = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()
    from app.domain.trust_service import latest_gate
    facts["trust"] = latest_gate(db, dataset_id)
    return facts


def build_reply(facts: dict, message: str, stage_context: str | None = None) -> str:
    msg = (message or "").lower().strip()
    ctx = (stage_context or "").lower()

    if any(k in msg for k in ("whose", "who are", "your name")):
        return "I'm EcoMind AI's reasoning assistant. I summarize each pipeline stage and can answer questions about your energy datasets, model results, anomalies and recommendations -- all computed locally from your data."

    if any(k in msg for k in ("dq", "quality", "data quality", "score")):
        if facts["dq"]:
            return (f"The latest Data Quality assessment scores {facts['dq'].score:.1f}/100 "
                    f"(dimension {facts['dq'].dimension}, severity {facts['dq'].severity}). "
                    "The DQ engine checks completeness, validity, consistency, timeliness and accuracy per column.")
        return "No DQ assessment yet. Run the DQ Engine stage (POST /datasets/{id}/dq/run) to evaluate data quality."

    if any(k in msg for k in ("anomal", "outlier", "spike")):
        if facts["anomalies"]:
            return (f"Detected anomalies are present -- most recent batch has {facts['anomalies'].score:.0%} mean confidence "
                    "and covers types like energy spikes, phantom load and degradation. Use the Anomaly stage to re-detect, "
                    "then confirm findings to record them.")
        return "No anomalies recorded yet. Run the Anomaly Detection stage to scan for spikes, phantom load and degradation."

    if any(k in msg for k in ("predict", "forecast", "confidence", "trust")):
        g = facts["trust"]
        if g:
            return (f"The AI confidence gate currently reports trust score {g.trust_score:.1f}/100 "
                    f"(verdict: {g.verdict}). Formula: 40% prediction confidence + 25% DQ + 20% model "
                    "relevance + 15% SHAP stability.")
        return "Run the confidence_gate stage for a trust score across prediction, DQ, model and SHAP stability."

    if any(k in msg for k in ("recommend", "saving", "optimiz")):
        if facts["recommendations"]:
            return "Recommendations are available. Check the Recommendations stage for prioritized actions with estimated kWh savings."
        return "No recommendations yet. Run the Recommendation stage to get prioritized, evidence-backed actions."

    if any(k in msg for k in ("shap", "explain", "importance", "why")):
        if facts["shap"]:
            return ("SHAP explanations are computed. The explanation engine attributes each prediction "
                    "to its driving features (e.g. cooling load, occupancy) with a stability index.")
        return "SHAP explanations not computed yet. Run the SHAP stage after training a model."

    if any(k in msg for k in ("next", "what should", "pipeline", "stage", "todo", "steps")):
        order = ["library", "import", "raw_preview", "schema_discovery", "dq_engine", "transformation",
                 "feature_engineering", "prediction", "confidence_gate", "raw_vs_processed", "shap",
                 "anomaly", "benchmarking", "recommendation", "executive_center", "report", "history_registry"]
        done = (facts["run"].stages_completed or []) if facts["run"] else []
        if not done:
            return "No stages executed on this dataset yet. Begin with the library, then import the dataset."
        nxt = next((s for s in order if s not in done), None)
        if nxt:
            return f"The pipeline is at stage #{len(done)}. Next action: run '{nxt}'. You can call exec on that stage."
        return "All 17 stages are done. Generate a report or promote the best model to production in the registry."

    if any(k in msg for k in ("hello", "hi", "hey", "help")):
        return ("Hello! I can explain your data quality score, anomalies, predictions, SHAP drivers, "
                "recommendations and what to do next in the pipeline. Try asking about any of those.")

    if facts["run"]:
        return (f"I don't have a specific answer for that, but here is context: pipeline run "
                f"{len(facts['run'].stages_completed or [])}/17 stages executed on dataset "
                f"{facts['dataset']}. Ask about DQ, anomalies, predictions, recommendations or SHAP.")
    return "I didn't catch that. Ask me about data quality, anomalies, predictions, SHAP, recommendations, or what to do next."


def chat(db: Session, user: User, message: str, dataset_id: str | None = None,
         run_id: str | None = None, stage_context: str | None = None) -> dict:
    facts = gather_facts(db, dataset_id)
    if not dataset_id and facts["dataset"]:
        dataset_id = facts["dataset"]
    reply = build_reply(facts, message, stage_context)
    db.add(AIInteraction(user_id=user.id, dataset_id=dataset_id, workflow_run_id=run_id,
                         role="user", content=message, meta={"stage_context": stage_context}))
    db.add(AIInteraction(user_id=user.id, dataset_id=dataset_id, workflow_run_id=run_id,
                         role="assistant", content=reply, meta={"stage_context": stage_context}))
    db.commit()
    return {"reply": reply, "meta": {"dataset_id": dataset_id, "run_id": run_id, "dataset_count": facts["dataset_count"]}}


def timeline(db: Session, dataset_id: str) -> dict:
    run = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()
    if not run:
        return {"stages": []}
    traces = db.query(StageTrace).filter(StageTrace.workflow_run_id == run.id) \
        .order_by(StageTrace.stage_number.asc()).all()
    return {
        "stages": [
            {
                "id": t.id,
                "stage_number": t.stage_number,
                "stage_name": t.stage_name,
                "status": t.status,
                "decision": t.decision or "",
                "confidence": t.confidence,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "duration_ms": float(t.duration_ms or 0.0),
            }
            for t in traces
        ]
    }