"""Model Registry service (promote / deprecate / list).

Ownership: S5 (history_registry runner) + S4 (promote/deprecate). Contract: docs/API_CONTRACT.md §3.20.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import Model, ModelRegistry
from app.domain.data import json_safe


def _entry_payload(e: ModelRegistry) -> dict:
    return {
        "id": e.id, "model_id": e.model_id, "dataset_id": e.dataset_id,
        "version": e.version, "status": e.status,
        "promoted_at": e.promoted_at.isoformat() if e.promoted_at else None,
        "deprecated_at": e.deprecated_at.isoformat() if e.deprecated_at else None,
        "performance_summary": e.performance_summary or {},
        "notes": e.notes or "", "is_current": bool(e.is_current),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def list_entries(db: Session, dataset_id: str | None = None):
    q = db.query(ModelRegistry).order_by(ModelRegistry.created_at.desc())
    if dataset_id:
        q = q.filter(ModelRegistry.dataset_id == dataset_id)
    return {"models": json_safe([_entry_payload(e) for e in q.all()])}


def _get_entry(db: Session, model_id: str) -> ModelRegistry:
    e = db.query(ModelRegistry).filter(ModelRegistry.model_id == model_id).first()
    if not e:
        m = db.query(Model).filter(Model.id == model_id).first()
        if not m:
            raise ValueError(f"Model '{model_id}' not found")
        e = ModelRegistry(model_id=m.id, dataset_id=m.dataset_id, version=m.version,
                          status="staging", performance_summary={
                              "r2": (m.metrics or {}).get("r2"),
                              "rmse": (m.metrics or {}).get("rmse"),
                              "mae": (m.metrics or {}).get("mae"),
                          }, is_current=False)
        db.add(e)
        db.flush()
    return e


def promote(db: Session, model_id: str, notes: str | None = None) -> dict:
    from app.db.models import AuditLog
    e = _get_entry(db, model_id)
    db.query(ModelRegistry).filter(ModelRegistry.dataset_id == e.dataset_id) \
        .update({ModelRegistry.is_current: False})
    e.is_current = True
    e.status = "production"
    e.promoted_at = datetime.now(timezone.utc)
    e.notes = notes or e.notes
    db.add(AuditLog(action="update", resource_type="registry", resource_id=model_id,
                    details={"action": "promote", "dataset_id": e.dataset_id}))
    db.commit()
    db.refresh(e)
    return _entry_payload(e)


def deprecate(db: Session, model_id: str, notes: str | None = None) -> dict:
    from app.db.models import AuditLog
    e = _get_entry(db, model_id)
    e.status = "deprecated"
    e.deprecated_at = datetime.now(timezone.utc)
    if e.is_current:
        e.is_current = False
    e.notes = notes or e.notes
    db.add(AuditLog(action="update", resource_type="registry", resource_id=model_id,
                    details={"action": "deprecate", "dataset_id": e.dataset_id}))
    db.commit()
    db.refresh(e)
    return _entry_payload(e)


def history_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    from app.db.models import WorkflowRun, Report
    runs = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).limit(20).all()
    reports = db.query(Report).filter(Report.dataset_id == dataset_id) \
        .order_by(Report.generated_at.desc()).limit(10).all()
    entries = list_entries(db, dataset_id)["models"]
    output = {
        "runs": [{"id": r.id, "status": r.status, "current_stage": r.current_stage,
                  "stages_completed": r.stages_completed or [],
                  "started_at": r.started_at.isoformat() if r.started_at else None,
                  "completed_at": r.completed_at.isoformat() if r.completed_at else None}
                 for r in runs],
        "reports": [{"id": x.id, "title": x.title, "report_type": x.report_type,
                     "format": x.format, "status": x.status,
                     "generated_at": x.generated_at.isoformat() if x.generated_at else None}
                    for x in reports],
        "registry": entries,
    }
    return {"output": json_safe(output), "confidence": None,
            "decision": f"{len(runs)} runs, {len(reports)} reports, {len(entries)} registry entries"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("history_registry")(history_stage)