"""ALL database models — 21 tables.

Contract: PROJECT_MASTER_BLUEPRINT.md §13
Every model inherits TimestampMixin (created_at, updated_at).
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, JSON, DateTime,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ─────────────────────────────────────────────
# 1. users
# ─────────────────────────────────────────────
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), default="")
    role = Column(String(50), default="analyst")  # admin / analyst / viewer
    is_active = Column(Boolean, default=True)


# ─────────────────────────────────────────────
# 2. datasets
# ─────────────────────────────────────────────
class Dataset(TimestampMixin, Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    source_type = Column(String(50), nullable=False)  # sample / upload
    file_path = Column(String(1024), default="")
    file_size_bytes = Column(Integer, default=0)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    status = Column(String(50), default="registered")  # registered / profiling / ready / error
    # Provenance (7 fields per amendment)
    provenance = Column(JSON, default=dict)
    # {origin, license, collection_method, temporal_range, geographic_scope, version, citation}


# ─────────────────────────────────────────────
# 3. schema_columns
# ─────────────────────────────────────────────
class SchemaColumn(TimestampMixin, Base):
    __tablename__ = "schema_columns"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    data_type = Column(String(50), nullable=False)  # float64 / int64 / object / datetime64 / bool
    nullable = Column(Boolean, default=True)
    unique_count = Column(Integer, default=0)
    null_count = Column(Integer, default=0)
    sample_values = Column(JSON, default=list)
    statistics = Column(JSON, default=dict)
    # {mean, std, min, max, median, q25, q75, skewness, kurtosis}
    semantic_type = Column(String(50), default="unknown")
    # energy_timestamp / energy_value / device_id / location / temperature / humidity / generic

    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_schema_col_dataset_name"),
    )


# ─────────────────────────────────────────────
# 4. dq_results
# ─────────────────────────────────────────────
class DQResult(TimestampMixin, Base):
    __tablename__ = "dq_results"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    rule_name = Column(String(255), nullable=False)
    rule_category = Column(String(50), nullable=False)
    # completeness / accuracy / consistency / timeliness / validity
    dimension = Column(String(50), nullable=False)
    score = Column(Float, default=0.0)  # 0-100
    details = Column(JSON, default=dict)
    # {affected_columns, affected_rows, threshold, actual_value, severity}
    severity = Column(String(20), default="info")  # info / warning / critical
    passed = Column(Boolean, default=True)
    ran_at = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# 5. transformations
# ─────────────────────────────────────────────
class Transformation(TimestampMixin, Base):
    __tablename__ = "transformations"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    operation = Column(String(100), nullable=False)
    # drop_columns / fill_missing / encode_categorical / normalize / outlier_clip / feature_engineer / resample
    params = Column(JSON, default=dict)
    columns_affected = Column(JSON, default=list)
    rows_affected = Column(Integer, default=0)
    before_snapshot = Column(JSON, default=dict)
    after_snapshot = Column(JSON, default=dict)
    applied = Column(Boolean, default=False)
    applied_at = Column(DateTime, nullable=True)


# ─────────────────────────────────────────────
# 6. features
# ─────────────────────────────────────────────
class Feature(TimestampMixin, Base):
    __tablename__ = "features"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    feature_type = Column(String(50), nullable=False)  # numerical / categorical / temporal / boolean
    source_columns = Column(JSON, default=list)
    description = Column(Text, default="")
    importance_score = Column(Float, default=0.0)
    created_by = Column(String(100), default="engineer")  # engineer / auto

    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_feature_dataset_name"),
    )


# ─────────────────────────────────────────────
# 7. models (trained ML models)
# ─────────────────────────────────────────────
class Model(TimestampMixin, Base):
    __tablename__ = "models"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    algorithm = Column(String(100), nullable=False)  # xgboost / random_forest / gradient_boosting / linear / ridge / lasso
    task_type = Column(String(50), nullable=False)  # regression / classification / anomaly
    version = Column(Integer, default=1)
    hyperparameters = Column(JSON, default=dict)
    metrics = Column(JSON, default=dict)
    # {r2, rmse, mae, mape, accuracy, f1, precision, recall, auc_roc}
    feature_importances = Column(JSON, default=dict)
    training_time_seconds = Column(Float, default=0.0)
    training_rows = Column(Integer, default=0)
    model_path = Column(String(1024), default="")  # path to serialized model
    status = Column(String(50), default="trained")  # training / trained / active / archived
    is_active = Column(Boolean, default=False)

    __table_args__ = (
        Index("ix_model_dataset_active", "dataset_id", "is_active"),
    )


# ─────────────────────────────────────────────
# 8. predictions
# ─────────────────────────────────────────────
class Prediction(TimestampMixin, Base):
    __tablename__ = "predictions"
    id = Column(String, primary_key=True, default=_uuid)
    model_id = Column(String, ForeignKey("models.id"), nullable=False, index=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    input_data = Column(JSON, default=dict)
    predicted_value = Column(Float, nullable=True)
    confidence = Column(Float, default=0.0)  # 0-1
    prediction_type = Column(String(50), default="point")  # point / interval / probabilistic
    interval_lower = Column(Float, nullable=True)
    interval_upper = Column(Float, nullable=True)
    actual_value = Column(Float, nullable=True)  # filled when ground truth available
    error = Column(Float, nullable=True)  # |predicted - actual|


# ─────────────────────────────────────────────
# 9. shap_explanations
# ─────────────────────────────────────────────
class SHAPExplanation(TimestampMixin, Base):
    __tablename__ = "shap_explanations"
    id = Column(String, primary_key=True, default=_uuid)
    prediction_id = Column(String, ForeignKey("predictions.id"), nullable=True, index=True)
    model_id = Column(String, ForeignKey("models.id"), nullable=False, index=True)
    method = Column(String(50), default="tree")  # tree / kernel / linear / deep
    feature_names = Column(JSON, default=list)
    shap_values = Column(JSON, default=list)  # per-feature SHAP values
    base_value = Column(Float, default=0.0)
    expected_value = Column(Float, default=0.0)
    global_importance = Column(JSON, default=dict)  # {feature: mean_abs_shap}
    interaction_effects = Column(JSON, default=dict)
    computation_time_ms = Column(Float, default=0.0)


# ─────────────────────────────────────────────
# 10. anomalies
# ─────────────────────────────────────────────
class Anomaly(TimestampMixin, Base):
    __tablename__ = "anomalies"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    model_id = Column(String, ForeignKey("models.id"), nullable=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    asset_id = Column(String, nullable=True)
    anomaly_type = Column(String(100), nullable=False)
    # energy_spike / night_usage / equipment_degradation / phantom_load /
    # voltage_fluctuation / current_imbalance / continuous_overconsumption / sensor_failure
    severity = Column(String(20), nullable=False)  # low / medium / high / critical
    score = Column(Float, default=0.0)  # anomaly score (higher = more anomalous)
    confidence = Column(Float, default=0.0)
    is_confirmed = Column(Boolean, default=False)
    description = Column(Text, default="")
    context = Column(JSON, default=dict)
    # {reading_value, expected_value, deviation_pct, nearby_readings}

    __table_args__ = (
        Index("ix_anomaly_dataset_time", "dataset_id", "timestamp"),
    )


# ─────────────────────────────────────────────
# 11. benchmarks
# ─────────────────────────────────────────────
class Benchmark(TimestampMixin, Base):
    __tablename__ = "benchmarks"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    model_ids = Column(JSON, default=list)  # list of model IDs compared
    metrics_compared = Column(JSON, default=list)  # ["r2", "rmse", "mae", "mape"]
    results = Column(JSON, default=dict)
    # {model_id: {metric: value, rank: n}}
    winner = Column(String, nullable=True)  # model_id of best overall
    methodology = Column(String(100), default="cross_validation")
    # cross_validation / holdout / time_series_split


# ─────────────────────────────────────────────
# 12. recommendations
# ─────────────────────────────────────────────
class Recommendation(TimestampMixin, Base):
    __tablename__ = "recommendations"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    anomaly_id = Column(String, ForeignKey("anomalies.id"), nullable=True)
    category = Column(String(100), nullable=False)
    # hvac_optimization / lighting / equipment_scheduling / load_shifting / maintenance / renewable
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), default="medium")  # low / medium / high / critical
    estimated_savings_kwh = Column(Float, default=0.0)
    estimated_savings_percent = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    status = Column(String(50), default="pending")  # pending / accepted / implemented / rejected
    supporting_evidence = Column(JSON, default=dict)
    # {anomaly_scores, shap_top_features, similar_cases}


# ─────────────────────────────────────────────
# 13. reports
# ─────────────────────────────────────────────
class Report(TimestampMixin, Base):
    __tablename__ = "reports"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    report_type = Column(String(50), nullable=False)  # executive / technical / compliance / custom
    format = Column(String(20), default="pdf")  # pdf / html / csv
    file_path = Column(String(1024), default="")
    file_size_bytes = Column(Integer, default=0)
    sections = Column(JSON, default=list)
    # [{title, content, charts: [{type, data_key}]}]
    status = Column(String(50), default="generated")  # generating / generated / failed
    generated_at = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# 14. workflow_runs
# ─────────────────────────────────────────────
class WorkflowRun(TimestampMixin, Base):
    __tablename__ = "workflow_runs"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String(50), default="running")  # running / completed / failed / cancelled
    current_stage = Column(Integer, default=0)
    total_stages = Column(Integer, default=17)  # sync w/ workflow.stages.TOTAL_STAGES (17)
    stages_completed = Column(JSON, default=list)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    config = Column(JSON, default=dict)
    # {target_column, selected_features, model_types, ...}


# ─────────────────────────────────────────────
# 15. stage_traces (AI Reasoning Timeline)
# ─────────────────────────────────────────────
class StageTrace(TimestampMixin, Base):
    __tablename__ = "stage_traces"
    id = Column(String, primary_key=True, default=_uuid)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=False, index=True)
    stage_number = Column(Integer, nullable=False)
    stage_name = Column(String(100), nullable=False)
    status = Column(String(50), default="running")  # running / completed / failed / skipped
    input_snapshot = Column(JSON, default=dict)
    output_snapshot = Column(JSON, default=dict)
    decision = Column(Text, default="")  # human-readable AI decision summary
    confidence = Column(Float, nullable=True)  # 0-1, only for stages with confidence
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Float, default=0.0)
    error = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_stage_trace_run_stage", "workflow_run_id", "stage_number"),
    )


# ─────────────────────────────────────────────
# 16. confidence_gates
# ─────────────────────────────────────────────
class ConfidenceGate(TimestampMixin, Base):
    __tablename__ = "confidence_gates"
    id = Column(String, primary_key=True, default=_uuid)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=False, index=True)
    prediction_confidence = Column(Float, default=0.0)
    dq_score = Column(Float, default=0.0)
    model_relevance = Column(Float, default=0.0)
    shap_stability = Column(Float, default=0.0)
    trust_score = Column(Float, default=0.0)
    # 0.40 * pred_conf + 0.25 * dq + 0.20 * model_rel + 0.15 * shap_stab
    verdict = Column(String(20), nullable=False)  # high_trust / moderate_trust / low_trust
    factors = Column(JSON, default=dict)
    # {prediction: {value, confidence}, dq: {overall_score}, model: {best_r2}, shap: {stability_index}}
    reasoning = Column(Text, default="")


# ─────────────────────────────────────────────
# 17. raw_processed_comparisons
# ─────────────────────────────────────────────
class RawProcessedComparison(TimestampMixin, Base):
    __tablename__ = "raw_processed_comparisons"
    id = Column(String, primary_key=True, default=_uuid)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=False, index=True)
    raw_model_id = Column(String, ForeignKey("models.id"), nullable=True)
    processed_model_id = Column(String, ForeignKey("models.id"), nullable=True)
    metrics = Column(JSON, default=dict)
    # {raw: {r2, rmse, mae, mape, shap_stability}, processed: {r2, rmse, mae, mape, shap_stability}}
    improvement = Column(JSON, default=dict)
    # {r2_delta, rmse_delta_pct, mae_delta_pct, mape_delta_pct, shap_delta}
    feature_count_raw = Column(Integer, default=0)
    feature_count_processed = Column(Integer, default=0)
    shap_divergence = Column(Float, default=0.0)  # cosine distance between raw/processed SHAP vectors
    conclusion = Column(Text, default="")
    # "Processing improved R2 by 12.3% while reducing SHAP instability by 8.1%"


# ─────────────────────────────────────────────
# 18. model_registry
# ─────────────────────────────────────────────
class ModelRegistry(TimestampMixin, Base):
    __tablename__ = "model_registry"
    id = Column(String, primary_key=True, default=_uuid)
    model_id = Column(String, ForeignKey("models.id"), nullable=False, index=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    version = Column(Integer, nullable=False)
    status = Column(String(50), default="staging")  # staging / production / deprecated / archived
    promoted_at = Column(DateTime, nullable=True)
    deprecated_at = Column(DateTime, nullable=True)
    performance_summary = Column(JSON, default=dict)
    # {r2, rmse, mae, training_date, dataset_hash, feature_count}
    notes = Column(Text, default="")
    is_current = Column(Boolean, default=False)  # only one per dataset can be current

    __table_args__ = (
        UniqueConstraint("model_id", "version", name="uq_model_version"),
        Index("ix_registry_dataset_current", "dataset_id", "is_current"),
    )


# ─────────────────────────────────────────────
# 19. comparison_charts
# ─────────────────────────────────────────────
class ComparisonChart(TimestampMixin, Base):
    __tablename__ = "comparison_charts"
    id = Column(String, primary_key=True, default=_uuid)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=False, index=True)
    chart_type = Column(String(50), nullable=False)  # bar / radar / waterfall / heatmap / scatter / line
    title = Column(String(255), nullable=False)
    data = Column(JSON, default=dict)  # chart-ready data structure
    config = Column(JSON, default=dict)  # display config (colors, labels, axes)
    comparison_type = Column(String(50), nullable=False)  # raw_vs_processed / model_comparison / metric_evolution


# ─────────────────────────────────────────────
# 20. ai_interactions (chat history)
# ─────────────────────────────────────────────
class AIInteraction(TimestampMixin, Base):
    __tablename__ = "ai_interactions"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True)
    role = Column(String(20), nullable=False)  # user / assistant / system
    content = Column(Text, nullable=False)
    meta = Column(JSON, default=dict)
    # {stage_context, tool_used, confidence}

    __table_args__ = (
        Index("ix_ai_interaction_user_dataset", "user_id", "dataset_id"),
    )


# ─────────────────────────────────────────────
# 21. audit_log
# ─────────────────────────────────────────────
class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_log"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False)  # create / update / delete / execute / export
    resource_type = Column(String(100), nullable=False)  # dataset / model / report / workflow / recommendation
    resource_id = Column(String, nullable=True)
    details = Column(JSON, default=dict)
    ip_address = Column(String(45), default="")

    __table_args__ = (
        Index("ix_audit_user_action", "user_id", "action"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
    )
