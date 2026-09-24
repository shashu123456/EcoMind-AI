"""Schema discovery routes. Prefix /api/v1/datasets."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.schema_service import discover, list_schema
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/schema")
def schema_get(dataset_id: str, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    return json_safe(list_schema(db, dataset_id))


@router.post("/{dataset_id}/schema/discover")
def schema_discover(dataset_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    return json_safe(discover(db, dataset_id))