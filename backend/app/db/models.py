"""ALL database models — 23 tables.

The schema mirrors the product, not the implementation history. Every table
here answers a question a user can ask; tables that only existed to serve a
retired screen are gone rather than left dormant to rot.

Count: 21 legacy − 9 retired + 11 introduced = 23. Anything added here must
either replace a table that was dropped or justify why the answer it stores
cannot be derived from one that already exists.

Layout
  identity      users, audit_log
  dataset       datasets, dataset_buildings, dataset_floors, dataset_rooms,
                dataset_devices
  preparation   schema_columns, schema_issues, dq_results, dq_repairs,
                quality_scores, energy_monthly
  selection     models, model_selection
  decision      anomalies, forecasts, recommendations, reports
  run           workflow_runs, stage_traces, analytics_snapshots
  dormant       shap_explanations

Two rules the column names follow:

* The estate is stored as **codes** (`building_code`, `floor_no`, `room_code`,
  `device_code`) exactly as they appear in a reading, never as a surrogate id.
  A surrogate would force a code/id mapping at every join and every export, and
  the codes are what an engineer recognises in the field.

* Hierarchy tables carry an explicit parent code plus the natural key of their
  own, because the estate is only meaningful nested. Depth is enforced by which
  tables exist for a dataset, not by nullable columns that mean different
  things in different rows.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)

from .base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ─────────────────────────────────────────────
# identity
# ─────────────────────────────────────────────
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), default="")
    role = Column(String(50), default="analyst")  # admin / analyst / viewer
    is_active = Column(Boolean, default=True)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_log"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(120), nullable=False)
    resource_type = Column(String(60))
    resource_id = Column(String(64))
    details = Column(JSON)
    ip_address = Column(String(45))


Index("ix_audit_action", AuditLog.action)
Index("ix_audit_created", AuditLog.created_at)


# ─────────────────────────────────────────────
# dataset + estate hierarchy
# ─────────────────────────────────────────────
class Dataset(TimestampMixin, Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    # synthetic / upload / reference
    source_type = Column(String(30), default="sample")
    file_path = Column(String(1024))
    file_size_bytes = Column(Integer)
    row_count = Column(Integer)
    column_count = Column(Integer)

    # 'asset' (building›floor›room›device) or 'meter' (building›meter).
    # A reference dataset that only has meters must say so, so the interface
    # can suppress drill-downs the data cannot support instead of offering
    # empty room panels.
    granularity = Column(String(20), default="asset")

    # One dataset is active at a time — the whole journey is scoped to it.
    is_active = Column(Boolean, default=False, index=True)

    building_count = Column(Integer, default=0)
    floor_count = Column(Integer, default=0)
    room_count = Column(Integer, default=0)
    device_count = Column(Integer, default=0)
    hourly_row_count = Column(Integer, default=0)
    monthly_row_count = Column(Integer, default=0)
    defect_rate = Column(Float)
    anomaly_rate = Column(Float)

    # Display badges, e.g. {"healthy": true, "reference": false, "controlled_pair": true}
    badges = Column(JSON)
    provenance = Column(JSON)
    doi = Column(String(120))
    source_url = Column(String(512))
    license = Column(String(120))
    notes = Column(Text)
    status = Column(String(30), default="registered")


class DatasetBuilding(TimestampMixin, Base):
    __tablename__ = "dataset_buildings"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    building_code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    building_type = Column(String(60))  # office / industrial / campus
    gross_area_sqm = Column(Float)
    commissioned_year = Column(Integer)
    rated_kw = Column(Float)


Index(
    "ix_dataset_buildings_unique",
    DatasetBuilding.dataset_id,
    DatasetBuilding.building_code,
    unique=True,
)


class DatasetFloor(TimestampMixin, Base):
    __tablename__ = "dataset_floors"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    building_code = Column(String(64), nullable=False)
    floor_no = Column(String(24), nullable=False)
    label = Column(String(120))
    floor_type = Column(String(60))  # office / plant / retail / yard
    area_sqm = Column(Float)


Index(
    "ix_dataset_floors_unique",
    DatasetFloor.dataset_id,
    DatasetFloor.building_code,
    DatasetFloor.floor_no,
    unique=True,
)


class DatasetRoom(TimestampMixin, Base):
    __tablename__ = "dataset_rooms"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    building_code = Column(String(64), nullable=False)
    floor_no = Column(String(24), nullable=False)
    room_code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    room_type = Column(String(60))  # office / server_room / chiller_plant / cabin / bay
    area_sqm = Column(Float)
    occupancy_capacity = Column(Integer)


Index(
    "ix_dataset_rooms_unique",
    DatasetRoom.dataset_id,
    DatasetRoom.building_code,
    DatasetRoom.floor_no,
    DatasetRoom.room_code,
    unique=True,
)


class DatasetDevice(TimestampMixin, Base):
    __tablename__ = "dataset_devices"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    building_code = Column(String(64), nullable=False)
    floor_no = Column(String(24), nullable=True)
    room_code = Column(String(64), nullable=True)
    device_code = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    # meter, hvac, lighting, chiller, generator, server, ups, pump, elevator,
    # plug_load, solar, cctv, coffee_machine
    category = Column(String(40), nullable=False)
    is_critical = Column(Boolean, default=False)
    rated_kw = Column(Float)
    manufacturer = Column(String(120))
    model_name = Column(String(120))
    installed_on = Column(String(24))
    is_meter = Column(Boolean, default=False, index=True)


Index("ix_dataset_devices_unique", DatasetDevice.dataset_id, DatasetDevice.device_code, unique=True)
Index("ix_dataset_devices_category", DatasetDevice.dataset_id, DatasetDevice.category)


# ─────────────────────────────────────────────
# preparation — schema
# ─────────────────────────────────────────────
class SchemaColumn(TimestampMixin, Base):
    __tablename__ = "schema_columns"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    data_type = Column(String(60))
    # identifier / hierarchy_key / timestamp / measure / dimension
    column_role = Column(String(30))
    ordinal = Column(Integer, default=0)
    nullable = Column(Boolean, default=True)
    unique_count = Column(Integer)
    null_count = Column(Integer)
    sample_values = Column(JSON)
    statistics = Column(JSON)
    semantic_type = Column(String(60))
    unit = Column(String(30))


class SchemaIssue(TimestampMixin, Base):
    """Detected structural problems. Detection only — repairs are DQ's job.

    Nothing here stores a before or an after value. Schema Discovery answers
    "what is wrong with the shape of this data"; Data Quality answers "what did
    we change". Splitting them keeps a review of the schema from looking like
    an edit log.
    """

    __tablename__ = "schema_issues"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    column_name = Column(String(128))
    issue_type = Column(String(60), nullable=False)
    severity = Column(String(20), default="moderate")  # low / moderate / high / critical
    detail = Column(Text)
    suggested_role = Column(String(30))
    rows_affected = Column(Integer, default=0)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index("ix_schema_issues_type", SchemaIssue.dataset_id, SchemaIssue.issue_type)


# ─────────────────────────────────────────────
# preparation — data quality
# ─────────────────────────────────────────────
class DQResult(TimestampMixin, Base):
    """One rule's verdict.

    The eight-stage rollup the progress rail shows is a `GROUP BY stage_key` over
    this table joined against `dq_repairs`, not a second table — the stage has
    no state of its own beyond what its rules and repairs already say.
    """

    __tablename__ = "dq_results"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    rule_id = Column(String(16))  # R01 … R12
    rule_name = Column(String(120), nullable=False)
    rule_category = Column(String(60))
    dimension = Column(String(30))  # completeness / consistency / validity / accuracy / uniqueness
    stage_key = Column(String(40), index=True)
    stage_order = Column(Integer)
    severity = Column(String(20), default="info")
    passed = Column(Boolean, default=True)
    violations = Column(Integer, default=0)
    rows_affected = Column(Integer, default=0)
    score = Column(Float)
    details = Column(JSON)
    message = Column(Text)
    ran_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DQRepair(TimestampMixin, Base):
    """The before → after ledger.

    Every mutation to a reading is recorded here with the value it replaced, so
    a user can see exactly what was changed and why. This is the audit trail
    the product's credibility rests on.
    """

    __tablename__ = "dq_repairs"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    rule_id = Column(String(16), index=True)
    rule_name = Column(String(120))
    stage_key = Column(String(40))
    repair_action = Column(
        String(60), nullable=False
    )  # imputed / dropped / coerced / mapped / rescaled
    column_name = Column(String(128))
    building_code = Column(String(64))
    floor_no = Column(String(24))
    room_code = Column(String(64))
    device_code = Column(String(64), index=True)
    row_timestamp = Column(DateTime)
    before_value = Column(Text)
    after_value = Column(Text)
    severity = Column(String(20), default="moderate")
    detail = Column(Text)
    repaired_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index(
    "ix_dq_repairs_device_time", DQRepair.dataset_id, DQRepair.device_code, DQRepair.row_timestamp
)
Index("ix_dq_repairs_rule", DQRepair.dataset_id, DQRepair.rule_id)


class QualityScore(TimestampMixin, Base):
    """Overall quality, 0–100, before and after repair.

    `phase` is 'raw' or 'processed'. The 'processed' row is written at the end
    of stage 4 (Range Validation), not stage 5: by stage 5 datatype coercion
    has run, so a score written there would silently include repairs the user
    was never shown. Raw and processed therefore bracket the same repair set.
    """

    __tablename__ = "quality_scores"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    phase = Column(String(20), nullable=False)  # raw / processed
    overall = Column(Float, nullable=False)
    completeness = Column(Float)
    consistency = Column(Float)
    validity = Column(Float)
    accuracy = Column(Float)
    uniqueness = Column(Float)
    rows_scored = Column(Integer, default=0)
    repairs_applied = Column(Integer, default=0)
    dimensions = Column(JSON)
    scored_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index("ix_quality_scores_unique", QualityScore.dataset_id, QualityScore.phase, unique=True)


class EnergyMonthly(TimestampMixin, Base):
    """36 months of history per scope, so a 12-month forecast has a baseline.

    A 12-month forward forecast is only defensible with at least two full
    seasonal cycles behind it. Hourly readings cannot supply that (they cover
    days, not years), so monthly history is stored alongside them.

    Scope is nullable on both axes because the three datasets need different
    scopes: the synthetic estate carries estate- and building-level months, and
    the BDG2 reference dataset carries per-meter months under one building.
    """

    __tablename__ = "energy_monthly"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    building_code = Column(String(64), nullable=True, index=True)
    device_code = Column(String(64), nullable=True, index=True)
    period = Column(String(7), nullable=False)  # YYYY-MM
    period_start = Column(DateTime, nullable=False)
    energy_kwh = Column(Float, nullable=False)
    cost_inr = Column(Float)
    co2_kg = Column(Float)
    peak_kw = Column(Float)
    avg_kw = Column(Float)
    reading_hours = Column(Integer)


Index(
    "ix_energy_monthly_scope",
    EnergyMonthly.dataset_id,
    EnergyMonthly.building_code,
    EnergyMonthly.device_code,
    EnergyMonthly.period,
)


# ─────────────────────────────────────────────
# preparation — model selection
# ─────────────────────────────────────────────
class Model(TimestampMixin, Base):
    __tablename__ = "models"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    algorithm = Column(String(60), nullable=False)
    task_type = Column(String(40), default="regression")
    version = Column(String(40), default="1")
    hyperparameters = Column(JSON)
    metrics = Column(JSON)
    normalised = Column(JSON)
    composite_score = Column(Float)
    selection_rank = Column(Integer)
    is_selected = Column(Boolean, default=False, index=True)
    selection_rationale = Column(Text)
    feature_importances = Column(JSON)
    training_time_seconds = Column(Float)
    training_rows = Column(Integer)
    model_path = Column(String(1024))
    status = Column(String(30), default="trained")
    is_active = Column(Boolean, default=True)
    error = Column(Text)


Index("ix_models_dataset_active", Model.dataset_id, Model.is_active)


class ModelSelection(TimestampMixin, Base):
    """Why one model won. Generated from real metric deltas, never hand-written."""

    __tablename__ = "model_selection"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    selected_model_id = Column(String, ForeignKey("models.id"), nullable=False)
    algorithm = Column(String(60))
    composite_score = Column(Float)
    weights = Column(JSON)
    winning_criteria = Column(JSON)
    lost_criteria = Column(JSON)
    margin_over_second = Column(Float)
    near_tie = Column(Boolean, default=False)
    dataset_characteristics = Column(JSON)
    rationale = Column(Text, nullable=False)
    candidates = Column(JSON)
    selected_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index("ix_model_selection_dataset", ModelSelection.dataset_id, ModelSelection.created_at)


# ─────────────────────────────────────────────
# decision — anomalies
# ─────────────────────────────────────────────
class Anomaly(TimestampMixin, Base):
    """A deviation from a robust baseline, at a place in the estate.

    Detection is statistical, never model-based: the baseline is a median
    hour-of-week profile per device, which a single anomalous week cannot move.
    `expected_kwh` and `actual_kwh` are stored together because the whole
    business case for an anomaly is the gap between them.
    """

    __tablename__ = "anomalies"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    device_id = Column(String, ForeignKey("dataset_devices.id"), nullable=True, index=True)
    building_code = Column(String(64), index=True)
    floor_no = Column(String(24))
    room_code = Column(String(64))
    device_code = Column(String(64), index=True)
    device_category = Column(String(40))
    timestamp = Column(DateTime, index=True)
    window_start = Column(DateTime)
    window_end = Column(DateTime)
    anomaly_type = Column(String(60))
    anomaly_class = Column(String(60), index=True)
    severity = Column(String(20), default="moderate", index=True)
    score = Column(Float)
    deviation_pct = Column(Float)
    expected_kwh = Column(Float)
    actual_kwh = Column(Float)
    excess_kwh = Column(Float)
    excess_cost = Column(Float)
    excess_co2_kg = Column(Float)
    priority_rank = Column(Integer)
    baseline_method = Column(String(40))
    is_confirmed = Column(Boolean, default=False)
    description = Column(Text)
    context = Column(JSON)


Index("ix_anomalies_dataset_time", Anomaly.dataset_id, Anomaly.timestamp)
Index("ix_anomalies_device", Anomaly.dataset_id, Anomaly.device_code, Anomaly.timestamp)
# Named differently from the implicit `ix_anomalies_severity` that
# `severity = Column(..., index=True)` already emits — two indexes on one name
# makes `create_all` fail outright.
Index("ix_anomalies_dataset_severity", Anomaly.dataset_id, Anomaly.severity)


# ─────────────────────────────────────────────
# decision — forecast
# ─────────────────────────────────────────────
class Forecast(TimestampMixin, Base):
    """Two tiers, deliberately.

    Short horizons (24h / 7d / 30d) are recursive hourly predictions from the
    selected model. The 12-month horizon is not: an hourly model extrapolated a
    year ahead is a straight line dressed up as a forecast, so long-range uses
    additive Holt-Winters on the monthly history, calibrated against the short
    model and reported with a widening band.

    Aggregates are stored as data, not only as chart series — Recommendations
    consumes the demand and cost numbers directly rather than re-deriving them.
    """

    __tablename__ = "forecasts"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    model_id = Column(String, ForeignKey("models.id"), nullable=True, index=True)
    tier = Column(String(10), nullable=False)  # short / long
    horizon = Column(String(10), nullable=False)  # 24h / 7d / 30d / 12m
    method = Column(String(60))
    building_code = Column(String(64), index=True)
    device_code = Column(String(64), index=True)
    points = Column(JSON)
    aggregates = Column(JSON)
    band_lower = Column(JSON)
    band_upper = Column(JSON)
    total_energy_kwh = Column(Float)
    total_cost_inr = Column(Float)
    peak_demand_kw = Column(Float)
    peak_demand_at = Column(DateTime)
    demand_p95_kw = Column(Float)
    co2_tonnes = Column(Float)
    calibration_factor = Column(Float)
    history_months = Column(Integer)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index(
    "ix_forecasts_scope",
    Forecast.dataset_id,
    Forecast.tier,
    Forecast.horizon,
    Forecast.building_code,
    Forecast.device_code,
)


# ─────────────────────────────────────────────
# decision — recommendations + report
# ─────────────────────────────────────────────
class Recommendation(TimestampMixin, Base):
    """An action, and the evidence that justifies it.

    A recommendation exists only if it can cite both the anomalies that motivate
    it and the forecast that sizes the prize. `anomaly_ids` and
    `forecast_basis` are not decoration — they are the record a facilities
    manager takes to a budget meeting.
    """

    __tablename__ = "recommendations"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    # P1 / P2 / P3
    priority = Column(String(4), nullable=False, index=True)
    category = Column(String(60))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    reason = Column(Text)
    building_code = Column(String(64), index=True)
    floor_no = Column(String(24))
    room_code = Column(String(64))
    device_code = Column(String(64), index=True)
    device_category = Column(String(40))
    anomaly_ids = Column(JSON)
    forecast_basis = Column(JSON)
    estimated_savings_kwh = Column(Float)
    estimated_savings_rupees = Column(Float)
    estimated_savings_percent = Column(Float)
    maintenance_action = Column(Text)
    payback_months = Column(Float)
    estimated_cost_inr = Column(Float)
    supporting_evidence = Column(JSON)
    status = Column(String(30), default="open")
    confidence = Column(Float)


# Composite, so named differently from the implicit `ix_recommendations_priority`
# that `priority = Column(..., index=True)` already emits.
Index("ix_recommendations_dataset_priority", Recommendation.dataset_id, Recommendation.priority)


class Report(TimestampMixin, Base):
    """An enterprise PDF. No model metrics appear in it — see report_service."""

    __tablename__ = "reports"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    user_id = Column(String, ForeignKey("users.id"))
    title = Column(String(255), nullable=False)
    organization_name = Column(String(255))
    report_type = Column(String(60), default="organization")
    format = Column(String(20), default="pdf")
    file_path = Column(String(1024))
    file_size_bytes = Column(Integer)
    sections = Column(JSON)
    summary = Column(JSON)
    status = Column(String(30), default="pending")
    error = Column(Text)
    generated_at = Column(DateTime)


# ─────────────────────────────────────────────
# run
# ─────────────────────────────────────────────
class WorkflowRun(TimestampMixin, Base):
    __tablename__ = "workflow_runs"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"))
    status = Column(String(30), default="pending")
    current_stage = Column(Integer, default=0)
    current_stage_key = Column(String(40))
    # 10. The pipeline is ten stages; a run that reports 17 is a different product.
    total_stages = Column(Integer, default=10)
    stages_completed = Column(JSON)
    stage_statuses = Column(JSON)
    selected_model_id = Column(String, ForeignKey("models.id"), nullable=True)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    config = Column(JSON)


class StageTrace(TimestampMixin, Base):
    __tablename__ = "stage_traces"
    id = Column(String, primary_key=True, default=_uuid)
    workflow_run_id = Column(String, ForeignKey("workflow_runs.id"), index=True)
    stage_number = Column(Integer)
    stage_key = Column(String(40), index=True)
    stage_name = Column(String(120))
    status = Column(String(20), default="pending")
    input_snapshot = Column(JSON)
    output_snapshot = Column(JSON)
    decision = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    duration_ms = Column(Integer)
    error = Column(Text)


Index("ix_stage_traces_run_stage", StageTrace.workflow_run_id, StageTrace.stage_number)


class AnalyticsSnapshot(TimestampMixin, Base):
    """A precomputed answer to an expensive question.

    Grouping 120,960 hourly readings by device and hour-of-week is far too slow
    to do on every page load, and it produces the same answer every time. Each
    expensive read is therefore written once here and read many times.
    """

    __tablename__ = "analytics_snapshots"
    id = Column(String, primary_key=True, default=_uuid)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id"), nullable=True, index=True)
    kind = Column(String(40), nullable=False, index=True)
    scope = Column(String(120))
    payload = Column(JSON, nullable=False)
    row_count = Column(Integer)
    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Index(
    "ix_analytics_snapshots_unique",
    AnalyticsSnapshot.dataset_id,
    AnalyticsSnapshot.kind,
    AnalyticsSnapshot.scope,
)
