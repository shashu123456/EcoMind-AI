"""Activity feed: the audit trail, exposed for the inspector/activity panel.

Every mutating operation (upload, DQ run, transform, baseline generation,
model race, anomaly scan, forecast, recommendation, report, workflow control)
writes an `audit_log` row. This route reads them back newest-first so the UI
activity panel is a projection of the same trail the backend records, never a
separate event store that can drift.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import AuditLog, User

router = APIRouter()


@router.get("")
def list_activity(
    limit: int = Query(50, ge=1, le=500),
    resource_type: str | None = None,
    action: str | None = None,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if action:
        q = q.filter(AuditLog.action == action)
    rows = q.limit(limit).all()
    return {
        "events": [
            {
                "id": r.id,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "details": r.details or {},
                "user_id": r.user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }
