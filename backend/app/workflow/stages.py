"""Canonical 17-stage workflow + stage-runner registry.

THE single source of truth for stage order used by:
  - the workflow router (exec / advance / traces)
  - domain routers (they register stage runners here)
  - the frontend PipelineRail / ConfidenceGate / timeline

Stage keys are snake_case; `route` is the frontend path segment.
`api` is the owning API area (informational only).

Runners must be plain functions with signature:

    def run(run: WorkflowRun, db: Session, params: dict) -> dict

returning:
    {
        "output": {...},            # stage payload (persisted to trace.output_snapshot)
        "confidence": float | None, # 0..1 for stages that produce confidence
        "decision": str,            # human-readable AI reasoning summary
        "trace_extra": {...},       # optional extra trace fields
    }

Register with the @register_stage_runner(key) decorator; callable name is
irrelevant. Registration happens at import time (routers import domain
services), so the workflow exec endpoint sees every runner.
"""
from __future__ import annotations

from typing import Callable, Dict, Optional

STAGES = [
    {"number": 1, "key": "library",            "label": "Dataset Library",         "route": "/library"},
    {"number": 2, "key": "import",             "label": "Import",                  "route": "/import"},
    {"number": 3, "key": "raw_preview",        "label": "Raw Preview",             "route": "/preview"},
    {"number": 4, "key": "schema_discovery",   "label": "Schema Discovery",        "route": "/schema"},
    {"number": 5, "key": "dq_engine",          "label": "DQ Engine",               "route": "/dq"},
    {"number": 6, "key": "transformation",     "label": "Transformation Viewer",   "route": "/transformations"},
    {"number": 7, "key": "feature_engineering", "label": "Feature Engineering",    "route": "/features"},
    {"number": 8, "key": "prediction",         "label": "Prediction",              "route": "/prediction"},
    {"number": 9, "key": "confidence_gate",    "label": "AI Confidence Gate",      "route": "/confidence"},
    {"number": 10, "key": "raw_vs_processed",  "label": "Raw vs Processed",        "route": "/comparison"},
    {"number": 11, "key": "shap",              "label": "SHAP Explainability",     "route": "/shap"},
    {"number": 12, "key": "anomaly",           "label": "Anomaly Detection",       "route": "/anomalies"},
    {"number": 13, "key": "benchmarking",      "label": "Benchmarking",            "route": "/benchmarks"},
    {"number": 14, "key": "recommendation",    "label": "Recommendation Engine",   "route": "/recommendations"},
    {"number": 15, "key": "executive_center",  "label": "Executive Intelligence Center", "route": "/executive"},
    {"number": 16, "key": "report",            "label": "Report Generation",       "route": "/reports"},
    {"number": 17, "key": "history_registry",  "label": "History & Model Registry", "route": "/history"},
]

STAGE_BY_KEY = {s["key"]: s for s in STAGES}
STAGE_BY_NUMBER = {s["number"]: s for s in STAGES}
TOTAL_STAGES = len(STAGES)

# Trust formula (locked, per spec): 0.40*pred_conf + 0.25*dq + 0.20*model_rel + 0.15*shap_stab
TRUST_WEIGHTS = {"prediction_confidence": 0.40, "dq_score": 0.25, "model_relevance": 0.20, "shap_stability": 0.15}


def trust_verdict(trust_score: float) -> str:
    if trust_score >= 80:
        return "high_trust"
    if trust_score >= 60:
        return "moderate_trust"
    return "low_trust"


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