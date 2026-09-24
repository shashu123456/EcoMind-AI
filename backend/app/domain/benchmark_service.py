"""Model benchmarking (time-series split, leaderboard) service.

Ownership: S4. Contract: docs/API_CONTRACT.md §3.11.
"""
from __future__ import annotations

import time

import numpy as np
from sqlalchemy.orm import Session

from app.db.models import Benchmark, Model, ComparisonChart
from app.domain.data import json_safe
from app.domain.dataset_service import load_dataframe, audit
from app.domain.feature_utils import (
    build_ml_matrix, build_model, metrics_dict, time_ordered_split,
)


def _benchmark_payload(b: Benchmark) -> dict:
    return {
        "id": b.id, "dataset_id": b.dataset_id, "name": b.name,
        "description": b.description or "", "model_ids": b.model_ids or [],
        "metrics_compared": b.metrics_compared or [], "results": b.results or {},
        "winner": b.winner, "methodology": b.methodology,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


DEFAULT_ALGOS = ["xgboost", "random_forest", "gradient_boosting", "ridge"]
COMPARE_METRICS = {"r2": "higher is better", "rmse": "lower is better",
                   "mae": "lower is better", "mape": "lower is better"}


def run_benchmark(db: Session, dataset_id: str, params: dict | None = None):
    p = params or {}
    dataset_name = _dataset_name(db, dataset_id)
    target = p.get("target_column") or "energy_kwh"
    algos = p.get("algorithms") or DEFAULT_ALGOS
    algo = p.get("algorithm")
    if algo:
        algos = [algo]
    use_processed = bool(p.get("use_processed", True))
    _, df = load_dataframe(db, dataset_id, use_processed=use_processed)
    if target not in df.columns:
        raise ValueError(f"target_column '{target}' not found")
    X, y, _ = build_ml_matrix(df, target, derive=True)
    X_tr, X_te, y_tr, y_te = time_ordered_split(X, y)

    t0 = time.time()
    results = {}
    leaderboard = []
    model_ids = []
    for algo_name in algos:
        try:
            m = build_model(algo_name, p.get("hyperparameters"))
            m.fit(X_tr, y_tr)
            yp = m.predict(X_te)
            mt = metrics_dict(y_te, yp)
            results[algo_name] = mt
            leaderboard.append({"name": algo_name, "algorithm": algo_name, "scores": mt})
        except Exception as exc:
            leaderboard.append({"name": algo_name, "algorithm": algo_name,
                                "scores": {}, "error": str(exc)})

    for lb in leaderboard:
        tot = 0.0
        for metric, (_) in COMPARE_METRICS.items():
            v = lb["scores"].get(metric)
            if v is None:
                continue
            best = min((r["scores"].get(metric, float("inf")) for r in leaderboard
                       if r["scores"].get(metric) is not None))
            worst = max((r["scores"].get(metric, float("-inf")) for r in leaderboard
                        if r["scores"].get(metric) is not None), default=best)
            metric_key = metric
            if metric in ("rmse", "mae", "mape"):
                lb["scores"][metric] = round(v, 4)
                norm = (worst - v) / ((worst - best) or 1.0)
            else:
                norm = (v - worst) / ((best - worst) or 1.0)
            tot += max(0.0, min(1.0, norm)) * 25.0
        lb["total_score"] = round(tot, 1)
    leaderboard.sort(key=lambda r: ("error" not in r, r.get("total_score", -1)), reverse=True)
    for i, lb in enumerate(leaderboard):
        lb["rank"] = i + 1
    winner = leaderboard[0]["name"] if leaderboard and "error" not in leaderboard[0] else None

    bench = Benchmark(
        dataset_id=dataset_id,
        name=p.get("name") or f"{dataset_name} model benchmark",
        description=p.get("description") or "Timed cross-model comparison on identical features and split.",
        model_ids=model_ids if model_ids else None,
        metrics_compared=list(COMPARE_METRICS.keys()),
        results=results,
        winner=winner,
        methodology="time_series_split" if not p.get("methodology") else p.get("methodology"),
    )
    db.add(bench)
    db.flush()
    if winner:
        w = db.query(Model).filter(Model.dataset_id == dataset_id,
                                   Model.algorithm == winner).first()
        if w:
            bench.winner = w.id
            bench.model_ids = [w.id]
    chart_data = {"labels": [lb["name"] for lb in leaderboard],
                  "series": [{m: [round(lb["scores"].get(m) or 0, 4) for lb in leaderboard]
                              for m in COMPARE_METRICS}]}
    from app.db.models import WorkflowRun
    run = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()
    run_id = run.id if run else ""
    db.add(ComparisonChart(workflow_run_id=run_id, chart_type="bar",
                           title="Model benchmark leaderboard",
                           data=chart_data,
                           config={"metrics": list(COMPARE_METRICS.keys())},
                           comparison_type="model_comparison"))
    audit(db, None, "execute", "benchmark", dataset_id, {"models": algos})
    db.commit()
    db.refresh(bench)
    return {"benchmark": _benchmark_payload(bench), "leaderboard": json_safe(leaderboard),
            "winner": winner,
            "elapsed_ms": round((time.time() - t0) * 1000, 1)}


def _dataset_name(db, dataset_id):
    from app.db.models import Dataset
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    return ds.name if ds else "dataset"


def _leaderboard_from_results(results: dict) -> list[dict]:
    rows = []
    for algo, scores in (results or {}).items():
        if not isinstance(scores, dict) or "r2" not in scores:
            continue
        rows.append({"name": algo, "algorithm": algo,
                     "scores": {k: v for k, v in scores.items() if k in COMPARE_METRICS}})
    for lb in rows:
        tot = 0.0
        for metric in COMPARE_METRICS:
            v = lb["scores"].get(metric)
            if v is None:
                continue
            col = [r["scores"].get(metric) for r in rows if r["scores"].get(metric) is not None]
            best = min(col)
            worst = max(col)
            if metric in ("rmse", "mae", "mape"):
                norm = (worst - v) / ((worst - best) or 1.0)
            else:
                norm = (v - worst) / ((best - worst) or 1.0)
            tot += max(0.0, min(1.0, norm)) * 25.0
        lb["total_score"] = round(tot, 1)
    rows.sort(key=lambda r: r.get("total_score", -1), reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def list_benchmarks(db: Session, dataset_id: str | None = None):
    q = db.query(Benchmark).order_by(Benchmark.created_at.desc())
    if dataset_id:
        q = q.filter(Benchmark.dataset_id == dataset_id)
    benches = q.limit(50).all()
    latest = benches[0] if benches else None
    return {
        "benchmarks": json_safe([_benchmark_payload(b) for b in benches]),
        "leaderboard": _leaderboard_from_results(latest.results or {}) if latest else [],
    }


def benchmark_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = run_benchmark(db, dataset_id, params)
    lb = result["leaderboard"][0] if result["leaderboard"] else {}
    return {"output": result,
            "confidence": float((lb.get("scores") or {}).get("r2", 0) if lb else 0.0),
            "decision": f"Winner: {result['winner'] or 'none'} (top score {lb.get('total_score', 0):.1f}/100)"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("benchmarking")(benchmark_stage)