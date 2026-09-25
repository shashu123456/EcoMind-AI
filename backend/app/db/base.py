from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def _migrate(db) -> None:
    """Run idempotent schema migrations for already-created SQLite databases."""
    inspector = inspect(db)
    if "shap_explanations" in inspector.get_table_names():
        cols = {c["name"]: c for c in inspector.get_columns("shap_explanations")}
        pred = cols.get("prediction_id")
        if pred and not pred.get("nullable", False):
            # Rebuild table so prediction_id becomes nullable (global explanations
            # are model-level and may not be tied to a prediction row).
            db.execute(
                text(
                    """
                    CREATE TABLE shap_explanations_new (
                        id VARCHAR NOT NULL,
                        prediction_id VARCHAR,
                        model_id VARCHAR NOT NULL,
                        method VARCHAR(50),
                        feature_names JSON,
                        shap_values JSON,
                        base_value FLOAT,
                        expected_value FLOAT,
                        global_importance JSON,
                        interaction_effects JSON,
                        computation_time_ms FLOAT,
                        created_at DATETIME,
                        updated_at DATETIME,
                        PRIMARY KEY (id)
                    )
                    """
                )
            )
            db.execute(
                text(
                    """
                    INSERT INTO shap_explanations_new (
                        id, prediction_id, model_id, method, feature_names, shap_values,
                        base_value, expected_value, global_importance, interaction_effects,
                        computation_time_ms, created_at, updated_at
                    )
                    SELECT id, prediction_id, model_id, method, feature_names, shap_values,
                           base_value, expected_value, global_importance, interaction_effects,
                           computation_time_ms, created_at, updated_at
                    FROM shap_explanations
                    """
                )
            )
            db.execute(text("DROP TABLE shap_explanations"))
            db.execute(text("ALTER TABLE shap_explanations_new RENAME TO shap_explanations"))
            db.commit()


def init_db() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        _migrate(conn)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()