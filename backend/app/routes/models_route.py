"""Model routes. Prefix /api/v1/models."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.model_service import get_model, list_models, model_payload, train
from app.domain.data import json_safe

router = APIRouter()


@router.get("")
def models_list(dataset_id: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return json_safe({"models": list_models(db, dataset_id)})


@router.post("/train")
def models_train(body: dict = Body(...), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    if not (body or {}).get("dataset_id"):
        raise HTTPException(422, "dataset_id is required")
    try:
        m = train(db, body, user.id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return json_safe({"model": model_payload(m)})


@router.get("/{model_id}")
def models_get(model_id: str, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    m = get_model(db, model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    return json_safe(model_payload(m))