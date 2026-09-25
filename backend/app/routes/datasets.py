"""Dataset endpoints per contract §3.3: list, upload, get, delete, preview, content, refresh.

Router prefix (from main.py): `/api/v1/datasets`.
Importing this module also imports `dataset_service`, which registers the
`library` / `import` stage runners at import time.
"""
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain import dataset_service

router = APIRouter()


@router.get("")
def list_datasets(
    source_type: str | None = Query(None, description="Filter by source type (sample/upload)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.list_datasets(db, source_type=source_type, user=user)


@router.post("/upload")
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"dataset": dataset_service.register_upload(db, user, file)}


@router.get("/{dataset_id}")
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.get_dataset(db, dataset_id)


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.delete_dataset(db, user, dataset_id)


@router.get("/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str,
    limit: int = Query(100, ge=0, le=5000),
    start: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.preview_dataset(db, dataset_id, limit=limit, start=start)


@router.get("/{dataset_id}/content")
def content_dataset(
    dataset_id: str,
    limit: int = Query(100, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    format: str = Query("rows", pattern="^(rows|records)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.dataset_content(db, dataset_id, limit=limit,
                                           offset=offset, fmt=format)


@router.post("/{dataset_id}/refresh")
def refresh_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return dataset_service.refresh_dataset(db, user, dataset_id)