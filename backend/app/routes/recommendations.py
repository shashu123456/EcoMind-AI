"""Recommendation routes. Prefix /api/v1/recommendations."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.recommend_service import generate, list_recommendations
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/recommendations")
def recs_list(dataset_id: str, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    return json_safe(list_recommendations(db, dataset_id))


@router.post("/{dataset_id}/recommendations/generate")
def recs_generate(dataset_id: str, body: dict | None = None, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    try:
        return json_safe(generate(db, dataset_id, (body or {}).get("top_k") or 10))
    except ValueError as exc:
        raise HTTPException(400, str(exc))