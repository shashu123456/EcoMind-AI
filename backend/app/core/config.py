from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ECOMIND_",
        env_file=".env",
        protected_namespaces=("settings_",),
    )

    app_name: str = "EcoMind"
    app_tagline: str = "Enterprise Energy Analytics Platform"
    port: int = 8000
    secret_key: str = "eco-mind-dev-secret-change-me"
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
