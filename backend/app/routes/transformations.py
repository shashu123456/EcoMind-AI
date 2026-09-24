"""Transformation routes. Prefix /api/v1/datasets/{dataset_id}/transformations."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.transform_service import OPS, apply, list_transformations
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/transformations")
def transformations_get(dataset_id: str, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    return json_safe(list_transformations(db, dataset_id))


@router.post("/{dataset_id}/transformations/apply")
def transformations_apply(dataset_id: str, body: dict = Body(...), db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    op = (body or {}).get("operation")
    if not op:
        raise HTTPException(422, "operation is required")
    if op not in OPS:
        raise HTTPException(422, f"operation must be one of {list(OPS)}")
    try:
        return json_safe(apply(db, dataset_id, op, (body or {}).get("params") or {}))
    except ValueError as exc:
        raise HTTPException(400, str(exc))