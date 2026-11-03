"""Fitted model artifacts: save, load, and the feature schema they were trained on.

Ownership: S4 boundary with S5 (forecast).

Training used to return metrics and throw the estimator away, so nothing
downstream could ever call ``predict``. The forecast stage had no model to load
and no way to ask the question it exists to ask, which is why a dataset could
finish a ten-stage run with a model rank, a forecast trace and no forecast.

Two files per model, both named after the model row:

    {models_dir}/{model_id}.joblib      the estimator, exactly as fitted
    {models_dir}/{model_id}.meta.json   feature order, target, algorithm

The sidecar exists because a fitted array pipeline is positional: feature
columns must be supplied in the order training saw them, or the model silently
scores a well-formed but wrong matrix. Storing the order next to the estimator
makes "input columns match training columns" a fact that is read back rather
than a convention someone has to remember.

Loading a missing artifact raises rather than returning None, because every
caller of this module is about to predict and a silent fallback to something
made up is the failure mode this whole file exists to prevent.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings


class ArtifactMissing(FileNotFoundError):
    """The estimator file for a model id is not on disk."""


def artifact_path(model_id: str) -> Path:
    return settings.models_dir / f"{model_id}.joblib"


def meta_path(model_id: str) -> Path:
    return settings.models_dir / f"{model_id}.meta.json"


def save_artifact(
    model_id: str,
    estimator: Any,
    *,
    feature_cols: list[str],
    target: str,
    algorithm: str,
    hyperparameters: dict | None = None,
    training_rows: int | None = None,
    validation_rows: int | None = None,
    training_seconds: float | None = None,
    extra: dict | None = None,
) -> str:
    """Persist the estimator and its schema. Returns the estimator path."""
    import joblib

    settings.models_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_path(model_id)
    joblib.dump(estimator, path)
    meta = {
        "model_id": model_id,
        "algorithm": algorithm,
        "target": target,
        "feature_cols": list(feature_cols),
        "feature_count": len(feature_cols),
        "hyperparameters": hyperparameters or {},
        "training_rows": training_rows,
        "validation_rows": validation_rows,
        "training_seconds": training_seconds,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        **(extra or {}),
    }
    meta_path(model_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return str(path)


def load_artifact(model_id: str) -> tuple[Any, dict]:
    """The estimator and its recorded schema.

    Raises :class:`ArtifactMissing` when the row exists but the file does not,
    which is the state every model trained before this module was written is in.
    Callers retrain in that case rather than pretending to have a model.
    """
    import joblib

    path = artifact_path(model_id)
    if not path.exists():
        raise ArtifactMissing(str(path))
    estimator = joblib.load(path)
    meta: dict = {}
    mp = meta_path(model_id)
    if mp.exists():
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            meta = {}
    return estimator, meta


def has_artifact(model_id: str) -> bool:
    return artifact_path(model_id).exists()


def delete_artifact(model_id: str) -> None:
    for p in (artifact_path(model_id), meta_path(model_id)):
        try:
            p.unlink()
        except FileNotFoundError:
            pass
