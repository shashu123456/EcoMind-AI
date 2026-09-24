# EcoMind-AI — Project Knowledge (source of truth)

> Single file a new developer or agent reads to understand the ENTIRE project.
> Consolidates `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `docs/DESIGN_SYSTEM.md`,
> `docs/BUILD_LOG.md`, `docs/PROGRESS.md`, `frontend/src/lib/journey.ts`,
> `backend/app/workflow/stages.py`, and the measured facts in `docs/research/EVIDENCE.md`.
> **Do not invent numbers.** Anything quantitative — check `docs/research/EVIDENCE.md` first.

---

## **Project at a glance**

EcoMind-AI is an **offline, self-contained energy-intelligence platform**: upload an energy
dataset and it runs a 17-stage "journey" that audits data quality, engineers features, trains
models, proves cleaning's impact, explains predictions, and produces audit-ready reports —
entirely on-device, no external LLM or cloud calls.

Core thesis (three-step logic — the paper's argument):
1. **DQ-first** — data quality is validated/cleaned before anything else (8 rules, 5 dimensions).
2. **Explainable forecasting** — every model decision is justified via SHAP, trust scoring, and
   evidence-backed recommendations.
3. **Trust-gated deployment** — nothing ships without a Confidence Gate verdict
   (`high_trust` / `moderate_trust` / `low_trust`); a trained model is promoted only through a
   registry with `staging -> production`.

Stack and scale (measured 2026-09-23):

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python) | app factory `backend/app/main.py`; 21 DB tables |
| DB | SQLite, WAL | `data/ecomind.db`; `total_stages=17` |
| Frontend | React + Vite + TypeScript + Tailwind | `frontend/`, port 5173 |
| Realtime | SSE | `/stream` proxy -> backend run stream |
| API | REST `/api/v1`, JWT Bearer auth | 55+ routes (~61 with health) |
| Workflow | key-based stage-runner registry | `backend/app/workflow/stages.py`; 17 stages, 6 milestones |

Primary research entity pair: dataset `b61c2b04` (*EcoMind_sample_energy.csv* — 3,600 rows,
12 cols, 30 days, 5 assets, target `energy_kwh`) and workflow run `5c8dd728`. Secondary BDG2
variants `a6e6405c` / `28ae70af` exist but are not used for headline numbers.

## **How to run**

```
# Backend  (from backend/)
.\.venv\Scripts\python backend\run.py     # or: uvicorn app.main:app --port 8000 (from backend/)
# Frontend (from frontend/)
npm run dev                                # port 5173, proxies /api and /stream -> :8000
```

- Ports: backend **8000**, frontend **5173**.
- Default login: `admin@ecomind.ai` / `admin123` (role `admin`).
- DB: `data/ecomind.db` (SQLite WAL) relative to run dir.
- Uploads -> `settings.uploads_dir`; processed frames -> `data/processed/{id}.csv`;
  models -> `data/models/{id}.joblib`; reports -> `settings.reports_dir`.

## **Architecture**

### Backend layout (actual)
```
backend/app/
  main.py          # app factory, CORS, mounts routers
  core/            # config.py, security.py (JWT/bcrypt), storage helpers
  db/              # base.py (engine/session), models.py (all 21 tables)
  routes/          # FastAPI routers — one file per domain (55+ routes):
  │                  auth.py datasets.py schema.py dq.py transformations.py features.py
  │                  models_route.py predictions.py shap.py ai.py anomalies.py benchmarks.py
  │                  recommendations.py comparison.py registry.py reports.py workflow.py health.py
  domain/          # business services, one per domain
  │                  dataset_service dq_service schema_service transform_service feature_service
  │                  model_service prediction_service trust_service shap_service
  │                  anomaly_service benchmark_service recommend_service executive_service
  │                  comparison_service registry_service report_service conversation_service
  │                  data.py (shared I/O helpers) feature_utils.py
  workflow/        # stages.py (canonical 17-stage registry), events.py (SSE emit)
  events/          # SSE event bus
  pipeline/        # upload/import/sample/library helpers
  quality/         # DQ engine
  features/        # feature engineering
  ml/              # prediction/comparison/explain/trust/anomaly/bench/recommend
  reports/         # pdf/html/csv generation
```
> Contracts/writings mention both `routes/` and `api/`; **the real directory is
> `backend/app/routes/`**. `confidence` / `executive` endpoints live in `routes/ai.py`
> (there is no `routes/confidence.py` or `routes/executive.py`).

### Frontend layout (actual)
```
frontend/src/
  main.tsx, App.tsx, router.tsx
  lib/             # api.ts (typed client), journey.ts (workflow + 6-milestone rail +
  │                  journey store), theme.tsx, kit.tsx, pagekit.tsx, cn.ts, interactive/*
  app/             # AppShell, Router, PipelineRail, JourneyMap, TopBar, providers
  stages/          # stage screens
  components/      # RoomStage, JourneyMap, PipelineRail, ExecutionMode, TopBar, viz, flow, ui
  api/             # typed API client + hooks
  state/           # Context providers + custom hooks
  styles/tokens.css
```

### Auth
- `POST /auth/login`, `POST /auth/register`, `GET /health` are public; **everything else
  requires `Authorization: Bearer <token>`**.
- Passwords bcrypt-hashed in `app.core.security` (never returned). JWT via
  `create_access_token({"sub": user.id})`.
- Roles: `admin` / `analyst` / `viewer`. User object = `{id, email, full_name, role}`.

### Response envelope
- **API**: `{ data } | { error: { detail } }`; timestamps ISO-8601; numbers JSON-safe
  (`app.domain.data.js_type`).
- **SSE (workflow stream)**: JSON payloads in `data:`,
  `{type: run_started|stage_started|stage_completed|stage_failed|run_completed|run_failed|heartbeat,
  run_id, stage_number?, stage_key?, stage_name?, output?, decision?, confidence?, error?, ts}`.
  Token via `?token=` or Bearer; frontend reconnects after 4s, falls back to polling.
- Contract-documented SSE names (ARCHITECTURE.md): `stage.enter, stage.progress,
  stage.complete, quality.score, quality.correction, import.row, transformation.log,
  feature.created, model.metrics, prediction.point, anomaly.detected, benchmark.row,
  recommendation.created, report.generated, run.done, run.failed` (the live workflow stream
  uses the `{type: ...}` JSON form above).

## **The 17-stage workflow**

Canonical order: `backend/app/workflow/stages.py` (`STAGES`, `TOTAL_STAGES=17`). Frontend mirror:
`frontend/src/lib/journey.ts` (`WORKFLOW`) — adds `path`, `requires`, `inspect`.

| # | Stage key | Purpose | Backend routers | Frontend page | Path | Requires |
|---|---|---|---|---|---|---|
| 1 | library | Choose dataset | datasets.py | Library.tsx | `/library` | none |
| 2 | import | Stream CSV/XLSX in | datasets.py | Import.tsx | `/import/$datasetId` | dataset |
| 3 | raw_preview | Untouched data display | datasets.py (preview) | RawPreview.tsx | `/preview/$datasetId` | dataset |
| 4 | schema_discovery | Auto-detect types/roles/confidence | schema.py | SchemaDiscovery.tsx | `/schema/$datasetId` | dataset |
| 5 | dq_engine | 8 rules x 5 dims quality audit | dq.py | DQEngine.tsx | `/dq/$datasetId` | dataset · **inspect** |
| 6 | transformation | Raw->Processed live log | transformations.py | Transformations.tsx | `/transformations/$datasetId` | dataset |
| 7 | feature_engineering | Explainable energy features | features.py | FeatureEngineering.tsx | `/features/$datasetId` | dataset |
| 8 | prediction | Train models head-to-head | predictions.py | Prediction.tsx | `/prediction/$datasetId` | dataset · **inspect** |
| 9 | confidence_gate | Trust-score gate | ai.py | ConfidenceGate.tsx | `/confidence/$runId` | run · **inspect** |
| 10 | raw_vs_processed | Prove DQ improves performance | comparison.py | RawProcessedComparison.tsx | `/comparison/$runId` | run |
| 11 | shap | Why did the model decide | shap.py | SHAPExplainability.tsx | `/shap/$modelId` | model |
| 12 | anomaly | Severity-ranked anomaly timeline | anomalies.py | AnomalyDetection.tsx | `/anomalies/$datasetId` | dataset |
| 13 | benchmarking | Model/portfolio comparison | benchmarks.py | Benchmarking.tsx | `/benchmarks/$datasetId` | dataset |
| 14 | recommendation | Evidence-backed actions | recommendations.py | Recommendations.tsx | `/recommendations/$datasetId` | dataset |
| 15 | executive_center | CEO briefing, one view | ai.py | ExecutiveCenter.tsx | `/executive` | none |
| 16 | report | PDF/HTML/CSV deliverables | reports.py | ReportGeneration.tsx | `/reports` | none |
| 17 | history_registry | Reopen/version past runs | registry.py + workflow.py | History.tsx | `/history` | none |

Pages outside the rail: `Dashboard.tsx` (default landing), `Login.tsx`.

**Runner contract**: plain function
`run(run: WorkflowRun, db: Session, params: dict) -> {"output", "confidence", "decision", "trace_extra"?}`,
registered via `@register_stage_runner(key)`; registration fires at import time (routers import
domain services so every runner is visible to the workflow exec endpoint).

### The 6-milestone rail (`journey.ts` `MILESTONES`)
| Milestone | Stages | Short |
|---|---|---|
| **Intake** | library, import, raw_preview | Data In |
| **Understand** | schema_discovery, dq_engine | Schema + Quality |
| **Rebuild** | transformation, feature_engineering | Features |
| **Model** | prediction, confidence_gate | Predict + Trust |
| **Prove** | raw_vs_processed, shap, anomaly | Proof |
| **Decide** | benchmarking, recommendation, executive_center, report, history_registry | Decide |

Rail mechanics (JourneyMap): milestone buttons with status LED + progress dots +
`.connector-pipe` links; click opens inline stage dropdown. `PASSTHROUGH_KEYS` =
`raw_preview, schema_discovery, raw_vs_processed, shap, anomaly` — run in background in auto
mode, "bg" chip; `CHECKPOINT_KEYS` are where the user actually stops. Execution mode
(`auto`/`manual`, persisted `localStorage["ecomind_mode"]`, default `auto`): auto auto-runs DQ +
Prediction via once-ref guards; manual shows gold step-by-step Continue. SSE stage patches via
pure `sseStatusPatch` reducer; `connectSse` reconnects after 4s; `poll()` picks the most-advanced
run per dataset; `reopenRun` restores dataset/run/model + stageStatuses from History.

## **Data model** (all 21 tables, `backend/app/db/models.py`)

| Table | Purpose | Key fields |
|---|---|---|
| users | Auth | email, password_hash, full_name, role |
| datasets | Data inventory | name, source_type, file_path, row/column_count, status, **provenance** (7 fields) |
| schema_columns | Detected schema | name, data_type, semantic_type, statistics, nullable, unique/null_count |
| dq_results | DQ rule rows | rule_name, dimension, score (/100), severity, passed, details |
| transformations | Ops chain | operation, params, before/after_snapshot, rows/cols_affected |
| features | Engineered features | name, feature_type, source_columns, importance_score |
| models | Trained models | algorithm, task_type, metrics, feature_importances, model_path, status, is_active |
| predictions | Forecast points | timestamp, predicted, lower/upper, confidence, actual |
| shap_explanations | Explainability | method, shap_values, global_importance, stability_index |
| anomalies | Detected anomalies | anomaly_type, severity, score, confidence, context |
| benchmarks | Compare runs | leaderboard, winner, methodology |
| recommendations | Action items | category, title, savings, confidence, supporting_evidence |
| reports | Generated docs | report_type, format, file_size_bytes, sections, status |
| workflow_runs | Run lifecycle | status, current_stage, stages_completed[], total_stages=17 |
| stage_traces | Per-stage snapshots | stage_key, status, input/output_snapshot, decision, confidence, duration_ms |
| confidence_gates | Gate records | trust_score, verdict, factors, reasoning |
| raw_processed_comparisons | DQ-impact results | metrics raw/proc, improvement deltas, conclusion |
| model_registry | Promote/deprecate | version, status (staging/production/deprecated), is_current, performance_summary |
| comparison_charts | Chart rows | comparison_type (radar/bar/scatter/line), chart data |
| ai_interactions | Chat / executive log | role, content, meta |
| audit_log | Every mutation | user_id, action, resource_type/id, details |

## **Key technical facts & known gotchas** (measured, `docs/research/EVIDENCE.md`)

1. **DQ `overall_score` semantics are broken — do not quote as percent.** GET `/dq`
   `overall_score = Σ(rule scores)/#dims = 795/5 = 159` (unbounded, not /100). POST `dq/run`
   = `0.25 × Σ(dim means)` -> **max 125** (weights sum to 1.25; docstring claims 0–100 —
   known weighting bug). Use **per-rule /100 scores** (completeness 100, monotonic 96.7,
   IQR outliers 98.4, zscore 99.9) and the **trust-gate dq_score=100** in the paper. Never
   write "overall DQ 159/100".
2. **Ridge r²=1.0 is leak, not skill.** Feature derivation runs **before** the 70/30
   chronological split, creating `lag_1h=yₜ₋₁` and `diff_1h=yₜ−yₜ₋₁` ⇒ `yₜ = diff_1h + lag_1h`
   exactly; `rolling_mean_24h` window is **inclusive** of `yₜ`; `load_factor=yₜ/power_kw`,
   `energy_density=yₜ/occupancy`. Leaderboard (entry `10c3457b`, methodology
   `time_series_split`, `cut = int(n·0.7)`): **gradient_boosting wins legitimately
   (r² 0.9175, rmse 1.3517, mae 0.1120, mape 1.32)**, xgboost 0.9147, random_forest 0.9162,
   ridge 1.0000. Present ridge's 1.0 honestly as a leakage case the platform detects
   (target-derived features must be excluded from splits).
3. **`shap_stability` is mislabeled.** The response field is
   `max(0, Pearson(argsort(mean|SHAP|), arange))×100` — a **column-order alignment index**,
   not explanation stability; non-reproducible (unseeded `X.sample(≤200)`); exactly 0 =
   clamped non-positive corr. The **real** metric is `shap_service._stability` (Spearman
   ranking correlation across two random half-samples), stored as `__stability_index`.
   Should be fixed in the backend to expose the true metric.
4. **Raw-vs-processed yields Δ≈0 on clean data (honest result).** Both runs (`776bf594`,
   `5c8dd728`), xgboost, 17 features both sides: raw r²=0.9153 / processed r²=0.9153,
   all delta_pct=0 (deltas are **absolute** diffs despite the `_pct` name; `shap_divergence`
   = `|stability_raw−stability_proc| + |r²_raw−r²_proc|`, NOT cosine despite the DB
   comment). System conclusion: *"Raw data matched or beat cleaned data here — possible
   over-cleaning or already-high quality input."* QED that DQ-driven cleaning is
   data-dependent.
5. **Comparisons are null until the stage runs.** A run created without executing
   `raw_vs_processed` returns `{comparison: null}`; charts likewise appear only after
   `POST /comparison/{run_id}/raw-processed/run`.
6. **Workflow status is sticky `'running'`.** Runs are created `running` and flip to
   `completed` **only after all 17 stage keys execute** via
   `/workflows/{run}/stages/{key}/exec` or `/advance`. **No background auto-runner.**
   Seed injects one `completed` run whose `stages_completed` holds integers `1..18` —
   inconsistent with the key-based engine (known seed artifact).
7. **Seed dataset facts:** 3,600 rows / 43,200 cells / 12 cols / 298,893 bytes / 5 assets /
   hourly (median 3600 s) / 30-day span; 8 DQ rules pass, 0 fail (6 info / 2 warning).
   Predictions across all 8 models record **identical** r²=0.9153, rmse=1.3692, mae=0.121,
   mape=1.58, exvar=0.9155 (same deterministic split/features). Registry: 16 entries, all
   version=1, `is_current=false`, `status=staging`; gradient_boosting entry `adbdca09` →
   model `84a9df08` r²=0.9175, 2,091 training rows, 17 features, dataset_hash `5a5ce1ca2c`.
8. **Confidence Gate (run `5c8dd728`):** trust_score **94.5 = 0.40·100 + 0.25·100 +
   0.20·91.5 + 0.15·75** -> verdict **high_trust**. Weights locked in `stages.py`
   (`TRUST_WEIGHTS`); verdicts: ≥80 `high_trust`, 60–79 `moderate_trust`, <60 `low_trust`.
   Executive headline: *"Trust 94/100 (high_trust) with DQ 100 and best model xgboost."*
9. **Build/test status (per PROGRESS.md):** pytest **7/7**, vitest **22/22**, `tsc + vite
   build` green. Backend live-verified (latest relaunch PID 8872); workflow list carries
   `trace_count` + `total_stages=17`; pagination caps `limit` 0–5000 (422 beyond),
   `start/offset ≥ 0`; anomaly `detect` response always carries `precision`/`recall`
   (number when labelled ground truth present, else null).

## **Frontend conventions**

- **Design system = Industrial Skeuomorphism** (locked, `docs/DESIGN_SYSTEM.md`). Default
  theme **light**: chassis `#e0e5ec`, panels `#f0f2f5`, recessed `#d1d9e6`, ink `#2d3436`,
  safety-orange accent **`#ff4757`**, shadow pair `#babecc` / `#ffffff`. "Light desk, dark
  screens" — terminals (RoomStage) stay dark CRTs with scanlines. Neumorphic shadows
  `--shadow-card/floating/pressed/recessed/sharp/glow`; radii sm 4 · md 8 · lg 16 · xl 24 ·
  2xl 30 · full. Inter for text; JetBrains Mono for numbers/labels (uppercase, 0.05–0.08em,
  weight 700); spring cubic-bezier motion (150–200ms interactions); `prefers-reduced-motion`
  respected; no inline styles. Signature utilities: `.screws`, `.vent-slot`, `.led*`,
  `.scanlines`, `.blueprint-grid`, `.phys-key`, `.input-well`, `.connector-pipe`,
  `.device-bezel`, `.pushpin`, `.glass-panel`.
- **Pages** (19 under `frontend/src/pages/`): Library, Import, RawPreview, SchemaDiscovery,
  DQEngine, Transformations, FeatureEngineering, Prediction, ConfidenceGate,
  RawProcessedComparison, SHAPExplainability, AnomalyDetection, Benchmarking,
  Recommendations, ExecutiveCenter, ReportGeneration, History, Dashboard, Login.
- **Interactive primitives** (`lib/interactive/`): `RippleTransition` (WebGL ripple),
  `AnnotatedText` (12 hand-drawn marks), `SplitFlapDisplay`, `MatrixRain`, `PixelatedReveal` —
  WebGL ones wrapped in `WebGLErrorBoundary -> WebGLFallback`.
- **API client**: typed client + hooks in `frontend/src/api/` and `lib/api.ts`; `request()`
  handles Bearer token, 401 redirect, `{detail}` error extraction; `streamWorkflow` = SSE
  client with token. Polling every 6s (`startWorkflowPolling`).
- **Theming toggle**: `lib/theme.tsx` — light default vs legacy dark; TopBar sun/moon
  dropdown plus execution-mode toggle.
- **Execution mode**: `auto` (rapid passes, DQ + Prediction auto-run) vs `manual`
  (step-by-step gold Continue); `ExecutionMode.tsx` toggle in TopBar + PipelineRail footer.

## **Testing & QA**

| Command | Where | Status |
|---|---|---|
| `pytest backend/tests` | 7 tests (incl. `total_stages is seventeen`) | 7/7 pass |
| `npm run test` (vitest) | `frontend/src/lib/__tests__/` (colLabel, sseStatusPatch, request, journeyPoll, + suites) | 22/22 pass |
| `npm run build` (tsc + vite) | — | green |
| `python -m compileall` | backend package | clean, imports 61 routes |

Env gotchas:
- **gstack browse is blocked on this Windows box**: the bundled-Bun binary throws
  `Cannot find server.ts. Set BROWSE_SERVER_SCRIPT env`. Use **headless Chrome + CDP**
  for anything visual. HTTP smoke of `/`, `/library`, `/dq/:id`, `/prediction/:id`,
  `/executive` returns 200; unauthenticated `/api/v1/*` returns 403 (expected).
- A backend must be running + seeded (`run.py`) for frontend, workflow, SSE, and any
  live-verification to work.

## **Deliverable mapping**

| Artifact | Location | Notes |
|---|---|---|
| **This doc** | `docs/research/PROJECT_KNOWLEDGE.md` | single source of truth for the whole project |
| Golden numbers | `docs/research/EVIDENCE.md` | live-queried 2026-09-23; never invent past it |
| Methods | `docs/research/methodology.md` | experiment/paper methods |
| Related work | `docs/research/related_work.md` | literature positioning |
| Bib | `docs/research/references.bib` | citations |
| Paper draft | `docs/EcoMind_IEEE_Paper.tex` | **stale** root copy; new research lives in `research/` |
| Legacy specs | root + `docs/` | `PROJECT_MASTER_BLUEPRINT.md`, `PROJECT_MASTER_SPEC.md` (39 sect), `GAP_ANALYSIS.md`, `IMPLEMENTATION_ROADMAP.md`; `docs/ARCHITECTURE.md` (pointer + stale `api/` layout), `docs/API_CONTRACT.md` (route + `api/` naming stale), `docs/PROGRESS.md` (17-stage table now accurate; references non-existent `routes/confidence.py`, `routes/executive.py`), `docs/DESIGN_SYSTEM.md` (locked), `docs/DESIGN_PLAN.md` (superseded), `docs/BUILD_LOG.md` (append-only runbook) |

## **Roadmap / gaps** (honest)

1. **Raw-vs-processed Δ≈0 on clean data** — on the already-clean seed set cleaning provably
   changes nothing; the stage verifies correctness but shows no improvement. Cleaning is
   data-dependent; a deliberately-dirty dataset is needed to demonstrate DQ impact.
2. **`shap_stability` mislabel** — backend exposes the column-order Pearson index as
   "stability"; should return `shap_service._stability`/`__stability_index` (Spearman)
   instead.
3. **DQ aggregate bug** — GET `overall_score` is Σ/#dims (unbounded, 159) and POST variant
   weights sum to 1.25 (max 125); both claim 0–100. Weights/denominator should be corrected
   so `overall_score` is a real 0–100.
4. **No background workflow runner** — runs stay `running` until all 17 stage keys execute;
   there is no scheduler to auto-run the pipeline.
5. **Seed completed-run mismatch** — the seeded `completed` run stores integer
   `stages_completed = 1..18`, inconsistent with the key-based stage engine and other runs.
6. **Doc drift** — `ARCHITECTURE.md`/`API_CONTRACT.md`/`PROGRESS.md` still reference the
   `api/` layout and `routes/confidence.py` / `routes/executive.py`; actual is
   `backend/app/routes/` with confidence+executive in `routes/ai.py`. Contracts also list
   dotted SSE event names vs the live `{type: ...}` stream. These docs are candidates for
   replacement by this file.