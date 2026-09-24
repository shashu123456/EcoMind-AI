"""Report routes. Prefix /api/v1/reports."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import Report, User
from app.domain.data import json_safe
from app.domain.report_service import _payload, generate, list_reports

router = APIRouter()


@router.get("")
def reports_list(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return json_safe(list_reports(db))


@router.post("/generate")
def reports_generate(body: dict = Body(...), db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    if not (body or {}).get("dataset_id"):
        raise HTTPException(422, "dataset_id is required")
    try:
        r = generate(db, body.get("dataset_id"), body.get("title"), body.get("report_type", "executive"),
                     body.get("format", "pdf"), body.get("sections"), user.id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return json_safe({"report": _payload(r), "download_url": f"/api/v1/reports/{r.id}/download"})


@router.get("/{report_id}")
def reports_get(report_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return json_safe(_payload(r))


@router.get("/{report_id}/download")
def reports_download(report_id: str, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    r = db.query(Report).filter(Report.id == report_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    from pathlib import Path
    path = Path(r.file_path)
    if not path.exists():
        raise HTTPException(404, "Report file missing")
    return FileResponse(path, filename=path.name)