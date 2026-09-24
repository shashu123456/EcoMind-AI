"""Workflow event emission helper (SSE)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.events.event_bus import event_bus


def emit(run, event_type: str, **kw):
    payload = {
        "type": event_type,
        "run_id": run.id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if getattr(run, "current_stage", None) is not None:
        payload["stage_number"] = run.current_stage
    payload.update(kw)
    event_bus.publish(f"run:{run.id}", payload)