"""Workflow event emission helper (SSE)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.events.event_bus import event_bus


def emit(run, event_type: str, **kw):
    """Publish one workflow event to ``run:<id>``.

    `run` may be None: every service can be called directly (from a route, a
    test, or a backfill) as well as through the stage runner, and a progress
    event is not worth failing the work over. Emitting is best-effort — a
    subscriber that has gone away must not take the run down with it.
    """
    run_id = getattr(run, "id", None)
    payload = {
        "type": event_type,
        "run_id": run_id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if getattr(run, "current_stage", None) is not None:
        payload["stage_number"] = run.current_stage
    payload.update(kw)
    if run_id is None:
        return
    try:
        event_bus.publish(f"run:{run_id}", payload)
    except Exception:  # pragma: no cover - a dead subscriber is not our failure
        pass
