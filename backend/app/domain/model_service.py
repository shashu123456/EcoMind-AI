"""Model training + registry service.

Ownership: S4. Persists model rows, serializes joblib to settings.data_dir/models/{id}.joblib,
auto-registers ModelRegistry entry (version 1, staging).
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Model, ModelRegistry
from app.domain.data import json_safe, read_dataset
from app.domain.feature_utils import (
    build_ml_matrix, build_model, dataset_hash, feature_importance, metrics_dict,
    time_ordered_split,
)
from app.domain.dataset_service import load_dataframe


def _models_dir() -> Path:
    p = settings.data_dir / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p


def model_payload(m: Model) -> dict:
    return {
        "id": m.id,
        "dataset_id": m.dataset_id,
        "name": m.name,
        "algorithm": m.algorithm,
        "task_type": m.task_type,
        "version": m.version,
        "hyperparameters": m.hyperparameters or {},
        "metrics": m.metrics or {},
        "feature_importances": m.feature_importances or {},
        "training_time_seconds": float(m.training_time_seconds or 0.0),
        "training_rows": m.training_rows,
        "model_path": m.model_path,
        "status": m.status,
        "is_active": bool(m.is_active),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def train(db: Session, params: dict, actor_id: str | None = None) -> Model:
    dataset_id = params["dataset_id"]
    algorithm = params.get("algorithm", "xgboost")
    target = params.get("target_column") or "energy_kwh"
    use_processed = bool(params.get("use_processed", True))
    features = params.get("features")
    hyper = params.get("hyperparameters") or {}

    _, df = load_dataframe(db, dataset_id, use_processed=use_processed)
    if target not in df.columns:
        raise ValueError(f"target_column '{target}' not found in dataset columns")
    X, y, feat_cols = build_ml_matrix(df, target, features=features)
    if len(y) < 30:
        raise ValueError(f"Not enough valid rows for training ({len(y)})")

    X_tr, X_te, y_tr, y_te = time_ordered_split(X, y)
    model_obj = build_model(algorithm, hyper)
    t0 = time.time()
    model_obj.fit(X_tr, y_tr)
    train_secs = time.time() - t0
    y_pred = model_obj.predict(X_te)
    m = metrics_dict(y_te, y_pred)
    fi = feature_importance(model_obj, feat_cols)

    model_id = None
    if params.get("model_id"):
        model_id = params["model_id"]

    row = Model(
        id=model_id,
        dataset_id=dataset_id,
        name=params.get("name") or f"{algorithm} energy model",
        algorithm=algorithm,
        task_type=params.get("task_type") or "regression",
        version=int(params.get("version") or 1),
        hyperparameters=hyper,
        metrics=m,
        feature_importances=fi,
        training_time_seconds=round(train_secs, 3),
        training_rows=int(len(y_tr)),
        status="trained",
        is_active=True,
    )
    if model_id is None:
        db.add(row)
        db.flush()
    else:
        row = db.merge(row)
        db.flush()
    _models_dir()
    path = _models_dir() / f"{row.id}.joblib"
    import joblib
    joblib.dump({"model": model_obj, "feature_cols": feat_cols, "target": target,
                 "algorithm": algorithm, "metrics": m}, path)
    row.model_path = str(path)

    existing = db.query(ModelRegistry).filter(ModelRegistry.model_id == row.id).first()
    if not existing:
        db.add(ModelRegistry(
            model_id=row.id,
            dataset_id=dataset_id,
            version=row.version,
            status="staging",
            performance_summary={
                "r2": m["r2"], "rmse": m["rmse"], "mae": m["mae"],
                "training_rows": int(len(y_tr)),
                "dataset_hash": dataset_hash(X),
                "feature_count": len(feat_cols),
            },
            is_current=False,
        ))
    else:
        existing.performance_summary = {
            "r2": m["r2"], "rmse": m["rmse"], "mae": m["mae"],
            "training_rows": int(len(y_tr)),
            "dataset_hash": dataset_hash(X),
            "feature_count": len(feat_cols),
        }
        existing.version = row.version
    db.commit()
    db.refresh(row)
    return row


def list_models(db: Session, dataset_id: str | None = None):
    q = db.query(Model).order_by(Model.created_at.desc())
    if dataset_id:
        q = q.filter(Model.dataset_id == dataset_id)
    return [model_payload(m) for m in q.all()]


def get_model(db: Session, model_id: str) -> Model:
    m = db.query(Model).filter(Model.id == model_id).first()
    if not m:
        raise ValueError(f"Model '{model_id}' not found")
    return m


def best_model(db: Session, dataset_id: str) -> Model | None:
    m = db.query(Model).filter(Model.dataset_id == dataset_id, Model.is_active.is_(True)) \
        .order_by(Model.created_at.desc()).first()
    if m is None:
        m = db.query(Model).filter(Model.dataset_id == dataset_id) \
            .order_by(Model.created_at.desc()).first()
    return m


def load_artifact(model_id: str) -> dict:
    path = _models_dir() / f"{model_id}.joblib"
    if not path.exists():
        raise ValueError(f"Serialized model '{model_id}' not found")
    import joblib
    return joblib.load(path)


def model_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    m = train(db, params, actor_id=run.user_id)
    return {"output": {"model": model_payload(m)},
            "confidence": float(m.metrics.get("r2", 0.0)),
            "decision": f"Trained {m.algorithm} (r2={m.metrics.get('r2', 0):.3f}, rmse={m.metrics.get('rmse', 0):.3f})"}


def _remove_stale_registrations():  # noqa  # safety: (not used)
    return None