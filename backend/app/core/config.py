import sys
import warnings
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: backend/ -- this file is backend/app/core/config.py.
BACKEND_DIR = Path(__file__).resolve().parents[2]

#: The shipped fallback. Kept only so the app can be imported for a quick look;
#: the launcher always writes a generated key, so seeing this at runtime means
#: `backend/.env` was lost, never edited, or hand-copied from `.env.example`.
DEV_SECRET_KEY = "eco-mind-dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ECOMIND_",
        # Anchored to backend/ rather than the working directory. A relative
        # ".env" silently resolves against wherever the process was started, so
        # `python backend/seed.py` from the repo root -- which the launcher
        # itself suggests in its failure message -- loaded none of it and fell
        # back to the placeholder secret while the running app used the real
        # one. The two disagreed about how tokens were signed.
        env_file=str(BACKEND_DIR / ".env"),
        protected_namespaces=("settings_",),
        # `ignore`, not the pydantic default `forbid`. The launcher generates
        # backend/.env, and an operator may well add a key of their own; a
        # surplus variable is not a reason to refuse to start. Every value this
        # app actually depends on is a declared field below, and a typo in one
        # of those still fails loudly at startup rather than silently defaulting.
        extra="ignore",
    )

    # Deployment label, written by the launcher as ECOMIND_ENV=local. Declared
    # so the generated .env is always readable.
    env: str = "local"

    app_name: str = "EcoMind"
    app_tagline: str = "Enterprise Energy Analytics Platform"
    port: int = 8000
    secret_key: str = DEV_SECRET_KEY
    access_token_expire_minutes: int = 60 * 24
    jwt_algorithm: str = "HS256"

    root_dir: Path = Path(__file__).resolve().parents[2]
    data_dir: Path = Path(root_dir) / "data"
    uploads_dir: Path = data_dir / "uploads"
    processed_dir: Path = data_dir / "processed"
    sample_dir: Path = data_dir / "sample"
    reports_dir: Path = data_dir / "reports"
    generated_dir: Path = data_dir / "generated"
    reference_dir: Path = data_dir / "reference"
    models_dir: Path = data_dir / "models"

    db_path: Path = data_dir / "ecomind.db"

    max_upload_mb: int = 200
    max_rows: int = 400_000
    ml_sample_rows: int = 60_000

    # --- Model selection -----------------------------------------------------
    # The six candidates the platform races in a single pass. The workspace
    # trains them simultaneously and auto-selects the winner, so a broader
    # cohort is a feature rather than noise.
    candidate_algorithms: tuple[str, ...] = (
        "xgboost",
        "random_forest",
        "gradient_boosting",
        "extra_trees",
        "ridge",
        "linear",
    )
    # Weights applied to min-max normalised metrics. R² and RMSE dominate
    # because they describe accuracy; speed is a tie-breaker only.
    selection_weights: dict[str, float] = {
        "r2": 0.50,
        "rmse": 0.35,
        "speed": 0.15,
    }
    # Below this composite margin the winner is reported as a near-tie rather
    # than presented as decisive.
    selection_near_tie_margin: float = 0.02

    # --- Forecasting ---------------------------------------------------------
    # Short horizons use recursive hourly inference with the selected model.
    # Long horizons use a seasonal model; an hourly recursion that far out
    # would compound error into meaninglessness.
    forecast_short_horizons: tuple[str, ...] = ("24h", "7d", "30d")
    forecast_long_horizons: tuple[str, ...] = ("12m",)
    forecast_short_max_hours: int = 24 * 30
    forecast_long_max_months: int = 12
    # Months of history the seasonal model needs to be defensible.
    seasonal_history_months: int = 36
    # The annual projection inherits the trained model's view of near-term
    # drift, clamped so a single period cannot run the forecast away.
    long_horizon_calibration_bounds: tuple[float, float] = (0.80, 1.25)

    # --- Anomaly analytics ---------------------------------------------------
    anomaly_score_threshold: float = 0.60
    # Above this share of injected anomalies the baseline starts absorbing
    # them and detection collapses. Dataset generators must respect it.
    anomaly_injection_cap_pct: float = 0.30
    anomaly_baseline_method: str = "median_hour_of_week"

    # --- Data quality --------------------------------------------------------
    dq_stage_count: int = 8
    dq_rule_count: int = 12
    dq_ledger_page_size: int = 50

    # --- Library -------------------------------------------------------------
    catalog_preview_rows: int = 5
    generated_history_days: int = 90
    generated_history_months: int = 36
    reference_meter_count: int = 10

    # --- Reporting -----------------------------------------------------------
    report_org_name: str = "Organisation Energy Programme"
    report_sections: tuple[str, ...] = (
        "organization_summary",
        "buildings",
        "overall_health",
        "data_quality",
        "critical_anomalies",
        "predicted_consumption",
        "predicted_cost",
        "recommendations",
        "maintenance_plan",
        "estimated_savings",
        "priority_actions",
        "appendix",
    )


settings = Settings()

# A JWT signed with the shipped fallback is forgeable by anyone who has read
# this file, which is everyone. Refusing to start would break a legitimate
# `uvicorn` poke at the codebase, so this warns loudly instead -- but the
# launcher treats it as a failed check, and `.env` repairs itself.
if settings.secret_key == DEV_SECRET_KEY:
    warnings.warn(
        "ECOMIND_SECRET_KEY is the shipped development placeholder. Every JWT "
        "this process signs can be forged by a third party. Run `ecomind` to "
        "generate a real one, or set ECOMIND_SECRET_KEY before exposing this.",
        RuntimeWarning,
        stacklevel=2,
    )
    print(
        "[!] WARNING: ECOMIND_SECRET_KEY is the development placeholder. "
        "JWTs signed with it are forgeable. Run `ecomind` to fix.",
        file=sys.stderr,
        flush=True,
    )
elif len(settings.secret_key) < 32:
    warnings.warn(
        f"ECOMIND_SECRET_KEY is only {len(settings.secret_key)} characters; "
        "use at least 32 for HS256.",
        RuntimeWarning,
        stacklevel=2,
    )

for _d in (
    settings.data_dir,
    settings.uploads_dir,
    settings.processed_dir,
    settings.sample_dir,
    settings.reports_dir,
    settings.generated_dir,
    settings.reference_dir,
    settings.models_dir,
):
    _d.mkdir(parents=True, exist_ok=True)
