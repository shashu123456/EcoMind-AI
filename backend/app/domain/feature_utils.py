"""Shared ML feature builders + metrics (no file I/O, pure pandas/numpy).

Ownership: S4.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import (
    explained_variance_score, mean_absolute_error, mean_squared_error, r2_score,
)

TEMP_FEATURES = [
    "hour_of_day", "day_of_week", "is_weekend", "month",
    "rolling_mean_24h", "rolling_std_24h", "lag_1h", "diff_1h",
    "load_factor", "energy_density",
]


def find_ts_column(df: pd.DataFrame) -> str | None:
    if "timestamp" in df.columns:
        return "timestamp"
    if "datetime" in df.columns:
        return "datetime"
    for c in df.columns:
        if c.lower() in ("ts", "time", "date", "datetime"):
            return c
    return None


def derive_features(df: pd.DataFrame, ts_col: str | None = None) -> pd.DataFrame:
    """Add temporal/lag/rolling/ratio features. Non-mutating (returns copy)."""
    out = df.copy()
    ts = ts_col or find_ts_column(out)
    if not ts:
        return out
    idx = pd.to_datetime(out[ts]).copy()
    out["hour_of_day"] = idx.dt.hour
    out["day_of_week"] = idx.dt.dayofweek
    out["is_weekend"] = (idx.dt.dayofweek >= 5).astype(int)
    out["month"] = idx.dt.month

    target_candidates = [c for c in out.columns if c in ("energy_kwh", "power_kw", "energy", "value", "load")]
    target = target_candidates[0] if target_candidates else None
    if target:
        s = pd.to_numeric(out[target], errors="coerce")
        out["rolling_mean_24h"] = s.rolling(24, min_periods=1).mean()
        out["rolling_std_24h"] = s.rolling(24, min_periods=1).std().fillna(0.0)
        out["lag_1h"] = s.shift(1)
        out["diff_1h"] = s.diff()
        if "power_kw" in out.columns and out["power_kw"].abs().max() > 0:
            out["load_factor"] = s / out["power_kw"].replace(0, np.nan)
        else:
            out["load_factor"] = np.nan
        if "occupancy_count" in out.columns:
            out["energy_density"] = s / out["occupancy_count"].replace(0, np.nan).clip(lower=0.01)
        else:
            out["energy_density"] = np.nan
    # ensure last row has lag/diff backbone for forecast
    out["lag_1h"] = out.get("lag_1h", s.shift(1)) if target else 0
    return out


def build_ml_matrix(df: pd.DataFrame, target: str, exclude: set | None = None,
                    derive: bool = True, features: list | None = None) -> tuple:
    """Return (X_df, y_series, feature_cols). Drops non-numeric + NaN rows."""
    ex = set(exclude or set())
    ex.update({"timestamp", "datetime", "is_anomaly", target, "asset_id", "asset_type"})
    src = derive_features(df) if derive else df.copy()
    cols = []
    for c in src.columns:
        if c in ex:
            continue
        if features:
            if c in features:
                cols.append(c)
            continue
        if pd.api.types.is_numeric_dtype(src[c]):
            cols.append(c)
        elif c.lower() in ("hour_of_day", "day_of_week", "is_weekend", "month"):
            cols.append(c)
    if not cols:
        raise ValueError("No usable numeric feature columns found")
    X = src[cols].apply(pd.to_numeric, errors="coerce")
    y = pd.to_numeric(src[target], errors="coerce")
    mask = X.notna().all(axis=1) & y.notna()
    return X[mask], y[mask], [c for c in X.columns if c not in ex]


def time_ordered_split(X, y, test_frac: float = 0.3):
    n = len(y)
    cut = int(n * (1 - test_frac))
    return X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]


def metrics_dict(y_true, y_pred) -> dict:
    yt = np.asarray(y_true, dtype=float)
    yp = np.asarray(y_pred, dtype=float)
    mape = float(np.mean(np.abs((yt - yp) / np.clip(np.abs(yt), 1e-9, None)))) * 100
    return {
        "r2": round(float(r2_score(yt, yp)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(yt, yp))), 4),
        "mae": round(float(mean_absolute_error(yt, yp)), 4),
        "mape": round(mape, 2),
        "explained_variance": round(float(explained_variance_score(yt, yp)), 4),
    }


ALGORITHM_FACTORY = {
    "xgboost": lambda hp: _xgboost(hp),
    "random_forest": lambda hp: _rf(hp),
    "gradient_boosting": lambda hp: _gb(hp),
    "linear": lambda hp: _linear(hp),
    "ridge": lambda hp: _ridge(hp),
    "lasso": lambda hp: _lasso(hp),
    "extra_trees": lambda hp: _et(hp),
}


def _xgboost(hp):
    import xgboost as xgb
    return xgb.XGBRegressor(
        n_estimators=hp.get("n_estimators", 200),
        max_depth=hp.get("max_depth", 6),
        learning_rate=hp.get("learning_rate", 0.05),
        subsample=0.9, colsample_bytree=0.9,
        objective="reg:squarederror", n_jobs=-2, random_state=7,
        verbosity=0)


def _rf(hp):
    from sklearn.ensemble import RandomForestRegressor
    return RandomForestRegressor(
        n_estimators=hp.get("n_estimators", 250),
        max_depth=hp.get("max_depth", None), min_samples_leaf=hp.get("min_samples_leaf", 2),
        n_jobs=-2, random_state=7)


def _gb(hp):
    from sklearn.ensemble import GradientBoostingRegressor
    return GradientBoostingRegressor(
        n_estimators=hp.get("n_estimators", 150),
        learning_rate=hp.get("learning_rate", 0.05), max_depth=hp.get("max_depth", 4),
        random_state=7)


def _linear(hp):
    from sklearn.linear_model import LinearRegression
    return LinearRegression()


def _ridge(hp):
    from sklearn.linear_model import Ridge
    return Ridge(alpha=hp.get("alpha", 1.0))


def _lasso(hp):
    from sklearn.linear_model import Lasso
    return Lasso(alpha=hp.get("alpha", 0.01), max_iter=5000)


def _et(hp):
    from sklearn.ensemble import ExtraTreesRegressor
    return ExtraTreesRegressor(
        n_estimators=hp.get("n_estimators", 200), min_samples_leaf=hp.get("min_samples_leaf", 2),
        n_jobs=-2, random_state=7)


def build_model(algorithm: str, hyperparameters: dict | None = None):
    hp = hyperparameters or {}
    factory = ALGORITHM_FACTORY.get(algorithm)
    if factory is None:
        raise ValueError(f"Unknown algorithm '{algorithm}'. Choose from {sorted(ALGORITHM_FACTORY)}")
    return factory(hp)


def feature_importance(model, feature_cols) -> dict:
    try:
        imp = model.feature_importances_
        out = {f: round(float(v), 4) for f, v in zip(feature_cols, imp) if v > 0}
        return dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True))
    except Exception:
        try:
            coef = getattr(model, "coef_")
            out = {f: round(float(abs(c)), 4) for f, c in zip(feature_cols, coef)}
            return dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True))
        except Exception:
            return {}


def dataset_hash(X) -> str:
    try:
        import hashlib
        s = ",".join(X.columns) + ":" + str(len(X))
        return hashlib.md5(s.encode()).hexdigest()[:10]
    except Exception:
        return "unknown"