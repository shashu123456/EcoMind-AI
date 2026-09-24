"""Feature engineering routes. Prefix /api/v1/datasets/{dataset_id}/features."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.feature_service import engineer, list_features
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/features")
def features_get(dataset_id: str, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    return json_safe(list_features(db, dataset_id))


@router.post("/{dataset_id}/features/engineer")
def features_engineer(dataset_id: str, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    return json_safe(engineer(db, dataset_id, user.id))