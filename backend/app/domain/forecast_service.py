"""Forecasting, in two tiers, because one method cannot honestly span both.

Ownership: S6. Contract: docs/API_CONTRACT.md §4.2.

Short horizons (24h / 7d / 30d) and the 12-month projection are not the same
problem wearing different labels, and running one method across both produces a
number that is defensible for neither.

Three decisions worth stating
-----------------------------

**The 12-month view is a different model, not a longer recursion.** A model
trained on hourly rows and asked for hour 8,760 has compounded 8,760 recursive
steps. Its own error each step is small, but the errors are serially correlated,
so the interval after a year is a straight line with a number on it. The annual
view therefore uses additive Holt-Winters over the monthly history, and says so
in `method` on every row it produces.

**Recursive inference walks per device, never per row.** The single most
informative feature in this dataset is `lag_1h` — the previous hour of the same
meter. Predicting campus totals recursively would feed the building's next hour
with the *previous device's* prediction, which is a fabrication that reads as a
trend. Each device is walked on its own timeline and the results are summed
afterwards, so the aggregate inherits the per-device structure instead of
inventing it.

**The band is measured, not asserted.** Before forecasting, the last 14 days are
withheld and replayed through the exact recursive path, and the spread of those
errors is what sets the band. The band widens with the square root of the horizon
step because hourly errors are serially correlated, so linear growth would
understate the twelfth hour and overstate the seven-hundred-and-twentieth. Where
the backtest cannot run (less than 21 days of history) the band is reported as
`null` rather than as a number nobody measured.

What this module will not do
----------------------------

A forecast is a projection of the *selected* model, not a second opinion. It
never re-races algorithms, and `model_id` on every `forecasts` row points at the
one `ModelSelection` chose. A user comparing the forecast page against the model
page should be looking at the same model, and the report cites the same id.

Exogenous features (temperature, occupancy) are held at their trailing
same-hour-of-week mean over the next seven days, then flat. That is stated in
`confidence_note` on every short horizon, because a 30-day projection produced
under a frozen August temperature is a projection of August, and the reader has
to know that is what they are looking at.
"""

from __future__ import annotations

import time
from collections import deque
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from app.core.config import settings
from app.db.models import Forecast, Model, WorkflowRun
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.dataset_service import audit, load_dataframe
from app.domain.feature_utils import ALGORITHM_FACTORY, build_ml_matrix
from app.domain.framing import per_device_frame
from app.domain.model_service import excluded_columns
from app.domain.tariff import (
    CURRENCY,
    STANDING_CHARGE_PER_PERIOD,
    band_for_hour,
    blended_rate,
    co2_tonnes,
    cost_of_series,
    tariff_summary,
)
from app.workflow.events import emit
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

#: Hours in each short horizon label. A label the platform invents later has to
#: be added here deliberately, not derived from a string.
HORIZON_HOURS: dict[str, int] = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
}

#: Lead, in hours, at which the error that sets the band is measured. It is the
#: shortest horizon the platform reports, because that is where a recursive
#: forecast is actually trustworthy; the band widens from there.
BACKTEST_HORIZON = 24

#: Consecutive origins the backtest replays. Seven daily origins cover a full
#: week including a weekend; one origin is an anecdote.
BACKTEST_ORIGINS = 7

#: Hours of history required in front of the first origin. Less than two weeks
#: and the walk has no weekly cycle to reproduce, so the backtest would measure
#: the model's inability to guess which day it is.
MIN_TRAIN_HOURS = 24 * 14

#: Bands are never allowed to collapse onto the point estimate, whatever the
#: backtest says. A band of zero width is a claim of certainty this platform
#: cannot support on meter data.
MIN_BAND_PCT = 2.0

#: Ceiling on band width as a percentage of the point value. Past this the lower
#: bound is negative on any real distribution and the interval has stopped being
#: a range a reader can reason about.
MAX_BAND_PCT = 100.0

#: Rolling window behind the rolling mean / std features. Must match
#: `feature_utils.derive_features` or the forecast is fed features the model was
#: never trained on.
ROLLING_WINDOW = 24

CALENDAR_FEATURES = ("hour_of_day", "day_of_week", "is_weekend", "month")

#: Features that are functions of the target's own recent past, and therefore
#: have to be recomputed at every recursive step rather than carried forward.
SELF_REFERENTIAL = ("lag_1h", "diff_1h", "rolling_mean_24h", "rolling_std_24h")


def _horizon_labels() -> tuple[str, ...]:
    return tuple(settings.forecast_short_horizons)


# ── Contract: what the selected model was actually trained on ──────────────
class _Contract:
    """The feature contract, recovered from the model-selection snapshot.

    `Model` rows carry metrics and importances but not the column list, and
    nothing is pickled to disk, so the forecast rebuilds the matrix with the same
    exclusions the race used. Reading them back out of the snapshot is what keeps
    the forecast and the model on the same feature set; re-deriving the exclusions
    here would work until one of the two changed and then quietly disagree.
    """

    def __init__(self, model: Model, target: str, feature_cols: list[str]):
        self.model = model
        self.algorithm = model.algorithm
        self.hyperparameters = dict(model.hyperparameters or {})
        self.target = target
        self.feature_cols = feature_cols


def _contract(db: Session, dataset_id: str, ds, df: pd.DataFrame) -> _Contract:
    run = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.dataset_id == dataset_id)
        .order_by(WorkflowRun.created_at.desc())
        .first()
    )
    model_id = (run.selected_model_id if run else None) or None

    model = None
    if model_id:
        model = db.query(Model).filter(Model.id == model_id).first()
    if model is None:
        model = (
            db.query(Model)
            .filter(
                Model.dataset_id == dataset_id,
                Model.status == "trained",
            )
            .order_by(Model.composite_score.desc().nullslast())
            .first()
        )
    if model is None:
        raise ValueError(
            "No trained model for this dataset. Run the model selection stage "
            "before forecasting; the forecast projects the selected model and "
            "has nothing to project without it."
        )

    state = snapshots.latest_snapshot(db, "model_selection", dataset_id) or {}
    target = state.get("target_column") or next(
        (c for c in df.columns if c in ("energy_kwh", "energy_consumption_kwh", "power_kw")), None
    )
    if not target:
        raise ValueError(
            "No energy column to forecast. Expected one of energy_kwh, "
            f"energy_consumption_kwh or power_kw; got {list(df.columns)}."
        )

    exclude, _ = excluded_columns(df, target)
    _, _, feature_cols = build_ml_matrix(
        per_device_frame(df), target, exclude=exclude, derive=False
    )
    return _Contract(model, target, feature_cols)


def _fit(contract: _Contract, X: pd.DataFrame, y: pd.Series):
    estimator = ALGORITHM_FACTORY[contract.algorithm](contract.hyperparameters)
    estimator.fit(X.values, y.values)
    return estimator


# ── Recursive inference ──────────────────────────────────────────────────
class _DeviceWalk:
    """One device's forecast state: its recent history, carried step by step.

    The buffer holds enough of the device's own past to rebuild every
    self-referential feature. It is updated with *predictions* as the walk
    proceeds, which is what makes the recursion real rather than a loop that
    quietly replays history: step 300's `lag_1h` is step 299's prediction, and
    uncertainty about step 300 therefore propagates into step 301.
    """

    __slots__ = ("device_code", "building_code", "features", "recent", "exog")

    def __init__(
        self,
        device_code: str,
        building_code: str | None,
        features: list[str],
        target: str,
        block: pd.DataFrame,
    ):
        self.device_code = device_code
        self.building_code = building_code
        self.features = features
        # The buffer is the target's own recent past, indexed by timestamp —
        # the recursive features are rebuilt from the series, not from the frame.
        history = block.set_index("timestamp")[target].astype(float).dropna()
        self.recent: deque[float] = deque(history.tolist(), maxlen=ROLLING_WINDOW)

        # Exogenous columns are frozen at their trailing same-hour-of-week mean,
        # falling back to the last observed value for a column with no matching
        # bin (a meter that only reported during office hours, say).
        if history.empty:
            self.exog: dict[str, float] = {}
            return
        frame = block.set_index("timestamp").sort_index()
        window = frame[frame.index >= history.index.max() - pd.Timedelta(days=7)]
        group = (
            window.assign(_how=window.index.dayofweek * 24 + window.index.hour)
            .groupby("_how")
            .mean(numeric_only=True)
        )
        self.exog = {}
        for c in features:
            if c in CALENDAR_FEATURES or c in SELF_REFERENTIAL:
                continue
            if c in group.columns and not group[c].dropna().empty:
                self.exog[c] = float(group[c].dropna().iloc[-1])
            elif c in frame.columns and not frame[c].dropna().empty:
                self.exog[c] = float(frame[c].dropna().iloc[-1])

    def next_features(self, ts: pd.Timestamp) -> list[float]:
        row: list[float] = []
        recent = self.recent
        window = list(recent)
        for name in self.features:
            if name == "hour_of_day":
                row.append(float(ts.hour))
            elif name == "day_of_week":
                row.append(float(ts.dayofweek))
            elif name == "is_weekend":
                row.append(1.0 if ts.dayofweek >= 5 else 0.0)
            elif name == "month":
                row.append(float(ts.month))
            elif name == "lag_1h":
                row.append(float(window[-1]) if window else 0.0)
            elif name == "diff_1h":
                row.append(float(window[-1] - window[-2]) if len(window) >= 2 else 0.0)
            elif name == "rolling_mean_24h":
                row.append(float(np.mean(window)) if window else 0.0)
            elif name == "rolling_std_24h":
                row.append(float(np.std(window, ddof=0)) if len(window) else 0.0)
            else:
                row.append(self.exog.get(name, 0.0))
        return row

    def push(self, value: float) -> None:
        self.recent.append(float(value))


def _walk(
    contract: _Contract, estimator, frame: pd.DataFrame, steps: int
) -> tuple[list[str], list[str], dict[str, list[float]]]:
    """Recurse ``steps`` hours forward for every device, one step at a time.

    Every device is advanced together and predicted in one call, so the cost is
    ``steps`` predictions regardless of how many meters the campus has.
    """
    walks = [
        _DeviceWalk(
            code,
            block["building_code"].iloc[0] if "building_code" in block else None,
            contract.feature_cols,
            contract.target,
            block,
        )
        for code, block in frame.groupby("device_code", observed=True)
        if not block.empty
    ]
    order = [w.device_code for w in walks]
    series: dict[str, list[float]] = {code: [] for code in order}
    stamps: list[str] = []
    matrix = np.empty((len(walks), len(contract.feature_cols)), dtype=float)
    # The walk continues from the last timestamp in the frame, not from the
    # frame's index — the two differ whenever the frame was sorted or reset.
    start = pd.Timestamp(frame["timestamp"].max())

    for i in range(steps):
        ts = start + pd.Timedelta(hours=i + 1)
        stamps.append(ts.isoformat())
        for row_idx, walk in enumerate(walks):
            matrix[row_idx, :] = walk.next_features(ts)
        predicted = np.asarray(estimator.predict(matrix), dtype=float)
        # Energy is a non-negative quantity. A tree ensemble can emit a small
        # negative prediction for a night hour it has rarely seen, and a
        # negative kWh silently reduces the total, so it is clipped here rather
        # than allowed to cancel real consumption somewhere else in the week.
        predicted = np.clip(predicted, 0.0, None)
        for row_idx, walk in enumerate(walks):
            value = float(predicted[row_idx])
            series[walk.device_code].append(value)
            walk.push(value)
    return stamps, order, series


# ── Band, measured on a replay the model has not seen ─────────────────────
def _error_profile(contract: _Contract, frame: pd.DataFrame) -> float | None:
    """Rolling-origin backtest at the shortest horizon, which sets the band.

    Returns the mean absolute percentage error at that lead, or None when there
    is not enough history to run the replay.

    The lead measured is deliberately the *shortest* one the platform reports.
    Measuring error at the 30-day lead and then applying it to the 24-hour band
    produces a band so wide it is a confession rather than an interval, and it
    is the reason an early version of this reported 2,200% error. Error is
    measured where it is smallest and the sqrt-of-lead growth in `_band` carries
    it outward, which is a claim about how error accumulates rather than a
    measurement of each horizon — and the note on every row says so.

    Seven consecutive origins rather than one, because a single 24-hour window
    that happens to contain a holiday is not a forecast error, it is a anecdote.
    The model is fitted once; only the walk is repeated.
    """
    hours = sorted(frame["timestamp"].unique())
    span = len(hours)
    needed = BACKTEST_ORIGINS * BACKTEST_HORIZON
    if span < needed + MIN_TRAIN_HOURS:
        return None
    train = frame[frame["timestamp"] < hours[span - needed]]
    if train.empty:
        return None

    exclude, _ = excluded_columns(train, contract.target)
    X, y, _ = build_ml_matrix(
        per_device_frame(train), contract.target, exclude=exclude, derive=False
    )
    if len(X) < 50:
        return None
    estimator = _fit(contract, X, y)

    errors: list[np.ndarray] = []
    loads: list[np.ndarray] = []
    for origin_index in range(BACKTEST_ORIGINS):
        edge = span - needed + origin_index * BACKTEST_HORIZON
        origin_ts = pd.Timestamp(hours[edge - 1])
        seed = frame[frame["timestamp"] <= origin_ts]
        target = frame[
            (frame["timestamp"] > origin_ts)
            & (frame["timestamp"] <= hours[edge - 1 + BACKTEST_HORIZON])
        ]
        if seed.empty or target.empty:
            continue
        _, _, series = _walk(contract, estimator, seed, BACKTEST_HORIZON)
        predicted: dict[pd.Timestamp, float] = {}
        for code, values in series.items():
            block = target[target["device_code"] == code]
            for ts, value in zip(block["timestamp"].tolist(), values):
                key = pd.Timestamp(ts)
                predicted[key] = predicted.get(key, 0.0) + float(value)
        # Both sides are aggregated per timestamp. The walk sums every device at
        # an hour, so comparing that sum against individual device rows scores
        # each of thirty rows against the whole campus — which is how an early
        # version of this reported 2,000% error on a model with a 65% per-meter
        # error.
        stamps = pd.to_datetime(target["timestamp"])
        actual_by_ts = target[contract.target].astype(float).groupby(stamps).sum()
        keys = list(actual_by_ts.index)
        forecast_values = np.array(
            [predicted.get(pd.Timestamp(ts), np.nan) for ts in keys], dtype=float
        )
        actual_values = actual_by_ts.values.astype(float)
        keep = np.isfinite(forecast_values)
        if not keep.any():
            continue
        errors.append(forecast_values[keep] - actual_values[keep])
        loads.append(np.abs(actual_values[keep]))

    if not errors:
        return None
    all_errors = np.concatenate(errors)
    all_loads = np.concatenate(loads)
    mean_load = float(np.mean(all_loads))
    if mean_load <= 0:
        return None
    return float(np.mean(np.abs(all_errors)) / mean_load) * 100.0


def _band(centre: np.ndarray, mape_pct: float | None, step: int) -> tuple[np.ndarray, np.ndarray]:
    """Interval around a point forecast, anchored at the measured lead.

    ``mape_pct`` is the measured error at `BACKTEST_HORIZON` steps, so at that
    lead the band is exactly the observed error and it widens as the square root
    of the step count beyond it. Growing from step one instead — which is what
    this did first — multiplies the error of the first hour, where the model is
    nearly exact, by sqrt(720) and produces a 30-day band wider than the forecast.

    Serially correlated errors accumulate like a random walk, so the square root
    is the right shape; the cap is not a claim, it is the admission that beyond
    100% of the point value the interval has stopped being informative and a
    reader is better served by the point estimate and the note beside it.
    """
    if mape_pct is None:
        width = np.full(len(centre), np.nan)
    else:
        pct = min(
            MAX_BAND_PCT,
            max(MIN_BAND_PCT, mape_pct * float(np.sqrt(max(1, step) / BACKTEST_HORIZON))),
        )
        width = pct / 100.0 * np.abs(centre)
    return np.clip(centre - width, 0.0, None), centre + width


# ── Long horizon: additive Holt-Winters over monthly history ──────────────
def _monthly_history(frame: pd.DataFrame, target: str) -> pd.Series:
    s = frame.set_index("timestamp")[target].astype(float).resample("MS").sum()
    return s[s > 0]


def _long_points(
    frame: pd.DataFrame, target: str, months: int, step: pd.Timestamp
) -> tuple[list[dict], list[float], list[float], str, int]:
    """The monthly projection plus its bounds, or a clear statement it has none."""
    monthly = _monthly_history(frame, target)
    values = monthly.values.astype(float)
    n_history = int(len(values))
    stamps = [(step + pd.DateOffset(months=i)).strftime("%Y-%m") for i in range(months)]

    if n_history < 24:
        if n_history >= 3:
            slope = float(np.polyfit(np.arange(n_history), values, 1)[0])
            last = float(values[-1])
            projected = [last + slope * (1.0 - 0.7 ** (i + 1)) for i in range(months)]
        else:
            level = float(np.mean(values)) if n_history else 0.0
            projected = [level] * months
        return (
            [{"month": s, "energy_kwh": round(max(0.0, v), 2)} for s, v in zip(stamps, projected)],
            [0.0] * months,
            [0.0] * months,
            "damped_trend",
            n_history,
        )

    # Imported here, not at module scope, and only on the branch that needs it.
    # A campus with a month of history is a legitimate input and must not depend
    # on a seasonal package it will never use; a top-of-function import made the
    # thirty-day demo dataset fail with `No module named 'statsmodels'` before the
    # short-history branch could answer it.
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    cap = settings.seasonal_history_months * 3
    window = values[-min(len(values), cap) :]
    whole = (len(window) // 12) * 12
    window = window[-whole:] if whole >= 24 else values[-24:]
    fit = ExponentialSmoothing(
        window,
        trend="add",
        seasonal="add",
        seasonal_periods=12,
        damped_trend=True,
        initialization_method="estimated",
    ).fit(optimized=True)
    projected = np.clip(np.asarray(fit.forecast(months), dtype=float), 0.0, None)
    # In-sample residual scale, widened by sqrt of the lead time. Same reasoning
    # as the hourly band: serially correlated errors do not accumulate linearly.
    fitted = np.asarray(fit.fittedvalues, dtype=float)
    resid = values[-len(fitted) :] - fitted
    sigma = float(np.std(resid)) if len(resid) > 1 else 0.0
    width = 1.64 * sigma * np.sqrt(np.arange(1, months + 1))
    return (
        [{"month": s, "energy_kwh": round(float(v), 2)} for s, v in zip(stamps, projected)],
        [float(v) for v in np.clip(projected - width, 0.0, None)],
        [float(v) for v in projected + width],
        "holt_winters_additive_damped",
        n_history,
    )


def _calibrate(annual_projection: list[dict], short_daily: float, recent_daily: float) -> float:
    """Carry near-term drift into the annual view, clamped.

    Holt-Winters sees level and season. It does not see that consumption has been
    drifting up for three months, because a damped trend deliberately ignores
    recent slope in favour of the long-run one. The short model does see it. The
    ratio between the two is applied to the annual figure, bounded by
    `long_horizon_calibration_bounds` so that one unusual month cannot run the
    twelve-month projection away by a factor of three.
    """
    low, high = (float(x) for x in settings.long_horizon_calibration_bounds)
    if recent_daily <= 0 or short_daily <= 0 or not annual_projection:
        return 1.0
    projected_daily = float(np.mean([p["energy_kwh"] for p in annual_projection])) / 30.4375
    if projected_daily <= 0:
        return 1.0
    return float(np.clip(short_daily / projected_daily, low, high))


# ── Aggregation ───────────────────────────────────────────────────────────
def _hourly_frame(
    stamps: list[str], per_device: dict[str, list[float]], devices: list[str]
) -> pd.DataFrame:
    totals = np.zeros(len(stamps), dtype=float)
    for code in devices:
        values = np.asarray(per_device[code], dtype=float)
        if len(values) == len(stamps):
            totals += values
    return pd.DataFrame({"timestamp": pd.to_datetime(stamps), "energy_kwh": totals})


def _band_pct(centre: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float | None:
    """Full span of the interval as a percentage of the point value.

    Full span, not half-width: a reader asking "how wide is this band" means
    lower-to-upper. The consequence is that a span can reach 200% when the half
    width is pinned at `MAX_BAND_PCT` and the lower bound sits at zero.
    """
    if not len(centre):
        return None
    span = (upper - lower) / np.where(np.abs(centre) < 1e-9, np.nan, np.abs(centre))
    value = float(np.nanmean(span)) * 100.0
    return None if np.isnan(value) else round(value, 2)


def _aggregates(hourly: pd.DataFrame) -> dict:
    """Demand, money and carbon for one horizon's hourly series.

    `load_factor_pct` is measured against the campus's own observed peak rather
    than a nameplate capacity the platform does not have. A campus with no
    contracted demand on file can be told its load factor is 61% of what it has
    already done at worst; it cannot be told its load factor against 5 MW.
    """
    ts = hourly["timestamp"]
    kwh = hourly["energy_kwh"].astype(float).values
    cost = np.asarray([k * _rate(t) for k, t in zip(kwh, ts)], dtype=float)
    band = pd.Series([band_for_hour(t.hour).key for t in ts])
    cost_by_band = []
    for key in ("peak", "shoulder", "off_peak"):
        mask = (band == key).values
        if not mask.any():
            continue
        cost_by_band.append(
            {
                "band": key,
                "kwh": round(float(kwh[mask].sum()), 2),
                "cost_inr": round(float(cost[mask].sum()), 2),
            }
        )

    peak_at = ts.iloc[int(np.argmax(kwh))] if len(kwh) else None
    total = float(kwh.sum())
    days = max(1.0, len(kwh) / 24.0)
    return {
        "total_kwh": round(total, 2),
        "avg_daily_kwh": round(total / days, 2),
        "peak_demand_kw": round(float(np.max(kwh)), 3) if len(kwh) else 0.0,
        "peak_demand_at": peak_at.isoformat() if peak_at is not None else None,
        "p95_demand_kw": round(float(np.percentile(kwh, 95)), 3) if len(kwh) else 0.0,
        "load_factor_pct": (
            round(float(np.mean(kwh) / np.max(kwh) * 100.0), 2)
            if len(kwh) and np.max(kwh) > 0
            else 0.0
        ),
        "total_cost_inr": round(float(cost.sum()), 2),
        "blended_rate_per_kwh": blended_rate(zip(kwh, ts)),
        "projected_bill_inr": round(float(cost.sum()) + STANDING_CHARGE_PER_PERIOD, 2),
        "standing_charge_inr": round(STANDING_CHARGE_PER_PERIOD, 2),
        "co2_tonnes": co2_tonnes(total),
        "cost_by_band": cost_by_band,
    }


def _rate(ts) -> float:
    from app.domain.tariff import rate_for

    return rate_for(ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts)


# ── Stage ─────────────────────────────────────────────────────────────────
def forecast(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    params = dict(params or {})
    started = time.perf_counter()
    ds, df = load_dataframe(db, dataset_id, use_processed=True)
    if df.empty:
        raise ValueError("Dataset has no rows to forecast.")

    df = df.sort_values("timestamp").reset_index(drop=True)
    contract = _contract(db, dataset_id, ds, df)

    exclude, _ = excluded_columns(df, contract.target)
    # The same per-device framing the model race used, so the walk feeds the
    # model the feature distribution it was selected on.
    framed = per_device_frame(df)
    X, y, _ = build_ml_matrix(framed, contract.target, exclude=exclude, derive=False)
    if len(X) < 50:
        raise ValueError(
            f"Only {len(X)} usable rows for forecasting; the selected model needs "
            "at least 50. Re-run transformation to refresh the derived features."
        )
    estimator = _fit(contract, X, y)

    max_hours = int(settings.forecast_short_max_hours)
    labels = [h for h in _horizon_labels() if HORIZON_HOURS.get(h, 0) <= max_hours]
    max_steps = max((HORIZON_HOURS[h] for h in labels), default=0)
    origin = pd.Timestamp(df["timestamp"].max())

    profile = _error_profile(contract, df)
    if profile is None:
        mape: float | None = None
    else:
        mape = profile

    emit(
        params.get("run"),
        "forecast_progress",
        step="inference",
        steps=max_steps,
        origin=origin.isoformat(),
    )

    stamps, devices, per_device = _walk(contract, estimator, df, max_steps)

    # One pass, one hourly series, sliced per horizon. Walking once and taking
    # prefixes is what guarantees the 24h total is a subset of the 7d total; three
    # independent runs would be three forecasts that quietly disagreed.
    total_series = _hourly_frame(stamps, per_device, devices)
    hourly_points: list[dict] = []
    bands: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for i in range(len(total_series)):
        kwh = float(total_series["energy_kwh"].values[i])
        ts = total_series["timestamp"].iloc[i]
        # The band's sqrt growth is applied per *step* in `_band`, so each point
        # gets its own depth rather than the whole horizon's.
        lo, hi = _band(np.array([kwh]), mape, i + 1)
        hourly_points.append(
            {
                "timestamp": ts.isoformat(),
                "energy_kwh": round(kwh, 4),
                "lower_kwh": round(float(lo[0]), 4),
                "upper_kwh": round(float(hi[0]), 4),
                # Hourly kWh over a one-hour interval *is* average kW, so this is a
                # unit conversion and not a second forecast.
                "power_kw": round(kwh, 4),
                "cost_inr": round(kwh * _rate(ts.to_pydatetime()), 4),
                "tariff_band": band_for_hour(ts.hour).key,
            }
        )
        bands[ts.isoformat()] = (lo, hi)

    device_building = {
        code: (block["building_code"].iloc[0] if "building_code" in block else None)
        for code, block in df.groupby("device_code", observed=True)
    }

    horizons: list[dict] = []
    rows: list[Forecast] = []
    for label in labels:
        steps = HORIZON_HOURS[label]
        sub = total_series.head(steps)
        lower = np.array([bands[t][0][0] for t in sub["timestamp"].map(lambda x: x.isoformat())])
        upper = np.array([bands[t][1][0] for t in sub["timestamp"].map(lambda x: x.isoformat())])
        agg = _aggregates(sub)
        method = f"recursive_hourly::{contract.algorithm}"
        horizons.append(
            {
                "horizon": label,
                "tier": "short",
                "label": f"Next {label}",
                "total_kwh": agg["total_kwh"],
                "total_cost_inr": agg["total_cost_inr"],
                "peak_demand_kw": agg["peak_demand_kw"],
                "peak_demand_at": agg["peak_demand_at"],
                "co2_tonnes": agg["co2_tonnes"],
                "band_width_pct": _band_pct(sub["energy_kwh"].values, lower, upper),
                "method": method,
                "confidence_note": _confidence_note(
                    label, steps, mape, hours_history=int(df["timestamp"].nunique())
                ),
            }
        )
        rows.append(
            _forecast_row(
                dataset_id,
                params.get("run_id"),
                contract,
                "short",
                label,
                method,
                hourly_points[:steps],
                agg,
                lower,
                upper,
                None,
                0,
            )
        )

    # Per-building and per-device totals, summed from the same per-device walk so
    # they add up to the campus figure exactly instead of being a share applied
    # to it afterwards.
    scope_rows: list[dict] = []
    for code in devices:
        values = np.asarray(per_device[code], dtype=float)
        scope_rows.append(
            {
                "building_code": device_building.get(code),
                "device_code": code,
                "total_kwh": round(float(values.sum()), 2),
            }
        )
    campus_total = float(total_series["energy_kwh"].sum())
    for scope in scope_rows:
        if scope["total_kwh"] <= 0:
            continue
        rows.append(
            _scope_row(
                dataset_id,
                params.get("run_id"),
                contract,
                scope["building_code"],
                scope["device_code"],
                scope["total_kwh"],
                scope["total_kwh"] / campus_total if campus_total else 0.0,
                contract.algorithm,
            )
        )

    # --- long horizon --------------------------------------------------------
    months = int(settings.forecast_long_max_months)
    # The projection starts at the next month boundary. The current month is
    # part history — half-elapsed at best — and re-projecting it would put the
    # same kWh in both the history line and the forecast line.
    next_month = (origin + pd.offsets.MonthBegin(1)).replace(day=1)
    monthly_points, low_m, high_m, long_method, history_months = _long_points(
        df, contract.target, months, next_month
    )

    # Calibration compares like with like: a daily *total* on each side. The
    # recent figure is the mean of actual daily totals over the last 30 days of
    # history, and the short figure is the 24h horizon total, which is one day.
    daily_totals = df.set_index("timestamp")[contract.target].astype(float).resample("D").sum()
    recent_daily = float(daily_totals.tail(30).mean()) if len(daily_totals) else 0.0
    short_daily = float(horizons[0]["total_kwh"]) if horizons else 0.0
    calibration = _calibrate(monthly_points, short_daily, recent_daily)
    monthly_points = [
        {**p, "energy_kwh": round(p["energy_kwh"] * calibration, 2)} for p in monthly_points
    ]
    low_m = [v * calibration for v in low_m]
    high_m = [v * calibration for v in high_m]

    history = [
        {"month": ts.strftime("%Y-%m"), "energy_kwh": round(float(v), 2)}
        for ts, v in _monthly_history(df, contract.target).items()
    ]
    history_by_month = {h["month"]: h["energy_kwh"] for h in history}
    # The monthly series carries no hour, so it is priced at the campus blend
    # observed over the history window rather than at the short-tier rate.
    short_agg_rate = round(
        cost_of_series(
            df[contract.target].astype(float).tolist(),
            [ts.to_pydatetime() for ts in df["timestamp"]],
        )
        / max(1e-9, float(df[contract.target].astype(float).sum())),
        4,
    )

    # A monthly band cannot be measured from a monthly series this short, but
    # reporting 0.0 either side of the point would draw a flat line and claim a
    # certainty the note two lines above contradicts. The short tier's measured
    # band at the 30-day lead is inherited instead, and the note says so.
    if long_method.startswith("holt"):
        inherited_band = 0.0
    else:
        inherited_band = min(
            MAX_BAND_PCT,
            max(
                MIN_BAND_PCT,
                (
                    (mape * float(np.sqrt(HORIZON_HOURS["30d"] / BACKTEST_HORIZON)))
                    if mape
                    else MIN_BAND_PCT
                ),
            ),
        )

    monthly_view = [
        {
            "month": p["month"],
            "energy_kwh": p["energy_kwh"],
            "lower_kwh": round(p["energy_kwh"] * (1.0 - inherited_band / 100.0), 2),
            "upper_kwh": round(p["energy_kwh"] * (1.0 + inherited_band / 100.0), 2),
            "cost_inr": round(p["energy_kwh"] * _flat_rate(short_agg_rate), 2),
            "history_kwh": history_by_month.get(p["month"]),
        }
        for p in monthly_points
    ]

    annual_kwh = round(sum(p["energy_kwh"] for p in monthly_points), 2)
    annual_cost = round(sum(p["cost_inr"] for p in monthly_view), 2)
    long_note = _long_note(long_method, history_months, calibration, mape)
    horizons.append(
        {
            "horizon": "12m",
            "tier": "long",
            "label": "Next 12 months",
            "total_kwh": annual_kwh,
            "total_cost_inr": annual_cost,
            "peak_demand_kw": 0.0,
            "peak_demand_at": None,
            "co2_tonnes": co2_tonnes(annual_kwh),
            # A monthly aggregate is wider than the hourly band and is not measured
            # by the hourly backtest, so it is reported as unknown rather than
            # borrowed from a different horizon's number.
            "band_width_pct": None,
            "method": long_method,
            "confidence_note": long_note,
        }
    )
    rows.append(
        _forecast_row(
            dataset_id,
            params.get("run_id"),
            contract,
            "long",
            "12m",
            long_method,
            monthly_view,
            _long_aggregates(annual_kwh, annual_cost),
            [p["lower_kwh"] for p in monthly_view],
            [p["upper_kwh"] for p in monthly_view],
            calibration,
            history_months,
        )
    )

    db.query(Forecast).filter(Forecast.dataset_id == dataset_id).delete(synchronize_session=False)
    for row in rows:
        db.add(row)
    db.flush()

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    short_agg = _aggregates(total_series) if len(total_series) else _empty_aggregates()

    result = json_safe(
        {
            "run_id": params.get("run_id"),
            "dataset_id": dataset_id,
            "model_id": contract.model.id,
            "selected_algorithm": contract.algorithm,
            "target_column": contract.target,
            "origin_timestamp": origin.isoformat(),
            "history_rows": int(len(df)),
            "history_hours": int(df["timestamp"].nunique()),
            "devices": devices,
            "scope_totals": scope_rows,
            "exogenous_assumption": "trailing 7-day same-hour-of-week mean, held flat",
            "mape_backtest": None if mape is None else round(mape, 2),
            "hourly": hourly_points,
            "monthly": monthly_view,
            "monthly_history": history,
            "horizons": horizons,
            "aggregates": short_agg,
            "tariff": tariff_summary(),
            "calibration_factor": round(calibration, 4),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_ms": elapsed_ms,
        }
    )

    # The building split is computed here rather than left to `compare()`, which
    # is a read path that recomputes from the snapshot. Folding it into the
    # result means the report and the compare endpoint read the *same* numbers
    # from one computation. When they were separate, the report's buildings
    # section rendered empty — the snapshot had no `compare` key — while the
    # forecast page showed a full per-building table, which is exactly the kind
    # of silent disagreement between two views of one run that destroys trust
    # in both.
    result["compare"] = _compare_rows(result, agg=short_agg, steps=len(hourly_points))

    snapshots.snapshot(db, dataset_id, "forecast", result, run_id=params.get("run_id"))
    audit(
        db,
        None,
        "execute",
        "forecast",
        dataset_id,
        {"horizons": [h["horizon"] for h in horizons], "model_id": contract.model.id},
    )
    db.commit()

    emit(
        params.get("run"),
        "forecast_completed",
        horizons=[h["horizon"] for h in horizons],
        elapsed_ms=elapsed_ms,
    )
    return result


def _flat_rate(rate: float) -> float:
    # A month has no single tariff hour, so the monthly figure is priced at the
    # campus blend rather than at peak, which would overstate every forecast and
    # quietly build in a recommendation to shift nothing.
    return rate


def _long_aggregates(total_kwh: float, total_cost: float) -> dict:
    return {
        "total_kwh": total_kwh,
        "avg_daily_kwh": round(total_kwh / 365.25, 2),
        "peak_demand_kw": 0.0,
        "peak_demand_at": None,
        "p95_demand_kw": 0.0,
        "load_factor_pct": 0.0,
        "total_cost_inr": total_cost,
        "blended_rate_per_kwh": round(total_cost / total_kwh, 4) if total_kwh else 0.0,
        "projected_bill_inr": round(total_cost + STANDING_CHARGE_PER_PERIOD, 2),
        "standing_charge_inr": round(STANDING_CHARGE_PER_PERIOD, 2),
        "co2_tonnes": co2_tonnes(total_kwh),
        "cost_by_band": [],
    }


def _forecast_row(
    dataset_id: str,
    run_id,
    contract: _Contract,
    tier: str,
    horizon: str,
    method: str,
    points: list[dict],
    agg: dict,
    lower,
    upper,
    calibration,
    history_months: int,
) -> Forecast:
    return Forecast(
        dataset_id=dataset_id,
        run_id=run_id,
        model_id=contract.model.id,
        tier=tier,
        horizon=horizon,
        method=method,
        points=json_safe(points),
        aggregates=json_safe(agg),
        band_lower=json_safe([round(float(v), 4) for v in lower]),
        band_upper=json_safe([round(float(v), 4) for v in upper]),
        total_energy_kwh=agg.get("total_kwh"),
        total_cost_inr=agg.get("total_cost_inr"),
        peak_demand_kw=agg.get("peak_demand_kw"),
        peak_demand_at=_parse_ts(agg.get("peak_demand_at")),
        demand_p95_kw=agg.get("p95_demand_kw"),
        co2_tonnes=agg.get("co2_tonnes"),
        calibration_factor=calibration,
        history_months=history_months or None,
    )


def _empty_aggregates() -> dict:
    return {
        "total_kwh": 0.0,
        "avg_daily_kwh": 0.0,
        "peak_demand_kw": 0.0,
        "peak_demand_at": None,
        "p95_demand_kw": 0.0,
        "load_factor_pct": 0.0,
        "total_cost_inr": 0.0,
        "blended_rate_per_kwh": 0.0,
        "projected_bill_inr": round(STANDING_CHARGE_PER_PERIOD, 2),
        "standing_charge_inr": round(STANDING_CHARGE_PER_PERIOD, 2),
        "co2_tonnes": 0.0,
        "cost_by_band": [],
    }


def _scope_row(
    dataset_id: str,
    run_id,
    contract: _Contract,
    building: str | None,
    device: str | None,
    total_kwh: float,
    share: float,
    algorithm: str,
) -> Forecast:
    return Forecast(
        dataset_id=dataset_id,
        run_id=run_id,
        model_id=contract.model.id,
        tier="short",
        horizon="30d",
        method=f"recursive_hourly::{algorithm}",
        building_code=building,
        device_code=device,
        points=json_safe([]),
        aggregates=json_safe(
            {"total_kwh": round(total_kwh, 2), "share_pct": round(share * 100.0, 2)}
        ),
        total_energy_kwh=round(total_kwh, 2),
    )


def _parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _confidence_note(label: str, steps: int, mape: float | None, hours_history: int) -> str:
    if mape is None:
        return (
            f"{label} is a point projection only: {hours_history} hours of history "
            f"is under the {MIN_TRAIN_HOURS + BACKTEST_ORIGINS * BACKTEST_HORIZON} "
            "the error backtest needs, so no interval is reported rather than one "
            "that was never measured."
        )
    lead = steps / 24.0
    return (
        f"Recursive hourly projection {lead:g} days ahead, band measured at a "
        f"{BACKTEST_HORIZON}h lead over {BACKTEST_ORIGINS} rolling origins "
        f"({mape:.1f}% error) and widened as the square root of lead time. "
        "Temperature and occupancy are held at their trailing same-hour-of-week "
        "mean, so this is a projection of the weather as observed, not a weather "
        "forecast."
    )


def _long_note(method: str, history_months: int, calibration: float, mape: float | None) -> str:
    base = (
        f"Additive Holt-Winters over {history_months} months of history"
        if method.startswith("holt")
        else (
            f"Damped trend over {history_months} months of history; fewer than "
            "two annual cycles means no defensible seasonal pattern"
        )
    )
    if abs(calibration - 1.0) > 0.01:
        low, high = (float(x) for x in settings.long_horizon_calibration_bounds)
        clamped = " (clamped to the configured bound)" if calibration in (low, high) else ""
        base += (
            f". Calibrated x{calibration:.3f} against the short-term model to "
            f"carry near-term drift{clamped}"
        )
    base += (
        ". An hourly model cannot be trusted this far out: its own error is "
        "correlated step to step, so recursion past a few weeks produces a "
        "line dressed as a forecast."
    )
    return base


# ── Read paths ────────────────────────────────────────────────────────────
def forecast_state(db: Session, dataset_id: str) -> dict | None:
    return snapshots.latest_snapshot(db, "forecast", dataset_id)


def _compare_rows(state: dict, agg: dict | None = None, steps: int | None = None) -> dict:
    """Per-building projection totals, summed from the per-device walk.

    Reads the run's own `scope_totals`, which the stage summed from the walk, so
    the rows add up to the campus figure they sit under. Re-deriving them from a
    historical share would be wrong in the most likely way: the worst building
    changes between a 30-day historical share and a 30-day projection.
    """
    agg = agg if agg is not None else (state.get("aggregates") or {})
    rate = float(agg.get("blended_rate_per_kwh") or 0.0)
    steps = steps or len(state.get("hourly") or []) or 1

    by_building: dict[str, float] = {}
    for scope in state.get("scope_totals") or []:
        key = scope.get("building_code")
        if not key:
            # A flat meter dataset has no building column; everything is one
            # unnamed estate rather than a set of invented ones.
            key = "All sites"
        by_building[key] = by_building.get(key, 0.0) + float(scope.get("total_kwh") or 0.0)

    total = sum(by_building.values()) or 1.0
    rows = [
        {
            "building_code": key,
            "building_name": key,
            "total_kwh": round(value, 2),
            "total_cost_inr": round(value * rate, 2),
            "peak_demand_kw": round(value / steps, 3),
            "co2_tonnes": co2_tonnes(value),
            "share_pct": round(value / total * 100.0, 2),
        }
        for key, value in by_building.items()
    ]
    rows.sort(key=lambda r: -r["total_kwh"])
    return json_safe({"rows": rows, "total": len(rows)})


def compare(db: Session, dataset_id: str) -> dict:
    """The comparison table for the forecast page.

    Returns the block the stage already computed and stored, so the table and
    the snapshot cannot drift. Falls back to recomputing from `scope_totals` for
    a snapshot written before `compare` was folded in.
    """
    state = forecast_state(db, dataset_id)
    if not state:
        return {"rows": [], "total": 0}
    stored = state.get("compare")
    if stored and stored.get("rows"):
        return stored
    return _compare_rows(state)


def bill(db: Session, dataset_id: str, horizon: str = "30d") -> dict:
    """The 30-day view priced band by band, as a bill."""
    state = forecast_state(db, dataset_id)
    if not state:
        raise ValueError("No forecast yet; run the forecast stage first.")
    agg = state["aggregates"]
    total = float(agg["total_kwh"])
    bands = []
    for entry in agg.get("cost_by_band") or []:
        kwh = float(entry["kwh"])
        bands.append(
            {
                "band": entry["band"],
                "kwh": kwh,
                "rate_per_kwh": round(float(entry["cost_inr"]) / kwh, 4) if kwh else 0.0,
                "cost_inr": entry["cost_inr"],
            }
        )
    energy_charge = round(sum(b["cost_inr"] for b in bands), 2)
    standing = round(STANDING_CHARGE_PER_PERIOD, 2)
    return json_safe(
        {
            "dataset_id": dataset_id,
            "billing_period_days": int(HORIZON_HOURS.get(horizon, 24 * 30) / 24),
            "estimated_kwh": round(total, 2),
            "energy_charge_inr": energy_charge,
            "standing_charge_inr": standing,
            "total_inr": round(energy_charge + standing, 2),
            "currency": CURRENCY,
            "cost_by_band": bands,
            "projected_by_month": [
                {"month": p["month"], "kwh": p["energy_kwh"], "cost_inr": p["cost_inr"]}
                for p in state.get("monthly") or []
            ],
        }
    )


@register_stage_runner("forecast")
def forecast_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = forecast(db, dataset_id, {**params, "run_id": run.id, "run": run})

    short = [h for h in result["horizons"] if h["tier"] == "short"]
    lead = short[-1] if short else result["horizons"][0]
    if result.get("mape_backtest") is None:
        confidence = 0.4
    else:
        # Halved MAPE, floored at 0.2: a 5% backtest error is a strong forecast
        # and should read as one, but no meter forecast on this platform earns
        # full marks.
        confidence = round(max(0.2, min(0.95, 1.0 - result["mape_backtest"] / 20.0)), 3)

    decision = (
        f"{lead['total_kwh']:,.0f} kWh projected over {lead['label'].lower()} at "
        f"Rs {lead['total_cost_inr']:,.0f} ({result['co2_tonnes'] if 'co2_tonnes' in result else lead['co2_tonnes']:,.2f} tCO2). "
        f"Method: {result['selected_algorithm']} for short horizons, "
        f"{next(h['method'] for h in result['horizons'] if h['tier'] == 'long')} for 12 months."
    )
    return {
        "output": result,
        "confidence": confidence,
        "decision": decision,
        "trace_extra": {
            "model_id": result["model_id"],
            "horizons": [h["horizon"] for h in result["horizons"]],
        },
    }
