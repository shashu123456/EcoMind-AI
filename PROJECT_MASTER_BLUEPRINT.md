# EcoMind AI — Master Blueprint

**Document status:** Authoritative source of truth
**Version:** 1.0.0 (Blueprint baseline)
**Date:** 2026-09-16
**Classification:** Internal technical specification

> Every implementation, architecture decision, feature, research contribution, workflow, UI decision, and future enhancement of EcoMind AI is governed by this document. Any future development must follow this blueprint, and this file must be updated whenever a major feature is completed.

---

## 1. Project Overview

### Project Name
**EcoMind AI — Adaptive Explainable Energy Intelligence Platform**

### Vision
Transform raw organizational energy datasets into trusted, explainable, actionable business decisions through a transparent, end-to-end AI workflow. EcoMind AI is a decision-support platform for any organization that manages energy — universities, hospitals, corporate offices, commercial buildings, manufacturing, hotels, airports, government buildings, shopping malls, data centers, and research institutions.

### Mission
To demonstrate that **trustworthy AI begins with trustworthy data**. Every prediction, recommendation, benchmark, and executive decision produced by the platform must be traceable back through a transparent processing pipeline, allowing users to understand not only *what* the system predicts, but *why* it reached that conclusion.

### Problem Statement
Organizations collect large volumes of energy telemetry (meter readings, building hierarchies, occupancy, temperature) but lack the means to convert that raw data into reliable decisions. Existing tools fall into two camps:

- **Monitoring dashboards** that visualize data but provide no intelligence or decision support.
- **Black-box prediction engines** that produce forecasts without explaining *why* or *how trustworthy* they are.

Neither suffices for an organization that must justify energy investments to leadership or regulators.

### Why This Project Exists
EcoMind AI exists to fill the gap between raw energy data and defensible organizational decisions. It integrates the entire analytical chain — ingestion, schema discovery, data quality, transformation, feature engineering, prediction, trust evaluation, comparison, explainability, anomaly detection, benchmarking, recommendations, and executive reporting — into **one coherent, observable, explainable workflow**.

### Current Status
- **v0.5.1 (deprecated):** A prior multi-service implementation (PostgreSQL, InfluxDB, Redis, MQTT, Docker) existed under `EcoMind-AI-main/ecomind-ai`. It is **not** part of the locked architecture. It is preserved only as a reference for reusable algorithms (simulator, anomaly injection, explanation engine) and is being **rebuilt cleanly** per this blueprint.
- **Current:** This blueprint is the baseline. Implementation proceeds by parallel workstreams against this document.

### Final Expected Outcome
A self-contained, offline, single-machine application (`React` frontend + `FastAPI` backend + `SQLite`) implementing the complete 18-stage explainable workflow below. The product must serve three purposes simultaneously:

1. A **final-year engineering major project** with production-quality code.
2. A credible **IEEE conference paper** story centered on system integration, explainability, and reproducibility.
3. A **professional portfolio SaaS** that feels like enterprise software (Linear, Vercel, Stripe, Datadog, Palantir-quality UI).

---

## 2. Research Objective

EcoMind AI is:

- **NOT** an energy monitoring system.
- **NOT** an IoT/hardware platform.
- **NOT** a standalone prediction engine.
- **NOT** an anomaly detector.
- **NOT** a dashboard.

EcoMind AI **is** an **Adaptive Explainable Energy Intelligence Platform**: a transparent, integrated AI workflow that converts raw energy datasets into trustworthy business decisions. The objective is to help organizations transform raw energy datasets into reliable, explainable, median-reproducible decisions while making the entire analytical process visible and auditable.

The adaptive dimension means the platform adapts its processing to the discovered structure of each dataset (schema discovery driven), selects the best model per dataset, evaluates the trustworthiness of its own outputs (AI Confidence Gate), and adapts its recommendations to each organization's evidence.

The research objective is to answer one question:

> How can an organization convert raw energy data into intelligent, explainable decisions?

Prediction is only one stage. **The workflow is the product.**

---

## 3. Research Contribution

The novelty of EcoMind AI is **not** a new machine learning algorithm. Its contribution is an **integrated, explainable workflow** where multiple intelligent stages operate as one transparent pipeline.

### Core Contributions

| # | Contribution | Detail |
|---|---|---|
| 1 | **Data Quality Engine (primary)** | Every dataset must pass through the Data Quality Engine before any AI analysis. The system demonstrates — quantitatively — how quality improvement affects prediction accuracy and decision reliability. |
| 2 | **Explainable AI (SHAP)** | Every prediction explains itself: global + local feature importance, natural-language reasoning, confidence bounds. |
| 3 | **Transparent AI workflow** | Every stage is observable: pipeline events, transformation log, AI Reasoning Timeline, raw data preserved, provenance stored. Nothing is hidden. |
| 4 | **Raw vs Processed comparison** | The same ML experiment is run on the raw dataset and the quality-processed dataset; improvements in Accuracy, RMSE, MAE, Confidence, and SHAP stability are quantified or visualized. |
| 5 | **AI Confidence Gate** | Predictions are not blindly accepted. A trust score (prediction confidence, data quality, model reliability, SHAP stability) determines whether the result is reliable enough for executive reporting, accepted with caveats, or rejected (request more data). |
| 6 | **Decision support + Executive Intelligence Center** | Business-level synthesis: savings, CO₂ reduction, building rankings, critical anomalies, and executive summary on one screen. |

### Why This Is Suitable for an IEEE Conference Paper
- The contribution is **system integration and reproducibility** — an appropriate, defensible research stance.
- The **Raw vs Processed comparison experiment** and the **AI Confidence Gate** evaluate trustworthiness of AI outputs, not just their generation.
- Full **dataset provenance + model registry** enable reproducible experiments.
- The platform is a **complete decision-support pipeline**, which is a legitimate research artifact.

---

## 4. Complete System Architecture

```
┌───────────────────────────────────────────────────────────┐
│  FRONTEND — React SPA (Vite, :5173)                       │
│  React · TypeScript · Tailwind CSS · Framer Motion        │
│  Recharts · React Flow (workflow visualization only)      │
│  Guided workflow · split-screen processing views          │
└──────────────────────────┬────────────────────────────────┘
                           │  HTTP /api/v1  +  SSE /runs/{id}/stream
┌──────────────────────────▼────────────────────────────────┐
│  BACKEND — FastAPI (:8000)  single process, single node   │
│  api/ routers → domains/ services → pipeline/ · quality/  │
│  features/ · ml/ · reports/                               │
│  Async job execution (BackgroundTasks) + SSE event bus    │
└──────────────────────────┬────────────────────────────────┘
                           │  SQLAlchemy (sync or aiosqlite)
┌──────────────────────────▼────────────────────────────────┐
│  DATABASE — SQLite only (data/ecomind.db, WAL mode)       │
│  Full relational model: provenance, runs, events,          │
│  transformations, model registry, every stage artifact     │
└──────────────────────────┬────────────────────────────────┘
                           │  Pandas/NumPy read/write
┌──────────────────────────▼────────────────────────────────┐
│  AI ENGINE — in-process ML services                       │
│  scikit-learn · XGBoost · SHAP · Pandas · NumPy            │
│  Prediction · comparison · explainability · anomalies ·    │
│  benchmarking · recommendations · trust scoring            │
└──────────────────────────┬────────────────────────────────┘
                           │  artifacts
┌──────────────────────────▼────────────────────────────────┐
│  REPORTING ENGINE — ReportLab · HTML · CSV                │
│  Executive PDF · Technical PDF · HTML · CSV exports        │
│  data/reports/                                            │
└───────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility |
|---|---|
| **Frontend** | Guided interaction: shows the system thinking and processing in real time. Owns the 18-stage workflow UI, split-screen visualizations, animations, and the Executive Intelligence Center. Never hides state. |
| **Backend** | API + orchestration. Accepts uploads, validates inputs, drives the workflow engine, persists every artifact, streams progress events over SSE. |
| **Database** | Single source of truth for all persisted artifacts (SQLite). Every stage result is queryable and reproducible. |
| **AI Engine** | Pure computation: schema inference, quality scoring, transformation, feature engineering, model training/evaluation, SHAP, anomaly detection, benchmarking, recommendation synthesis, trust scoring. |
| **Reporting Engine** | Materializes the run into professional PDF/HTML/CSV deliverables including methodology, limitations, provenance, and appendix. |

---

## 5. Technology Stack

### Frontend
| Tool | Use |
|---|---|
| React 18 + TypeScript | Application framework |
| Vite | Dev server / build |
| Tailwind CSS | Styling (utility-first + design tokens) |
| Framer Motion | All motion/animation |
| Recharts | Charts (area, line, bar, radar, gauge, heatmap, treemap, scatter, timeline, forecast, donut) |
| React Flow | Workflow visualization only |

### Backend
| Tool | Use |
|---|---|
| FastAPI | HTTP API + SSE |
| SQLAlchemy | ORM (SQLite) |
| Pydantic | Validation / schemas |

### Database
| Tool | Use |
|---|---|
| SQLite | Only database. Single file. WAL mode. No external services. |

### AI / ML
| Tool | Use |
|---|---|
| Pandas / NumPy | Dataframes and numerics |
| scikit-learn | Linear Regression, Random Forest, Gradient Boosting, Isolation Forest, LOF, One-Class SVM, metrics, splits |
| XGBoost | Gradient-boosted trees (XGBRegressor) |
| SHAP | Global + local explainability |

### Reports
| Tool | Use |
|---|---|
| ReportLab | PDF generation (platypus framework) |
| HTML (Jinja2) | HTML report |
| CSV | Tabular exports per stage |

### Intentionally NOT Used
Explicitly excluded (portability, reproducibility, offline requirement, simplicity):

- Docker
- PostgreSQL / MySQL / MongoDB / Firebase / Supabase / InfluxDB
- Redis or any cache/broker
- Kafka / MQTT / any messaging
- TensorFlow / PyTorch
- SAS / MATLAB / any proprietary engine
- Hardware integration (ESP32, Raspberry Pi)
- Any cloud-specific dependency
- Background distributed services / Celery / workers

Rationale: the entire system must run on a single Windows machine with minimal setup and be fully reproducible offline.

---

## 6. Repository Structure

```
EcoMind-AI-main/
├── PROJECT_MASTER_BLUEPRINT.md   ← this file (source of truth)
├── README.md                     ← quick start + overview
├── Makefile                      ← backend / frontend / demo / test targets
├── backend/
│   ├── requirements.txt
│   ├── run.py                    ← uvicorn entrypoint
│   ├── seed.py                   ← create tables + seed admin
│   └── app/
│       ├── main.py               ← FastAPI app factory + router mounting
│       ├── core/                 ← config, db session, storage, security(JWT)
│       ├── db/
│       │   ├── base.py           ← SQLAlchemy Base/engine/session
│       │   └── models.py         ← ALL tables (single source)
│       ├── api/                  ← routers: auth, datasets, runs, stream,
│       │                            schema, quality, transformations, features,
│       │                            predictions, models, explain, trust,
│       │                            anomalies, benchmarks, recommendations,
│       │                            decisions, reports, history
│       ├── domains/              ← workflow.py (orchestrator), history.py
│       ├── pipeline/             ← upload, import(ETL), sample generator, library
│       ├── schemas/              ← discovery, quality, features, predictions,
│       │                            anom, bench, recs, decisions
│       ├── quality/              ← Data Quality Engine + transformation rules
│       ├── features/             ← feature engineering service
│       ├── ml/                   ← models, evaluation, comparison, explain,
│       │                            trust, anomalies, benchmark, recommend
│       ├── reports/              ← pdf.py, html.py, csv.py, templates/
│       └── events/               ← SSE event bus + pipeline event logger
├── frontend/
│   ├── package.json
│   ├── vite.config.ts            ← proxy /api + /stream → :8000
│   ├── tailwind.config.js        ← design tokens
│   ├── index.html
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── app/                  ← AppShell, Router, PipelineRail, providers
│       ├── stages/               ← 18 stage screens
│       ├── components/
│       │   ├── ui/               ← primitives (Button, GlassCard, Table, ...)
│       │   ├── viz/              ← Recharts wrappers + SHAP views
│       │   └── flow/             ← PipelineRail, StageNode, FlowLine, LiveLog
│       ├── api/                  ← typed client + SSE hooks
│       ├── styles/               ← tokens.css + globals
│       └── state/                ← React Context providers + custom hooks
├── data/                         ← ecomind.db, uploads/, processed/, sample/, reports/
├── docs/                         ← BUILD_LOG, PROGRESS, DESIGN_SYSTEM, ARCHITECTURE
├── scripts/                      ← seed-sample.py, make-demo.py
└── .gitignore
```

**Folder responsibilities:**
- `backend/` — entire server: API, orchestration, AI services, persistence, reporting.
- `frontend/` — entire client: design system, guided workflow UI, animations.
- `data/` — all runtime data (DB + file artifacts). Never committed.
- `docs/` — living operational documentation.
- `scripts/` — reproducibility scripts (seed sample, full demo).

---

## 7. Complete Workflow

The application guides the user through this exact sequence. It **auto-advances** to the next stage when the current stage completes; the user only pauses where inspection or interpretation is valuable (Data Quality corrections, Prediction results, Confidence Gate verdict).

```
Dataset Library
      ↓
Import Dataset
      ↓
Raw Dataset Preview
      ↓
Schema Discovery
      ↓
Data Quality Engine
      ↓
Transformation Viewer
      ↓
Feature Engineering
      ↓
Prediction Engine
      ↓
AI Confidence Gate
      ↓
Raw vs Processed Comparison
      ↓
SHAP Explainability
      ↓
Anomaly Detection
      ↓
Benchmarking
      ↓
Recommendation Engine
      ↓
Executive Intelligence Center
      ↓
Report Generation
      ↓
History & Model Registry
```

### Stage Details

**1. Dataset Library** — Choose a bundled research dataset (BDG2-inspired sample) with full provenance metadata, or proceed to upload. Library cards show source, citation, license, buildings, time range, variables, download/import date, version.

**2. Import Dataset** — Upload an Excel (.xlsx) or CSV file (drag & drop). The original file is stored unchanged. Animated ETL: rows stream into the engine; live storage stats (rows, buildings, floors, meters, timestamps) update in real time. Import is idempotent.

**3. Raw Dataset Preview** — Read-only view of the raw dataset exactly as received: rows, columns, data types, first-N preview, file statistics, missing-value summary. Provenance block displayed.

**4. Schema Discovery** — Automatic inference: timestamp column, building/meter identifiers, energy consumption, temperature, occupancy, metadata columns. Each inference includes a confidence percentage. Detected columns are shown *before* processing begins.

**5. Data Quality Engine** *(primary research contribution)* — Split-screen: raw dataset (left) → animated processing rules (center) → processed dataset (right). Highlights missing values, duplicates, invalid timestamps, outliers, inconsistent values. Live quality score climbs (42% → 58% → 74% → 89% → 96%). Continuous transformation log with human-readable reasons for every change. See §8.

**6. Transformation Viewer** — Full traceability: original dataset → every transformation step (with before/after and reason) → final processed dataset. Nothing is hidden.

**7. Feature Engineering** — Visualization of generated analytical features: Hour, Day-of-Week, Weekend, Month, Season, Business Hour, Lag features, Rolling Mean, Rolling Std, Normalized Consumption. Each feature appears with an explanation.

**8. Prediction Engine** — Trains multiple models on the processed dataset: Baseline (Linear), Random Forest, Gradient Boosting, XGBoost. Reports MAE, RMSE, MAPE, R², training time, inference time. Auto-selects the best model and registers it in the Model Registry.

**9. AI Confidence Gate** — Prediction results are not blindly accepted. Computes a Final Trust Score from Prediction Confidence, Data Quality Score, Model Reliability, and SHAP Stability. Verdict: *Reliable for executive reporting* / *Reliable with caveats* / *Request more data*.

**10. Raw vs Processed Comparison** — Split-screen experiment: the same prediction task on the raw dataset (left) vs the processed dataset (right), comparing Accuracy, RMSE, MAE, Confidence, and SHAP explanation. Bottom panel visualizes improvements (accuracy gain, error reduction, confidence gain). Strongest IEEE figure.

**11. SHAP Explainability** — Global feature importance (summary bars) + local force plots + natural-language reasoning ("Prediction increased because occupancy increased while outdoor temperature remained high").

**12. Anomaly Detection** — Multiple methods: Statistical Threshold, Isolation Forest, Local Outlier Factor, One-Class SVM. Each anomaly shows timestamp, building, severity, confidence, evidence, explanation, suggested action. Timeline visualization with per-anomaly drill down.

**13. Benchmarking** — Buildings/departments compared: energy intensity, efficiency score, percentile ranking, utilization, trend. Identifies best and lowest performers.

**14. Recommendation Engine** — Evidence-based recommendations only. Each contains: problem, evidence (references actual analytics), business impact, estimated savings (kWh + cost), estimated CO₂ reduction, priority, confidence, implementation difficulty, supporting metrics, recommended action.

**15. Executive Intelligence Center** — Final business-level screen: Overall Data Quality, Overall Trust Score, Predicted Consumption, Critical Anomalies, Building Ranking, Cost Saving Potential, CO₂ Reduction, AI Recommendations, Executive Summary. Answers "what should management do next?".

**16. Report Generation** — Generate PDF (executive/technical), HTML, and CSV exports. See §15.

**17. History & Model Registry** — All past runs with artifacts to reopen; full model registry (algorithm, features, hyperparameters, metrics, dataset version, training time, model version).

---

## 8. Data Quality Engine (Primary Research Contribution)

The Data Quality Engine is the **mandatory gate** before any AI analysis. No dataset reaches prediction, anomaly detection, or recommendations without passing through it.

### Processing Rules (executed visibly, in order)

| Rule | What it does |
|---|---|
| Duplicate removal | Identifies exact and near-duplicate rows by business key (meter, timestamp) and removes them. |
| Timestamp validation | Fixes malformed formats, out-of-order entries, duplicates, and timezone inconsistencies to a single naive UTC schema. |
| Missing value handling | Imputes missing values contextually: forward-fill for telemetry, median/mean by role for measurements, explicit flags preserved. |
| Invalid value correction | Rejects or repairs out-of-range values (negative energy, absurd voltage) using domain bounds. |
| Unit normalization | Normalizes inconsistent units (e.g., kWh vs MWh columns) into canonical units. |
| Consistency checks | Verifies hierarchy references (building/floor/meter exist), primary-key uniqueness, and cross-field coherence (energy ≈ power × interval). |
| Feature readiness | Outputs an analysis-ready canonical dataframe. |

### Data Quality Score Calculation
Composite 0–100 score computed on the dataset:

```
DQ Score = 0.25·Completeness + 0.25·Validity + 0.20·Consistency + 0.15·Uniqueness + 0.15·Timeliness
```

- **Completeness** — weighted non-null ratio by column role.
- **Validity** — fraction of values passing domain type/range constraints.
- **Consistency** — fraction passing hierarchy + cross-field coherence checks.
- **Uniqueness** — 1 − duplicate-row ratio on the business key.
- **Timeliness** — timestamp format/order/gap validity.

The score is recomputed after each rule so it climbs deterministically during the visual processing (e.g., 42 → 58 → 74 → 89 → 96).

### Transformation Logging
Every correction produces an immutable log entry `{stage, step, column, row_index, before, after, reason, duration_ms}` persisted to the `transformations` table. This log feeds the Transformation Viewer, the AI Reasoning Timeline, reports, and the audit appendix. **Every transformation is explained so users understand exactly why each modification occurred.**

### Why This Is the Main Contribution
Quality is the least-glamorous but most decisive factor in ML outcomes. By making it a visible, measurable, explainable first-class stage — and proving its impact via the Raw vs Processed comparison — EcoMind AI demonstrates the thesis that **trustworthy AI begins with trustworthy data**.

---

## 9. AI Workflow

```
Prediction → Confidence Evaluation → Comparison → Explainability → Recommendation → Decision Support
```

| Module | Purpose | Key behavior |
|---|---|---|
| **Prediction** | Multi-model training + evaluation | Temporal train/test split (80/20 by time), 4 models, auto best-model selection by RMSE. |
| **Confidence Evaluation** | AI Confidence Gate | Trust Score = 0.40·PredConfidence + 0.25·DataQuality + 0.20·ModelReliability + 0.15·SHAPStability. Verdict thresholds: ≥80 reliable, 60–79 caveats, <60 request-more-data (halts auto-advance). |
| **Comparison** | Raw vs processed experiment | Identical split + recipe on both versions; quantifies improvement. |
| **Explainability** | SHAP | Global summary + local force + natural-language reasoning. |
| **Recommendation** | Evidence synthesis | Rules reference anomaly/benchmark/prediction evidence; never generic. |
| **Decision Support** | Executive Intelligence Center | Business-level aggregation + readiness. |

---

## 10. Dataset Strategy

### Supported Input
- **Excel (.xlsx)** and **CSV** only. No other formats.
- The uploaded original file **must remain unchanged** — stored byte-for-byte in `data/uploads/`.

### Dataset Library
- **Bundled research sample** (BDG2-*inspired*): deterministic, offline, generated by the internal simulator with embedded ground-truth anomalies. 3 buildings (office campus, hospital, retail), ~12 assets, 14 days @ 15-min resolution (~16k rows). Full metadata card.
- **BDG2 (Building Data Genome Project 2)** — documented as the official external benchmark dataset with metadata (source, citation, license, download date, time ranges, building counts, variables). Users can import real BDG2 files via upload; the platform never auto-downloads large datasets.

### Provenance & Versioning
Every dataset stores and displays: **source, citation, license, download date, import date, original filename, version** (increments on re-import), time range, schema. Provenance appears on preview, library cards, and the report appendix — strengthening research reproducibility.

---

## 11. UI/UX Design System

See also `docs/DESIGN_SYSTEM.md` (full token reference). Summarized here as the locked contract.

### Philosophy
- A premium enterprise **AI operating system** — not a dashboard. Users watch an intelligent system operate.
- Every visualization explains what the AI is doing. No decorative cards, no meaningless KPIs.
- **Mission control** aesthetic: alive, precise, trustworthy, scientific.

### Color Palette (dark professional)
| Token | Value |
|---|---|
| Background base | `#0B1020` |
| Secondary surface | `#111827` |
| Card surface | `#171F33` |
| Elevated panel | `#1E293B` |
| Borders | 1px subtle only |
| Accents (intelligence only) | Electric Blue, Deep Cyan, Emerald, Purple |
| Never | rainbow palettes, heavy gradients, heavy outlines |

### Typography
- Headings: **Space Grotesk** · Body: **Inter** · Numbers/mono: **JetBrains Mono**
- Scale: Hero 64 · Section 42 · Page Title 34 · Card Title 20 · Body 15 · Caption 13 · Weights 400–700

### Spacing / Geometry
- 8px grid; card padding 24–32; section spacing 80; component gaps 24.
- Radius: cards 20 · buttons/inputs 14 · panels 24.
- Shadows: soft, large blur, subtle.

### Motion System (Framer Motion everywhere)
- Page transitions: fade + slide + blur, 500ms.
- Cards: fade-up on enter, hover lift, glow border.
- Buttons: scale 1.02, ripple.
- Charts animate values; counters count up; progress animated.
- Pipeline: flowing light, AI-thinking pulse, skeleton loaders (never spinners).
- **`prefers-reduced-motion` must be respected.**

### Signature Views
- **Split-screen processing** (Data Quality, Raw vs Processed comparison).
- **Animated pipeline rail** (traveling light between 18 stages).
- **Mission Control dashboard** (story panels, no KPI grid).
- **Executive Intelligence Center** (one-screen executive answer).
- Tables: sticky headers, sort/filter/search/pagination, animated row loading, CSV export.
- Loading = skeleton shimmer + processing logs; Empty states = illustrated with CTA.

### Design Principles Every Screen Must Follow
1. Premium enterprise quality; zero student-project look.
2. Intentional motion that communicates computation, never decoration.
3. Transparency: show what the system is doing at every point.
4. Accessibility: keyboard navigation, high contrast, focus indicators, screen-reader labels.
5. Responsive from mobile to 4K, no layout breaks.
6. Reusable atomic components; design tokens; no inline styles; no duplicate CSS.

---

## 12. Database Design (SQLite)

| Table | Purpose | Key columns |
|---|---|---|
| `organizations` | Organization scope | id, name, sector |
| `users` | Auth/identity | id, org_id, name, email, password_hash, role |
| `datasets` | Provenance + file metadata | id, org_id, name, source_type, original_filename, file_path, format, rows, columns, buildings, floors, rooms, assets, time_start, time_end, schema_json, metadata_json, license, citation, download_date, import_date, version, import_status |
| `readings` | Canonical telemetry (processed) | id, dataset_id, building_id, floor_id, room_id, meter_id, timestamp, energy_kwh, power_kw, voltage, current, power_factor, occupancy, temperature, equipment_status |
| `raw_points` | Raw parsed rows (before quality) | same shape as readings, version=raw |
| `schema_profiles` | Schema discovery output | dataset_id, column, inferred_type, unit, role, confidence, missing_pct, unique_pct, sample_json |
| `runs` | Workflow run lifecycle | id, dataset_id, status, current_stage, progress, raw_score, processed_score, best_model, trust_score, verdict, created_at, completed_at |
| `stage_trace` | AI Reasoning Timeline | run_id, stage, seq, input_json, output_json, duration_ms, ai_decision, confidence |
| `pipeline_events` | Streaming log | run_id, stage, seq, message, level, ts |
| `transformations` | Immutable change log | run_id, seq, step, category, column, row_index, before, after, reason, duration_ms |
| `features` | Generated features | run_id, name, category, description |
| `model_evals` | Per-model metrics | run_id, dataset_version, model, mae, rmse, mape, r2, train_time, infer_time |
| `model_registry` | Every trained model | run_id, model_version, algorithm, dataset_version, features_json, hyperparameters_json, metrics_json, training_time, created_at, best |
| `predictions` | Forecast points | run_id, dataset_version, model, timestamp, actual, predicted, lower, upper, confidence |
| `shap_summary` | Global SHAP | run_id, dataset_version, feature, global_importance, direction |
| `comparisons` | Raw vs processed | run_id, metric, raw_value, processed_value, improvement_pct |
| `trust_checks` | Confidence Gate | run_id, prediction_confidence, data_quality, model_reliability, shap_stability, trust_score, verdict |
| `anomalies` | Detected anomalies | run_id, timestamp, building_id, meter_id, detector, severity, confidence, evidence, reason, action, status |
| `benchmarks` | Building rankings | run_id, building_id, efficiency_score, energy_intensity, utilization, percentile, rank, trend |
| `recommendations` | Evidence-based advice | run_id, problem, evidence_json, impact, savings_kwh, savings_cost, co2_kg, priority, confidence, difficulty, action, metrics_json |
| `reports` | Generated artifacts | run_id, format, path, created_at |

**Relationships:** `organizations 1—N users, 1—N datasets` · `datasets 1—N readings/raw_points/schema_profiles` · `datasets 1—N runs` · `runs 1—N {stage_trace, pipeline_events, transformations, features, model_evals, model_registry, predictions, shap_summary, comparisons, trust_checks, anomalies, benchmarks, recommendations, reports}`.

---

## 13. API Design (`/api/v1`)

| Method | Endpoint | Purpose | Input | Output |
|---|---|---|---|---|
| POST | `/auth/login` | Authenticate | {email, password} | {token} |
| GET | `/auth/me` | Current user | — | user object |
| GET | `/datasets` | Library + uploads | — | list w/ provenance |
| POST | `/datasets/upload` | Upload xlsx/csv | multipart file | dataset meta |
| GET | `/datasets/{id}` | Metadata | — | provenance JSON |
| GET | `/datasets/{id}/preview` | Raw preview | limit | rows, columns, stats, missing summary |
| DELETE | `/datasets/{id}` | Remove | — | status |
| POST | `/runs` | Start workflow | {dataset_id} | run_id |
| GET | `/runs/{id}` | Run status | — | status/stage/progress |
| GET | `/runs/{id}/stream` | SSE events | — | event stream |
| POST | `/runs/{id}/pause` | Pause at inspection | — | status |
| POST | `/runs/{id}/advance` | Resume/next stage | — | status |
| GET | `/runs/{id}/schema` | Schema discovery | — | profiles |
| GET | `/runs/{id}/quality` | DQ result + score | — | score, metrics |
| GET | `/runs/{id}/transformations` | Change log | — | list |
| GET | `/runs/{id}/features` | Features | — | list |
| GET | `/runs/{id}/predictions` | Forecast | version | points + metrics |
| GET | `/runs/{id}/models/leaderboard` | Model comparison | — | evals |
| GET | `/runs/{id}/models/registry` | Model registry | — | registry rows |
| GET | `/runs/{id}/trust` | Confidence gate | — | trust_checks |
| GET | `/runs/{id}/comparison` | Raw vs processed | — | comparisons + metrics |
| GET | `/runs/{id}/explain` | SHAP global/local | ts? | summary/force/nl |
| GET | `/runs/{id}/anomalies` | Anomalies | — | list |
| PATCH | `/runs/{id}/anomalies/{a}` | Acknowledge/resolve | — | updated |
| GET | `/runs/{id}/benchmarks` | Rankings | — | list |
| GET | `/runs/{id}/recommendations` | Recommendations | — | list |
| GET | `/runs/{id}/decisions` | Executive Intelligence | — | aggregated |
| GET | `/runs/{id}/reasoning` | AI Reasoning Timeline | — | stage_trace |
| GET | `/runs/{id}/report` | Generate report | format | artifact |
| GET | `/history` | Past runs | — | list |
| GET | `/history/{run_id}` | Run detail/artifacts | — | run + artifacts |

**Validation:** Pydantic models enforce types everywhere; upload endpoint validates extension (xlsx/csv) and file size; every GET supports errors as structured JSON `{detail}`.

---

## 14. AI Models

### Models
| Model | Role |
|---|---|
| Baseline (Linear Regression) | Simple reference |
| Random Forest | Non-linear ensemble baseline |
| Gradient Boosting | SGBoost-style boosting |
| XGBoost | Primary strong boosted model |

### Evaluation Metrics
- **MAE**, **RMSE**, **MAPE**, **R²**
- **Training time**, **Inference time**
- **Confidence** from cross-validation residual statistics → prediction intervals.
- **SHAP** for feature influence (global + local).

### Selection
Temporal split (80/20, no leakage). Leaderboard ranks models by RMSE; best model auto-selected, saved, and registered in `model_registry`.

---

## 15. Reports

Formats: **PDF (executive + technical)**, **HTML**, **CSV**.

### Contents
1. Cover page (title, org, date)
2. Dataset information + provenance
3. Data quality results (score, dimension breakdown, transformation summary)
4. Prediction results (leaderboard, best model, forecast plot, confidence)
5. AI confidence gate / trust score
6. Raw vs processed comparison
7. Anomaly summary
8. Benchmark results
9. Recommendations
10. Business impact (savings, CO₂)
11. Methodology
12. Limitations
13. Appendix (AI reasoning timeline, transformation log, SHAP summaries)

PDF via ReportLab platypus; HTML narrative via Jinja2; CSV exports per stage.

---

## 16. Completed Features

| # | Feature | Description | Status | Date | Commit |
|---|---|---|---|---|---|
| 1 | Master Blueprint | This document — locked architecture | ✅ Done | 2026-09-16 | — (uncommitted) |
| 2 | — includes legacy reference (v0.5.1) | Deprecated repo preserved as algorithm reference | ✅ Done | 2026-09-16 | — |
| 3 | Full 18-stage implementation | See §7 | ⬜ Pending | — | — |

*This checklist is updated as implementation lands. Each feature records description, status, date, and commit reference.*

---

## 17. Pending Features (Prioritized Roadmap)

### Critical
- [ ] Backend foundation: FastAPI app, SQLite models, auth, storage
- [ ] Datasets: upload (xlsx/csv), library registry, sample generator (BDG2-inspired)
- [ ] Raw preview + schema discovery
- [ ] Data Quality Engine + score + transformation log
- [ ] Transformation Viewer + Feature Engineering
- [ ] Prediction Engine + Model Registry + AI Confidence Gate
- [ ] Raw vs Processed comparison
- [ ] SHAP Explainability
- [ ] Anomaly Detection (statistical, IF, LOF, OCSVM)
- [ ] Benchmarking + Recommendation Engine
- [ ] Executive Intelligence Center
- [ ] Reports (PDF/HTML/CSV) + History
- [ ] Frontend design system (tokens, primitives, motion)
- [ ] Frontend 18-stage workflow screens with animations
- [ ] SSE streaming + auto-advance orchestration
- [ ] Test suite (pytest + vitest) + `make demo`

### Important
- [ ] Anomaly detection precision/recall scoring against ground truth
- [ ] History page polish (reopen artifacts)
- [ ] Model registry detail view (hyperparameters, dataset version diff)
- [ ] Unit dropdown/currency config in settings

### Future Enhancements
- [ ] Multi-building organization management at scale
- [ ] Role-based access control refinement
- [ ] Report scheduling
- [ ] More bundled research datasets
- [ ] i18n

---

## 18. Future Research (IEEE-viable)

### Belongs to the Current Project
- Data Quality Engine as primary contribution
- AI Confidence Gate / trustworthiness evaluation
- Raw vs Processed prediction comparison
- Integrated transparent workflow + reasoning timeline
- Full reproducibility via provenance + model registry

### Planned for Future Work (explicitly out of current scope)
| Idea | Description | Status |
|---|---|---|
| Advanced Data Quality Scoring | Adaptive/learned quality weights, per-domain quality norms | Future |
| Adaptive Model Selection | Meta-learning to choose model family per dataset signature before training | Future |
| Explainable Recommendation Engine | Post-hoc explanation generation for every recommendation | Future |
| Transfer Learning | Cross-building model transfer to cold-start buildings | Future |
| Knowledge Graph Integration | Buildings, meters, and relationships as a KG for reasoning | Future |
| Digital Twin | Simulated operational twin for what-if analysis | Future |
| Multi-tenant SaaS | Cloud deployment, tenants, billing | Future |

---

## 19. Presentation Flow

| Screen | What to explain | Why it matters |
|---|---|---|
| 1. Landing | Product identity: Explainable Energy Intelligence, decision support | Sets the "not a dashboard" frame |
| 2. Dataset Library | Provenance: source, citation, license, BDG2 alignment | Research reproducibility |
| 3. Upload / Import | Original file preserved; animated ETL into SQLite | Transparent ingestion |
| 4. Raw Preview + Schema | Automatic schema detection with confidence | Trustworthy inference |
| 5. **Data Quality Engine** | Split screen; rules animate; score 42→96; every correction explained | **Primary contribution** |
| 6. Transformation Viewer | Full traceability of every operation | "Nothing is hidden" |
| 7. Feature Engineering | Features appear with rationale | Feature story |
| 8. Prediction | 4 models, leaderboard, auto best-model | Rigorous evaluation |
| 9. **AI Confidence Gate** | Trust score components + verdict | Trustworthy AI outputs |
| 10. **Raw vs Processed** | Quantified improvement (accuracy/error/confidence/SHAP) | **Key IEEE figure** |
| 11. SHAP Explainability | Global + local + natural language | Transparency |
| 12. Anomaly Detection | Timeline, severity, confidence, evidence | Detection story |
| 13. Benchmarking | Rankings, percentiles, efficiency | Comparative insight |
| 14. Recommendations | Evidence-linked, savings + CO₂ | Actionability |
| 15. **Executive Intelligence Center** | One-screen answer for management | Decision support |
| 16. Reports | PDF/HTML/CSV incl. methodology + limitations + appendix | Professional closure |
| 17. History & Model Registry | Reopenable runs, registered models, dataset versions | Reproducibility |

---

## 20. Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-16 | Blueprint baseline created (v1.0.0). Locked architecture: React+FastAPI+SQLite+sklearn/XGBoost/SHAP, 18-stage workflow, Data Quality Engine primary contribution, AI Confidence Gate, Executive Intelligence Center, provenance + model registry. | Authoritative source of truth for the clean rebuild. |
| 2026-09-16 | Deprecated prior v0.5.1 multi-service architecture; preserved as reference only. | Architecture did not meet locked vision (distributed infra, numpy-only forecasting). |