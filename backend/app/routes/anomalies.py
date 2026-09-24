"""Anomaly detection routes. Prefix /api/v1/anomalies."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.anomaly_service import confirm, detect, list_anomalies
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/anomalies")
def anomalies_list(dataset_id: str, limit: int = Query(200, ge=0, le=5000), severity: str | None = Query(None),
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return json_safe(list_anomalies(db, dataset_id, limit, severity))


@router.post("/{dataset_id}/detect")
def anomalies_detect(dataset_id: str, body: dict | None = None, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    try:
        return json_safe(detect(db, dataset_id, body or {}))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.patch("/{dataset_id}/anomalies/{anomaly_id}")
def anomalies_confirm(dataset_id: str, anomaly_id: str, body: dict = Body(...),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return json_safe(confirm(db, dataset_id, anomaly_id, bool((body or {}).get("is_confirmed", True))))
    except ValueError as exc:
        raise HTTPException(400, str(exc))