"""Data Quality Engine routes. Prefix /api/v1/datasets/{dataset_id}/dq."""

from __future__ import annotations

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.data import json_safe
from app.domain.dq_service import last_result, run_dq
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("/{dataset_id}/dq")
def dq_get(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return json_safe(
        last_result(db, dataset_id)
        or {
            "overall_score": None,
            "results": [],
            "by_dimension": {},
            "severity_counts": {},
            "ran_at": None,
            "note": "no DQ run yet",
        }
    )


@router.post("/{dataset_id}/dq/run")
def dq_run(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return json_safe(run_dq(db, dataset_id))


@router.get('/{id}/dq/three-panel')
def dq_three_panel_get(id: str, db: Session = Depends(get_db)):
    from app.domain import dq_service
    return dq_service.dq_three_panel(db, id)

