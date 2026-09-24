"""SHAP explainability routes. Prefix /api/v1/explanations."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.shap_service import compute_global, explain
from app.domain.data import json_safe

router = APIRouter()


@router.post("/{prediction_id}/explain")
def explain_local(prediction_id: str, body: dict | None = None, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    try:
        return json_safe(explain(db, prediction_id, body or {}))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/{model_id}/global")
def explain_global(model_id: str, top_n: int = Query(10), method: str = Query("auto"),
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return json_safe(compute_global(db, model_id, top_n=top_n, method=method))
    except ValueError as exc:
        raise HTTPException(400, str(exc))