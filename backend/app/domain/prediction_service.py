"""Time-series ML prediction (recursive forecast) service.

Ownership: S4. Contract: docs/API_CONTRACT.md §3.9.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.db.models import Model, Prediction
from app.domain.data import json_safe
from app.domain.dataset_service import load_dataframe
from app.domain.feature_utils import (
    build_ml_matrix, build_model, metrics_dict, time_ordered_split,
)
from app.domain.model_service import (
    best_model, get_model, load_artifact, model_payload, train,
)

CO2_KG_PER_KWH = 0.5
PRICE_PER_KWH = 0.28

CALENDAR_FEATURES = {"hour_of_day", "day_of_week", "is_weekend", "month"}


def _build_forecast_row(ts, yhist, feat_cols, df_tail: dict) -> dict:
    row = {}
    for c in feat_cols:
        if c in CALENDAR_FEATURES:
            pass  # handled below
        elif c == "rolling_mean_24h":
            row[c] = float(np.mean(yhist[-24:])) if yhist else 0.0
        elif c == "rolling_std_24h":
            row[c] = float(np.std(yhist[-24:])) if len(yhist) >= 3 else 0.0
        elif c == "lag_1h":
            row[c] = float(yhist[-1]) if yhist else df_tail.get(c, 0.0)
        elif c == "diff_1h":
            row[c] = float(yhist[-1] - yhist[-2]) if len(yhist) >= 2 else 0.0
        elif c == "load_factor":
            if "power_kw" in df_tail:
                p = df_tail["power_kw"]
                row[c] = float((yhist[-1] / p) if p and abs(p) > 0 else 0.0) if yhist else 0.0
            else:
                row[c] = df_tail.get(c, 0.0)
        elif c == "energy_density":
            occ = df_tail.get("occupancy_count")
            row[c] = float((yhist[-1] / occ) if occ and occ > 0 else 0.0) if yhist else 0.0
        else:
            row[c] = df_tail.get(c, 0.0)
    row["hour_of_day"] = ts.hour
    row["day_of_week"] = ts.dayofweek
    row["is_weekend"] = int(ts.dayofweek >= 5)
    row["month"] = ts.month
    return row


def predict(db: Session, params: dict, actor_id: str | None = None) -> dict:
    from app.domain.dataset_service import audit

    dataset_id = params["dataset_id"]
    target = params.get("target_column") or "energy_kwh"
    horizon = int(params.get("horizon") or params.get("future_steps") or 24)
    horizon = max(1, min(horizon, 24 * 30))
    conf_level = float(params.get("confidence_level") or 0.90)
    use_processed = bool(params.get("use_processed", True))

    _, df = load_dataframe(db, dataset_id, use_processed=use_processed)
    if target not in df.columns:
        raise ValueError(f"target_column '{target}' not found")

    model = None
    if params.get("model_id"):
        model = get_model(db, params["model_id"])
    elif params.get("algorithm"):
        model = train(db, {**params, "use_processed": use_processed}, actor_id=actor_id)
    else:
        model = best_model(db, dataset_id)
        if model is None:
            model = train(db, {**params, "algorithm": params.get("algorithm", "xgboost"),
                               "use_processed": use_processed}, actor_id=actor_id)

    artifact = load_artifact(model.id)
    feat_cols = artifact["feature_cols"]
    algo = artifact["algorithm"]
    X, y, _ = build_ml_matrix(df, target, derive=True, features=feat_cols)
    m_obj = build_model(algo, model.hyperparameters or {})
    m_obj.fit(X, y)
    y_pred_full = m_obj.predict(X)
    train_metrics = metrics_dict(y, y_pred_full)

    resid = np.asarray(y) - np.asarray(y_pred_full)
    resid_std = float(np.std(resid)) or 1.0
    z = {0.80: 1.282, 0.90: 1.645, 0.95: 1.960, 0.99: 2.576}.get(
        min(conf_level, 0.99), 1.645)

    last_ts = pd.to_datetime(df.iloc[-1][df.columns[0]]) if len(df) else pd.Timestamp.utcnow()
    last_ts = pd.Timestamp(datetime.now(timezone.utc))
    try:
        last_ts = pd.to_datetime(df.iloc[-1]["timestamp"])
    except Exception:
        last_ts = pd.Timestamp(datetime.now(timezone.utc))

    df_tail = {}
    for c, v in df.iloc[-1].to_dict().items():
        if np.isscalar(v) and pd.api.types.is_numeric_dtype(type(v)) or isinstance(v, (int, float, np.number)):
            try:
                df_tail[c] = float(v)
            except (TypeError, ValueError):
                pass
    yhist = [float(v) for v in y.tolist()]

    points = []
    for h in range(horizon):
        ts = last_ts + pd.Timedelta(hours=h + 1)
        row = _build_forecast_row(ts, yhist, feat_cols, df_tail)
        p = float(m_obj.predict(pd.DataFrame([[row[c] for c in feat_cols]], columns=feat_cols))[0])
        p = max(0.0, p)
        lo = max(0.0, p - z * resid_std)
        hi = p + z * resid_std
        points.append({
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S"),
            "predicted": round(p, 3),
            "lower": round(lo, 3),
            "upper": round(hi, 3),
            "actual": None,
            "confidence": round(float(max(min(1.0, model.metrics.get("r2", 0.0) + 0.2), 0.05)), 3),
        })
        yhist.append(p)

    preds = [dict(p) for p in points]
    for pt in preds:
        db.add(Prediction(
            model_id=model.id,
            dataset_id=dataset_id,
            input_data={"features": json_safe(feat_cols)},
            predicted_value=pt["predicted"],
            confidence=pt["confidence"],
            prediction_type="interval",
            interval_lower=pt["lower"],
            interval_upper=pt["upper"],
            actual_value=None,
            error=None,
        ))
    audit(db, actor_id and type("U", (), {"id": actor_id})() or None,
          "execute", "prediction", model.id, {"horizon": horizon})
    db.commit()

    total = round(sum(p["predicted"] for p in preds), 2)
    peak_idx = int(np.argmax([p["predicted"] for p in preds]))
    return {
        "model": model_payload(model),
        "predictions": preds,
        "metrics": train_metrics,
        "forecast_start": preds[0]["timestamp"] if preds else None,
        "forecast_end": preds[-1]["timestamp"] if preds else None,
        "horizon_summary": {
            "horizon_hours": horizon,
            "total_kwh": total,
            "peak_kw": round(preds[peak_idx]["predicted"], 3),
            "peak_time": preds[peak_idx]["timestamp"],
            "avg_kw": round(total / horizon, 3),
            "co2_estimate_kg": round(total * CO2_KG_PER_KWH, 2),
            "cost_estimate": round(total * PRICE_PER_KWH, 2),
        },
    }


def list_predictions(db: Session, model_id: str | None = None, dataset_id: str | None = None, limit: int = 500):
    q = db.query(Prediction).order_by(Prediction.created_at.desc())
    if model_id:
        q = q.filter(Prediction.model_id == model_id)
    if dataset_id:
        q = q.filter(Prediction.dataset_id == dataset_id)
    out = []
    for p in q.limit(max(1, min(limit, 1000))).all():
        out.append({
            "id": p.id, "model_id": p.model_id, "dataset_id": p.dataset_id,
            "predicted_value": p.predicted_value, "confidence": p.confidence,
            "prediction_type": p.prediction_type, "interval_lower": p.interval_lower,
            "interval_upper": p.interval_upper, "actual_value": p.actual_value,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return out


def prediction_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = predict(db, {**params, "dataset_id": dataset_id}, actor_id=run.user_id)
    return {"output": result, "confidence": float(result["model"]["metrics"].get("r2", 0.0)),
            "decision": f"{result['model']['algorithm']} forecast over {result['horizon_summary']['horizon_hours']}h "
                        f"(r2={result['metrics'].get('r2', 0):.3f}); total {result['horizon_summary']['total_kwh']} kWh predicted"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("prediction")(prediction_stage)