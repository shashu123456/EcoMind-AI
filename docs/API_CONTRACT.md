# EcoMind AI — API Contract (source of truth)

Locked wire contract for backend ↔ frontend. Every agent (S1–S8) MUST implement against this
document. When a shape must change, update this file AND the affected endpoint on both sides.

**Companion docs:** `PROJECT_MASTER_BLUEPRINT.md` (vision), `docs/DESIGN_SYSTEM.md` (UI),
`backend/app/workflow/stages.py` (stage order + registry), `backend/app/domain/data.py` (I/O helpers).

---

## 0. Conventions

- Base URL: `/api/v1`. Server: `.\\.venv\\Scripts\\python backend\\run.py` (port 8000).
- All endpoints except `POST /auth/login`, `POST /auth/register`, `GET /health` require
  `Authorization: Bearer <token>`.
- Errors: HTTP status with JSON body `{"detail": "<message>"}`.
- Timestamps: ISO-8601 strings (`2024-01-01T08:00:00`). Booleans: JSON `true/false`.
- All numeric values returned to the API are JSON-safe (no NaN/Inf/numpy scalars).
  Use `app.domain.data.js_type` before returning any computed value.
- Pagination where noted: `?limit=` (cap 5000) + `?start=` (offset).
- Workflow stage keys are snake_case; see §Stage order below.

## 1. Dataset I/O conventions (shared helpers — DO NOT duplicate)

`backend/app/domain/data.py` already exists. Use:
- `read_dataset(dataset, use_processed=False) -> pd.DataFrame`  (raw CSV from `dataset.file_path`)
- `save_processed(dataset_id, df) -> Path` (writes `data/processed/{id}.csv`)
- `read_csv(path)`, `exists_processed(id)`
- `numeric_columns(df)`, `categorical_columns(df)`, `timestamp_column(df)`, `guess_target(df)`
- `column_stats(df, col)`, `snapshot(df)`, `preview_payload(df, limit, start)`, `missing_summary(df)`
- `js_type(v)` / `json_safe(v)`

Sample dataset columns (`data/sample/bdg2_energy_30day.csv`):
`timestamp, asset_id, asset_type, energy_kwh, power_kw, voltage_v, current_a, power_factor,
temperature_c, humidity_pct, occupancy_count, is_anomaly`

Default target = `energy_kwh`. Timestamp col = `timestamp`.

## 2. Stage order (17 stages) — from `app/workflow/stages.py` (authoritative)

1 library · 2 import · 3 raw_preview · 4 schema_discovery · 5 dq_engine · 6 transformation ·
7 feature_engineering · 8 prediction · 9 confidence_gate · 10 raw_vs_processed · 11 shap ·
12 anomaly · 13 benchmarking · 14 recommendation · 15 executive_center · 16 report ·
17 history_registry

`STAGE_RUNNERS`, `@register_stage_runner(key)`, `get_stage_runner(key)`, `TOTAL_STAGES`,
`TRUST_WEIGHTS`, `trust_verdict(score)` all live there.

**Runner contract** (plain function `(run: WorkflowRun, db: Session, params: dict) -> dict`):
returns `{"output": {...}, "confidence": float|None, "decision": str, "trace_extra": {...}?}`.
Domain routers MUST import the domain service modules so registration runs at import time.

---

## 3. Endpoints

### 3.1 AppInfo
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | — | `{status:"ok", version:"1.0.0"}` |

### 3.2 Auth (`/api/v1/auth` — S1)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, full_name}` | `{access_token, user}` |
| POST | `/auth/login` | `{email, password}` | `{access_token, user}` |
| GET | `/auth/me` | — | `{id, email, full_name, role}` |

`user = {id, email, full_name, role}` (role: admin/analyst/viewer). Passwords bcrypt-hashed
(`app.core.security`) — never returned. JWT via `create_access_token({"sub": user.id})`.

### 3.3 Datasets (`/api/v1/datasets` — S1)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/datasets` | `?source_type=` | `{datasets: [Dataset]}` |
| POST | `/datasets/upload` | multipart `file` (csv/xlsx) | `{dataset: Dataset}` |
| GET | `/datasets/{id}` | — | `Dataset` (full, incl provenance) |
| DELETE | `/datasets/{id}` | — | `{ok: true}` |
| GET | `/datasets/{id}/preview` | `?limit=&start=` | `preview_payload` |
| POST | `/datasets/{id}/refresh` | — | `Dataset` (re-scans file: row_count/column_count) |
| GET | `/datasets/{id}/content` | `?limit=&offset=&format=rows|records` | `preview_payload` |

`Dataset = {id, name, description, source_type, file_path, file_size_bytes, row_count,
column_count, status, provenance, created_at, updated_at}`
`provenance` = `{origin, license, collection_method, temporal_range, geographic_scope,
version, citation}` (7 fields — required for sample; uploads auto-populate).

Upload rules: accept `.csv` (pandas read) and `.xlsx` (openpyxl). Validate size ≤
`settings.max_upload_mb`. Reject non-tabular uploads with 422 `{detail}`. Store file under
`settings.uploads_dir`, clone provenance defaults, status `ready`.

### 3.4 Schema discovery (`/api/v1/datasets` — S3)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/datasets/{id}/schema` | — | `{columns: [SchemaColumn], discovered_at, source}` |
| POST | `/datasets/{id}/schema/discover` | `{use_processed?: bool}` | `{columns, warnings, elapsed_ms, source}` |

`SchemaColumn = {name, data_type, nullable, unique_count, null_count, sample_values,
statistics, semantic_type}` (statistics: mean/std/min/max/median/q25/q75/skewness/kurtosis for
numerics; semantic_type from the semantic_type list in models.py). Persists to `schema_columns`
(upsert on (dataset_id, name)). Sets `dataset.status` → `ready`.

### 3.5 Data Quality (`/api/v1/datasets` — S3, PRIMARY RESEARCH CONTRIBUTION)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/datasets/{id}/dq` | `?latest_only=` | `{overall_score, results, by_dimension, severity_counts, ran_at}` |
| POST | `/datasets/{id}/dq/run` | `{use_processed?: bool}` | `{overall_score, results, passed_count, failed_count, by_dimension, severity_counts, summary, elapsed_ms}` |

`DQResult = {id, rule_name, rule_category, dimension, score, details, severity, passed, ran_at}`.
Dimensions: `completeness, accuracy, consistency, timeliness, validity`. Severity: `info, warning, critical`.
`overall_score` = 0–100 (weighted mean of per-dimension scores; weights in service).
`by_dimension` = `{completeness: 94.2, accuracy: 88.7, ...}`.
`severity_counts` = `{info: n, warning: n, critical: n}`.

**Required engine (implement genuinely, not fake):** compute per-column quality analytics —
null rate, uniqueness, outlier rate (IQR), z-score, value ranges vs semantic bounds (voltage≈220–240V,
power factor 0–1, humidity 0–100, temperature −20–60), duplicate rows, missing timestamps /
gaps in temporal coverage, monotonicity anomalies, invalid identifiers. Each check becomes a
DQResult row with a human explanation in `details.explanation`.

### 3.6 Transformations (`/api/v1/datasets` — S3)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/datasets/{id}/transformations` | — | `{transformations: [Transformation]}` |
| POST | `/datasets/{id}/transformations/apply` | `{operation, params}` | `{transformation, diff_summary}` |

`Transformation = {id, operation, params, columns_affected, rows_affected, before_snapshot,
after_snapshot, applied, applied_at}`. `before_snapshot`/`after_snapshot` = `snapshot(df)`.
Apply mutates the PROCESSED copy (`save_processed(dataset_id, df)`), idempotent chain from raw +
prior ops each time. Operations: `drop_columns{columns}`, `fill_missing{strategy: mean|median|ffill|zero, columns}`,
`encode_categorical{columns, method: onehot|label}`, `normalize{columns, method: minmax|zscore}`,
`outlier_clip{columns, method: iqr|zscore, threshold}`, `resample{rule: 1h|1d, agg: mean|sum}`,
`rename_columns{mapping}`. `diff_summary = {rows_changed, columns_changed, nulls_before,
nulls_after, mean_delta, std_delta}`.

### 3.7 Feature engineering (`/api/v1/datasets` — S3)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/datasets/{id}/features` | — | `{features: [Feature]}` |
| POST | `/datasets/{id}/features/engineer` | `{auto?: bool, features?: [...]}` | `{features, messages: [str]}` |

`Feature = {id, name, feature_type, source_columns, description, importance_score, created_by}`.
`auto:true` (default) on time-series+energy datasets should create temporal + lag features that
are GENERALLY USEFUL: `hour_of_day, day_of_week, is_weekend, month, rolling_mean_24h,
rolling_std_24h, lag_1h, diff_1h, load_factor` (energy/power), plus `energy_density` where
occupancy exists. Idempotent — skip existing names, report in `messages`. Custom features array
allows `{name, expression}` over column names (safe subset: `column_arithmetic`).

### 3.8 Models (`/api/v1/models` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/models` | — | `{models: [Model]}` |
| POST | `/models/train` | `{dataset_id, algorithm, target_column?, features?, hyperparameters?, task_type?, use_processed?}` | `{model: Model}` |
| GET | `/models/{id}` | — | `Model` |

`Model = {id, dataset_id, name, algorithm, task_type, version, hyperparameters, metrics,
feature_importances, training_time_seconds, training_rows, model_path, status, is_active,
created_at}`. Algorithms: `xgboost, random_forest, gradient_boosting, linear (regression),
ridge, lasso, extra_trees`. Task: `regression`. Metrics: `{r2, rmse, mae, mape, explained_variance}`.
Serialize fitted model with `joblib` to `data/models/{id}.joblib`. 70/30 time-ordered split.
Create `ModelRegistry` row (version=1, status `staging`) after training.

### 3.9 Predictions (`/api/v1/predictions` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/predictions/predict` | `{dataset_id, model_id?, algorithm?, target_column?, horizon?, future_steps?, confidence_level?, features?, use_processed?}` | `{model, predictions, metrics, forecast_start, forecast_end, horizon_summary}` |
| GET | `/predictions/{model_id}/predictions` | — | `{predictions: [PredictionPoint]}` |

`PredictionPoint = {timestamp, predicted, lower, upper, actual?, confidence}`.
If no `model_id`: auto-select best model (train if none, reuse latest active/per-dataset).
`horizon` in hours (default 24). `confidence_level` default 0.90 → interval via residual std.
Persist `Prediction` rows (interval type) + attach to model. `metrics` = held-out evaluation
`{r2, rmse, mae, mape}`. `horizon_summary = {total_kwh, peak_kw, peak_time, avg_kw, co2_estimate_kg, cost_estimate}`.

### 3.10 SHAP (`/api/v1/explanations` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/explanations/{prediction_id}/explain` | `{method?: tree\|kernel}` | `{explanation, top_features, narrative, stability_index}` |
| GET | `/explanations/{model_id}/global` | `?top_n=` | `{feature_names, global_importance, base_value, stability_index, computation_time_ms}` |

`explanation = {prediction_id, model_id, method, feature_names, shap_values, base_value,
expected_value, global_importance, computation_time_ms}` — persisted to `shap_explanations`.
`top_features = [{feature, value, shap_value, impact (positive|negative)}]`.
`narrative` = one-sentence human-readable: “energy_kwh pushed the prediction up by 3.2 kWh because today's load is 18% above the building average.” `stability_index` = 0–100 derived from SHAP magnitude agreement across bootstrap subsamples (higher = more stable).
Use `shap.TreeExplainer` for tree models, `shap.KernelExplainer` (sampled background) otherwise.

### 3.11 Anomaly detection (`/api/v1/anomalies` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/anomalies/{dataset_id}/anomalies` | `?limit=&severity=` | `{anomalies, total, by_type, by_severity}` |
| POST | `/anomalies/{dataset_id}/detect` | `{method?: ensemble\|isolation_forest\|zscore}` | `{anomalies, detected_count, total, by_type, by_severity, precision?, recall?, elapsed_ms}` |

`Anomaly = {id, timestamp, asset_id, anomaly_type, severity, score, confidence, is_confirmed,
description, context}`. `context = {reading_value, expected_value, deviation_pct, nearby_readings}`.
Detection ensemble (genuine): IsolationForest + z-score (per-asset, per-hour) + absolute trend
breaks + domain rules (night usage on office buildings, zero/low sensor reads). Merge & dedupe;
score = 0–1; severity by score/context. If an `is_anomaly` ground-truth column exists, report
`precision`/`recall`. Persist `Anomaly` rows (replace prior unconfirmed for a run).

### 3.12 Benchmarking (`/api/v1/benchmarks` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/benchmarks/{dataset_id}/benchmarks` | — | `{benchmarks: [Benchmark]}` |
| POST | `/benchmarks/{dataset_id}/benchmarks/run` | `{model_ids?, methodology?, metrics?}` | `{benchmark, leaderboard, winner}` |

Trains/evaluates a default comparison set (e.g. XGBoost, Random Forest, Gradient Boosting, Ridge)
with identical features/split unless `model_ids` given. `leaderboard = [{model_id, name,
algorithm, scores: {metric: value}, total_score, rank}]`. `methodology`: `time_series_split`
(default; also accept `cross_validation`). Persist `Benchmark` + write a `ComparisonChart`
(comparison_type `model_comparison`) for the workflow.

### 3.13 Recommendations (`/api/v1/recommendations` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/recommendations/{dataset_id}/recommendations` | — | `{recommendations: [Rec]}` |
| POST | `/recommendations/{dataset_id}/recommendations/generate` | `{top_k?}` | `{recommendations, by_category, total_savings_kwh, total_savings_percent, top_recommendation}` |

Bases: anomalies (types + severities), SHAP top drivers, consumption trends, idle/off-hours
load, weekday/weekend patterns. Categories: `hvac_optimization, lighting, equipment_scheduling,
load_shifting, maintenance, renewable`. `Rec = {id, category, title, description, priority,
estimated_savings_kwh, estimated_savings_percent, confidence, status, supporting_evidence}`
(`supporting_evidence = {anomaly_scores, shap_top_features, similar_cases, basis}` — always
fill `basis` with the evidence text used to justify the recommendation).

### 3.14 Confidence Gate (`/api/v1/ai` — S4) + stage
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/ai/{dataset_id}/confidence` | — | `{gate: Gate}` |
| POST | `/ai/{dataset_id}/confidence/evaluate` | optional overrides | `{gate: Gate}` |

`Gate = {trust_score, verdict, prediction_confidence, dq_score, model_relevance, shap_stability,
factors, reasoning, created_at}`. Formula (locked): `trust_score = 0.40*pred_conf + 0.25*dq +
0.20*model_rel + 0.15*shap_stab` (all 0–100). Verdict via `trust_verdict()`:
`high_trust ≥ 80`, `moderate_trust 60–79`, `low_trust < 60`. Persist `ConfidenceGate` bound to the
run. The `confidence_gate` stage runner pulls latest prediction confidence, latest DQ overall,
best model R²×? (as model_relevance), latest SHAP stability from the DB for the run's dataset,
then evaluates + persists.

### 3.15 Raw vs Processed (`/api/v1/comparison` — S4) + stage
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/comparison/{workflow_run_id}/raw-processed` | — | `{comparison: Comparison?}` |
| GET | `/comparison/{workflow_run_id}/charts` | — | `{charts: [Chart]}` |
| POST | `/comparison/{workflow_run_id}/raw-processed/run` | `{target_column?, algorithm?}` | `{comparison, charts}` |

Trains TWO models on identical features/split: one on the RAW frame, one on the PROCESSED frame
(guaranteed same feature set). 5 metrics compared (locked): `r2, rmse, mae, mape, shap_stability`.
`Comparison = {metrics: {raw: {...5 metrics}, processed: {...}}, improvement: {r2_delta,
rmse_delta_pct, mae_delta_pct, mape_delta_pct, shap_stability_delta}, feature_count_raw,
feature_count_processed, shap_divergence, conclusion}`. `conclusion` full sentence.
Persist `RawProcessedComparison` + `ComparisonChart` rows (types: `radar` metrics comparison,
`bar` improvements, `scatter`/`line` forecast vs actual).

### 3.16 Executive Intelligence Center (`/api/v1/ai` — S4) + stage
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/ai/{dataset_id}/executive` | — | `{summary}` |

Aggregates for a run/dataset: trust verdict + score, key anomalies, top recommendations + total
savings, model leaderboard winner, SHAP top drivers, consumption totals + carbon/cost, DQ score,
headline (one sentence). The `executive_center` stage runner produces this summary + persists an
`AIInteraction` (role system) capturing it.

### 3.17 AI Chat + Timeline (`/api/v1/ai` — S2/S4)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/ai/chat` | `{message, dataset_id?, run_id?, stage_context?}` | `{reply, meta}` |
| GET | `/ai/{dataset_id}/timeline` | — | `{stages: [Trace]} (latest run traces)` |

`/ai/chat` is a deterministic rule-based assistant (no external LLM): it knows the current run's
stage results and dataset facts from the DB and answers questions like “what is the DQ score?”,
“explain the anomalies”, “what should I do next?”, “why are predictions confident?”. Persist the
exchange in `ai_interactions` (role user/assistant, meta `{stage_context}`). Unknown questions
receive a helpful pointer to the pipeline. (S2 owns chat; falls back gracefully if no run.)

### 3.18 Reports (`/api/v1/reports` — S5)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/reports` | — | `{reports: [Report]}` |
| POST | `/reports/generate` | `{dataset_id, title?, report_type?, format?, sections?}` | `{report, download_url}` |
| GET | `/reports/{id}` | — | `Report` full |
| GET | `/reports/{id}/download` | — | FileResponse (attachment, content-disposition) |

`Report = {id, title, report_type, format, file_size_bytes, sections, status, generated_at}`.
`report_type`: `executive|technical|compliance|custom`. `format`: `pdf|html|csv`.
PDF via ReportLab (clean multi-section layout, header/footer, page numbers), HTML via Jinja2
match of DESIGN_SYSTEM tokens, CSV = one sheet per section. Sections auto-populated from the
dataset's latest run: exec summary (trust verdict + headline), DQ, schema, model metrics +
leaderboard, SHAP top drivers, anomalies, recommendations + savings, predictions horizon,
carbon/cost. `download_url = /api/v1/reports/{id}/download`. Persist `Report` + write file to
`settings.reports_dir`.

### 3.19 Workflows (`/api/v1/workflows` — S2)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/workflows/start` | `{dataset_id, config?}` | `{run: Run}` |
| GET | `/workflows` | `?dataset_id=` | `{runs: [Run]}` |
| GET | `/workflows/{run_id}` | — | `{run, traces}` |
| POST | `/workflows/{run_id}/stages/{stage_key}/exec` | `{params?}` | `{trace, output, decision, confidence}` |
| POST | `/workflows/{run_id}/advance` | — | same as exec (next gap stage) |
| GET | `/workflows/{run_id}/traces` | — | `{traces: [Trace]}` |
| GET | `/workflows/{run_id}/stream` | — | SSE (token via `?token=` or Bearer) |

`Run = {id, dataset_id, status, current_stage, total_stages, stages_completed,
started_at, completed_at, error_message, config}`. `total_stages = TOTAL_STAGES` (17).
`status`: `running|completed|failed|cancelled`. Completes when stages_completed length == TOTAL.

`Trace = {id, stage_number, stage_name, status, input_snapshot, output_snapshot, decision,
confidence, started_at, completed_at, duration_ms, error}`.

Exec semantics: validate stage_key exists; look up dataset from run; call `get_stage_runner(key)`;
404 if unregistered. Persist StageTrace (input snapshot = params, output snapshot = output); update
run `current_stage = max(current_stage, stage_no)` + `stages_completed.append(key)`; publish SSE
`stage_completed`. Errors → trace status `failed`, run error_message set, SSE `stage_failed`.
After exec #17 → run `completed` + SSE `run_completed`.

SSE events (JSON in `data:`, no event names): `{type: run_started|stage_started|
stage_completed|stage_failed|run_completed|run_failed|heartbeat, run_id, stage_number?,
stage_key?, stage_name?, output?, decision?, confidence?, error?, ts}`. Stage runners should also
publish `stage_started` at their start (via helper `app.workflow.events.emit(run, type, **kw)`).

### 3.20 Registry (`/api/v1/registry` — S4)
| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/registry` | `?dataset_id=` | `{models: [RegistryEntry]}` |
| POST | `/registry/{model_id}/promote` | — | `{entry: RegistryEntry}` |
| POST | `/registry/{model_id}/deprecate` | — | `{entry: RegistryEntry}` |

`RegistryEntry = {id, model_id, dataset_id, version, status, promoted_at, deprecated_at,
performance_summary, notes, is_current, created_at}`. `promote` sets exactly one `is_current`
per dataset (unset others), status `production`, record `promoted_at`. `deprecate` → `deprecated`.

---

## 4. Stage runner → file ownership map

| Stage key | Register in (module) | Owned by |
|---|---|---|
| library, import, raw_preview | `app/domain/dataset_service.py` | S1 |
| schema_discovery | `app/domain/schema_service.py` | S3 |
| dq_engine | `app/domain/dq_service.py` | S3 |
| transformation | `app/domain/transform_service.py` | S3 |
| feature_engineering | `app/domain/feature_service.py` | S3 |
| prediction | `app/domain/prediction_service.py` | S4 |
| confidence_gate | `app/domain/trust_service.py` | S4 |
| raw_vs_processed | `app/domain/comparison_service.py` | S4 |
| shap | `app/domain/shap_service.py` | S4 |
| anomaly | `app/domain/anomaly_service.py` | S4 |
| benchmarking | `app/domain/benchmark_service.py` | S4 |
| recommendation | `app/domain/recommend_service.py` | S4 |
| executive_center | `app/domain/executive_service.py` | S4 |
| report | `app/domain/report_service.py` | S5 |
| history_registry | `app/domain/registry_service.py` | S5 (summary) |

## 5. Audit + interactions (all agents)
Every mutating action (upload, apply, train, promote, generate, exec) writes an `AuditLog`
row: `{user_id, action, resource_type, resource_id, details}`. `/ai/chat` and executive summary
persist `AIInteraction` rows as specified above.