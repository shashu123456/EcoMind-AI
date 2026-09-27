from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ECOMIND_", env_file=".env")

    app_name: str = "EcoMind AI"
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

    db_path: Path = data_dir / "ecomind.db"

    max_upload_mb: int = 200
    max_rows: int = 250_000
    ml_sample_rows: int = 60_000


settings = Settings()

for _d in (settings.data_dir, settings.uploads_dir, settings.processed_dir,
           settings.sample_dir, settings.reports_dir):
    _d.mkdir(parents=True, exist_ok=True)