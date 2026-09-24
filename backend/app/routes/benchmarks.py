"""Benchmark routes. Prefix /api/v1/benchmarks."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import User
from app.domain.benchmark_service import list_benchmarks, run_benchmark
from app.domain.data import json_safe

router = APIRouter()


@router.get("/{dataset_id}/benchmarks")
def benchmarks_list(dataset_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    return json_safe(list_benchmarks(db, dataset_id))


@router.post("/{dataset_id}/benchmarks/run")
def benchmarks_run(dataset_id: str, body: dict | None = None, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    try:
        return json_safe(run_benchmark(db, dataset_id, body or {}))
    except ValueError as exc:
        raise HTTPException(400, str(exc))