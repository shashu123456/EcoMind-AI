"""Comparison (raw vs processed) routes. Prefix /api/v1/comparison."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User, WorkflowRun
from app.domain.comparison_service import charts, get_comparison, run_comparison
from app.domain.data import json_safe

router = APIRouter()


def _run_or_404(db: Session, run_id: str) -> WorkflowRun:
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Workflow run not found")
    return run


@router.get("/{run_id}/raw-processed")
def comparison_get(run_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _run_or_404(db, run_id)
    return json_safe(get_comparison(db, run_id))


@router.post("/{run_id}/raw-processed/run")
def comparison_run(run_id: str, body: dict | None = None, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    run = _run_or_404(db, run_id)
    try:
        return json_safe(run_comparison(db, run, body or {}))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/{run_id}/charts")
def comparison_charts(run_id: str, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    _run_or_404(db, run_id)
    return json_safe(charts(db, run_id))