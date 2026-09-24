"""Recommendation engine (rule + evidence based) service.

Ownership: S4. Contract: docs/API_CONTRACT.md §3.12.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import Anomaly, DQResult, Model, Recommendation, SHAPExplanation
from app.domain.data import json_safe
from app.domain.dataset_service import audit

CATEGORIES = ["hvac_optimization", "lighting", "equipment_scheduling",
              "load_shifting", "maintenance", "renewable"]


def _rec_payload(r: Recommendation) -> dict:
    return {
        "id": r.id, "dataset_id": r.dataset_id, "category": r.category,
        "title": r.title, "description": r.description or "",
        "priority": r.priority, "estimated_savings_kwh": r.estimated_savings_kwh or 0.0,
        "estimated_savings_percent": r.estimated_savings_percent or 0.0,
        "confidence": round(float(r.confidence or 0.0), 3), "status": r.status,
        "supporting_evidence": r.supporting_evidence or {},
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def generate(db: Session, dataset_id: str, top_k: int | None = None) -> dict:
    anomalies = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id) \
        .order_by(Anomaly.timestamp.desc()).all()
    dq = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).all()
    model = db.query(Model).filter(Model.dataset_id == dataset_id) \
        .order_by(Model.created_at.desc()).first()
    shap = db.query(SHAPExplanation).order_by(SHAPExplanation.created_at.desc()).first()

    types = {}
    for a in anomalies:
        types[a.anomaly_type] = types.get(a.anomaly_type, 0) + 1
    sev = {}
    for a in anomalies:
        sev[a.severity] = sev.get(a.severity, 0) + 1
    dq_overall = (dq[0].score if dq else None)
    shap_drivers = list((shap.global_importance or {}).keys())[:5] if shap and shap.global_importance else []

    shap_evidence = [{"feature": f, "value": round(float(shap.global_importance.get(f, 0)), 4)} for f in shap_drivers]
    anom_evidence = [{"type": t, "count": c, "score": round(sum(a.score for a in anomalies if a.anomaly_type == t) / max(c, 1), 3)}
                     for t, c in types.items()]

    recs = []

    def add(category, title, desc, priority, savings_kwh, savings_pct, conf, basis, anomaly_score=None, anomalies=None):
        recs.append({
            "dataset_id": dataset_id,
            "category": category,
            "title": title,
            "description": desc,
            "priority": priority,
            "estimated_savings_kwh": round(savings_kwh, 2),
            "estimated_savings_percent": round(savings_pct, 2),
            "confidence": round(min(1.0, conf), 3),
            "status": "pending",
            "supporting_evidence": {
                "basis": basis,
                "anomaly_scores": anom_evidence if anomaly_score else [],
                "shap_top_features": shap_evidence[:3],
                "similar_cases": [],
            },
        })

    spikes = types.get("energy_spike", 0)
    if spikes:
        add("load_shifting", "Shift energy-intensive loads off peak hours",
            f"Interior energy spikes observed ({spikes} events). Moving pre-cooling / heating or EV charging to off-peak reduces peak demand charges.",
            "high" if spikes > 5 else "medium", spikes * 42.0, 3.5 + spikes, 0.92, "energy_spike anomalies: " + str(spikes), anomaly_score=True)

    if types.get("phantom_load", 0) or types.get("night_usage", 0):
        n = types.get("phantom_load", 0) + types.get("night_usage", 0)
        add("equipment_scheduling", "Schedule equipment shutdown during unoccupied hours",
            f"Night-time or phantom load events ({n} detected). Programmatic shutdown of office/misc equipment outside working hours can eliminate wasted draw.",
            "high", n * 30.0, 4.0 + n, 0.9, "phantom_load + night_usage anomalies", anomaly_score=True)

    if types.get("continuous_overconsumption", 0):
        n = types["continuous_overconsumption"]
        add("maintenance", "Inspect high-consumption assets for degradation",
            "A sustained over-consumption signal usually indicates degrading equipment (filters, bearings, refrigerant charge). A maintenance visit prevents efficiency loss.",
            "medium", max(80.0, n * 25.0), 2.0 + n, 0.85, "continuous_overconsumption anomalies", anomaly_score=True)

    has_thermal = bool(dq_overall is not None)  # thermal context available
    if has_thermal:
        add("hvac_optimization", "Optimize HVAC schedule and setpoints",
            "Interior temperature patterns warrant HVAC scheduling review. Occupancy-aware setpoints with night setback typically cut HVAC energy by 10-20%.",
            "medium", 120.0, 7.5, 0.8, "thermal pattern monitoring active")

    has_dq_issues = dq_overall is not None and dq_overall < 85
    if has_dq_issues:
        add("maintenance", "Improve data quality to sharpen analytics",
            f"Data Quality engine scored {dq_overall:.0f}/100. Improving sensor data quality yields more reliable models and insights.",
            "low", 15.0, 0.5, 0.75, f"dq_overall={dq_overall}")

    if shap_drivers and "power_kw" in shap_drivers or (model and (model.feature_importances or {}).get("power_kw")):
        add("renewable", "Evaluate on-site solar to offset peak demand",
            "High correlation between power demand and energy use supports a solar + battery proposition sized from the asset load profile.",
            "low", 200.0, 12.0, 0.6, "shap driver: power_kw / demand sensitivity")

    if not any(sev.get(s, 0) > 0 for s in ("high", "critical")) and not has_dq_issues and not anomalies:
        add("hvac_optimization", "Continue monitoring to validate baselines",
            "Current operations look clean; continue the 4-week baseline capture before committing to retrofits.",
            "low", 0.0, 0.0, 0.7, "no anomalies or DQ issues")

    ordered = sorted(recs, key=lambda r: {"critical": 0, "high": 1, "medium": 2, "low": 3}[r["priority"]])
    rows = [Recommendation(**r) for r in ordered]
    db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id).delete()
    for r in rows:
        db.add(r)
    db.flush()
    audit(db, None, "execute", "recommendation", dataset_id, {"count": len(rows)})
    db.commit()
    db.refresh(rows[0]) if rows else None

    by_category = {}
    for r in rows:
        by_category[r.category] = by_category.get(r.category, 0) + 1
    total_kwh = sum(r.estimated_savings_kwh or 0 for r in rows)
    total_pct = sum(r.estimated_savings_percent or 0 for r in rows)
    return {"recommendations": json_safe([_rec_payload(r) for r in rows]),
            "by_category": by_category,
            "total_savings_kwh": round(total_kwh, 2),
            "total_savings_percent": round(total_pct, 2),
            "top_recommendation": _rec_payload(rows[0]) if rows else None}


def list_recommendations(db: Session, dataset_id: str, limit: int = 100):
    rows = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id) \
        .order_by(Recommendation.created_at.desc()).limit(limit).all()
    by_category = {}
    for r in rows:
        by_category[r.category] = by_category.get(r.category, 0) + 1
    return {"recommendations": json_safe([_rec_payload(r) for r in rows]), "by_category": by_category}


def update_status(db: Session, dataset_id: str, rec_id: str, status: str):
    r = db.query(Recommendation).filter(Recommendation.id == rec_id,
                                        Recommendation.dataset_id == dataset_id).first()
    if not r:
        raise ValueError(f"Recommendation '{rec_id}' not found")
    r.status = status
    db.commit()
    db.refresh(r)
    return _rec_payload(r)


def recommendation_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = generate(db, dataset_id)
    return {"output": result,
            "confidence": float((result["top_recommendation"] or {}).get("confidence", 0.0)),
            "decision": f"{len(result['recommendations'])} recommendations; total est. savings {result['total_savings_kwh']} kWh ({result['total_savings_percent']}%)"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("recommendation")(recommendation_stage)