"""Dataset domain service + library/import/raw_preview stage runners.

Ownership: S1. Contract: docs/API_CONTRACT.md §3.3, §4.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Anomaly, Benchmark, ComparisonChart, ConfidenceGate, Dataset, DQResult,
    Feature, Model, ModelRegistry, Prediction, RawProcessedComparison,
    Recommendation, Report, SchemaColumn, SHAPExplanation, StageTrace,
    Transformation, User, WorkflowRun,
)
from app.domain.data import json_safe, preview_payload, read_csv, save_processed
from app.workflow.stages import register_stage_runner

BANNED = ("\\", "/", ":", "*", "?", '"', "<", ">", "|")

DATASET_DEPENDENT = [
    SchemaColumn, DQResult, Transformation, Feature, Model, Anomaly,
    Benchmark, Recommendation, Report,
]


def _dataset_payload(ds: Dataset) -> dict:
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "source_type": ds.source_type,
        "file_path": ds.file_path,
        "file_size_bytes": ds.file_size_bytes,
        "row_count": ds.row_count,
        "column_count": ds.column_count,
        "status": ds.status,
        "provenance": ds.provenance or {},
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
        "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
    }


def audit(db: Session, user: User, action: str, rtype: str, rid: str, details: dict | None = None) -> None:
    from app.db.models import AuditLog
    db.add(AuditLog(user_id=user.id if user else None, action=action,
                    resource_type=rtype, resource_id=rid, details=json_safe(details or {})))


# ─────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────
def list_datasets(db: Session, source_type: str | None = None, user: User | None = None) -> dict:
    q = db.query(Dataset)
    if source_type:
        q = q.filter(Dataset.source_type == source_type)
    datasets = [json_safe(_dataset_payload(d)) for d in q.order_by(Dataset.created_at.desc()).all()]
    return {"datasets": datasets}


def get_dataset(db: Session, dataset_id: str) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return json_safe(_dataset_payload(ds))


def register_upload(db: Session, user: User, file: UploadFile) -> dict:
    fname = (file.filename or "upload.csv").lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(422, "Only .csv or .xlsx uploads are supported")

    import io
    raw = file.file.read()
    if len(raw) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(422, f"File too large (max {settings.max_upload_mb}MB)")

    ds = Dataset(
        user_id=user.id,
        name=file.filename or "upload.csv",
        description="Uploaded dataset",
        source_type="upload",
        status="loading",
        provenance={
            "origin": "User upload",
            "license": "Unknown",
            "collection_method": "Manual upload",
            "temporal_range": "",
            "geographic_scope": "",
            "version": "1.0",
            "citation": "",
        },
    )
    db.add(ds)
    db.flush()

    try:
        if fname.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        else:
            df = pd.read_excel(io.BytesIO(raw))
    except Exception as exc:
        db.rollback()
        raise HTTPException(422, f"Could not parse file into a table ({exc})")

    if df.empty:
        db.rollback()
        raise HTTPException(422, "Uploaded file is empty")
    if len(df) > settings.max_rows:
        db.rollback()
        raise HTTPException(422, f"Too many rows (max {settings.max_rows})")

    path = settings.uploads_dir / f"{ds.id}.csv"
    df.to_csv(path, index=False)
    ds.file_path = str(path)
    ds.file_size_bytes = path.stat().st_size
    ds.row_count = int(len(df))
    ds.column_count = int(len(df.columns))
    ds.status = "ready"
    audit(db, user, "create", "dataset", ds.id, {"source": "upload", "rows": ds.row_count})
    db.commit()
    db.refresh(ds)
    return json_safe(_dataset_payload(ds))


def delete_dataset(db: Session, user: User, dataset_id: str) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    runs = [r.id for r in db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id).all()]
    if runs:
        db.query(ConfidenceGate).filter(ConfidenceGate.workflow_run_id.in_(runs)).delete(synchronize_session=False)
        db.query(RawProcessedComparison).filter(RawProcessedComparison.workflow_run_id.in_(runs)).delete(synchronize_session=False)
        db.query(ComparisonChart).filter(ComparisonChart.workflow_run_id.in_(runs)).delete(synchronize_session=False)
        db.query(StageTrace).filter(StageTrace.workflow_run_id.in_(runs)).delete(synchronize_session=False)
        db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id).delete(synchronize_session=False)

    model_ids = [m.id for m in db.query(Model).filter(Model.dataset_id == dataset_id).all()]
    if model_ids:
        db.query(SHAPExplanation).filter(SHAPExplanation.model_id.in_(model_ids)).delete(synchronize_session=False)
        db.query(Prediction).filter(Prediction.dataset_id == dataset_id).delete(synchronize_session=False)
    db.query(ModelRegistry).filter(ModelRegistry.dataset_id == dataset_id).delete(synchronize_session=False)
    for cls in DATASET_DEPENDENT:
        db.query(cls).filter(cls.dataset_id == dataset_id).delete(synchronize_session=False)

    # remove files
    for p in (Path(ds.file_path) if ds.file_path else None,
              settings.processed_dir / f"{dataset_id}.csv"):
        if p and p.exists():
            try:
                p.unlink()
            except OSError:
                pass

    audit(db, user, "delete", "dataset", dataset_id, {"name": ds.name})
    db.delete(ds)
    db.commit()
    return {"ok": True}


def preview_dataset(db: Session, dataset_id: str, limit: int = 100, start: int = 0) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    df = read_csv(_dataset_path(ds))
    return json_safe(preview_payload(df, limit=limit, start=start))


def dataset_content(db: Session, dataset_id: str, limit: int = 100, offset: int = 0, fmt: str = "rows") -> dict:
    return preview_dataset(db, dataset_id, limit=limit, start=offset)


def refresh_dataset(db: Session, user: User, dataset_id: str) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    df = read_csv(_dataset_path(ds))
    ds.row_count = int(len(df))
    ds.column_count = int(len(df.columns))
    path = Path(ds.file_path) if ds.file_path else None
    if path and path.exists():
        ds.file_size_bytes = int(path.stat().st_size)
    ds.status = "ready"
    audit(db, user, "update", "dataset", dataset_id, {"refresh": "file rescanned"})
    db.commit()
    db.refresh(ds)
    return json_safe(_dataset_payload(ds))


def _dataset_path(ds: Dataset) -> Path:
    if ds.file_path:
        p = Path(ds.file_path)
        if p.exists():
            return p
    return settings.sample_dir / "bdg2_energy_30day.csv"


def load_dataframe(db: Session, dataset_id: str, use_processed: bool = False) -> tuple[Dataset, pd.DataFrame]:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    if use_processed and (settings.processed_dir / f"{dataset_id}.csv").exists():
        df = read_csv(settings.processed_dir / f"{dataset_id}.csv")
    else:
        df = read_csv(_dataset_path(ds))
    return ds, df


def summary_payload(ds: Dataset) -> dict:
    return {
        "id": ds.id,
        "name": ds.name,
        "source_type": ds.source_type,
        "row_count": ds.row_count,
        "column_count": ds.column_count,
        "status": ds.status,
    }


# ─────────────────────────────────────────────
# Stage runners
# ─────────────────────────────────────────────
def _read_for_dataset(db: Session, dataset_id: str) -> pd.DataFrame:
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return read_csv(_dataset_path(ds))


@register_stage_runner("library")
def library_stage(run, db: Session, params: dict) -> dict:
    datasets = list_datasets(db)
    output = {"datasets": datasets["datasets"]}
    return {"output": output, "confidence": None,
            "decision": f"Dataset library contains {len(output['datasets'])} dataset(s)."}


@register_stage_runner("import")
def import_stage(run, db: Session, params: dict) -> dict:
    ds = db.query(Dataset).filter(Dataset.id == run.dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    from app.domain.data import column_stats
    df = read_csv(_dataset_path(ds))
    output = {
        **summary_payload(ds),
        "provenance": ds.provenance or {},
        "columns": [column_stats(df, c) for c in df.columns[:20]],
    }
    return {"output": json_safe(output), "confidence": None,
            "decision": f"Dataset '{ds.name}' ({ds.row_count} rows, {ds.column_count} cols) is ready for the pipeline."}


@register_stage_runner("raw_preview")
def raw_preview_stage(run, db: Session, params: dict) -> dict:
    df = _read_for_dataset(db, run.dataset_id)
    output = preview_payload(df, limit=params.get("limit", 100), start=0)
    return {"output": json_safe(output), "confidence": None,
            "decision": f"Raw preview returned {min(100, len(df))} rows of {len(df)}."}