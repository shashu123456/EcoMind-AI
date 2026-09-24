"""Model registry routes. Prefix /api/v1/registry."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.registry_service import deprecate, list_entries, promote
from app.domain.data import json_safe

router = APIRouter()


@router.get("")
def registry_list(dataset_id: str | None = Query(None), db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    return json_safe(list_entries(db, dataset_id))


@router.post("/{model_id}/promote")
def registry_promote(model_id: str, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    try:
        return json_safe({"entry": promote(db, model_id)})
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/{model_id}/deprecate")
def registry_deprecate(model_id: str, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    try:
        return json_safe({"entry": deprecate(db, model_id)})
    except ValueError as exc:
        raise HTTPException(400, str(exc))