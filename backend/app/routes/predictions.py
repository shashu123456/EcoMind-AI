"""Prediction routes. Prefix /api/v1/predictions."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.prediction_service import list_predictions, predict
from app.domain.data import json_safe

router = APIRouter()


@router.post("/predict")
def predict_run(body: dict = Body(...), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    if not (body or {}).get("dataset_id"):
        raise HTTPException(422, "dataset_id is required")
    try:
        return json_safe(predict(db, body, user.id))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/{model_id}/predictions")
def predictions_list(model_id: str, dataset_id: str | None = None, limit: int = Query(50, ge=0, le=5000),
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return json_safe({"predictions": list_predictions(db, model_id, dataset_id, limit)})