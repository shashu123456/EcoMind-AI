"""Canonical 10-stage workflow + stage-runner registry.

THE single source of truth for stage order, used by:
  - the workflow router (exec / advance / traces / stream)
  - domain modules (they register stage runners here)
  - the frontend PhaseNav, which renders one panel per `key`

Two phases, six preparation stages then four decision stages. The split is not
cosmetic: a decision stage is only reachable once the six preparation stages
have passed, so no anomaly, forecast or recommendation is ever computed on data
that has not been through quality checks and transformation.

Stage keys are snake_case; `route` is the frontend path segment relative to the
dataset, and `phase` drives which half of the rail a stage belongs to.

Runners are plain functions:

    def run(run: WorkflowRun, db: Session, params: dict) -> dict

returning:

    {
        "output": {...},            # stage payload (persisted to trace.output_snapshot)
        "confidence": float | None, # 0..1 for stages that produce confidence
        "decision": str,            # human-readable reasoning summary
        "trace_extra": {...},       # optional extra trace fields
    }

Register with @register_stage_runner(key); the callable's name is irrelevant.
Registration happens at import time (route modules import domain services), so
the exec endpoint sees every runner.

This module imports no models. Domain services import this, so a model import
here would be circular.
"""

from __future__ import annotations

from typing import Callable, Dict, Optional

PHASE_PREPARATION = "phase:preparation"
PHASE_DECISION = "phase:decision"
PHASE_DATASET = "dataset"

#: Values the locked `requires` column accepts. The old free-text values
#: ("all", "none", "schema", "predictions") are gone — anything downstream that
#: wants to know a stage's gate reads these instead.
REQUIRES_VALUES = (PHASE_PREPARATION, PHASE_DECISION, PHASE_DATASET)

STAGES = [
    # ── Preparation ────────────────────────────────────────────────────────
    {
        "number": 1,
        "key": "library",
        "label": "Dataset Library",
        "route": "/library",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    {
        "number": 2,
        "key": "import",
        "label": "Import Dataset",
        "route": "/import",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    {
        "number": 3,
        "key": "schema",
        "label": "Schema Discovery",
        "route": "/schema",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    {
        "number": 4,
        "key": "quality",
        "label": "Data Quality",
        "route": "/quality",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    {
        "number": 5,
        "key": "transformation",
        "label": "Transformation",
        "route": "/transformation",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    {
        "number": 6,
        "key": "model_selection",
        "label": "Model Selection",
        "route": "/model-selection",
        "phase": PHASE_PREPARATION,
        "requires": PHASE_DATASET,
    },
    # ── Decision ───────────────────────────────────────────────────────────
    {
        "number": 7,
        "key": "anomaly",
        "label": "Anomaly Detection",
        "route": "/anomalies",
        "phase": PHASE_DECISION,
        "requires": PHASE_PREPARATION,
    },
    {
        "number": 8,
        "key": "forecast",
        "label": "Energy Forecasting",
        "route": "/forecast",
        "phase": PHASE_DECISION,
        "requires": PHASE_PREPARATION,
    },
    {
        "number": 9,
        "key": "recommendation",
        # Same name the frontend stage registry uses. The label is emitted to
        # the browser as `stage_name` on stage_started/stage_completed events,
        # so a mismatch here shows up in the run bar and the live console as
        # two different names for the same stage.
        "label": "Action plan",
        # No page of its own: the action plan is the Action plan tab of the
        # report. `route` mirrors lib/journey.ts, which points this stage at
        # /report and lets the frontend deep-link the tab with a fragment.
        "route": "/report#action-plan",
        "phase": PHASE_DECISION,
        "requires": PHASE_DECISION,
    },
    {
        "number": 10,
        "key": "report",
        "label": "Report",
        "route": "/report",
        "phase": PHASE_DECISION,
        "requires": PHASE_DECISION,
    },
]

STAGE_BY_KEY: Dict[str, dict] = {s["key"]: s for s in STAGES}
STAGE_BY_NUMBER: Dict[int, dict] = {s["number"]: s for s in STAGES}
TOTAL_STAGES = len(STAGES)

#: Preparation keys that must have passed before a decision stage may run.
PREPARATION_KEYS = [s["key"] for s in STAGES if s["phase"] == PHASE_PREPARATION]
DECISION_KEYS = [s["key"] for s in STAGES if s["phase"] == PHASE_DECISION]

STAGE_RUNNERS: Dict[str, Callable] = {}


def register_stage_runner(stage_key: str):
    """Decorator registering a stage runner for the workflow engine."""
    if stage_key not in STAGE_BY_KEY:
        raise KeyError(f"Unknown stage key: {stage_key}. Valid: {list(STAGE_BY_KEY)}")

    def deco(fn: Callable) -> Callable:
        STAGE_RUNNERS[stage_key] = fn
        return fn

    return deco


def get_stage_runner(stage_key: str) -> Optional[Callable]:
    return STAGE_RUNNERS.get(stage_key)


def stage_manifest() -> list[dict]:
    """The rail, for the frontend and the progress endpoint."""
    return [{**s, "has_runner": s["key"] in STAGE_RUNNERS} for s in STAGES]


def next_stage(stage_key: str) -> dict | None:
    """The stage after `stage_key`, or None at the end of the pipeline.

    Explicit rather than `current + 1`: stage numbers are identifiers that can
    be renumbered when the pipeline changes, and walking a list by position
    means a number is never the thing that decides order.
    """
    idx = next((i for i, s in enumerate(STAGES) if s["key"] == stage_key), None)
    if idx is None or idx + 1 >= len(STAGES):
        return None
    return STAGES[idx + 1]


def missing_prior_stages(stage_key: str, completed: list | tuple | set | None) -> list[str]:
    """Preparation/decision stages that must run before `stage_key` may.

    `completed` is a run's `stages_completed` — the keys it has actually
    executed. Order is read positionally, so renumbering the pipeline never
    changes what depends on what.

    This is the pipeline's real gate: `requires` names the *phase* a stage sits
    behind for display purposes, but the enforceable rule is that you cannot
    skip ahead. Asking "is phase:preparation done?" is answerable wrong when the
    six preparation stages are half finished; asking "which earlier stages are
    missing?" is not.
    """
    idx = next((i for i, s in enumerate(STAGES) if s["key"] == stage_key), None)
    if idx is None:
        return []
    done = set(completed or ())
    return [s["key"] for s in STAGES[:idx] if s["key"] not in done]


def preparation_complete(stage_statuses: dict | None) -> bool:
    """True when all six preparation stages are marked passed.

    The gate is the statuses dict the journey already persists, not a separate
    derived flag, so the pipeline and the progress rail cannot disagree about
    how far the run got.
    """
    statuses = stage_statuses or {}
    return all(statuses.get(k) == "passed" for k in PREPARATION_KEYS)
