"""Workflow engine: start / list / get / exec / advance / traces / SSE stream.

Ownership: S2. Contract: docs/API_CONTRACT.md §3.19 + §2 runner contract.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from app.core.security import decode_token, get_current_user
from app.db.base import get_db
from app.db.models import AuditLog, StageTrace, User, WorkflowRun
from app.domain.data import json_safe
from app.events.event_bus import event_bus
from app.workflow.events import emit
from app.workflow.stages import (
    STAGE_BY_KEY,
    STAGES,
    TOTAL_STAGES,
    get_stage_runner,
    missing_prior_stages,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter()

# A run is `running` until its last stage returns. If the process died, was
# killed, or the machine slept, nothing ever moves that row again and it
# reports progress that will never complete. 30 minutes is far longer than the
# slowest real stage — the heaviest forecast on the reference dataset takes
# about 35 seconds — so this cannot reap a run that is genuinely working.
STALE_RUN_MINUTES = 30


def _reap_stale_runs(db: Session, user_id: str) -> int:
    """Fail runs stuck in `running` past the staleness threshold.

    Reaping happens when someone looks rather than on a background timer, so
    there is no scheduler to deploy and no state that drifts when the service
    restarts. The only cost is that a stale run stays visible as `running`
    until it is next listed, which is strictly better than leaving it stale
    forever.

    Returns the number of runs reaped so a caller can log it.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=STALE_RUN_MINUTES)
    stuck = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.user_id == user_id, WorkflowRun.status == "running")
        .all()
    )
    reaped = 0
    for run in stuck:
        # `updated_at` moves whenever a stage writes progress; a run whose row
        # has not been touched since the threshold never finished.
        last_touch = run.updated_at or run.started_at or run.created_at
        if last_touch and last_touch > cutoff:
            continue
        run.status = "failed"
        run.completed_at = datetime.utcnow()
        run.error_message = (
            f"Run marked failed: no stage progress for over {STALE_RUN_MINUTES} minutes. "
            "The process most likely stopped mid-stage. Start a new run."
        )
        reaped += 1
    return reaped


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
    """A stage trace.

    There is no `confidence` column: the ten-stage product reports each stage's
    own number in its payload (DQ overall score, forecast horizon coverage,
    savings total) rather than reducing every stage to one comparable score. The
    runner's optional `confidence` still travels on the live exec response and
    the SSE event, where it belongs to that moment rather than to history.
    """
    return {
        "id": t.id,
        "stage_key": t.stage_key,
        "stage_number": t.stage_number,
        "stage_name": t.stage_name,
        "status": t.status,
        "input_snapshot": json_safe(t.input_snapshot),
        "output_snapshot": json_safe(t.output_snapshot),
        "decision": t.decision or "",
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "duration_ms": float(t.duration_ms or 0.0),
        "error": t.error,
    }


def _audit(db, user, action, rtype, rid, details=None):
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            resource_type=rtype,
            resource_id=rid,
            details=json_safe(details or {}),
        )
    )


@router.post("/start")
def start_workflow(
    body: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
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
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.flush()
    emit(run, "run_started", dataset_id=dataset_id)
    _audit(db, user, "execute", "workflow", run.id, {"action": "start", "dataset_id": dataset_id})
    db.commit()
    db.refresh(run)
    return {"run": json_safe(_run_payload(run))}


@router.get("")
def list_runs(
    dataset_id: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Reaping here rather than on a timer: the moment anyone looks at run
    # history is the only moment a stale run can be noticed, so this is where
    # correcting it costs the least and helps the most.
    _reap_stale_runs(db, user.id)
    db.commit()

    q = db.query(WorkflowRun).filter(WorkflowRun.user_id == user.id)
    if dataset_id:
        q = q.filter(WorkflowRun.dataset_id == dataset_id)
    counts = dict(
        db.query(StageTrace.workflow_run_id, func.count(StageTrace.id))
        .group_by(StageTrace.workflow_run_id)
        .all()
    )
    runs = [
        _run_payload(r, counts.get(r.id, 0))
        for r in q.order_by(
            WorkflowRun.started_at.desc(), WorkflowRun.created_at.desc()
        ).all()
    ]
    return {"runs": json_safe(runs)}


@router.post("/{run_id}/abort")
def abort_run(
    run_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Cancel a run that is still marked `running`.

    Manual counterpart to the staleness reaper: a run abandoned by accident
    should be closeable now rather than after the threshold expires.
    """
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if run is None or run.user_id != user.id:
        raise HTTPException(404, "Run not found")
    if run.status == "completed":
        raise HTTPException(409, "Run is already completed")
    run.status = "failed"
    run.completed_at = datetime.utcnow()
    run.error_message = "Run aborted by the operator."
    emit(run, "run_failed", reason="aborted")
    _audit(db, user, "execute", "workflow", run.id, {"action": "abort"})
    db.commit()
    return {"run": json_safe(_run_payload(run))}


@router.get("/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    run = _require_run(db, run_id)
    traces = (
        db.query(StageTrace)
        .filter(StageTrace.workflow_run_id == run_id)
        .order_by(StageTrace.stage_number.asc())
        .all()
    )
    return {
        "run": json_safe(_run_payload(run, len(traces))),
        "traces": json_safe([_trace_payload(t) for t in traces]),
    }


@router.get("/{run_id}/traces")
def get_traces(run_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_run(db, run_id)
    traces = (
        db.query(StageTrace)
        .filter(StageTrace.workflow_run_id == run_id)
        .order_by(StageTrace.stage_number.asc())
        .all()
    )
    return {"traces": json_safe([_trace_payload(t) for t in traces])}


def _require_run(db: Session, run_id: str) -> WorkflowRun:
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Workflow run not found")
    return run


def _check_preconditions(run: WorkflowRun, stage: dict) -> None:
    """Refuse a stage until every stage before it in the pipeline has run.

    The gate is positional and reads the run's own `stages_completed`, which is
    the same record the progress rail renders, so the API and the UI cannot
    disagree about what may run next. A stage's `requires` names the phase it
    sits behind for display, but the enforceable rule is that you cannot skip
    ahead — "is phase:preparation done?" is answerable wrong when the six
    preparation stages are half finished, "which earlier stages are missing?" is
    not.

    Re-running a stage is always allowed: it has no missing prior stages, and
    re-running is how a run is corrected after new data lands.
    """
    if not run.dataset_id:
        raise HTTPException(409, "This run has no dataset; start a run with a dataset_id.")
    missing = missing_prior_stages(stage["key"], run.stages_completed)
    if missing:
        raise HTTPException(
            409,
            f"Stage '{stage['key']}' cannot run yet. Complete first: {', '.join(missing)}",
        )


@router.post("/{run_id}/stages/{stage_key}/exec")
def exec_stage(
    run_id: str,
    stage_key: str,
    body: dict | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stage = STAGE_BY_KEY.get(stage_key)
    if not stage:
        raise HTTPException(404, f"Unknown stage key '{stage_key}'")
    run = _require_run(db, run_id)
    if run.status in ("completed", "failed"):
        raise HTTPException(409, f"Run is {run.status}; start a new run to execute stages")
    # Order matters: whether a stage *may* run is a property of the pipeline, so
    # that check answers first. "Not implemented yet" is only the right answer
    # for a stage that would otherwise be allowed to run.
    _check_preconditions(run, stage)
    runner = get_stage_runner(stage_key)
    if runner is None:
        raise HTTPException(404, f"Stage '{stage_key}' not implemented yet")

    params = (
        json_safe((body or {}).get("params") or {})
        if isinstance(body, dict) and "params" in body
        else json_safe(body or {})
    )

    run.current_stage = max(int(run.current_stage or 0), stage["number"])
    emit(run, "stage_started", stage_key=stage_key, stage_name=stage["label"], params=params)
    db.commit()

    trace = StageTrace(
        workflow_run_id=run.id,
        stage_key=stage_key,
        stage_number=stage["number"],
        stage_name=stage["label"],
        status="running",
        input_snapshot=params,
    )
    db.add(trace)
    db.commit()

    started = datetime.utcnow()
    error = None
    try:
        result = runner(run, db, params) or {}
        output = json_safe(result.get("output") or {})
        confidence = result.get("confidence")
        decision = str(result.get("decision") or "")
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
        emit(
            run,
            "stage_completed",
            stage_key=stage_key,
            stage_name=stage["label"],
            stage_number=stage["number"],
            output=output,
            decision=decision,
            confidence=confidence,
        )
        if run_completed:
            emit(run, "run_completed", stages_completed=completed)
        db.commit()
        db.refresh(trace)

    return {
        "trace": json_safe(_trace_payload(trace)),
        "output": output,
        "decision": decision,
        "confidence": confidence,
    }


@router.get("/{run_id}/stages/{stage_key}")
def get_stage_output(
    run_id: str,
    stage_key: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The newest recorded result for one stage of one run.

    Every stage page reads its content from here, and this is the same
    `output_snapshot` `exec` wrote. That is deliberate: a screen that re-derived
    its own numbers from a second endpoint could disagree with the record of
    what actually ran, and the two would both look authoritative. One read path
    per stage means the page and the audit trail cannot drift.

    Returns the newest trace for the stage. Re-running a stage appends a trace,
    so "newest" is the answer to "what did the last execution of this stage
    say" — which is the one a user looking at the page means.
    """
    if stage_key not in STAGE_BY_KEY:
        raise HTTPException(404, f"Unknown stage key '{stage_key}'")
    _require_run(db, run_id)
    trace = (
        db.query(StageTrace)
        .filter(StageTrace.workflow_run_id == run_id, StageTrace.stage_key == stage_key)
        .order_by(StageTrace.started_at.desc(), StageTrace.id.desc())
        .first()
    )
    if trace is None:
        raise HTTPException(404, f"Stage '{stage_key}' has not been run in this run")
    return json_safe(
        {
            "stage_key": trace.stage_key,
            "stage_number": trace.stage_number,
            "stage_name": trace.stage_name,
            "status": trace.status,
            "output": json_safe(trace.output_snapshot) or {},
            "decision": trace.decision or "",
            "started_at": trace.started_at.isoformat() if trace.started_at else None,
            "completed_at": trace.completed_at.isoformat() if trace.completed_at else None,
            "duration_ms": float(trace.duration_ms or 0.0),
            "error": trace.error,
        }
    )


@router.post("/{run_id}/advance")
def advance_run(run_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    run = _require_run(db, run_id)
    done = set(run.stages_completed or [])
    next_key = next((s["key"] for s in STAGES if s["key"] not in done), None)
    if next_key is None:
        raise HTTPException(400, "All stages already completed")
    return exec_stage(run_id, next_key, {}, db, user)


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
