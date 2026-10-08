"""Baseline routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain import baseline_service

router = APIRouter()


@router.post("/{dataset_id}/baseline")
def generate_baseline(dataset_id: str, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        res = baseline_service.generate_baseline(db, dataset_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}/baseline")
def get_baseline(dataset_id: str, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        from app.domain import snapshots
        b = snapshots.latest_snapshot(db, 'baseline', dataset_id)
        if not b:
            return {}
        return b
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{dataset_id}/baseline/versions")
def list_baseline_versions(dataset_id: str, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.domain import snapshots
    return {"versions": snapshots.list_versions(db, dataset_id, "baseline")}


@router.get("/{dataset_id}/baseline/versions/{version}")
def get_baseline_version(dataset_id: str, version: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.domain import snapshots
    payload = snapshots.get_version(db, dataset_id, "baseline", version)
    if not payload:
        raise HTTPException(status_code=404, detail=f"Baseline version {version} not found")
    return payload
