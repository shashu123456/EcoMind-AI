"""Model selection: train candidates, score them, commit to one.

Ownership: S4. Contract: docs/API_CONTRACT.md §3.7.

The stage trains every algorithm in `settings.candidate_algorithms` on the same
split and picks one, so the user sees a comparison rather than a single number
that came from somewhere they cannot inspect.

Three decisions worth stating
-----------------------------
**The split is chronological, never random.** Energy demand has a trend and a
season. A random split leaks the future into the training set and reports an R²
that cannot survive contact with next week. The test set is always the most
recent slice of time.

**Accuracy is not the whole ranking.** `settings.selection_weights` blends R²,
RMSE and training speed. A model that is 0.4% better on R² and four times slower
to train is not the one you want behind a page that has to answer on load.

**The margin is reported even when it is tiny.** If the winner is inside
`settings.selection_near_tie_margin` of the runner-up, the selection is marked a
near tie and the rationale says so. Hiding a coin-flip behind a confident-sounding
"selected xgboost" is how a model gets trusted past the point its evidence goes.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import pandas as pd
from app.core.config import settings
from app.db.models import Model, ModelSelection
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.dataset_service import audit, load_dataframe
from app.domain.feature_service import TARGET_CANDIDATES, target_column
from app.domain.feature_utils import (
    build_ml_matrix,
    build_model,
    dataset_hash,
    feature_importance,
    metrics_dict,
    time_ordered_split,
)
from app.domain.framing import per_device_frame
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

#: Columns that identify an asset rather than describe its behaviour. They are
#: excluded from the matrix: `building_code` and `device_code` are labels, and a
#: model that memorises "BLD-C reads high" has learned the campus, not energy
#: behaviour, and will not transfer to a building it has not seen.
IDENTIFIER_COLUMNS = {
    "building_code",
    "floor_no",
    "room_code",
    "device_code",
    "device_category",
    "is_meter",
}

#: Columns that are arithmetic functions of the target *on the same row*.
#:
#: This is the difference between an R² of 0.95 and an R² of 1.000 that means
#: nothing. `power_kw` is the target times a noise factor, `load_factor` is the
#: target divided by that, `energy_density` is the target divided by occupancy,
#: and the rolling mean and diff both include the current reading. A regressor
#: handed any one of them can reconstruct the target almost exactly, and the
#: reported accuracy then describes the arithmetic, not the building.
#:
#: `lag_1h` is deliberately *not* here. It is the previous reading, which is
#: genuinely in the past, and predicting the next hour from the last hour is the
#: actual job. `forecast_service` builds that lag per device; here the frame is
#: interleaved across devices, so the previous row may be a different meter.
SAME_ROW_TARGET_DERIVATIVES = {
    "load_factor",
    "energy_density",
    "rolling_mean_24h",
    "rolling_std_24h",
    "diff_1h",
}

#: Energy and power are the same measurement over an hourly interval: kWh is kW ×
#: 1h, so whichever one is not the target is the target rescaled. Both are dropped
#: and the reason is recorded, because "power_kw was dropped" is otherwise an
#: unexplained hole in the feature list.
ENERGY_POWER = ("energy_kwh", "power_kw")

#: The electrical identity: over a one-hour interval,
#: ``energy_kwh == voltage_v * current_a * power_factor / 1000``.
#:
#: This is real physics, not a data defect, and it is the reason a naive matrix
#: reports R² of 0.9996 on hourly meter data. Given current, voltage and power
#: factor a regressor does not learn anything — it multiplies three numbers. The
#: score looks excellent and means nothing about whether the model can forecast.
#:
#: So when the target is energy, the whole electrical set is held out together.
#: Holding out `power_kw` alone is not enough: the identity can be walked in
#: either direction, and `current_a` is just the target divided by voltage.
ELECTRICAL_IDENTITY = ("voltage_v", "current_a", "power_factor")


def excluded_columns(df: pd.DataFrame, target: str) -> tuple[set[str], list[str]]:
    """Columns held out of the matrix, and the dropped ones that were present.

    Returns the exclusion set plus the subset that actually existed in this frame,
    so the stage can tell the user which of its columns it refused and why. A
    dropped column nobody had is not worth mentioning.
    """
    excluded = set(IDENTIFIER_COLUMNS) | set(SAME_ROW_TARGET_DERIVATIVES)
    for c in ENERGY_POWER + ELECTRICAL_IDENTITY:
        if c != target:
            excluded.add(c)
    present = df.columns
    dropped = sorted(c for c in excluded if c in present and c != target)
    return excluded, dropped


#: Human labels and families for the contract's `display_name` / `family`.
ALGORITHM_INFO = {
    "xgboost": ("XGBoost", "boosted"),
    "random_forest": ("Random Forest", "ensemble"),
    "gradient_boosting": ("Gradient Boosting", "boosted"),
    "ridge": ("Ridge Regression", "linear"),
    "linear": ("Linear Regression", "linear"),
    "lasso": ("Lasso Regression", "linear"),
    "extra_trees": ("Extra Trees", "ensemble"),
}

HYPERPARAMETERS = {
    "xgboost": {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05},
    "random_forest": {"n_estimators": 200, "min_samples_leaf": 2},
    "gradient_boosting": {"n_estimators": 150, "max_depth": 4, "learning_rate": 0.05},
    "extra_trees": {"n_estimators": 200, "min_samples_leaf": 1},
    "ridge": {"alpha": 1.0},
    "lasso": {"alpha": 0.001},
    "linear": {},
}

#: What each candidate beat the winner at, used to write `lost_criteria`. A
#: candidate that lost on everything has no lost criteria, and saying so is more
#: useful than inventing a near miss.
CRITERIA = ("r2", "rmse", "speed")


def _normalise(values: dict[str, float], higher_is_better: bool) -> dict[str, float]:
    """Scale raw metrics to 0..1 across the candidate set.

    Min-max over a set of three or five candidates is sensitive to one outlier, but
    it is the only normalisation that keeps "this candidate is the best on R²"
    meaning exactly that, and the selection is a comparison, not an absolute
    score. A candidate set where every value is identical collapses to 1.0 rather
    than dividing by zero.
    """
    present = [v for v in values.values() if v is not None]
    if not present:
        return {k: 0.0 for k in values}
    lo, hi = min(present), max(present)
    if hi - lo < 1e-12:
        return {k: 1.0 for k in values}
    out = {}
    for k, v in values.items():
        if v is None:
            out[k] = 0.0
            continue
        scaled = (v - lo) / (hi - lo)
        out[k] = scaled if higher_is_better else 1.0 - scaled
    return out


def _dataset_characteristics(df: pd.DataFrame, X: pd.DataFrame, y: pd.Series) -> dict:
    """Facts about the data that explain why the winner won.

    Reported verbatim in the rationale because "xgboost scored highest" is not an
    answer to "why should I believe this?". These are the properties of the data a
    reader would use to predict which model fits it.
    """
    ts = "timestamp" if "timestamp" in df.columns else None
    span_days = None
    if ts:
        try:
            delta = pd.to_datetime(df[ts]).max() - pd.to_datetime(df[ts]).min()
            span_days = round(delta.total_seconds() / 86400.0, 1)
        except Exception:
            span_days = None
    return {
        "rows": int(len(y)),
        "feature_count": int(X.shape[1]),
        "span_days": span_days,
        "devices": int(df["device_code"].nunique()) if "device_code" in df.columns else None,
        "buildings": int(df["building_code"].nunique()) if "building_code" in df.columns else None,
        "target_mean": round(float(y.mean()), 4) if len(y) else None,
        "target_std": round(float(y.std()), 4) if len(y) else None,
        "target_cv": round(float(y.std() / y.mean()), 4) if len(y) and y.mean() else None,
        "missing_feature_rate": round(float(1 - len(y) / max(len(df), 1)), 4),
        "matrix_hash": dataset_hash(X),
    }


def train_candidates(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Train every candidate, score it, and return the contract payload.

    Writes the `Model` rows but not the `ModelSelection` row: the selection is the
    decision, and `select_model` makes it. Splitting them means a caller can train
    without committing to anything.
    """
    params = params or {}
    ds, df = load_dataframe(db, dataset_id, use_processed=True)

    target = params.get("target_column") or target_column(df)
    if not target:
        raise ValueError(
            "No target column found. Expected one of "
            f"{list(TARGET_CANDIDATES)}; got {list(df.columns)}."
        )

    sample_cap = int(params.get("sample_rows") or settings.ml_sample_rows)
    original_rows = int(len(df))
    sampled = False
    if original_rows > sample_cap:
        # Keep the tail: the split is chronological, so the most recent readings
        # are the ones that matter, and a head-sample would train on the oldest
        # data and test on the newest of what is left.
        df = df.tail(sample_cap).copy()
        sampled = True

    exclude, dropped = excluded_columns(df, target)
    # Derive per device first (see framing.per_device_frame), then split
    # chronologically on the frame that comes back.
    framed = per_device_frame(df)
    X, y, feature_cols = build_ml_matrix(framed, target, exclude=exclude, derive=False)
    if len(X) < 50:
        raise ValueError(
            f"Only {len(X)} usable rows after dropping nulls; need at least 50 to "
            "train and test. Check the target column and feature completeness."
        )
    test_frac = float(params.get("test_frac", 0.3))
    X_tr, X_te, y_tr, y_te = time_ordered_split(X, y, test_frac=test_frac)

    algorithms = list(params.get("algorithms") or settings.candidate_algorithms)
    candidates: list[dict] = []
    now = datetime.now(timezone.utc)

    for algorithm in algorithms:
        hp = dict(HYPERPARAMETERS.get(algorithm, {}))
        hp.update((params.get("hyperparameters") or {}).get(algorithm) or {})
        started = time.time()
        try:
            model = build_model(algorithm, hp)
            model.fit(X_tr.values, y_tr.values)
            pred = model.predict(X_te.values)
            elapsed = time.time() - started
            metrics = metrics_dict(y_te.values, pred)
            error = None
        except Exception as exc:
            elapsed = time.time() - started
            metrics = {"r2": None, "rmse": None, "mae": None, "mape": None}
            error = str(exc)[:500]

        trained_seconds = round(elapsed, 3)
        importances = feature_importance(model, feature_cols) if not error else {}
        row = Model(
            dataset_id=dataset_id,
            name=f"{ALGORITHM_INFO.get(algorithm, (algorithm, ''))[0]} v1",
            algorithm=algorithm,
            task_type="regression",
            version=1,
            hyperparameters=json_safe(hp),
            metrics=json_safe(
                {**metrics, "training_seconds": trained_seconds, "training_rows": int(len(y_tr))}
            ),
            feature_importances=json_safe(importances),
            training_time_seconds=trained_seconds,
            training_rows=int(len(y_tr)),
            status="failed" if error else "trained",
            error=error,
            is_active=False,
        )
        db.add(row)
        db.flush()
        display, family = ALGORITHM_INFO.get(algorithm, (algorithm, "linear"))
        candidates.append(
            {
                "id": row.id,
                "algorithm": algorithm,
                "display_name": display,
                "family": family,
                "metrics": {
                    **metrics,
                    "training_seconds": trained_seconds,
                    "training_rows": int(len(y_tr)),
                },
                "composite_score": None,  # filled in below, once all are comparable
                "normalised": {"r2": 0.0, "rmse": 0.0, "speed": 0.0},
                "selection_rank": None,
                "is_selected": False,
                "trained_at": now.isoformat(),
                "error": error,
                "feature_importances": importances,
            }
        )

    trained = [c for c in candidates if not c["error"]]
    if not trained:
        db.rollback()
        errors = "; ".join(f"{c['algorithm']}: {c['error']}" for c in candidates)
        raise ValueError(f"Every candidate failed to train. {errors}")

    norm_r2 = _normalise({c["algorithm"]: c["metrics"]["r2"] for c in trained}, True)
    norm_rmse = _normalise({c["algorithm"]: c["metrics"]["rmse"] for c in trained}, False)
    norm_speed = _normalise(
        {c["algorithm"]: c["metrics"]["training_seconds"] for c in trained}, False
    )
    weights = settings.selection_weights

    for c in candidates:
        if c["error"]:
            continue
        a = c["algorithm"]
        n = {"r2": norm_r2[a], "rmse": norm_rmse[a], "speed": norm_speed[a]}
        c["normalised"] = {k: round(v, 4) for k, v in n.items()}
        c["composite_score"] = round(sum(n[k] * float(weights.get(k, 0.0)) for k in CRITERIA), 4)

    ranked = sorted(
        (c for c in candidates if not c["error"]), key=lambda c: c["composite_score"], reverse=True
    )
    for i, c in enumerate(ranked, start=1):
        c["selection_rank"] = i
    winner = ranked[0]
    runner_up = ranked[1] if len(ranked) > 1 else None
    margin = (
        round(winner["composite_score"] - runner_up["composite_score"], 4) if runner_up else None
    )
    near_tie = bool(margin is not None and margin < float(settings.selection_near_tie_margin))
    winner["is_selected"] = True

    characteristics = _dataset_characteristics(df, X, y)
    characteristics.update(
        {
            "sampled": sampled,
            "rows_available": original_rows,
            "sample_cap": sample_cap,
            "target_column": target,
        }
    )
    split_strategy = f"chronological, last {int(test_frac * 100)}% held out"
    result = {
        "run_id": params.get("run_id"),
        "dataset_id": dataset_id,
        "selected_model_id": winner["id"],
        "selected_algorithm": winner["algorithm"],
        "rationale": _rationale(
            winner, runner_up, margin, near_tie, characteristics, split_strategy
        ),
        "winning_criteria": _criteria_where_won(winner, runner_up),
        "lost_criteria": _criteria_where_lost(winner, runner_up),
        "margin_over_second": margin,
        "near_tie": near_tie,
        "dataset_characteristics": characteristics,
        "candidates": [_public(c) for c in ranked] + [_public(c) for c in candidates if c["error"]],
        "target_column": target,
        "feature_count": int(X.shape[1]),
        "excluded_columns": dropped,
        "feature_importances": dict(list(winner.get("feature_importances", {}).items())[:15]),
        "train_rows": int(len(y_tr)),
        "test_rows": int(len(y_te)),
        "split_strategy": split_strategy,
        "weights": {k: float(weights.get(k, 0.0)) for k in CRITERIA},
        "decided_at": now.isoformat(),
    }

    for row in db.query(Model).filter(Model.dataset_id == dataset_id).all():
        row.is_active = row.id == winner["id"]
        row.composite_score = next(
            (c["composite_score"] for c in candidates if c["id"] == row.id), None
        )
        row.normalised = next((c["normalised"] for c in candidates if c["id"] == row.id), None)
        row.selection_rank = next(
            (c["selection_rank"] for c in candidates if c["id"] == row.id), None
        )

    snapshots.snapshot(
        db,
        dataset_id,
        "model_selection",
        result,
        row_count=len(result["candidates"]),
        run_id=params.get("run_id"),
    )
    audit(
        db,
        None,
        "execute",
        "model_selection",
        dataset_id,
        {"selected": winner["algorithm"], "margin": margin, "near_tie": near_tie},
    )
    db.commit()
    return result


def _public(candidate: dict) -> dict:
    """The contract shape. Internal bookkeeping keys stay out of the payload."""
    return {
        k: candidate[k]
        for k in (
            "id",
            "algorithm",
            "display_name",
            "family",
            "metrics",
            "composite_score",
            "normalised",
            "selection_rank",
            "is_selected",
            "trained_at",
            "error",
        )
    }


def _criteria_where_won(winner: dict, runner_up: dict | None) -> list[str]:
    if not runner_up:
        return list(CRITERIA)
    return [c for c in CRITERIA if winner["normalised"][c] > runner_up["normalised"][c]]


def _criteria_where_lost(winner: dict, runner_up: dict | None) -> list[str]:
    if not runner_up:
        return []
    return [c for c in CRITERIA if winner["normalised"][c] < runner_up["normalised"][c]]


def _rationale(
    winner: dict,
    runner_up: dict | None,
    margin,
    near_tie: bool,
    characteristics: dict,
    split_strategy: str,
) -> str:
    """Plain-language reasoning, assembled from the numbers rather than asserted."""
    display = winner["display_name"]
    m = winner["metrics"]
    parts = [
        f"{display} won on a weighted score of {winner['composite_score']:.3f} "
        f"(R² {m['r2']}, RMSE {m['rmse']} kWh, trained in {m['training_seconds']}s)."
    ]
    if runner_up:
        parts.append(
            f"Margin over {runner_up['display_name']} is {margin:.3f}."
            if margin is not None
            else f"No runner-up to compare against; {display} was the only candidate that trained."
        )
        if near_tie:
            parts.append(
                "This is inside the near-tie threshold, so the two are effectively tied and "
                "the faster one was taken — prefer it, not because it is more accurate."
            )
    ch = characteristics
    drivers = [f for f, _ in list((winner.get("feature_importances") or {}).items())[:4]]
    if drivers:
        parts.append("Largest feature contributions: " + ", ".join(drivers) + ".")
    if ch.get("span_days"):
        parts.append(f"Trained on {ch['rows']} rows spanning {ch['span_days']} days.")
    if ch.get("sampled"):
        parts.append(
            f"Sampled the most recent {ch['rows']} of {ch['rows_available']} rows to stay "
            f"inside the {ch['sample_cap']}-row training cap."
        )
    parts.append(f"Held-out split: {split_strategy}.")
    return " ".join(p for p in parts if p)


def select_model(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Train, decide, and record the `ModelSelection` row.

    Separate from `train_candidates` because the `ModelSelection` row is the
    record of a decision, and a caller that only wants the comparison should not
    leave one behind claiming a decision was made.
    """
    params = dict(params or {})
    result = train_candidates(db, dataset_id, params)
    now = datetime.now(timezone.utc)

    db.query(ModelSelection).filter(ModelSelection.dataset_id == dataset_id).delete(
        synchronize_session=False
    )
    db.add(
        ModelSelection(
            dataset_id=dataset_id,
            run_id=params.get("run_id"),
            selected_model_id=result["selected_model_id"],
            algorithm=result["selected_algorithm"],
            composite_score=next(
                c["composite_score"]
                for c in result["candidates"]
                if c["id"] == result["selected_model_id"]
            ),
            weights=json_safe(result["weights"]),
            winning_criteria=json_safe(result["winning_criteria"]),
            lost_criteria=json_safe(result["lost_criteria"]),
            margin_over_second=result["margin_over_second"],
            near_tie=result["near_tie"],
            dataset_characteristics=json_safe(result["dataset_characteristics"]),
            rationale=result["rationale"],
            candidates=json_safe(result["candidates"]),
            selected_at=now,
        )
    )

    run_id = params.get("run_id")
    if run_id:
        from app.db.models import WorkflowRun

        run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        if run:
            run.selected_model_id = result["selected_model_id"]

    audit(
        db,
        None,
        "execute",
        "model_selection",
        dataset_id,
        {"selected_model_id": result["selected_model_id"]},
    )
    db.commit()
    return result


def selection_state(db: Session, dataset_id: str) -> dict | None:
    """The last selection, or None if model selection has not been run."""
    return snapshots.latest_snapshot(db, "model_selection", dataset_id)


def candidate_list(db: Session, dataset_id: str) -> list[dict]:
    """Candidates from the last selection, ranked. Empty if never run."""
    state = selection_state(db, dataset_id)
    return list((state or {}).get("candidates") or [])


@register_stage_runner("model_selection")
def model_selection_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = select_model(db, dataset_id, {**params, "run_id": run.id})
    winner = next(c for c in result["candidates"] if c["is_selected"])
    confidence = max(0.0, min(1.0, float(winner["metrics"]["r2"] or 0.0)))
    decision = result["rationale"]
    if result["near_tie"]:
        decision += " Near tie — treat these two as interchangeable."
    return {
        "output": result,
        "confidence": round(confidence, 3),
        "decision": decision,
        "trace_extra": {
            "selected_algorithm": result["selected_algorithm"],
            "near_tie": result["near_tie"],
        },
    }
