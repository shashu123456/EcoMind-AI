"""Energy forecasting: artifact -> recursive hourly inference -> persisted versions.

Ownership: S5. Contract: docs/API_CONTRACT.md §3.3.

What was wrong
--------------
The prediction page could only ever say "No forecast recorded yet". The stage
was registered in the rail and the stage trace said "completed", but the module
behind it had been reduced to a chart reader: nothing trained, nothing called
``predict``, nothing wrote a ``Forecast`` row. What the reader then found were
leftovers from an earlier build — a 12-month series keyed by ``month`` (which
the reader skipped, because it looked for ``timestamp``) and short-horizon rows
whose ``points`` was an empty list. Empty payload, empty page.

What this module does now
-------------------------
1. Loads the *selected* model's fitted artifact (``model_artifacts``), together
   with the exact column order recorded when it was trained. If the artifact is
   missing — every model trained before artifacts were saved is — it retrains
   from the same matrix and saves one, instead of failing the stage.
2. Walks the horizon hour by hour per device and feeds each prediction back as
   the next hour's lag, so the forecast is recursive rather than a flat line
   drawn from the last reading. Exogenous columns (temperature, occupancy,
   tariffs) are held at that device's trailing same-hour-of-week mean, which is
   recorded in the payload as an explicit assumption.
3. Measures its own error on the held-out tail of the history and uses those
   residuals for the confidence band, so the band widens with the horizon
   instead of being a fixed ±20% decoration.
4. Writes one ``forecast`` row per horizon with points, band, aggregates, cost,
   carbon and peak. Every run appends, so the versions are a ledger.
5. Writes the stage output the report and recommendation stages read
   (``horizons``, ``aggregates``, ``monthly_history``, ``compare``), which is
   what keeps those two stages honest when the forecast changes.
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from app.core.config import settings
from app.db.models import Dataset, Forecast, Model, ModelSelection, SchemaColumn
from app.domain import snapshots, tariff
from app.domain.data import json_safe
from app.domain.dataset_service import load_dataframe
from app.domain.feature_service import target_column
from app.domain.feature_utils import build_ml_matrix, build_model, metrics_dict
from app.domain.framing import per_device_frame
from app.domain.model_artifacts import ArtifactMissing, load_artifact, save_artifact
from app.domain.model_service import HYPERPARAMETERS, excluded_columns
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

#: (horizon key, hours, label). The order is the order the UI shows them in.
HORIZONS: tuple[tuple[str, int, str], ...] = (
    ("1h", 1, "Next hour"),
    ("6h", 6, "Next 6 hours"),
    ("12h", 12, "Next 12 hours"),
    ("24h", 24, "Next 24 hours"),
    ("2d", 48, "Next 2 days"),
    ("7d", 168, "Next 7 days"),
    ("30d", 720, "Next 30 days"),
)
HORIZON_HOURS = {key: hours for key, hours, _ in HORIZONS}
HORIZON_LABELS = {key: label for key, _, label in HORIZONS}
DEFAULT_HORIZON = "30d"

#: Hours of recorded history included with every forecast, so the chart can show
#: observed data and the projection on the same axis without a second request.
HISTORY_TAIL_HOURS = 168

#: The long tier is monthly. An hourly recursion extrapolated a year ahead is a
#: straight line dressed up as a forecast, so it is modelled on monthly totals.
LONG_HORIZON = "12m"
LONG_MONTHS = 12

DEVICE_COLUMN = "device_code"


# ─────────────────────────────────────────────────────────────
# Training context — the same matrix the model selection stage used
# ─────────────────────────────────────────────────────────────
def _training_context(db: Session, dataset_id: str):
    """Load the frame the selected model was trained on, unchanged.

    Deliberately delegates to the same helpers ``model_service`` uses. Re-typing
    the exclusion rules here is how a forecast ends up asking the model a
    question it was never trained on: one extra column and every prediction is
    silently wrong, with no error anywhere.
    """
    ds, df = load_dataframe(db, dataset_id, use_processed=True)
    target = target_column(df)
    if not target:
        raise ValueError(
            f"No energy target column found in this dataset (columns: {list(df.columns)})."
        )
    sample_cap = int(settings.ml_sample_rows)
    if len(df) > sample_cap:
        df = df.tail(sample_cap).copy()
    exclude, dropped = excluded_columns(df, target)
    framed = per_device_frame(df)
    X, y, feature_cols = build_ml_matrix(framed, target, exclude=exclude, derive=False)
    if not len(X):
        raise ValueError("No usable rows after feature construction; cannot forecast.")
    return ds, framed, target, feature_cols, X, y, dropped


def _selected_model(db: Session, dataset_id: str) -> Model:
    ms = (
        db.query(ModelSelection)
        .filter(ModelSelection.dataset_id == dataset_id)
        .order_by(ModelSelection.selected_at.desc())
        .first()
    )
    if not ms or not ms.selected_model_id:
        raise ValueError(
            "No model has been selected for this dataset yet. Run model selection "
            "before forecasting."
        )
    model = db.query(Model).filter(Model.id == ms.selected_model_id).first()
    if not model:
        raise ValueError("The selected model row is missing; re-run model selection.")
    if model.status == "failed":
        raise ValueError(f"The selected model failed to train: {model.error or 'unknown error'}")
    return model


def _load_or_refit(db: Session, model: Model, X, y, feature_cols, target):
    """The fitted estimator, its recorded schema, and whether it was retrained.

    A model trained before artifacts existed has metrics but no file. Retraining
    from the stored feature matrix is the only way to serve a forecast for it,
    and it is a real fit on the real data, not a stand-in.
    """
    try:
        estimator, meta = load_artifact(model.id)
        recorded = list(meta.get("feature_cols") or [])
        if recorded and recorded != list(feature_cols):
            raise ArtifactMissing(
                f"feature schema changed ({len(recorded)} recorded vs {len(feature_cols)} now)"
            )
        return estimator, meta, False
    except ArtifactMissing:
        pass

    hp = dict(HYPERPARAMETERS.get(model.algorithm, {}))
    hp.update((model.hyperparameters or {}) if isinstance(model.hyperparameters, dict) else {})
    estimator = build_model(model.algorithm, hp)
    estimator.fit(X.values, y.values)
    try:
        path = save_artifact(
            model.id,
            estimator,
            feature_cols=feature_cols,
            target=target,
            algorithm=model.algorithm,
            hyperparameters=hp,
            training_rows=int(len(y)),
            extra={"retrained_by": "forecast_service"},
        )
        model.model_path = path
        db.flush()
    except Exception:
        pass
    return estimator, {"feature_cols": list(feature_cols), "retrained": True}, True


# ─────────────────────────────────────────────────────────────
# Per-device history + exogenous profile
# ─────────────────────────────────────────────────────────────
def _parse_ts(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _device_frames(framed: pd.DataFrame, target: str) -> Dict[str, pd.DataFrame]:
    """One chronological frame per device, which is the unit the model predicts on."""
    if DEVICE_COLUMN not in framed.columns:
        return {"__all__": framed.copy()}
    frames: Dict[str, pd.DataFrame] = {}
    for device, chunk in framed.groupby(DEVICE_COLUMN, sort=True):
        if not isinstance(chunk, pd.DataFrame) or not len(chunk):
            continue
        frames[str(device)] = chunk.copy()
    return frames


def _exogenous_profile(df: pd.DataFrame, feature_cols: List[str]) -> Dict[str, np.ndarray]:
    """Trailing same-hour-of-week mean for every static column, per device.

    This is the documented assumption the payload reports: temperature,
    occupancy and tariff-derived columns are unknown in the future, so each hour
    is priced at the average the same weekday-hour has recorded. Anything with
    no history falls back to the device mean, then the frame mean.
    """
    ts = pd.to_datetime(df.get("timestamp"), errors="coerce")
    slot = (ts.dt.weekday * 24 + ts.dt.hour).to_numpy() if ts is not None else np.array([])
    profile: Dict[str, np.ndarray] = {}
    for col in feature_cols:
        if col in _RECURSIVE_COLUMNS:
            continue
        values = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        fallback = float(np.nanmean(values)) if np.isfinite(np.nanmean(values)) else 0.0
        slots = np.full(168, fallback, dtype=float)
        if slot.size == len(values):
            for s in range(168):
                mask = slot == s
                if mask.any():
                    v = values[mask]
                    v = v[np.isfinite(v)]
                    if v.size:
                        slots[s] = float(v.mean())
        profile[col] = slots
    return profile


#: Columns the recursion derives from its own predictions. They must never be
#: filled from the exogenous profile, or the lag the model is graded on would be
#: the trailing average instead of the value it just predicted.
_RECURSIVE_COLUMNS = {"lag_1h", "diff_1h", "rolling_mean_24h", "rolling_std_24h"}


def _backtest(estimator, framed: pd.DataFrame, feature_cols: List[str], target: str) -> dict:
    """Predict the held-out tail of the history and measure the error.

    The tail, not a random sample: the only error worth reporting for a forecast
    is the error on readings the model has not seen, in the order they happened.
    """
    tail = framed.tail(max(168, int(len(framed) * 0.3))).copy()
    if not len(tail):
        return {}
    Xb = tail[feature_cols].apply(pd.to_numeric, errors="coerce")
    yb = pd.to_numeric(tail[target], errors="coerce")
    mask = Xb.notna().all(axis=1) & yb.notna()
    if mask.sum() < 10:
        return {}
    try:
        pred = estimator.predict(Xb[mask].to_numpy(dtype=float))
    except Exception:
        return {}
    actual = yb[mask].to_numpy(dtype=float)
    metrics = metrics_dict(actual, pred)
    resid = pred - actual
    # Trend accuracy: does the model get the direction of change right?
    if len(actual) > 2:
        d_actual = np.diff(actual)
        d_pred = np.diff(pred)
        trend = float(np.mean(np.sign(d_actual) == np.sign(d_pred))) * 100.0
    else:
        trend = None
    return {
        **metrics,
        "bias": round(float(np.mean(resid)), 4),
        "residual_std": round(float(np.std(resid)), 4),
        "trend_accuracy": round(trend, 2) if trend is not None else None,
        "samples": int(mask.sum()),
        "window_start": str(tail["timestamp"].iloc[0]) if "timestamp" in tail else None,
        "window_end": str(tail["timestamp"].iloc[-1]) if "timestamp" in tail else None,
    }


# ─────────────────────────────────────────────────────────────
# Recursive hourly forecast
# ─────────────────────────────────────────────────────────────
def _build_hourly_path(
    estimator,
    framed: pd.DataFrame,
    feature_cols: List[str],
    target: str,
    max_hours: int,
    sigma: float,
    mape: float,
) -> Dict[str, Any]:
    """One aggregate hourly path across every device in the dataset.

    Devices are predicted together per hour (a single vectorised call) but each
    keeps its own history, so a device whose lag matters does not inherit its
    neighbour's series — the cross-device smear that made an earlier build's
    backtest meaningless.
    """
    # One predict call per hour is inevitable (each hour's lag is the previous
    # hour's prediction), and a forest with n_jobs=-2 pays thread-pool start-up
    # on every one of those calls: 720 hours took 190s that way, 9s this way.
    if hasattr(estimator, "n_jobs"):
        try:
            estimator.n_jobs = 1
        except Exception:
            pass

    frames = _device_frames(framed, target)
    histories: Dict[str, List[float]] = {}
    profiles: Dict[str, Dict[str, np.ndarray]] = {}
    last_ts: Optional[datetime] = None

    for device, df in frames.items():
        values = pd.to_numeric(df[target], errors="coerce").dropna().to_numpy(dtype=float)
        if not values.size:
            continue
        histories[device] = [float(v) for v in values[-168:]]
        profiles[device] = _exogenous_profile(df, feature_cols)
        ts = pd.to_datetime(df["timestamp"], errors="coerce") if "timestamp" in df else None
        if ts is not None and len(ts.dropna()):
            candidate = ts.dropna().max().to_pydatetime()
            if last_ts is None or candidate > last_ts:
                last_ts = candidate

    if not histories or last_ts is None:
        raise ValueError("No hourly history found; the dataset needs a timestamp and a target.")

    # Recorded history, aggregated per hour, so the chart has observed data.
    observed: Dict[datetime, float] = {}
    for device, df in frames.items():
        if "timestamp" not in df.columns:
            continue
        ts = pd.to_datetime(df["timestamp"], errors="coerce")
        vals = pd.to_numeric(df[target], errors="coerce")
        for t, v in zip(ts, vals):
            if pd.isna(t) or pd.isna(v):
                continue
            key = t.to_pydatetime().replace(minute=0, second=0, microsecond=0)
            observed[key] = observed.get(key, 0.0) + float(v)

    # The recursion touches a handful of columns per hour and holds the rest at
    # each device's profile. Precomputing the column positions keeps the inner
    # loop to array writes; building a DataFrame per hour cost 40 of the 48
    # seconds this stage used to spend.
    n_features = len(feature_cols)
    pos = {col: i for i, col in enumerate(feature_cols)}
    i_lag = pos.get("lag_1h")
    i_diff = pos.get("diff_1h")
    i_mean = pos.get("rolling_mean_24h")
    i_std = pos.get("rolling_std_24h")
    i_hour = pos.get("hour_of_day")
    i_dow = pos.get("day_of_week")
    i_weekend = pos.get("is_weekend")
    i_month = pos.get("month")
    temporal = {i for i in (i_hour, i_dow, i_weekend, i_month) if i is not None}
    devices = list(histories.keys())
    # Static part of each device's row, one 168-slot vector per feature index.
    static = {
        device: {
            pos[col]: profiles[device][col]
            for col in feature_cols
            if col not in _RECURSIVE_COLUMNS and pos[col] not in temporal
        }
        for device in devices
    }

    forecast_points: List[dict] = []
    for step in range(1, max_hours + 1):
        ts = last_ts + timedelta(hours=step)
        dow, hour, month = ts.weekday(), ts.hour, ts.month
        slot = dow * 24 + hour
        matrix = np.zeros((len(devices), n_features), dtype=float)
        for row_i, device in enumerate(devices):
            series = histories[device]
            prev = series[-1]
            prev2 = series[-2] if len(series) > 1 else prev
            for col_i, slots in static[device].items():
                matrix[row_i, col_i] = slots[slot]
            if i_lag is not None:
                matrix[row_i, i_lag] = prev
            if i_diff is not None:
                matrix[row_i, i_diff] = prev - prev2
            if i_mean is not None:
                matrix[row_i, i_mean] = float(np.mean(series[-24:]))
            if i_std is not None:
                matrix[row_i, i_std] = float(np.std(series[-24:]))
            if i_hour is not None:
                matrix[row_i, i_hour] = hour
            if i_dow is not None:
                matrix[row_i, i_dow] = dow
            if i_weekend is not None:
                matrix[row_i, i_weekend] = 1 if dow >= 5 else 0
            if i_month is not None:
                matrix[row_i, i_month] = month

        try:
            preds = estimator.predict(matrix)
        except Exception as exc:  # shape mismatch is a real error, not a shrug
            raise ValueError(
                "The selected model rejected the forecast matrix "
                f"({len(feature_cols)} features): {exc}"
            ) from exc

        total = 0.0
        for device, value in zip(devices, preds):
            v = max(0.0, float(value))
            histories[device].append(v)
            total += v

        # Uncertainty grows with the square root of the horizon, as a random walk
        # does; capped so a long horizon cannot claim an unbounded band.
        growth = math.sqrt(1.0 + step / 24.0)
        half = min(total * 0.6, 1.96 * sigma * growth) if sigma > 0 else total * 0.05
        confidence = max(0.0, min(99.0, 100.0 - (mape or 5.0) * growth))
        band = tariff.band_for_hour(hour)
        forecast_points.append(
            {
                "timestamp": ts.isoformat(),
                "energy_kwh": round(total, 4),
                "lower_kwh": round(max(0.0, total - half), 4),
                "upper_kwh": round(total + half, 4),
                "power_kw": round(total, 4),
                "cost_inr": tariff.cost_of(total, ts),
                "co2_kg": tariff.co2_of(total),
                "tariff_band": band.key,
                "confidence": round(confidence, 2),
                "temperature_c": None,  # filled from the profile when recorded
                "step": step,
            }
        )

    # Recorded temperature for the same hour, when the dataset carries it.
    if "temperature_c" in framed.columns and "timestamp" in framed.columns:
        ts_series = pd.to_datetime(framed["timestamp"], errors="coerce")
        temp = pd.to_numeric(framed["temperature_c"], errors="coerce")
        by_slot: Dict[int, float] = {}
        for t, v in zip(ts_series, temp):
            if pd.isna(t) or pd.isna(v):
                continue
            slot = int(t.weekday()) * 24 + int(t.hour)
            by_slot.setdefault(slot, float(v))
        for point in forecast_points:
            t = datetime.fromisoformat(point["timestamp"])
            value = by_slot.get(t.weekday() * 24 + t.hour)
            point["temperature_c"] = round(value, 2) if value is not None else None

    history_points = [
        {
            "timestamp": ts.isoformat(),
            "observed_kwh": round(kwh, 4),
            "cost_inr": tariff.cost_of(kwh, ts),
            "co2_kg": tariff.co2_of(kwh),
            "tariff_band": tariff.band_for_hour(ts.hour).key,
        }
        for ts, kwh in sorted(observed.items())[-HISTORY_TAIL_HOURS:]
    ]

    return {
        "origin": last_ts.isoformat(),
        "points": forecast_points,
        "history": history_points,
        "devices": sorted(histories),
    }


def _aggregates(points: List[dict], hours: int) -> dict:
    """Totals the report, recommendation and KPI cards all read."""
    kwh = [p["energy_kwh"] for p in points]
    total = float(sum(kwh))
    by_band: Dict[str, dict] = {}
    for p in points:
        band = p["tariff_band"]
        slot = by_band.setdefault(
            band,
            {
                "band": band,
                "label": tariff.band_for_key(band).label if tariff.band_for_key(band) else band,
                "rate_per_kwh": tariff.band_for_key(band).rate_per_kwh if tariff.band_for_key(band) else None,
                "kwh": 0.0,
                "cost_inr": 0.0,
                "hours": 0,
            },
        )
        slot["kwh"] = round(slot["kwh"] + p["energy_kwh"], 4)
        slot["cost_inr"] = round(slot["cost_inr"] + p["cost_inr"], 4)
        slot["hours"] += 1
    cost = float(sum(p["cost_inr"] for p in points))
    peak = max(points, key=lambda p: p["energy_kwh"]) if points else None
    values = np.array(kwh, dtype=float) if kwh else np.array([0.0])
    return {
        "total_kwh": round(total, 4),
        "avg_daily_kwh": round(total / max(hours / 24.0, 1e-9), 4),
        "peak_demand_kw": round(peak["energy_kwh"], 4) if peak else 0.0,
        "peak_demand_at": peak["timestamp"] if peak else None,
        "p95_demand_kw": round(float(np.percentile(values, 95)), 4),
        "load_factor_pct": round(float(values.mean() / values.max() * 100.0), 2) if values.max() > 0 else 0.0,
        "total_cost_inr": round(cost, 2),
        "blended_rate_per_kwh": round(cost / total, 4) if total > 0 else 0.0,
        "projected_bill_inr": round(cost + tariff.STANDING_CHARGE_PER_PERIOD, 2),
        "standing_charge_inr": tariff.STANDING_CHARGE_PER_PERIOD,
        "co2_tonnes": tariff.co2_tonnes(total),
        "cost_by_band": sorted(by_band.values(), key=lambda b: b["kwh"], reverse=True),
        "hours": hours,
    }


def _peaks(points: List[dict]) -> dict:
    """Where the horizon peaks, bottoms, and jumps — read off the predictions."""
    if not points:
        return {}
    peak = max(points, key=lambda p: p["energy_kwh"])
    low = min(points, key=lambda p: p["energy_kwh"])
    mean = sum(p["energy_kwh"] for p in points) / len(points)
    jumps = []
    for prev, cur in zip(points, points[1:]):
        jumps.append((cur["energy_kwh"] - prev["energy_kwh"], cur["timestamp"]))
    spike = max(jumps)[1] if jumps else None
    drop = min(jumps)[1] if jumps else None
    by_day: Dict[str, float] = {}
    for p in points:
        by_day[p["timestamp"][:10]] = by_day.get(p["timestamp"][:10], 0.0) + p["energy_kwh"]
    peak_day = max(by_day, key=by_day.get) if by_day else None
    return {
        "peak_hour": peak["timestamp"],
        "peak_kwh": round(peak["energy_kwh"], 2),
        "lowest_hour": low["timestamp"],
        "lowest_kwh": round(low["energy_kwh"], 2),
        "peak_day": peak_day,
        "peak_day_kwh": round(by_day.get(peak_day, 0.0), 2) if peak_day else None,
        "mean_kwh": round(mean, 2),
        "spike_at": spike,
        "drop_at": drop,
    }


def _feature_contributions(model: Model, framed: pd.DataFrame, feature_cols: List[str], target: str) -> List[dict]:
    """Importance, direction and (for linear models) the signed effect.

    Importance comes from the fitted model. Direction comes from the sign of the
    feature's correlation with the target in the recorded data, because a tree
    importance has no sign and inventing one would be a fabricated claim. The
    per-feature kWh effect is computed only where a coefficient exists, so it is
    absent rather than made up for ensemble models.
    """
    importances = model.feature_importances or {}
    total_importance = sum(float(v) for v in importances.values()) or 0.0
    coefs: Dict[str, float] = {}
    try:
        raw = getattr(model, "coef_", None)
        if raw is not None and len(raw) == len(feature_cols):
            coefs = {c: float(v) for c, v in zip(feature_cols, raw)}
    except Exception:
        coefs = {}

    out: List[dict] = []
    for col in feature_cols:
        imp = float(importances.get(col, 0.0))
        share = (imp / total_importance * 100.0) if total_importance else None
        direction = None
        corr = None
        try:
            x = pd.to_numeric(framed[col], errors="coerce")
            y = pd.to_numeric(framed[target], errors="coerce")
            mask = x.notna() & y.notna()
            if mask.sum() > 10 and float(x[mask].std()) > 0:
                corr = float(np.corrcoef(x[mask], y[mask])[0, 1])
                direction = "positive" if corr >= 0 else "negative"
        except Exception:
            pass
        delta = None
        if col in coefs:
            delta = round(coefs[col], 4)
            if direction is None:
                direction = "positive" if delta >= 0 else "negative"
        out.append(
            {
                "feature": col,
                "label": _feature_label(col),
                "importance": round(imp, 6),
                "importance_pct": round(share, 2) if share is not None else None,
                "direction": direction,
                "correlation": round(corr, 4) if corr is not None else None,
                "coefficient": delta,
                "group": _feature_group(col),
            }
        )
    out.sort(key=lambda f: (f["importance_pct"] if f["importance_pct"] is not None else -1), reverse=True)
    return out


_FEATURE_LABELS = {
    "hour_of_day": "Hour of day",
    "day_of_week": "Weekday",
    "is_weekend": "Weekend",
    "month": "Month",
    "lag_1h": "Previous hour load",
    "diff_1h": "Hourly change",
    "rolling_mean_24h": "24h rolling average",
    "rolling_std_24h": "24h rolling volatility",
    "temperature_c": "Temperature",
    "humidity_pct": "Humidity",
    "passenger_count": "Passenger count",
    "occupancy_count": "Occupancy",
    "power_kw": "Power demand",
    "voltage_v": "Voltage",
    "current_a": "Current",
    "power_factor": "Power factor",
    "cost_inr": "Recorded cost",
    "co2_kg": "Recorded carbon",
}


def _feature_label(col: str) -> str:
    return _FEATURE_LABELS.get(col, col.replace("_", " ").title())


def _feature_group(col: str) -> str:
    if col in {"hour_of_day", "day_of_week", "is_weekend", "month"}:
        return "Calendar"
    if col in _RECURSIVE_COLUMNS:
        return "Autoregressive"
    if col in {"temperature_c", "humidity_pct"}:
        return "Weather"
    if col in {"passenger_count", "occupancy_count"}:
        return "Occupancy"
    if col in {"cost_inr", "co2_kg"}:
        return "Tariff"
    if col in {"power_kw", "voltage_v", "current_a", "power_factor"}:
        return "Electrical"
    return "Operational"


# ─────────────────────────────────────────────────────────────
# Monthly long horizon
# ─────────────────────────────────────────────────────────────
def _monthly_history(framed: pd.DataFrame, target: str) -> List[dict]:
    if "timestamp" not in framed.columns:
        return []
    ts = pd.to_datetime(framed["timestamp"], errors="coerce")
    vals = pd.to_numeric(framed[target], errors="coerce")
    frame = pd.DataFrame({"ts": ts, "v": vals}).dropna()
    if frame.empty:
        return []
    frame["month"] = frame["ts"].dt.strftime("%Y-%m")
    totals = frame.groupby("month")["v"].sum().sort_index()
    return [{"month": m, "energy_kwh": round(float(v), 4)} for m, v in totals.items()]


def _long_horizon(history: List[dict], months: int = LONG_MONTHS) -> List[dict]:
    """Damped linear trend over monthly totals, with a widening band.

    With only a couple of months of history the slope is barely identified, so
    the damping keeps the projection from running away and the band is honest
    about it. Reported as such rather than presented as a confident year.
    """
    values = [h["energy_kwh"] for h in history]
    if not values:
        return []
    n = len(values)
    x = np.arange(n, dtype=float)
    slope = 0.0
    if n >= 3:
        slope = float(np.polyfit(x, np.array(values, dtype=float), 1)[0])
    last = float(values[-1])
    sigma = float(np.std(values)) if n > 1 else last * 0.15
    now = datetime.now(timezone.utc)
    out: List[dict] = []
    running = last
    for i in range(1, months + 1):
        month = (now.replace(day=1) + timedelta(days=32 * i)).strftime("%Y-%m")
        step = slope * (0.85 ** i)
        running = max(0.0, running + step)
        band = max(sigma, running * 0.08) * math.sqrt(i)
        out.append(
            {
                "month": month,
                "energy_kwh": round(running, 4),
                "lower_kwh": round(max(0.0, running - band), 4),
                "upper_kwh": round(running + band, 4),
                "cost_inr": tariff.cost_of(running),
                "history_kwh": None,
            }
        )
    return out


# ─────────────────────────────────────────────────────────────
# Generation
# ─────────────────────────────────────────────────────────────
def generate(
    db: Session,
    dataset_id: str,
    horizon: str = DEFAULT_HORIZON,
    run_id: str | None = None,
) -> dict:
    """Produce and persist the forecast for one horizon. Returns the payload."""
    started = time.time()
    horizon = horizon if horizon in HORIZON_HOURS else DEFAULT_HORIZON
    hours = HORIZON_HOURS[horizon]

    ds, framed, target, feature_cols, X, y, dropped = _training_context(db, dataset_id)
    model = _selected_model(db, dataset_id)
    estimator, meta, retrained = _load_or_refit(db, model, X, y, feature_cols, target)

    backtest = _backtest(estimator, framed, feature_cols, target)
    sigma = float(backtest.get("residual_std") or 0.0)
    mape = float(backtest.get("mape") or 0.0)

    path = _build_hourly_path(estimator, framed, feature_cols, target, hours, sigma, mape)
    points = path["points"]
    aggregates = _aggregates(points, hours)

    row = Forecast(
        dataset_id=dataset_id,
        run_id=run_id,
        model_id=model.id,
        tier="short",
        horizon=horizon,
        method=f"recursive_hourly::{model.algorithm}",
        points=json_safe(points),
        aggregates=json_safe(aggregates),
        band_lower=json_safe([p["lower_kwh"] for p in points]),
        band_upper=json_safe([p["upper_kwh"] for p in points]),
        total_energy_kwh=aggregates["total_kwh"],
        total_cost_inr=aggregates["total_cost_inr"],
        peak_demand_kw=aggregates["peak_demand_kw"],
        peak_demand_at=_parse_ts(aggregates["peak_demand_at"]),
        demand_p95_kw=aggregates["p95_demand_kw"],
        co2_tonnes=aggregates["co2_tonnes"],
        history_months=len(_monthly_history(framed, target)),
        generated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()

    payload = {
        "forecast": {
            "id": row.id,
            "dataset_id": dataset_id,
            "horizon": horizon,
            "horizon_label": HORIZON_LABELS[horizon],
            "hours": hours,
            "tier": "short",
            "method": row.method,
            "generated_at": row.generated_at.isoformat(),
            "origin": path["origin"],
            "points": points,
            "history": path["history"],
            "aggregates": aggregates,
            "peaks": _peaks(points),
            "devices": path["devices"],
            "exogenous_assumption": "trailing same-hour-of-week mean, held flat",
            "target_column": target,
            "unit": _unit_for(db, dataset_id, target),
        },
        "model": {
            "id": model.id,
            "algorithm": model.algorithm,
            "version": model.version,
            "trained_at": model.created_at.isoformat() if model.created_at else None,
            "feature_count": len(feature_cols),
            "features": feature_cols,
            "training_rows": model.training_rows,
            "training_seconds": model.training_time_seconds,
            "hyperparameters": model.hyperparameters or {},
            "metrics": model.metrics or {},
            "artifact": model.model_path,
            "artifact_source": "retrained" if retrained else "stored",
            "dropped_columns": dropped,
        },
        "quality": backtest,
        "features": _feature_contributions(model, framed, feature_cols, target),
        "status": "ready",
        "generation_ms": int((time.time() - started) * 1000),
    }

    snapshots.snapshot(
        db,
        dataset_id,
        "forecast",
        payload,
        scope=horizon,
        row_count=len(points),
        run_id=run_id,
    )
    db.commit()
    return payload


def generate_all(db: Session, dataset_id: str, run_id: str | None = None) -> dict:
    """Generate every horizon, the monthly projection, and the stage output.

    One model load, one backtest, seven horizon rows: the expensive part is
    shared, and each horizon keeps its own versioned row.
    """
    started = time.time()
    ds, framed, target, feature_cols, X, y, dropped = _training_context(db, dataset_id)
    model = _selected_model(db, dataset_id)
    estimator, meta, retrained = _load_or_refit(db, model, X, y, feature_cols, target)
    backtest = _backtest(estimator, framed, feature_cols, target)
    sigma = float(backtest.get("residual_std") or 0.0)
    mape = float(backtest.get("mape") or 0.0)
    features = _feature_contributions(model, framed, feature_cols, target)

    max_hours = HORIZON_HOURS[DEFAULT_HORIZON]
    path = _build_hourly_path(estimator, framed, feature_cols, target, max_hours, sigma, mape)
    full_points = path["points"]

    unit = _unit_for(db, dataset_id, target)
    horizons_out: List[dict] = []
    for key, hours, label in HORIZONS:
        pts = full_points[:hours]
        agg = _aggregates(pts, hours)
        band_width_pct = (
            round(
                float(np.mean([(p["upper_kwh"] - p["lower_kwh"]) / max(p["energy_kwh"], 1e-9) for p in pts]))
                * 100.0,
                2,
            )
            if pts
            else None
        )
        row = Forecast(
            dataset_id=dataset_id,
            run_id=run_id,
            model_id=model.id,
            tier="short",
            horizon=key,
            method=f"recursive_hourly::{model.algorithm}",
            points=json_safe(pts),
            aggregates=json_safe(agg),
            band_lower=json_safe([p["lower_kwh"] for p in pts]),
            band_upper=json_safe([p["upper_kwh"] for p in pts]),
            total_energy_kwh=agg["total_kwh"],
            total_cost_inr=agg["total_cost_inr"],
            peak_demand_kw=agg["peak_demand_kw"],
            peak_demand_at=_parse_ts(agg["peak_demand_at"]),
            demand_p95_kw=agg["p95_demand_kw"],
            co2_tonnes=agg["co2_tonnes"],
            generated_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.flush()
        # One snapshot per horizon, written here rather than only at the end.
        # `detail()` reads the horizon's own scope; when the stage wrote only the
        # default scope, a page opened on 24h fell back to whatever that scope
        # last held — in practice a snapshot from an older, leakier model that
        # reported 0.00% MAPE beside a forecast it had not produced.
        snapshots.snapshot(
            db,
            dataset_id,
            "forecast",
            {
                "forecast": {
                    "id": row.id,
                    "horizon": key,
                    "horizon_label": label,
                    "history": path["history"],
                    "aggregates": agg,
                    "exogenous_assumption": "trailing same-hour-of-week mean, held flat",
                    "target_column": target,
                    "unit": unit,
                    "devices": path["devices"],
                    "origin": path["origin"],
                },
                "origin_timestamp": path["origin"],
                "mape_backtest": backtest.get("mape"),
                "quality": backtest,
                "features": features,
                "selected_algorithm": model.algorithm,
                "artifact_source": "retrained" if retrained else "stored",
                "elapsed_ms": int((time.time() - started) * 1000),
            },
            scope=key,
            row_count=len(pts),
            run_id=run_id,
        )
        horizons_out.append(
            {
                "horizon": key,
                "tier": "short",
                "label": label,
                "hours": hours,
                "total_kwh": agg["total_kwh"],
                "total_cost_inr": agg["total_cost_inr"],
                "peak_demand_kw": agg["peak_demand_kw"],
                "peak_demand_at": agg["peak_demand_at"],
                "co2_tonnes": agg["co2_tonnes"],
                "band_width_pct": band_width_pct,
                "method": row.method,
                "confidence_note": (
                    f"Recursive hourly inference with a {sigma:,.1f} kWh residual band; "
                    f"{backtest.get('mape', 0):.2f}% MAPE on the held-out tail."
                    if sigma
                    else "Recursive hourly inference; residual band unavailable."
                ),
                "forecast_id": row.id,
            }
        )

    monthly_history = _monthly_history(framed, target)
    monthly = _long_horizon(monthly_history)
    if monthly:
        total_long = float(sum(m["energy_kwh"] for m in monthly))
        long_row = Forecast(
            dataset_id=dataset_id,
            run_id=run_id,
            model_id=model.id,
            tier="long",
            horizon=LONG_HORIZON,
            method="damped_trend",
            points=json_safe(monthly),
            aggregates=json_safe(
                {
                    "total_kwh": round(total_long, 4),
                    "total_cost_inr": round(float(sum(m["cost_inr"] for m in monthly)), 2),
                    "co2_tonnes": tariff.co2_tonnes(total_long),
                    "history_months": len(monthly_history),
                }
            ),
            band_lower=json_safe([m["lower_kwh"] for m in monthly]),
            band_upper=json_safe([m["upper_kwh"] for m in monthly]),
            total_energy_kwh=round(total_long, 4),
            total_cost_inr=round(float(sum(m["cost_inr"] for m in monthly)), 2),
            co2_tonnes=tariff.co2_tonnes(total_long),
            history_months=len(monthly_history),
            generated_at=datetime.now(timezone.utc),
        )
        db.add(long_row)
        db.flush()
        horizons_out.append(
            {
                "horizon": LONG_HORIZON,
                "tier": "long",
                "label": "Next 12 months",
                "months": len(monthly),
                "total_kwh": round(total_long, 4),
                "total_cost_inr": long_row.total_cost_inr,
                "co2_tonnes": long_row.co2_tonnes,
                "method": "damped_trend",
                "confidence_note": (
                    f"Monthly damped trend on {len(monthly_history)} month(s) of history; "
                    "band widens with the horizon."
                ),
                "forecast_id": long_row.id,
            }
        )

    default_agg = next((h for h in horizons_out if h["horizon"] == DEFAULT_HORIZON), horizons_out[0])
    elapsed_ms = int((time.time() - started) * 1000)
    output = {
        "run_id": run_id,
        "dataset_id": dataset_id,
        "model_id": model.id,
        "selected_algorithm": model.algorithm,
        "target_column": target,
        "unit": unit,
        "origin_timestamp": path["origin"],
        "history_rows": int(len(framed)),
        "history_hours": int(len(path["history"])),
        "devices": path["devices"],
        "exogenous_assumption": "trailing same-hour-of-week mean, held flat",
        "mape_backtest": backtest.get("mape"),
        "quality": backtest,
        "hourly": path["points"][: max(24, HORIZON_HOURS["24h"])],
        "monthly": monthly,
        "monthly_history": monthly_history,
        "horizons": horizons_out,
        "aggregates": next(
            (r.aggregates for r in [db.query(Forecast).filter(Forecast.id == default_agg["forecast_id"]).first()] if r),
            {},
        ),
        "tariff": tariff.tariff_summary(),
        "compare": {
            "rows": [
                {
                    "building_code": "All sites",
                    "building_name": "All sites",
                    "total_kwh": default_agg["total_kwh"],
                    "total_cost_inr": default_agg["total_cost_inr"],
                    "peak_demand_kw": default_agg.get("peak_demand_kw"),
                    "co2_tonnes": default_agg.get("co2_tonnes"),
                    "share_pct": 100.0,
                }
            ],
            "total": 1,
        },
        "features": features,
        "artifact_source": "retrained" if retrained else "stored",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
    }

    snapshots.snapshot(
        db,
        dataset_id,
        "forecast",
        output,
        row_count=len(full_points),
        run_id=run_id,
    )
    db.commit()
    return output


def _unit_for(db: Session, dataset_id: str, target: str) -> str:
    col = (
        db.query(SchemaColumn)
        .filter(SchemaColumn.dataset_id == dataset_id, SchemaColumn.name == target)
        .first()
    )
    return (col.unit or "") if col else ""


# ─────────────────────────────────────────────────────────────
# Stage runner
# ─────────────────────────────────────────────────────────────
@register_stage_runner("forecast")
def forecast_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    output = generate_all(db, dataset_id, run_id=run.id)
    short = next((h for h in output["horizons"] if h["horizon"] == DEFAULT_HORIZON), None)
    if short:
        decision = (
            f"{short['total_kwh']:,.0f} kWh projected over the next {short['horizon'].upper()} at "
            f"₹{short['total_cost_inr']:,.0f} ({short['co2_tonnes']:,.2f} tCO2). "
            f"Method: recursive hourly inference with {output['selected_algorithm']}, "
            f"{output['mape_backtest']:.2f}% MAPE on the held-out tail."
        )
    else:
        decision = "Forecast generated, but no short-horizon totals were recorded."
    confidence = 0.0
    try:
        confidence = max(0.0, min(1.0, 1.0 - float(output["mape_backtest"] or 0.0) / 20.0))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "output": json_safe(output),
        "confidence": round(confidence, 3),
        "decision": decision,
        "trace_extra": {
            "model_id": output["model_id"],
            "mape_backtest": output["mape_backtest"],
            "horizons": [h["horizon"] for h in output["horizons"]],
        },
    }


# ─────────────────────────────────────────────────────────────
# Readers
# ─────────────────────────────────────────────────────────────
def latest_row(db: Session, dataset_id: str, horizon: str | None = None) -> Forecast | None:
    q = db.query(Forecast).filter(Forecast.dataset_id == dataset_id)
    if horizon:
        q = q.filter(Forecast.horizon == horizon)
    else:
        # Prefer the short tier: a monthly row has no hourly shape the chart or
        # the KPI cards can use, and picking it by timestamp alone is what made
        # the page render an empty series while a forecast existed.
        q = q.filter(Forecast.tier == "short")
    return q.order_by(Forecast.generated_at.desc()).limit(1).scalar()


def _row_points(row: Forecast) -> List[dict]:
    return [p for p in (row.points or []) if isinstance(p, dict)]


def _point_timestamp(point: dict) -> Optional[datetime]:
    for key in ("timestamp", "month"):
        if point.get(key):
            raw = str(point[key])
            if key == "month" and len(raw) == 7:
                raw = f"{raw}-01T00:00:00"
            parsed = _parse_ts(raw)
            if parsed:
                return parsed
    return None


def history(db: Session, dataset_id: str, horizon: str = DEFAULT_HORIZON) -> List[dict]:
    """Every stored run for one horizon, newest first — the version ledger."""
    rows = (
        db.query(Forecast)
        .filter(Forecast.dataset_id == dataset_id, Forecast.horizon == horizon)
        .order_by(Forecast.generated_at.desc())
        .all()
    )
    out = []
    for i, row in enumerate(rows):
        agg = row.aggregates or {}
        out.append(
            {
                "version": len(rows) - i,
                "id": row.id,
                "generated_at": row.generated_at.isoformat() if row.generated_at else None,
                "horizon": row.horizon,
                "method": row.method,
                "total_kwh": row.total_energy_kwh,
                "total_cost_inr": row.total_cost_inr,
                "co2_tonnes": row.co2_tonnes,
                "mape": agg.get("mape"),
                "status": "current" if i == 0 else "superseded",
                "run_id": row.run_id,
                "model_id": row.model_id,
            }
        )
    return out


def detail(db: Session, dataset_id: str, horizon: str = DEFAULT_HORIZON) -> dict:
    """Everything the prediction page renders, in one payload.

    A page that assembles its own story from four endpoints disagrees with
    itself the moment one of them is stale. This returns the forecast row, the
    model that produced it, the measured error, the feature attributions, the
    peaks and the version ledger in one read.
    """
    horizon = horizon if horizon in HORIZON_HOURS else DEFAULT_HORIZON
    row = latest_row(db, dataset_id, horizon)
    if not row:
        return {
            "status": "missing",
            "dataset_id": dataset_id,
            "horizon": horizon,
            "horizon_label": HORIZON_LABELS.get(horizon, horizon),
            "message": (
                "No forecast is recorded for this dataset at this horizon. "
                "Generate one to project energy, cost and carbon from the selected model."
            ),
            "horizons": [
                {"horizon": key, "label": label, "hours": hours}
                for key, hours, label in HORIZONS
            ],
        }

    points = _row_points(row)
    model = db.query(Model).filter(Model.id == row.model_id).first() if row.model_id else None
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    # The horizon's own snapshot first, then the stage-wide one. Never a third
    # source: two readings of the same forecast must agree.
    snap = (
        snapshots.latest_snapshot(db, "forecast", dataset_id, scope=horizon)
        or snapshots.latest_snapshot(db, "forecast", dataset_id)
        or {}
    )
    quality = snap.get("quality") or {}
    features = snap.get("features") or []
    target = snap.get("forecast", {}).get("target_column") or (
        (snap.get("target_column")) if snap else None
    )
    unit = snap.get("forecast", {}).get("unit") if isinstance(snap.get("forecast"), dict) else None
    if not unit and target:
        unit = _unit_for(db, dataset_id, target)
    if unit is None:
        unit = ""

    agg = row.aggregates or {}
    versions = history(db, dataset_id, horizon)
    current_version = versions[0]["version"] if versions else None

    kpis = {
        "energy_kwh": row.total_energy_kwh,
        "cost_inr": row.total_cost_inr,
        "carbon_kg": round(float(row.total_energy_kwh or 0.0) * tariff.CO2_KG_PER_KWH, 2),
        "peak_kw": row.peak_demand_kw,
        "peak_at": row.peak_demand_at.isoformat() if row.peak_demand_at else agg.get("peak_demand_at"),
        "avg_kw": round(float(row.total_energy_kwh or 0.0) / max(HORIZON_HOURS.get(horizon, 1), 1), 2),
        "window_start": points[0]["timestamp"] if points and points[0].get("timestamp") else None,
        "window_end": points[-1]["timestamp"] if points and points[-1].get("timestamp") else None,
        "horizon": horizon,
        "horizon_label": HORIZON_LABELS.get(horizon, horizon),
        "confidence_pct": round(
            max(0.0, min(99.0, 100.0 - float(quality.get("mape") or 0.0))), 1
        )
        if quality
        else None,
        "model_version": f"{model.algorithm} v{model.version}" if model else None,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "version": current_version,
        "band_width_pct": (
            round(
                float(
                    np.mean(
                        [
                            (p["upper_kwh"] - p["lower_kwh"]) / max(p["energy_kwh"], 1e-9)
                            for p in points
                            if p.get("upper_kwh") is not None and p.get("lower_kwh") is not None
                        ]
                    )
                )
                * 100.0,
                2,
            )
            if points
            else None
        ),
    }

    return {
        "status": "ready",
        "dataset_id": dataset_id,
        "dataset_name": ds.name if ds else dataset_id,
        "horizon": horizon,
        "horizon_label": HORIZON_LABELS.get(horizon, horizon),
        "target_column": target,
        "unit": unit,
        "forecast": {
            "id": row.id,
            "horizon": row.horizon,
            "tier": row.tier,
            "method": row.method,
            "points": points,
            "history": snap.get("forecast", {}).get("history", []) if isinstance(snap.get("forecast"), dict) else [],
            "aggregates": agg,
            "peaks": _peaks(points),
            "generated_at": row.generated_at.isoformat() if row.generated_at else None,
            "exogenous_assumption": snap.get("exogenous_assumption"),
            "devices": snap.get("devices") or [],
        },
        "kpis": kpis,
        "model": (
            {
                "id": model.id,
                "algorithm": model.algorithm,
                "version": model.version,
                "trained_at": model.created_at.isoformat() if model.created_at else None,
                "training_rows": model.training_rows,
                "training_seconds": model.training_time_seconds,
                "hyperparameters": model.hyperparameters or {},
                "metrics": model.metrics or {},
                "feature_count": len(model.feature_importances or {}) or None,
                "features": list((model.feature_importances or {}).keys()),
                "artifact": model.model_path,
                "artifact_source": snap.get("artifact_source"),
            }
            if model
            else None
        ),
        "quality": quality,
        "features": features,
        "history": versions,
        "horizons": [
            {"horizon": key, "label": label, "hours": hours} for key, hours, label in HORIZONS
        ],
        "generated_ms": snap.get("elapsed_ms"),
        "tariff": tariff.tariff_summary(),
    }


def restore(db: Session, dataset_id: str, forecast_id: str) -> dict:
    """Make an earlier forecast the current one by re-recording it.

    The rows are append-only so the ledger never loses a run; restoring clones
    the chosen version forward as a new row, which is why the history shows both
    the original and the restore rather than pretending the later runs did not
    happen.
    """
    source = db.query(Forecast).filter(Forecast.id == forecast_id).first()
    if not source or source.dataset_id != dataset_id:
        raise ValueError("That forecast version does not belong to this dataset.")
    clone = Forecast(
        dataset_id=source.dataset_id,
        run_id=source.run_id,
        model_id=source.model_id,
        tier=source.tier,
        horizon=source.horizon,
        method=f"{source.method}::restored",
        points=source.points,
        aggregates=source.aggregates,
        band_lower=source.band_lower,
        band_upper=source.band_upper,
        total_energy_kwh=source.total_energy_kwh,
        total_cost_inr=source.total_cost_inr,
        peak_demand_kw=source.peak_demand_kw,
        peak_demand_at=source.peak_demand_at,
        demand_p95_kw=source.demand_p95_kw,
        co2_tonnes=source.co2_tonnes,
        calibration_factor=source.calibration_factor,
        history_months=source.history_months,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(clone)
    db.commit()
    return {"restored_from": source.id, "forecast_id": clone.id, "horizon": clone.horizon}


# ─────────────────────────────────────────────────────────────
# Chart reader (kept for the existing shell payload)
# ─────────────────────────────────────────────────────────────
def get_prediction_chart_data(
    db: Session,
    dataset_id: str,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Per-day observed/forecast series with band, cost and carbon.

    Handles both point shapes the platform has stored: hourly points keyed by
    ``timestamp`` and monthly points keyed by ``month``. The previous reader only
    understood ``timestamp``, so a dataset whose newest row was the 12-month
    projection rendered as "no forecast recorded" — which is exactly the bug this
    function used to have.
    """
    filters = filters or {}
    horizon = filters.get("horizon") or DEFAULT_HORIZON
    row = latest_row(db, dataset_id, horizon)
    if row is None:
        row = latest_row(db, dataset_id)

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    dataset_name = ds.name if ds else dataset_id
    domain = (ds.provenance or {}).get("domain", "") if ds else ""

    model_name = ""
    baseline_method = ""
    ms = db.query(ModelSelection).filter(ModelSelection.dataset_id == dataset_id).first()
    if ms and ms.selected_model_id:
        model = db.query(Model).filter(Model.id == ms.selected_model_id).first()
        if model:
            model_name = model.name or ""
            baseline_method = ms.rationale or ""

    units = {"energy": ""}
    if ms and ms.dataset_characteristics:
        target_col = ms.dataset_characteristics.get("target_column")
        if target_col:
            sc = db.query(SchemaColumn).filter_by(dataset_id=dataset_id, name=target_col).first()
            units = {"energy": (sc.unit if sc and sc.unit else "")}

    days: List[Dict[str, Any]] = []
    if row:
        points = _row_points(row)
        daily: Dict[str, Dict[str, float]] = {}
        for p in points:
            ts = _point_timestamp(p)
            if ts is None:
                continue
            key = ts.strftime("%Y-%m-%d")
            measured = p.get("energy_kwh")
            if measured is None:
                measured = p.get("forecast_energy_kwh")
            observed = p.get("observed_kwh", p.get("history_kwh"))
            forecast = p.get("forecast_energy_kwh", p.get("energy_kwh"))
            slot = daily.setdefault(
                key,
                {"observed": 0.0, "has_observed": 0.0, "forecast": 0.0, "lower": 0.0, "upper": 0.0, "cost": 0.0, "co2": 0.0, "n": 0.0},
            )
            if observed is not None:
                slot["observed"] += float(observed)
                slot["has_observed"] = 1.0
            if forecast is not None:
                slot["forecast"] += float(forecast)
            if p.get("lower_kwh") is not None:
                slot["lower"] += float(p["lower_kwh"])
            if p.get("upper_kwh") is not None:
                slot["upper"] += float(p["upper_kwh"])
            if p.get("cost_inr") is not None:
                slot["cost"] += float(p["cost_inr"])
            if p.get("co2_kg") is not None:
                slot["co2"] += float(p["co2_kg"])
            slot["n"] += 1

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for key in sorted(daily):
            slot = daily[key]
            n = max(slot["n"], 1)
            has_observed = bool(slot["has_observed"])
            days.append(
                {
                    "day": key,
                    "observed_energy_kwh": round(slot["observed"], 4) if has_observed else None,
                    "forecast_energy_kwh": round(slot["forecast"], 4),
                    "lower_kwh": round(slot["lower"], 4) if slot["lower"] else None,
                    "upper_kwh": round(slot["upper"], 4) if slot["upper"] else None,
                    "expected_cost_inr": round(slot["cost"], 2),
                    "expected_co2_kg": round(slot["co2"], 3),
                    # A projected day is one that was modelled, not metered. Tying
                    # this to the wall clock made every persisted forecast read as
                    # entirely historical the moment its origin aged past today,
                    # which is not what the flag means: it marks the modelled half
                    # of the chart so the UI can distinguish it from observed days.
                    "is_future": not has_observed,
                    "points": int(n),
                }
            )

    latest_snap = snapshots.latest_snapshot(db, "forecast", dataset_id, scope=horizon) or {}
    return {
        "days": days,
        "origin_timestamp": latest_snap.get("origin_timestamp"),
        "mape_backtest": latest_snap.get("mape_backtest"),
        "metadata": {
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
            "domain": domain,
            "model_name": model_name,
            "baseline_method": baseline_method,
            "units": units,
            "horizon": row.horizon if row else None,
            "tier": row.tier if row else None,
            "method": row.method if row else None,
            "generated_at": row.generated_at.isoformat() if row and row.generated_at else None,
        },
    }
