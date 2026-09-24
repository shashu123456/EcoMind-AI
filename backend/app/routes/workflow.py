"""Workflow engine: start / list / get / exec / advance / traces / SSE stream.

Ownership: S2. Contract: docs/API_CONTRACT.md §3.19 + §2 runner contract.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import decode_token, get_current_user
from app.db.base import get_db
from app.db.models import (
    AuditLog, ConfidenceGate, ComparisonChart, RawProcessedComparison,
    StageTrace, User, WorkflowRun,
)
from app.domain.data import json_safe
from app.workflow.events import emit
from app.workflow.stages import (
    STAGE_BY_KEY, STAGE_BY_NUMBER, TOTAL_STAGES, get_stage_runner,
)
from app.events.event_bus import event_bus

router = APIRouter()


def _run_payload(r: WorkflowRun, trace_count: int | None = None) -> dict:
    return {
        "id": r.id,
        "dataset_id": r.dataset_id,
        "status": r.status,
        "current_stage": int(r.current_stage or 0),
        "total_stages": int(r.total_stages or TOTAL_STAGES),
        "stages_completed": r.stages_completed or [],
        "trace_count": int(trace_count or 0),
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "error_message": r.error_message,
        "config": r.config or {},
    }


def _trace_payload(t: StageTrace) -> dict:
    return {
        "id": t.id,
        "stage_number": t.stage_number,
        "stage_name": t.stage_name,
        "status": t.status,
        "input_snapshot": json_safe(t.input_snapshot),
        "output_snapshot": json_safe(t.output_snapshot),
        "decision": t.decision or "",
        "confidence": t.confidence,
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "duration_ms": float(t.duration_ms or 0.0),
        "error": t.error,
    }


def _audit(db, user, action, rtype, rid, details=None):
    db.add(AuditLog(user_id=user.id, action=action, resource_type=rtype,
                    resource_id=rid, details=json_safe(details or {})))


@router.post("/start")
def start_workflow(body: dict, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    dataset_id = (body or {}).get("dataset_id")
    if not dataset_id:
        raise HTTPException(422, "dataset_id is required")
    run = WorkflowRun(
        dataset_id=dataset_id,
        user_id=user.id,
        status="running",
        current_stage=0,
        total_stages=TOTAL_STAGES,
        stages_completed=[],
        config=(body or {}).get("config") or {},
    )
    db.add(run)
    db.flush()
    emit(run, "run_started", dataset_id=dataset_id)
    _audit(db, user, "execute", "workflow", run.id, {"action": "start", "dataset_id": dataset_id})
    db.commit()
    db.refresh(run)
    return {"run": json_safe(_run_payload(run))}


@router.get("")
def list_runs(dataset_id: str | None = Query(None), db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    q = db.query(WorkflowRun).filter(WorkflowRun.user_id == user.id)
    if dataset_id:
        q = q.filter(WorkflowRun.dataset_id == dataset_id)
    counts = dict(db.query(StageTrace.workflow_run_id, func.count(StageTrace.id))
                  .group_by(StageTrace.workflow_run_id).all())
    runs = [_run_payload(r, counts.get(r.id, 0))
            for r in q.order_by(WorkflowRun.started_at.desc()).all()]
    return {"runs": json_safe(runs)}


@router.get("/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    run = _require_run(db, run_id)
    traces = db.query(StageTrace).filter(StageTrace.workflow_run_id == run_id) \
        .order_by(StageTrace.stage_number.asc()).all()
    return {"run": json_safe(_run_payload(run, len(traces))), "traces": json_safe([_trace_payload(t) for t in traces])}


@router.get("/{run_id}/traces")
def get_traces(run_id: str, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    _require_run(db, run_id)
    traces = db.query(StageTrace).filter(StageTrace.workflow_run_id == run_id) \
        .order_by(StageTrace.stage_number.asc()).all()
    return {"traces": json_safe([_trace_payload(t) for t in traces])}


def _require_run(db: Session, run_id: str) -> WorkflowRun:
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Workflow run not found")
    return run


@router.post("/{run_id}/stages/{stage_key}/exec")
def exec_stage(run_id: str, stage_key: str, body: dict | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stage = STAGE_BY_KEY.get(stage_key)
    if not stage:
        raise HTTPException(404, f"Unknown stage key '{stage_key}'")
    run = _require_run(db, run_id)
    runner = get_stage_runner(stage_key)
    if runner is None:
        raise HTTPException(404, f"Stage '{stage_key}' not implemented yet")
    if run.status in ("completed", "failed"):
        raise HTTPException(409, f"Run is {run.status}; start a new run to execute stages")

    params = json_safe((body or {}).get("params") or {}) if isinstance(body, dict) and "params" in body else json_safe(body or {})

    run.current_stage = max(int(run.current_stage or 0), stage["number"])
    emit(run, "stage_started", stage_key=stage_key, stage_name=stage["label"], params=params)
    db.commit()

    trace = StageTrace(
        workflow_run_id=run.id,
        stage_number=stage["number"],
        stage_name=stage["label"],
        status="running",
        input_snapshot=params,
    )
    db.add(trace)
    db.flush()
    db.commit()

    started = datetime.utcnow()
    error = None
    try:
        result = runner(run, db, params) or {}
        output = json_safe(result.get("output") or {})
        confidence = result.get("confidence")
        decision = str(result.get("decision") or "")
        trace_extra = result.get("trace_extra") or {}
    except HTTPException:
        raise
    except Exception as exc:
        error = str(exc)
        db.rollback()
        run = _require_run(db, run_id)
        trace = db.query(StageTrace).filter(StageTrace.id == trace.id).first()
        trace.status = "failed"
        trace.error = error
        trace.completed_at = datetime.utcnow()
        trace.duration_ms = (datetime.utcnow() - started).total_seconds() * 1000
        run.status = "failed"
        run.error_message = error
        _audit(db, user, "execute", "workflow", run.id, {"stage": stage_key, "status": "failed"})
        emit(run, "stage_failed", stage_key=stage_key, stage_name=stage["label"], error=error)
        db.commit()
        raise HTTPException(500, f"Stage '{stage_key}' failed: {error}")

    if error is None:
        trace.status = "completed"
        trace.output_snapshot = output
        trace.decision = decision
        trace.confidence = confidence
        trace.completed_at = datetime.utcnow()
        trace.duration_ms = (datetime.utcnow() - started).total_seconds() * 1000

        completed = list(run.stages_completed or [])
        if stage_key not in completed:
            completed.append(stage_key)
        run.stages_completed = completed
        done = len([k for k in completed if k in STAGE_BY_KEY])
        run_completed = done >= TOTAL_STAGES
        if run_completed:
            run.status = "completed"
            run.completed_at = datetime.utcnow()
        _audit(db, user, "execute", "workflow", run.id, {"stage": stage_key, "status": "ok"})
        emit(run, "stage_completed", stage_key=stage_key, stage_name=stage["label"],
             stage_number=stage["number"], output=output, decision=decision, confidence=confidence)
        if run_completed:
            emit(run, "run_completed", stages_completed=completed)
        db.commit()
        db.refresh(trace)

    return {"trace": json_safe(_trace_payload(trace)), "output": output,
            "decision": decision, "confidence": confidence}


@router.post("/{run_id}/advance")
def advance_run(run_id: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    run = _require_run(db, run_id)
    done = set(run.stages_completed or [])
    next_key = next((s["key"] for s in _ordered_stages() if s["key"] not in done), None)
    if next_key is None:
        raise HTTPException(400, "All stages already completed")
    return exec_stage(run_id, next_key, {}, db, user)


def _ordered_stages():
    from app.workflow.stages import STAGES
    return STAGES


@router.get("/{run_id}/stream")
def stream_run(run_id: str, request: Request, token: str | None = Query(None)):
    if token:
        try:
            decode_token(token)
        except Exception:
            raise HTTPException(401, "Invalid token")
    else:
        raise HTTPException(401, "token query param required")

    async def gen():
        async for ev in event_bus.stream(f"run:{run_id}"):
            yield f"data: {json.dumps(ev, default=str)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")