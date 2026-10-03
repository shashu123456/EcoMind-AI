# EcoMind AI — PROJECT MASTER SPECIFICATION

**Document status:** Single source of truth — everything in this document is authoritative.
**Version:** 2.0.0 (Master Specification; supersedes `PROJECT_MASTER_BLUEPRINT.md` as source of truth)
**Date:** 2026-09-17
**Classification:** Internal technical specification (IEEE / final-year research artifact)

> Governing rule: **the architecture described here is LOCKED.** No redesign, no technology-stack
> changes, no new frameworks. All work must be **polish, completion, validation, and bug-fix** of
> the existing implementation. When a section is changed, update this file AND `docs/BUILD_LOG.md`
> in the same change. Never duplicate functionality; never redesign a completed module; never skip
> a task in `IMPLEMENTATION_ROADMAP.md`.

---

## Table of Contents

1. [Complete Project Vision](#1-complete-project-vision)
2. [Problem Statement](#2-problem-statement)
3. [Research Objective](#3-research-objective)
4. [Novel Research Contribution](#4-novel-research-contribution)
5. [Technology Stack](#5-technology-stack)
6. [Final Architecture](#6-final-architecture)
7. [Folder Structure](#7-folder-structure)
8. [Database Schema](#8-database-schema)
9. [API Endpoints](#9-api-endpoints)
10. [Complete 17-Stage Workflow](#10-complete-17-stage-workflow)
11. [Data Quality Engine Methodology](#11-data-quality-engine-methodology)
12. [Feature Engineering Methodology](#12-feature-engineering-methodology)
13. [Prediction Engine Methodology](#13-prediction-engine-methodology)
14. [AI Confidence Gate Methodology](#14-ai-confidence-gate-methodology)
15. [Raw vs Processed Comparison Methodology](#15-raw-vs-processed-comparison-methodology)
16. [SHAP Explainability Methodology](#16-shap-explainability-methodology)
17. [Anomaly Detection Methodology](#17-anomaly-detection-methodology)
18. [Benchmarking Methodology](#18-benchmarking-methodology)
19. [Recommendation Engine Methodology](#19-recommendation-engine-methodology)
20. [Executive Intelligence Center Methodology](#20-executive-intelligence-center-methodology)
21. [Report Generation Workflow](#21-report-generation-workflow)
22. [Dataset Library Specification](#22-dataset-library-specification)
23. [Dataset Provenance Specification](#23-dataset-provenance-specification)
24. [Model Registry Specification](#24-model-registry-specification)
25. [History Specification](#25-history-specification)
26. [UI/UX Design System](#26-uiux-design-system)
27. [Motion and Animation Rules](#27-motion-and-animation-rules)
28. [Color Palette](#28-color-palette)
29. [Typography](#29-typography)
30. [Component Standards](#30-component-standards)
31. [Coding Standards](#31-coding-standards)
32. [Folder Responsibilities](#32-folder-responsibilities)
33. [Testing Strategy](#33-testing-strategy)
34. [Future Research Roadmap](#34-future-research-roadmap)
35. [Known Limitations](#35-known-limitations)
36. [Pending Tasks](#36-pending-tasks)
37. [Completed Tasks](#37-completed-tasks)
38. [Development Log](#38-development-log)
39. [Change Log](#39-change-log)

---

## 1. Complete Project Vision

**EcoMind AI — Adaptive Explainable Energy Intelligence Platform** transforms raw organizational
energy datasets into trusted, explainable, actionable business decisions through a transparent,
end-to-end AI workflow.

The product simultaneously serves three purposes:

1. **Final-year engineering major project** — production-quality, well-architected code, tests,
   documentation, reproducible demo, and a professional UI.
2. **IEEE-conference-ready research artifact** — the research contribution is *system integration
   and reproducibility*: an integrated, observable 17-stage explainable pipeline with a quantified
   trustworthiness evaluation, not a single new ML algorithm.
3. **Professional portfolio SaaS** — the platform feels like enterprise software (Linear, Vercel,
   Stripe, Datadog, Palantir-quality UI) while remaining a completely offline, single-machine,
   self-contained application.

**Design thesis (locked):** *Trustworthy AI begins with trustworthy data.* Every prediction,
recommendation, benchmark, and executive decision must be traceable back through a transparent
processing pipeline so users understand not only *what* the system predicts but *why* it reached
that conclusion and *how much it can be trusted*.

**Product identity:** EcoMind AI is NOT an energy monitoring dashboard, NOT an IoT platform, NOT a
standalone forecaster, NOT a bare anomaly detector. It is a **decision-support intelligence
platform** in which *the workflow itself is the product*.

---

## 2. Problem Statement

Organizations collect large volumes of energy telemetry (meter readings, building hierarchies,
occupancy, temperature) but lack the means to convert that raw data into reliable decisions.

Existing tools fall into two camps:

- **Monitoring dashboards** visualize data but provide no intelligence or decision support.
- **Black-box prediction engines** produce forecasts without explaining *why* or how *trustworthy*
  the outputs are.

Neither suffices for an organization that must justify energy investments to leadership,
regulators, or auditors. Trustworthy decisions require **visible data quality, traceable
transformations, explainable predictions, quantified trust, and reproducible experiments.**

---

## 3. Research Objective

> How can an organization convert raw energy data into intelligent, explainable, trusted decisions?

EcoMind AI answers this by demonstrating an *adaptive* pipeline that:

- adapts its processing to the discovered structure of each dataset (schema-discovery-driven);
- selects the best model per dataset from a trained ensemble;
- evaluates the trustworthiness of its *own* outputs (AI Confidence Gate);
- adapts recommendations to each organization's evidence (never generic advice).

Prediction is only one stage. **The workflow is the product** — every stage observable, every
decision auditable, every experiment reproducible.

---

## 4. Novel Research Contribution

The novelty is **not** a new ML algorithm. The contribution is an **integrated, explainable
workflow** where multiple intelligent stages operate as one transparent pipeline, plus a formal
evaluation of the trustworthiness of the pipeline's own outputs.

| # | Contribution | Detail |
|---|---|---|
| 1 | **Data Quality Engine (primary)** | Mandatory gate before any AI analysis. Quantitatively demonstrates how quality improvement affects prediction accuracy and decision reliability. |
| 2 | **Explainable AI (SHAP)** | Global + local feature importance, natural-language reasoning, confidence bounds. |
| 3 | **Transparent AI workflow** | Every stage observable: stage traces (AI Reasoning Timeline), pipeline events, transformation log, raw data preserved, provenance stored. |
| 4 | **Raw vs Processed comparison experiment** | Identical ML experiment run on raw vs quality-processed data; R²/RMSE/MAE/MAPE/SHAP-stability improvements quantified (strongest IEEE figure). |
| 5 | **AI Confidence Gate** | Trust score from prediction confidence, data quality, model reliability, and SHAP stability; verdict high/moderate/low trust instead of blind acceptance. |
| 6 | **Decision support — Executive Intelligence Center** | Business-level synthesis: savings, CO₂ reduction, rankings, critical anomalies, executive summary, and recommendations on one screen. |

**Why suitable for IEEE:** the contribution is *system integration + reproducibility + output
trustworthiness evaluation* — a defensible research stance. Dataset provenance + model registry +
stage traces make every result reproducible.

---

## 5. Technology Stack

**Frontend** (locked):
| Tool | Use |
|---|---|
| React 18 + TypeScript | Application framework (TanStack Router for file-style routing) |
| Vite 5 | Dev server / production build |
| Tailwind CSS 3 | Utility-first styling + design tokens (`tokens.css`) |
| Framer Motion 11 | All motion/animation |
| Recharts 2 | Charts (area, line, bar, radar, gauge, scatter, donut…) |
| zustand 4 | Journey/workflow client state |
| @tanstack/react-query | Server-state hooks (`useApi`) |
| lucide-react | Iconography |
| reactflow | (installed; workflow rail uses custom DOM — reserved) |

**Backend** (locked):
| Tool | Use |
|---|---|
| FastAPI | HTTP API + SSE streaming |
| SQLAlchemy | ORM over SQLite |
| Pydantic | Validation / schemas |
| bcrypt (passlib) | Password hashing |
| python-jose | JWT access tokens |
| joblib | Model serialization (`data/models/*.joblib`) |

**Database:** SQLite only — single file `backend/data/ecomind.db`, WAL mode, no external services.

**AI / ML:**
| Tool | Use |
|---|---|
| pandas / numpy | Dataframes and numerics |
| scikit-learn | Linear, Random Forest, Gradient Boosting, Isolation Forest, LOF, One-Class SVM, metrics, splits |
| xgboost | XGBRegressor (primary strong model) |
| shap | Global + local explainability |

**Reports:**
| Tool | Use |
|---|---|
| reportlab | PDF generation (platypus) |
| jinja2 | HTML reports |
| csv (stdlib) | Tabular exports |

**Intentionally NOT used** (portability, reproducibility, offline, simplicity): Docker; any external
database (Postgres/MySQL/Mongo/Supabase/Influx); Redis or any cache/broker; Kafka/MQTT/messaging;
TensorFlow/PyTorch; cloud SDKs; Celery/workers; hardware integration. The entire system runs on a
single Windows machine with `.venv` and is fully reproducible offline.

**Runtime end-to-end:** FastAPI serves the built SPA from `frontend/dist` at `/` (production mode,
`backend/app/main.py` mounts `StaticFiles` under `/`), so `http://localhost:8000` is the full app.
Vite dev `:5173` is optional for development. Desktop launcher (`launcher/`) orchestrates both.

---

## 6. Final Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  FRONTEND — React SPA (served at :8000 by FastAPI; dev :5173)  │
│  React · TS · Tailwind · Framer Motion · Recharts · zustand    │
│  19 pages · animated 17-stage PipelineRail · journey store     │
│  Service layer: lib/api.ts (typed client) · lib/hooks.ts       │
└───────────────────────────────┬───────────────────────────────┘
                               │  HTTP /api/v1 (JSON)  +  SSE /workflows/{id}/stream
┌───────────────────────────────▼───────────────────────────────┐
│  BACKEND — FastAPI (:8000), single process, single node        │
│  app/routes/*.py (19 routers) → app/domain/*_service.py        │
│  (stage runners) → app/workflow/stages.py (registry)           │
│  Async event bus + SSE (app/events/event_bus.py)               │
└───────────────────────────────┬───────────────────────────────┘
                               │  SQLAlchemy (sync)
┌───────────────────────────────▼───────────────────────────────┐
│  DATABASE — SQLite (backend/data/ecomind.db, WAL)              │
│  21 tables: provenance, schema, dq, transformations, features, │
│  models, predictions, shap, anomalies, benchmarks, recs,       │
│  reports, runs, traces, gates, comparisons, registry, charts,  │
│  ai_interactions, audit_log, users                             │
└───────────────────────────────┬───────────────────────────────┘
                               │  pandas/numpy read/write
┌───────────────────────────────▼───────────────────────────────┐
│  AI ENGINE — in-process ML                                     │
│  sklearn · XGBoost · SHAP · pandas · numpy · joblib            │
└───────────────────────────────┬───────────────────────────────┘
                               │  artifacts
┌───────────────────────────────▼───────────────────────────────┐
│  ARTIFACT STORE — backend/data/                                │
│  uploads/{id}.csv · processed/{id}.csv · models/{id}.joblib ·  │
│  reports/{ts}_{dsid}.pdf · sample/bdg2_energy_30day.csv        │
└───────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| **Frontend** | Guided interaction: shows the system thinking and processing in real time. Owns the 17-stage workflow UI, split-screen visualizations, animations, Executive Intelligence Center. Never hides state. |
| **Backend** | API + orchestration. Uploads, validation, workflow engine, persistence of every artifact, SSE progress streaming. |
| **Database** | Single source of truth for all persisted artifacts; every stage result queryable and reproducible. |
| **AI Engine** | Pure computation: schema inference, quality scoring, transformation, feature engineering, model training/evaluation, SHAP, anomaly detection, benchmarking, recommendation synthesis, trust scoring. |
| **Artifact store** | Immutable original uploads, processed copies, serialized models, generated reports. |

---

## 7. Folder Structure

```
EcoMind-AI-main/
├── PROJECT_MASTER_SPEC.md        ← THIS FILE (single source of truth)
├── IMPLEMENTATION_ROADMAP.md     ← ordered task list (see §36, §39)
├── GAP_ANALYSIS.md               ← spec-vs-implementation delta (recheck after tasks)
├── PROJECT_MASTER_BLUEPRINT.md   ← original blueprint (historical baseline)
├── README.md                     ← quick start + overview
├── Makefile                      ← seed/backend/frontend/build/test/demo/clean/help
├── pytest.ini                    ← testpaths=backend/tests, pythonpath=backend
├── backend/
│   ├── requirements.txt
│   ├── run.py                    ← uvicorn entrypoint (:8000)
│   ├── seed.py                   ← create tables + seed admin/datasets
│   ├── data/                     ← ecomind.db, uploads/, processed/, models/, reports/, sample/, launcher/
│   ├── tests/                    ← conftest.py, test_api.py (6 tests, green)
│   └── app/
│       ├── main.py               ← app factory, CORS, cache headers, SPA mount
│       ├── core/                 ← config.py (settings), security.py (JWT/bcrypt)
│       ├── db/                   ← base.py (engine/session), models.py (21 tables)
│       ├── routes/               ← 19 routers (see §9)
│       ├── domain/               ← 18 service modules (stage runners + helpers)
│       ├── workflow/             ← stages.py (stage order + runner registry + trust formula), events.py
│       └── events/               ← event_bus.py (SSE)
├── frontend/
│   ├── package.json, tsconfig.json, vite.config.ts, tailwind.config.js, index.html
│   ├── dist/                     ← production build (served by backend)
│   └── src/
│       ├── main.tsx, App.tsx, router.tsx
│       ├── lib/                  ← api.ts (typed client), hooks.ts (useApi), journey.ts (workflow store), kit.tsx, pagekit.tsx
│       ├── pages/                ← 19 pages (see §26)
│       └── components/           ← PageSkeleton.tsx, TopBar.tsx, PipelineRail.tsx, …
├── launcher/
│   ├── start.py / stop.py / spawn.py / tee.py / processes.py / config.py / config.json
│   ├── system_check.py / checks.py / logutil.py
│   └── Launch_EcoMind.bat / Stop_EcoMind.bat / Check_System.bat   (at repo root)
├── scripts/
│   └── demo_end_to_end.py        ← 17-stage demo driver (real DB)
└── docs/
    ├── BUILD_LOG.md              ← runbook (appended)
    ├── PROGRESS.md               ← live checklist
    ├── DESIGN_SYSTEM.md          ← locked design contract
    ├── ARCHITECTURE.md           ← fast lookup pointer
    └── API_CONTRACT.md           ← wire contract
```

---

## 8. Database Schema

21 tables, all with `TimestampMixin` (`created_at`, `updated_at`). SQLite, WAL mode,
`backend/data/ecomind.db`. Source of truth: `backend/app/db/models.py`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Auth/identity | id(uuid str), email(unique), hashed_password, full_name, role(admin/analyst/viewer), is_active |
| `datasets` | Provenance + file metadata | id, user_id, name, description, source_type(sample/upload), file_path, file_size_bytes, row_count, column_count, status, provenance(JSON: origin, license, collection_method, temporal_range, geographic_scope, version, citation) |
| `schema_columns` | Schema discovery output | id, dataset_id, name, data_type, nullable, unique_count, null_count, sample_values(JSON), statistics(JSON: mean/std/min/max/median/q25/q75/skewness/kurtosis), semantic_type; unique(dataset_id, name) |
| `dq_results` | DQ checks | id, dataset_id, rule_name, rule_category, dimension(completeness/accuracy/consistency/timeliness/validity), score(0–100), details(JSON), severity(info/warning/critical), passed, ran_at |
| `transformations` | Immutable change log | id, dataset_id, operation(drop_columns/fill_missing/encode_categorical/normalize/outlier_clip/feature_engineer/resample), params(JSON), columns_affected(JSON), rows_affected, before_snapshot(JSON), after_snapshot(JSON), applied, applied_at |
| `features` | Generated features | id, dataset_id, name, feature_type, source_columns(JSON), description, importance_score, created_by; unique(dataset_id, name) |
| `models` | Trained ML models | id, dataset_id, name, algorithm(xgboost/random_forest/gradient_boosting/linear/ridge/lasso), task_type, version, hyperparameters(JSON), metrics(JSON: r2/rmse/mae/mape/…), feature_importances(JSON), training_time_seconds, training_rows, model_path, status, is_active |
| `predictions` | Forecast points | id, model_id, dataset_id, input_data(JSON), predicted_value, confidence(0–1), prediction_type(point/interval/probabilistic), interval_lower, interval_upper, actual_value, error |
| `shap_explanations` | Global/local SHAP | id, prediction_id, model_id, method(tree/kernel/linear/deep), feature_names(JSON), shap_values(JSON), base_value, expected_value, global_importance(JSON), interaction_effects(JSON), computation_time_ms |
| `anomalies` | Detected anomalies | id, dataset_id, model_id?, timestamp, asset_id, anomaly_type, severity(low/medium/high/critical), score, confidence, is_confirmed, description, context(JSON: reading_value/expected_value/deviation_pct/nearby_readings) |
| `benchmarks` | Model comparisons | id, dataset_id, name, description, model_ids(JSON), metrics_compared(JSON), results(JSON: model_id→{metric:value,rank}), winner, methodology(cross_validation/holdout/time_series_split) |
| `recommendations` | Evidence-based advice | id, dataset_id, anomaly_id?, category(hvac_optimization/lighting/equipment_scheduling/load_shifting/maintenance/renewable), title, description, priority, estimated_savings_kwh, estimated_savings_percent, confidence, status(pending/accepted/implemented/rejected), supporting_evidence(JSON: anomaly_scores/shap_top_features/similar_cases/basis) |
| `reports` | Generated artifacts | id, dataset_id, user_id, title, report_type(executive/technical/compliance/custom), format(pdf/html/csv), file_path, file_size_bytes, sections(JSON), status, generated_at |
| `workflow_runs` | Run lifecycle | id, dataset_id, user_id, status(running/completed/failed/cancelled), current_stage, total_stages(17 per spec), stages_completed(JSON), started_at, completed_at, error_message, config(JSON) |
| `stage_traces` | AI Reasoning Timeline | id, workflow_run_id, stage_number, stage_name, status(running/completed/failed/skipped), input_snapshot(JSON), output_snapshot(JSON), decision, confidence(0–1), started_at, completed_at, duration_ms, error |
| `confidence_gates` | Trust gate records | id, workflow_run_id, prediction_confidence, dq_score, model_relevance, shap_stability, trust_score, verdict(high_trust/moderate_trust/low_trust), factors(JSON), reasoning |
| `raw_processed_comparisons` | Raw-vs-processed experiment | id, workflow_run_id, raw_model_id?, processed_model_id?, metrics(JSON: raw/processed 5 metrics), improvement(JSON: r2_delta/rmse_delta_pct/mae_delta_pct/mape_delta_pct/shap_delta), feature_count_raw, feature_count_processed, shap_divergence, conclusion |
| `model_registry` | Every trained model (lifecycle) | id, model_id, dataset_id, version, status(staging/production/deprecated/archived), promoted_at, deprecated_at, performance_summary(JSON), notes, is_current; unique(model_id, version) |
| `comparison_charts` | Chart-ready comparison data | id, workflow_run_id, chart_type(bar/radar/waterfall/heatmap/scatter/line), title, data(JSON), config(JSON), comparison_type(raw_vs_processed/model_comparison/metric_evolution) |
| `ai_interactions` | Chat history | id, user_id, dataset_id?, workflow_run_id?, role(user/assistant/system), content, meta(JSON: stage_context/tool_used/confidence) |
| `audit_log` | Every mutating action | id, user_id?, action(create/update/delete/execute/export), resource_type, resource_id?, details(JSON), ip_address |

Relationships: `users 1—N datasets/models/reports/workflow_runs/ai_interactions/audit_log` ·
`datasets 1—N {schema_columns, dq_results, transformations, features, models, predictions, anomalies,
benchmarks, recommendations, reports, workflow_runs, model_registry}` ·
`workflow_runs 1—N {stage_traces, confidence_gates, raw_processed_comparisons, comparison_charts}` ·
`models 1—N predictions` · `predictions 1—N shap_explanations`.

---

## 9. API Endpoints

Base URL: `/api/v1`. Auth: `Authorization: Bearer <token>` except `POST /auth/register`,
`POST /auth/login`, `GET /health`. Errors: HTTP status + `{"detail": "<message>"}`. JSON-safe
numbers (no NaN/Inf).

### 9.1 AppInfo & Auth
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status:"ok", version:"1.0.0"}` |
| POST | `/auth/register` | `{email,password,full_name}` → `{access_token, user}` |
| POST | `/auth/login` | `{email,password}` → `{access_token, user}` |
| GET | `/auth/me` | current user `{id,email,full_name,role}` |

### 9.2 Datasets (incl. schema/discovery, DQ, transforms, features)
| Method | Path | Purpose |
|---|---|---|
| GET | `/datasets` | list w/ provenance (`?source_type=`) |
| POST | `/datasets/upload` | multipart csv/xlsx → dataset (original file stored byte-for-byte) |
| GET | `/datasets/{id}` | metadata + provenance |
| DELETE | `/datasets/{id}` | remove |
| GET/POST | `/datasets/{id}/preview` | raw preview (rows, columns, stats, missing summary) |
| POST | `/datasets/{id}/refresh` | re-scan file → row/column counts |
| GET | `/datasets/{id}/content` | rows/records payload |
| GET | `/datasets/{id}/schema` | stored schema columns |
| POST | `/datasets/{id}/schema/discover` | run discovery (`use_processed?`) |
| GET/POST | `/datasets/{id}/dq`, `/datasets/{id}/dq/run` | DQ results + run engine |
| GET/POST | `/datasets/{id}/transformations`, `/…/transformations/apply` | change log + apply op |
| GET/POST | `/datasets/{id}/features`, `/…/features/engineer` | feature list + engineering |

### 9.3 Models / Predictions / Explanations
| Method | Path | Purpose |
|---|---|---|
| GET | `/models` | list |
| POST | `/models/train` | train model → Model (regression, 70/30 time split, joblib persisted, registry row) |
| GET | `/models/{id}` | detail |
| POST | `/predictions/predict` | forecast (+ horizon_summary: total_kwh, peak_kw, co2_estimate_kg, cost_estimate) |
| GET | `/predictions/{model_id}/predictions` | stored prediction points |
| POST | `/explanations/{prediction_id}/explain` | local SHAP + narrative + stability_index |
| GET | `/explanations/{model_id}/global` | global SHAP `{feature_names, global_importance, base_value, stability_index}` |

### 9.4 Anomalies / Benchmarks / Recommendations
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/anomalies/{dataset_id}/anomalies`, `/…/detect` | list / ensemble detection (precision+recall when ground truth `is_anomaly` exists) |
| GET/POST | `/benchmarks/{dataset_id}/benchmarks`, `/…/run` | model leaderboard (time_series_split/cross_validation) |
| GET/POST | `/recommendations/{dataset_id}/recommendations`, `/…/generate` | evidence-based recommendations + total savings |

### 9.5 AI / Confidence / Executive / Chat
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/ai/{dataset_id}/confidence`, `/…/evaluate` | trust gate `{trust_score, verdict, prediction_confidence, dq_score, model_relevance, shap_stability, factors, reasoning}` |
| GET | `/ai/{dataset_id}/executive` | executive summary aggregate |
| POST | `/ai/chat` | deterministic rule-based assistant (no external LLM) |
| GET | `/ai/{dataset_id}/timeline` | stage traces (AI Reasoning Timeline) |

### 9.6 Comparison / Workflows / Registry / Reports
| Method | Path | Purpose |
|---|---|---|
| GET | `/comparison/{run_id}/raw-processed`, `/charts` | experiment result + charts |
| POST | `/comparison/{run_id}/raw-processed/run` | run raw-vs-processed experiment |
| POST | `/workflows/start` | `{dataset_id}` → `{run}` |
| GET | `/workflows?dataset_id=` | list runs |
| GET | `/workflows/{run_id}` | run + traces |
| POST | `/workflows/{run_id}/stages/{stage_key}/exec` | execute any stage runner |
| POST | `/workflows/{run_id}/advance` | execute next gap stage |
| GET | `/workflows/{run_id}/traces` | stage traces |
| GET | `/workflows/{run_id}/stream` | SSE event stream (token via `?token=` or Bearer) |
| GET | `/registry?dataset_id=` | registry entries |
| POST | `/registry/{model_id}/promote` / `/deprecate` | lifecycle transitions (one `is_current` per dataset) |
| GET/POST | `/reports`, `/reports/generate` | list / generate (pdf/html/csv) |
| GET | `/reports/{id}`, `/reports/{id}/download` | report + file download |

**SSE events (documented in API_CONTRACT §3.19):** `run_started | stage_started |
stage_completed | stage_failed | run_completed | run_failed | heartbeat` with structured JSON in `data:`.

---

## 10. Complete 17-Stage Workflow

Authoritative order & keys: `backend/app/workflow/stages.py` (`STAGES`; `TOTAL_STAGES = 17`).
Trust formula + verdict also live there (`TRUST_WEIGHTS`, `trust_verdict`).

| # | Key | Label | Frontend route | Backend runner |
|---|---|---|---|---|
| 1 | `library` | Dataset Library | `/library` | dataset_service |
| 2 | `import` | Import | `/import` | dataset_service |
| 3 | `raw_preview` | Raw Preview | `/preview` | dataset_service |
| 4 | `schema_discovery` | Schema Discovery | `/schema` | schema_service |
| 5 | `dq_engine` | DQ Engine | `/dq` | dq_service (primary contribution) |
| 6 | `transformation` | Transformation Viewer | `/transformations` | transform_service |
| 7 | `feature_engineering` | Feature Engineering | `/features` | feature_service |
| 8 | `prediction` | Prediction | `/prediction` | prediction_service |
| 9 | `confidence_gate` | AI Confidence Gate | `/confidence` | trust_service |
| 10 | `raw_vs_processed` | Raw vs Processed | `/comparison` | comparison_service |
| 11 | `shap` | SHAP Explainability | `/shap` | shap_service |
| 12 | `anomaly` | Anomaly Detection | `/anomalies` | anomaly_service |
| 13 | `benchmarking` | Benchmarking | `/benchmarks` | benchmark_service |
| 14 | `recommendation` | Recommendation Engine | `/recommendations` | recommend_service |
| 15 | `executive_center` | Executive Intelligence Center | `/executive` | executive_service |
| 16 | `report` | Report Generation | `/reports` | report_service |
| 17 | `history_registry` | History & Model Registry | `/history` | registry_service |

**Runner contract:** plain function `(run, db, params) -> {output, confidence(0–1|None),
decision(str), trace_extra?}`. Registration via `@register_stage_runner(key)` at import time.
`workflow/advance` walks the ordered list; completion requires `len(stages_completed) == 17`.
Every exec persists a `StageTrace` (input/output snapshots, decision, confidence, duration_ms).

The frontend guides the user through this exact sequence **with auto-advance** after each stage;
the user pauses only where inspection matters (DQ corrections, Prediction results, Confidence
verdict).

---

## 11. Data Quality Engine Methodology

**Mandatory gate before any AI analysis.** Split-screen UI (raw → animated rules → processed),
live composite score climbing, human-readable reason for every correction.

**Dimension weights (locked):**
```
DQ Score = 0.25·Completeness + 0.25·Validity + 0.20·Consistency + 0.15·Uniqueness + 0.15·Timeliness
```

- **Completeness** — weighted non-null ratio by column role.
- **Validity** — fraction of values passing type/range/semantic constraints
  (voltage ≈ 220–240 V, power factor 0–1, humidity 0–100, temperature −20–60, energy ≥ 0).
- **Consistency** — hierarchy/cross-field coherence (energy ≈ power × interval).
- **Uniqueness** — 1 − duplicate-row ratio on business key (asset_id + timestamp).
- **Timeliness** — timestamp format/order/gap validity.

Each check becomes a `dq_results` row (`rule_name`, `dimension`, `score`, `severity`, `passed`,
`details.explanation` — a human-readable explanation). Genuine computations, never faked: null
rate, uniqueness, IQR/z-score outlier rate, value-range vs semantic bounds, duplicate rows,
temporal gaps, monotonicity anomalies, invalid identifiers. Transformation corrections are
persisted as immutable `transformations` entries with before/after/reason and feed the
Transformation Viewer, AI Reasoning Timeline, reports, and audit appendix.

---

## 12. Feature Engineering Methodology

Features are generated on the *processed* frame, default `auto:true` when the dataset is
time-series + energy. Temporal + lag + statistical features (GENERALLY USEFUL, idempotent —
existing names are skipped and reported in `messages`):

- `hour_of_day`, `day_of_week`, `is_weekend`, `month`
- `rolling_mean_24h`, `rolling_std_24h`, `lag_1h`, `diff_1h`
- `load_factor` (energy/power), `energy_density` (where occupancy exists)

Custom feature array supports `{name, expression}` over column names (safe subset:
column arithmetic). Every feature is stored with `source_columns` + `description` so the UI can
explain *why* a feature exists. `importance_score` is updated after model training from
`feature_importances`.

---

## 13. Prediction Engine Methodology

- **Split:** temporal (time-ordered) train/test, 70/30 (models) or 80/20 (workflow contract) —
  no leakage.
- **Models (locked):** linear regression (baseline), random forest, gradient boosting, XGBoost
  (also ridge/lasso/extra_trees available via `/models/train`).
- **Metrics:** R², RMSE, MAE, MAPE, explained variance; training/inference time.
- **Confidence intervals:** residual-standard-deviation-based, `confidence_level` default 0.90 →
  `{lower, upper}` per point.
- **Selection:** leaderboard ranks models by RMSE; best auto-selected, serialized with joblib to
  `data/models/{id}.joblib`, registered in `model_registry`.
- **Forecast:** `horizon` in hours (default 24); `horizon_summary` = `{total_kwh, peak_kw,
  avg_kw, co2_estimate_kg, cost_estimate}` feeding business-impact visuals.

---

## 14. AI Confidence Gate Methodology

Predictions are never blindly accepted. Final Trust Score (locked):

```
trust_score = 0.40·prediction_confidence + 0.25·dq_score + 0.20·model_relevance + 0.15·shap_stability
```

Components (all 0–100): prediction confidence (interval width / residual stats), DQ overall
score, model relevance (best R²), SHAP stability index.

**Verdict (`trust_verdict`):** `high_trust ≥ 80` · `moderate_trust 60–79` · `low_trust < 60`.
`low_trust` halts auto-advance and requests more data. The gate persists `factors` (component
values) + `reasoning` (explanation) and surfaces as the **ConfidenceGate** screen with a trust
gauge + component bars.

---

## 15. Raw vs Processed Comparison Methodology

The strongest IEEE experiment. Trains two models with **identical features and split** — one on
the RAW frame, one on the PROCESSED frame. Five locked metrics compared:
`r2, rmse, mae, mape, shap_stability`.

- `comparison = {metrics:{raw,processed}, improvement:{r2_delta, rmse_delta_pct,
  mae_delta_pct, mape_delta_pct, shap_delta}, feature_count_raw, feature_count_processed,
  shap_divergence, conclusion}`.
- `conclusion` is a full sentence ("Processing improved R² by 12.3% while reducing SHAP
  instability by 8.1%").
- Charts (`comparison_charts`): radar (metrics), bar (improvements), scatter/line
  (forecast vs actual).

---

## 16. SHAP Explainability Methodology

- **Global:** `TreeExplainer` for tree models; `KernelExplainer` (sampled background) otherwise.
  Output `{feature_names, global_importance, base_value, stability_index}`.
- **Local:** per-prediction `shap_values` → `top_features` (`[{feature, value, shap_value,
  impact}]`) with `narrative` = one sentence explaining the largest drivers.
- **Stability index (0–100):** SHAP magnitude agreement across bootstrap subsamples (higher =
  more stable); feeds the Confidence Gate component.
- Persisted to `shap_explanations`; surfaced on the **SHAP** screen (global bars + local force +
  natural language).

---

## 17. Anomaly Detection Methodology

Ensemble detection (genuine, not rule-dedupe-only):

- **IsolationForest** (per-asset, per-hour context)
- **z-score** statistical threshold
- **absolute trend breaks**
- **domain rules** (night usage on office buildings, zero/low sensor reads)

Merge + dedupe; `score` 0–1; `severity` by score + context. Each anomaly stores `context =
{reading_value, expected_value, deviation_pct, nearby_readings}`, type
(`energy_spike/night_usage/equipment_degradation/phantom_load/voltage_fluctuation/
current_imbalance/continuous_overconsumption/sensor_failure`), confidence, and description.
If the dataset has an `is_anomaly` ground-truth column → report `precision`/`recall`.

---

## 18. Benchmarking Methodology

Default comparison set with identical features/split unless `model_ids` given:

- XGBoost, Random Forest, Gradient Boosting, Ridge (+ linear).
- `methodology`: `time_series_split` (default) or `cross_validation`.
- Output `leaderboard = [{model_id, name, algorithm, scores:{metric:value}, total_score, rank}]`,
  `winner`. Persists `Benchmark` + a `ComparisonChart` (comparison_type `model_comparison`).

---

## 19. Recommendation Engine Methodology

Evidence-based only — every recommendation references real analytics. Bases: anomalies
(types + severities), SHAP top drivers, consumption trends, idle/off-hours load,
weekday/weekend patterns.

- Categories: `hvac_optimization | lighting | equipment_scheduling | load_shifting |
  maintenance | renewable`.
- Each recommendation: `{category, title, description, priority, estimated_savings_kwh,
  estimated_savings_percent, confidence, status, supporting_evidence}` where
  `supporting_evidence = {anomaly_scores, shap_top_features, similar_cases, basis}` and `basis`
  is always the evidence text justifying the recommendation.
- Aggregate: `{recommendations, by_category, total_savings_kwh, total_savings_percent,
  top_recommendation}` (feeds Executive Center).

---

## 20. Executive Intelligence Center Methodology

One-screen executive answer aggregating the run/dataset:

- trust verdict + score, headline (one sentence)
- critical anomalies (with severities)
- top recommendations + total savings (kWh/%) + top recommendation
- model leaderboard winner, SHAP top drivers
- consumption totals: forecast kWh, CO₂ kg, cost
- DQ overall score

Persists an `AIInteraction` (role `system`) capturing the summary; the **ExecutiveCenter** page
renders headline, business-impact panels, anomaly/recommendation highlights, SHAP drivers, and
journey map.

---

## 21. Report Generation Workflow

**Formats:** PDF (executive/technical), HTML (Jinja2), CSV.
- PDF via reportLab platypus with header/footer + page numbers; HTML matches design tokens;
  CSV = one section per sheet.

**Sections (auto-populated from the dataset's latest run):**
1. Cover page (title, org, date) 2. Dataset info + provenance 3. Data quality results
(score, dimensions, transformation summary) 4. Prediction results (leaderboard, best model,
forecast, confidence) 5. AI confidence gate / trust score 6. Raw vs processed comparison
7. Anomaly summary 8. Benchmark results 9. Recommendations 10. Business impact (savings, CO₂)
11. Methodology 12. Limitations 13. Appendix (AI reasoning timeline, transformation log,
SHAP summaries).

Persist `Report` row (title, report_type, format, sections, status) + write file to
`backend/data/reports/`; serve via `/reports/{id}/download`. Real artifacts already generated
(verified — several dated PDFs exist in `backend/data/reports/`).

---

## 22. Dataset Library Specification

- **Bundled research sample** — `bdg2_energy_30day.csv` (BDG2-inspired, deterministic, offline):
  columns `timestamp, asset_id, asset_type, energy_kwh, power_kw, voltage_v, current_a,
  power_factor, temperature_c, humidity_pct, occupancy_count, is_anomaly`. Both seeded datasets
  are 3600 rows each. Default target `energy_kwh`; timestamp column `timestamp`.
- **Uploads** — CSV / XLSX only; original file stored byte-for-byte in
  `backend/data/uploads/{id}.csv`; validated (size ≤ `max_upload_mb`, tabular, non-empty).
- **Library cards** show: name, description, source_type, provenance, rows/columns, status,
  created/updated — via `/datasets`. Frontend route `/library`.

## 23. Dataset Provenance Specification

Every dataset stores a 7-field JSON `provenance`: `origin, license, collection_method,
temporal_range, geographic_scope, version, citation`. Uploads auto-populate defaults; the sample
carries full research metadata. Provenance appears on preview, library cards, and report appendix
— strengthening research reproducibility.

## 24. Model Registry Specification

- Every trained model registers a `model_registry` row (`version=1`, status `staging`).
- `/registry/{model_id}/promote` → status `production`, `promoted_at`, and **exactly one**
  `is_current` per dataset (others unset). `/deprecate` → `deprecated`.
- `performance_summary` = `{r2, rmse, mae, training_date, dataset_hash, feature_count}`; notes.
- Frontend `/history` renders registry entries with lifecycle status.

## 25. History Specification

- `/workflows` (optionally `?dataset_id=`) lists runs: `{id, dataset_id, status, current_stage,
  total_stages, stages_completed, started_at, completed_at, error_message, config}`.
- `/workflows/{run_id}` + `/traces` return run + full stage trace timeline (AI Reasoning Timeline).
- The **History** page lets users reopen any past run/its artifacts (stage statuses, executive,
  confidence, models) and view the model registry.

---

## 26. UI/UX Design System

"Mission control AI operating system." Premium enterprise; every visual explains what the AI is
doing; no decorative KPI grids.

**19 pages:** Dashboard/Mission Control(`/`), Library(`/library`), Import(`/import/$datasetId`),
RawPreview(`/preview/$datasetId`), SchemaDiscovery(`/schema/$datasetId`),
DQEngine(`/dq/$datasetId`), Transformations(`/transformations/$datasetId`),
FeatureEngineering(`/features/$datasetId`), Prediction(`/prediction/$datasetId`),
ConfidenceGate(`/confidence/$runId`), RawProcessedComparison(`/comparison/$runId`),
SHAPExplainability(`/shap/$modelId`), AnomalyDetection(`/anomalies/$datasetId`),
Benchmarking(`/benchmarks/$datasetId`), Recommendations(`/recommendations/$datasetId`),
ExecutiveCenter(`/executive`), ReportGeneration(`/reports`), History(`/history`), Login(`/login`).

**Shell:** collapsible sidebar (mission-control order), top bar with dataset context, animated
17-stage PipelineRail with traveling light + stage chips, journey poll (zustand store,
`journey.ts`, 6s heartbeat), auto-advance.

**Signature screens:** (1) Mission Control story panels; (2) DQ split-screen (raw rows stream
down → center rules animate → processed appear; live circular score + log); (3) Raw-vs-Processed
split with VS panel; (4) Confidence gate gauge + 4 component bars; (5) anomaly timeline with
pulsing severity; (6) Executive Intelligence Center one-screen answer.

**Table contracts:** sticky headers, sort/filter/search/pagination, animated row loading,
CSV export. Empty states illustrated with CTA (e.g. Dashboard "Nothing to show on this dataset
yet" with Run-journey/Library actions). Loading = skeleton shimmer + processing logs.
`prefers-reduced-motion: reduce` must be respected.

## 27. Motion and Animation Rules

All via Framer Motion (`lib/kit.tsx`: `Reveal`, `AnimatedNumber`, `LiveBar`, `Gauge`,
`StreamTable`, `LiveLog`, `StageBanner`, `Particles`, `AutoNext`, `DoneChip`, `PulseDot`,
`ScoreTile`).

- Page transitions: fade + slide + blur, ~500ms.
- Cards: fade-up on enter, hover lift, glow border.
- Buttons: scale 1.02.
- Charts animate values; counters count up; progress animated.
- Pipeline: flowing light between stages; AI-thinking pulse; skeleton loaders (never spinners).
- Backdrop: animated grid + floating particles + soft radial gradients, extremely low opacity.
- **`prefers-reduced-motion: reduce` → disable non-essential motion.**

## 28. Color Palette

Dark professional (tokens in `frontend/src/styles/tokens.css`):

| Token | Value |
|---|---|
| `--bg-base` | `#0B1020` |
| `--bg-secondary` | `#111827` |
| `--card` | `#171F33` |
| `--panel-elevated` | `#1E293B` |
| `--border` | `rgba(148,163,184,0.12)` |
| `--accent-blue` | `#38BDF8` |
| `--accent-cyan` | `#22D3EE` |
| `--accent-emerald` | `#34D399` |
| `--accent-purple` | `#A78BFA` |
| `--accent-rose/amber` | alert/chart accents |
| `--text-primary/secondary/muted` | `#E2E8F0` / `#94A3B8` / `#64748B` |
| `--danger` | `#F87171` |

Rules: borders 1px subtle; intelligence-only accents; never rainbow palettes, heavy gradients,
heavy outlines.

## 29. Typography

- Headings: **Space Grotesk** (`--font-display`); Body: **Inter**; Numbers/mono:
  **JetBrains Mono** (Google Fonts, loaded in `index.html`).
- Scale: Hero 64 · Section 42 · Page Title 34 · Card Title 20 · Body 15 · Caption 13.
- Weights 400–700. Whitespace-heavy hierarchy.

## 30. Component Standards

- All components custom (no Bootstrap/MUI). Every component defines hover, focus, loading,
  error, success, disabled, and transition states.
- Reusable primitives in `lib/kit.tsx`; page-level helpers in `lib/pagekit.tsx`
  (`useRouteParams` etc.). Icons: lucide-react only, consistent stroke width.
- Charts: Recharts (area/line/bar/radar/gauge/scatter/forecast/donut), all animated.
- Tables via `StreamTable` (sticky header, sorting/search/pagination, CSV export, animated row
  loading, resilient column rendering — accepts `string | {name}` column descriptors).
- No inline styles; design tokens only; no duplicate CSS.

## 31. Coding Standards

- **Backend:** Python 3.11; type hints on all public signatures; domain services as plain
  functions registered as stage runners; `js_type`/`json_safe` before returning numerics;
  Pydantic input validation at routers; every mutating action writes `AuditLog`; all user/stage
  output persisted (never computed-on-the-fly for stage results that must be reproducible).
- **Frontend:** TypeScript strict; pages export `XPage` + `default XPage`; data access only via
  `lib/api.ts` + `lib/hooks.ts`; component state via `lib/journey.ts` (zustand); no `any` leaks
  where the contract is known (fix any lingering `as any` with real types); no unused imports;
  `npx tsc -b` and `vite build` must stay green.
- **Tests:** pytest (backend, `backend/tests/`); vitest targets frontend (roadmap). No tests may
  depend on live external services; use TestClient.
- **Docs:** every completed task appends to `docs/BUILD_LOG.md`; spec updates in the same change.

## 32. Folder Responsibilities

- `backend/` — entire server: API, orchestration, AI services, persistence, reporting, tests.
- `backend/app/domain/` — stage-runner services (business logic per stage).
- `backend/app/routes/` — HTTP routers (thin; validation + delegation).
- `backend/app/workflow/` — stage order/registry/trust formula + SSE events.
- `frontend/` — entire client: design system, guided workflow UI, animations.
- `frontend/src/lib/` — API client, data hooks, journey store, UI primitives.
- `frontend/src/pages/` — one screen per stage.
- `backend/data/` — DB + uploads + processed + models + reports + sample; never committed.
- `launcher/` — offline desktop startup/stop/system-check via `.bat` entrypoints.
- `scripts/` — reproducibility (demo). `docs/` — living documentation. Root: spec, roadmap,
  gap analysis, Makefile, pytest.ini, README.

## 33. Testing Strategy

- **Backend unit+integration (green):** `pytest` via `pytest.ini` (testpaths=backend/tests,
  pythonpath=backend). `backend/tests/conftest.py` provides `client`, `auth_headers`,
  `dataset_id`, `run_id` fixtures. `backend/tests/test_api.py` covers 6 flows: health, auth,
  datasets list, workflow start + stage exec + advance + traces, report generate, registry.
- **E2E demo (green):** `scripts/demo_end_to_end.py` drives all 17 stages on the real DB with
  assertions — 17/17 traces, "E2E DEMO PASSED".
- **Frontend:** vitest is installed but **no test files yet** (ROADMAP: add unit tests for
  `lib/journey.ts` + `lib/api.ts` + key pages).
- **Make targets:** `make test` (pytest), `make demo` (E2E), `make build` (tsc + vite).
- Every fix adds/updates a regression test where feasible.

## 34. Future Research Roadmap

**In current scope (contribution-ready):** DQ Engine · AI Confidence Gate · Raw-vs-Processed
comparison · transparent workflow + reasoning timeline · provenance + model registry
reproducibility.

**Future work (explicitly OUT of current scope):**

| Idea | Description |
|---|---|
| Advanced DQ scoring | Learned/adaptive quality weights, per-domain quality norms |
| Adaptive model selection | Meta-learning model family per dataset signature before training |
| Explainable recommendation engine | Post-hoc explanation generation for every recommendation |
| Transfer learning | Cross-building model transfer to cold-start buildings |
| Knowledge-graph integration | Buildings/meters relationships as a KG for reasoning |
| Digital twin | Simulated operational twin for what-if analysis |
| Multi-tenant SaaS | Cloud deployment, tenants, billing |
| Federated/anomaly precision studies | Cross-site anomaly scoring, label propagation |

## 35. Known Limitations

1. **No browser-level (pixel) test automation** — runtime rendering bugs (e.g. the preview-column
   type crash) were only found by user reports; needs browse-based QA passes (see roadmap).
2. **Frontend no automated tests** — vitest configured, zero files.
3. **`WorkflowRun.total_stages` default = 18** in `models.py` but the canonical stage list is 17
   (`TOTAL_STAGES`); a correct-sync task is on the roadmap.
4. **API type drift** — `frontend/src/lib/api.ts` `PreviewPayload.columns` is typed `string[]`
   but the backend returns `{name, data_type}` objects; runtime code tolerates both, type
   contract must be fixed.
5. **SSE is not consumed by the UI** — the frontend advances via polling (`journey.ts`, 6s);
   streaming is implemented and documented but unused, losing live progress fidelity.
6. **Schema columns require a discovery run** — GET `/schema` can be empty before the
   schema_discovery stage; UI must handle this explicitly on `/schema`.
7. **Cache-control headers** (`no-store` on index.html, `immutable` on /assets) active only after
   the *next* backend restart.
8. **Dynamic import warning** — "api.ts is dynamically imported by journey.poll" (harmless, but
   see refactor task).
9. **Docs partially stale** — `docs/PROGRESS.md` still shows all stages ⬜; `docs/BUILD_LOG.md`
   lacks entries for the actual implementation; must be synchronized with this spec.
10. **AI chat is heuristic** — deterministic rule-based, not generative; documented as design
    choice for IEEE honesty.
11. **Vite dev server (:5173) is optional** — production runs purely on :8000; launcher may
    double-spawn on repeated double-clicks (duplicate-guard + port-skip present).
12. **UI verified via API/build only** — several stage pages have not been end-to-end eyeballed
    against live data (anomalies, benchmarks, SHAP, recommendations, reports render paths).

## 36. Pending Tasks

Maintain the ordered execution list in `IMPLEMENTATION_ROADMAP.md`. Priorities: Critical →
High → Medium → Low. Current top-priority backlog (summary):

- Fix `total_stages` 18→17 sync; harden `<schema>` empty state; type-drift cleanup in api.ts.
- Browse-grade runtime QA of all 19 pages against live data (find + fix real rendering bugs).
- Consume SSE stream for live stage progress (replace/augment polling).
- Add vitest unit tests (journey, api, kit, key pages).
- Sync stale docs (PROGRESS.md, BUILD_LOG.md, ARCHITECTURE/API_CONTRACT deltas).
- Research-paper assets: methodology figures (DQ curves, SHAP, Raw-Proc), dataset citation pack.

## 37. Completed Tasks

| # | Item | Verified |
|---|---|---|
| 1 | Backend 17-stage pipeline (all stage runners) | pytest 6/6 green; demo E2E 17/17 PASSED |
| 2 | SQLite schema — 21 tables | models.py |
| 3 | Auth JWT + bcrypt, admin seed | login verified live |
| 4 | Full typed API client + hooks + journey store | frontend build green |
| 5 | 19 frontend pages to real API shapes | tsc + vite build green, served |
| 6 | Launcher (spawn.py consoles, logs, system_check) | `system_check` ALL PASSED |
| 7 | Tests + demo + Makefile + pytest.ini | green |
| 8 | Runtime bug fixes: preview columns crash, stream-table/DQEngine coercion, journey best-run selection, Dashboard empty state, cache headers | served to :8000, verified |
| 9 | Sample datasets + seed (2 datasets, completed runs) | live exec Trust 94/100 |
| 10 | Reports PDF generation | artifacts in `backend/data/reports/` |

## 38. Development Log

Append-only runbook lives in `docs/BUILD_LOG.md`; must be updated after **every** completed task.
This spec's Change Log (below) records spec-level decisions.

## 39. Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-16 | Blueprint baseline (PROJECT_MASTER_BLUEPRINT.md v1.0.0) created; architecture locked (React+FastAPI+SQLite+sklearn/XGBoost/SHAP, DQ primary contribution). | Authoritative baseline. |
| 2026-09-16 | Implementation landed: 21-table schema, 17-stage runners, typed API client, 19 pages, launcher, tests, demo. | Core build complete. |
| 2026-09-17 | **PROJECT_MASTER_SPEC.md v2.0.0 created** and declared single source of truth; GAP_ANALYSIS.md + IMPLEMENTATION_ROADMAP.md produced; directive to polish/validate rather than add features. | Transformation to IEEE/final-year quality. |

---

*End of Project Master Specification.*