# EcoMind-AI Frontend — User Guide & Algorithm Reference

> Research-package deliverable complementing the IEEE paper. Companion docs:
> `EVIDENCE.md` (live numbers), `API_CONTRACT.md` (wire contract), `DESIGN_SYSTEM.md`
> (visual tokens), `PROGRESS.md` (shipping checklist).
>
> Source of truth for this document: `frontend/src/` page components, `router.tsx`,
> `lib/journey.ts`, `lib/api.ts`, `components/` shell + `docs/{API_CONTRACT,DESIGN_SYSTEM,EVIDENCE,PROGRESS}.md`.
> All API paths below match the actual frontend call sites (all behind base `/api/v1`).

---

## 1. Shell & navigation

The frontend is a single-page React app (`@tanstack/react-router`, Vite) wrapped by
`App.tsx` → `AppShell.tsx`. The shell is a three-layer stack:

```
┌ TopBar (h-12) — stage title, ds/run/model chips, theme toggle, settings, sign out
├ JourneyMap (h-16) — brand, 6-milestone rail, PDF link, mode badge, stage counter
└ <main> — lazy-loaded stage page behind <PageSkeleton> Suspense fallback
```

### TopBar
- **Stage title** derived from the current URL (`stageForPath` maps path base → `WORKFLOW` label; fallback "Mission Control").
- **Context chips** `ds.<8>/run.<8>/model.<8>` from the journey store (cut to 8 hex chars).
- **Theme toggle** — sun/moon icon; flips `data-theme` via `useTheme` (`lib/theme.tsx`), persisted in `localStorage['ecomind_theme']`, **default is `light`** (DESIGN_SYSTEM "light desk, dark screens"). Note tucked under the settings: *"Terminals always stay dark for signal clarity."*
- **Settings dropdown** — Appearance (Light/Dark mode), Execution mode (Automated / Step-by-step via `ExecutionModeToggle compact`), plus a tip that data tables expose CSV export.
- **User + Sign out** — avatar of `ecomind_user` email; sign-out clears `ecomind_token`/`ecomind_user` and navigates to `/login`.

### 6-milestone rail (JourneyMap) — `components/JourneyMap.tsx`
Six milestone buttons, each with a **status LED** (`led-online/alarm/idle`), a **`done/total` counter**, coloured **per-stage pips**, and a `.connector-pipe` link between milestones. Clicking one opens an inline dropdown of its stages; each stage is a `<Link>` that is **locked (opacity-35, unclickable)** while its `requires` context (`dataset`/`run`/`model`) is missing. Pass-through visual-only stages (`raw_preview, schema_discovery, raw_vs_processed, shap, anomaly` — `PASSTHROUGH_KEYS`) carry a tiny **`bg` badge**. A **global animated progress track** runs along the rail bottom, width = `doneCount/17`.

Milestone grouping (`MILESTONES`, `lib/journey.ts`):
| Milestone | Stages |
|---|---|
| Intake · Data In | library, import, raw_preview |
| Understand · Schema + Quality | schema_discovery, dq_engine |
| Rebuild · Features | transformation, feature_engineering |
| Model · Predict + Trust | prediction, confidence_gate |
| Prove · Proof | raw_vs_processed, shap, anomaly |
| Decide · Decide | benchmarking, recommendation, executive_center, report, history_registry |

Right cluster: **mode badge** ("automated run" / "step-by-step"), inline mode toggle, a **PDF quick-link** to `/reports` ("Generate & download a PDF audit report"), and a live **`doneCount/17`** counter with pulsing radio LED.

### JourneyMap header — progress chips & stage stepper
The rail *is* the stepper: chips (`done/total`), 17 stage badges, active-route highlighting (`isActiveRoute` compares path prefix), and check icons on completed stages. `PipelineRail.tsx` ships the same stepper as a left-hand rail variant (with per-stage connector lines, ping animation on the active node, and a bottom "current context" card showing dataset/run/model ids + a pulsing journey bar). Only JourneyMap is mounted by AppShell; PipelineRail is not wired into the shell.

### Auto vs manual execution mode — `lib/journey.ts` + `components/ExecutionMode.tsx`
- `mode ∈ {auto, manual}`, persisted under `localStorage['ecomind_mode']` (**default auto**).
- **Auto mode** runs the pipeline hands-off: stages that `useEffect` auto-fire (`PQEngine.runQuality`, `Prediction.trainAll`, DQ/raw comparison auto-reveal), and `AutoNext` auto-advances 4–8s after a stage completes. Pass-through stages are visual-only.
- **Manual mode**: stage auto-fire is suppressed (`if (mode === 'auto')` guards), and JourneyMap stepper turns gold with a "step-by-step" badge so the user confirms each stage.
- Progress is **live**: `startWorkflowPolling` (6 s interval) polls `GET /workflows` and consumes **SSE** `GET /workflows/{run}/stream?token=` (via `streamWorkflow`) mapping `stage_started/completed/failed/run_completed` onto statuses (`sseStatusPatch`).

---

## 2. Route table — `router.tsx`

All routes verify against real files in `frontend/src/pages/`. Lazy-loaded via `React.lazy` under the `__app` layout.

| Route | Page component | Stage (journey key) | Key API calls (base `/api/v1`) |
|---|---|---|---|
| `/login` | `Login.tsx` | — (auth) | `POST /auth/login` |
| `/` | `Dashboard.tsx` | — (Mission Control) | `GET /datasets`, `GET /ai/{ds}/executive`, `POST /workflows/start` |
| `/library` | `Library.tsx` | library (1) | `GET /datasets`, `POST /datasets/upload`, `POST /workflows/start`, `DELETE /datasets/{id}` |
| `/import/$datasetId` | `Import.tsx` | import (2) | `GET /datasets/{id}`, `GET /datasets/{id}/preview`, `POST /datasets/upload` |
| `/preview/$datasetId` | `RawPreview.tsx` | raw_preview (3) | `GET /datasets/{id}`, `GET /datasets/{id}/preview` |
| `/schema/$datasetId` | `SchemaDiscovery.tsx` | schema_discovery (4) | `GET /datasets/{id}/schema`, `POST /datasets/{id}/schema/discover` |
| `/dq/$datasetId` | `DQEngine.tsx` | dq_engine (5) | `GET /datasets/{id}`, `GET /datasets/{id}/preview`, `POST /datasets/{id}/dq/run` |
| `/transformations/$datasetId` | `Transformations.tsx` | transformation (6) | `GET /datasets/{id}/preview`, `GET /datasets/{id}/transformations`, `POST /datasets/{id}/transformations/apply` |
| `/features/$datasetId` | `FeatureEngineering.tsx` | feature_engineering (7) | `GET /datasets/{id}/features`, `POST /datasets/{id}/features/engineer`, `GET /datasets/{id}/preview` |
| `/prediction/$datasetId` | `Prediction.tsx` | prediction (8) | `GET /models`, `POST /models/train`, `POST /predictions/predict`, `POST /workflows/start` (ensureRun) |
| `/confidence/$runId` | `ConfidenceGate.tsx` | confidence_gate (9) | `GET /workflows/{run}`, `GET /ai/{ds}/confidence`, `POST /ai/{ds}/confidence/evaluate` |
| `/comparison/$runId` | `RawProcessedComparison.tsx` | raw_vs_processed (10) | `GET /workflows/{run}`, `GET /comparison/{run}/raw-processed`, `POST /comparison/{run}/raw-processed/run` |
| `/shap/$modelId` | `SHAPExplainability.tsx` | shap (11) | `GET /explanations/{modelId}/global?top_n=15` |
| `/anomalies/$datasetId` | `AnomalyDetection.tsx` | anomaly (12) | `GET /anomalies/{ds}/anomalies`, `POST /anomalies/{ds}/detect` |
| `/benchmarks/$datasetId` | `Benchmarking.tsx` | benchmarking (13) | `GET /benchmarks/{ds}/benchmarks`, `POST /benchmarks/{ds}/benchmarks/run` |
| `/recommendations/$datasetId` | `Recommendations.tsx` | recommendation (14) | `GET /recommendations/{ds}/recommendations`, `POST /recommendations/{ds}/recommendations/generate` |
| `/executive` | `ExecutiveCenter.tsx` | executive_center (15) | `GET /datasets`, `GET /ai/{ds}/executive`, `GET /ai/{ds}/timeline` |
| `/reports` | `ReportGeneration.tsx` | report (16) | `GET /datasets`, `GET /reports`, `POST /reports/generate`, `GET /reports/{id}/download` |
| `/history` | `History.tsx` | history_registry (17) | `GET /datasets`, `GET /workflows`, `GET /registry`, `GET /workflows/{run}`, `GET /models/{id}`, `POST /registry/{modelId}/promote`, `POST /registry/{modelId}/deprecate` |

API client (`lib/api.ts`) prefixes every path with `API_BASE = '/api/v1'`; JWT goes in
`Authorization: Bearer`; 401/403 clears the token and redirects to `/login`.

---

## 3. Per-screen reference

### 3.1 Login — `Login.tsx`
- **Purpose:** Authenticate (JWT) and land in Mission Control. Defaults prefilled `admin@ecomind.ai` / `admin123`.
- **Inputs:** email + password; an effect auto-signs-in after 120 ms (demo-friendly) and bounces to `/` when a token already exists.
- **Outputs:** `localStorage['ecomind_token']` + `['ecomind_user']`; error banner if backend unreachable.
- **API:** `POST /auth/login`. None via payload beyond credentials.
- **Algorithms shown:** none (auth only).
- **Key UI:** full-screen ripple backdrop (`RippleTransition`), gradient scrim, `glass-panel` card with corner `screws`, recessed input wells, safety-orange submit key (`phys-key` styling), system LED.

### 3.2 Dashboard · "Mission Control" — `Dashboard.tsx`
- **Purpose:** CEO-grade landing view of the active dataset — the executive briefing compressed into hero + metrics + journey map.
- **Inputs:** active `datasetId` (journey store) or first dataset from `GET /datasets`.
- **Outputs:** trust/confidence/quality gauges, business impact cards, narrative, 17-stage journey map.
- **API:** `GET /datasets`, `GET /ai/{datasetId}/executive` (summary), `POST /workflows/start`.
- **Algorithms shown:** none executed here; renders trust score, DQ score, best-model name, anomalies, totals (cost/CO₂/forecast kWh) from the executive summary.
- **Key UI:** `device-bezel` hero with ripple media + SplitFlap dataset readout (11 columns, green flaps); launch strip panel with `screws`; `ProgressRing` (SVG stroke-dashoffset) + **"Resume where left off"** that computes the first non-done stage and deep-links via `stagePath`; `MatrixRain` as the empty-state idle backdrop; 4 neumorphic metric cards; "journey map" progress chips 1–17.

### 3.3 Library — `Library.tsx`
- **Purpose:** Stage 01. Choose an energy dataset or upload CSV/XLSX; pick execution mode and launch a run.
- **Inputs:** library list; upload file; "Launch" per dataset.
- **Outputs:** `datasets.upload` (onPick) or `workflows.start` (launch) sets dataset + run context; USB-style progress on launch.
- **API:** `GET /datasets`, `POST /datasets/upload`, `POST /workflows/start`, `DELETE /datasets/{id}` (confirm dialog).
- **Key UI:** `ExecutionModeToggle` panel ("how should the journey run?"), FlowStat grid (Datasets / Total Rows / Ready / Types), per-card Launch, trash icon, empty/error boxes.

### 3.4 Import — `Import.tsx`
- **Purpose:** Stage 02. Animated "streaming" ingestion — phases (`Reading workbook…` → `Preparing dataset…`) play on a timer; a simulated stream counter increments rows every 60 ms up to `min(total_rows, 320)`.
- **Inputs:** `datasetId` (new upload or existing); optional file pick.
- **Outputs:** `markCompleted('import')`; on upload hands back to the Library-style flow (`datasets.upload` → `setActive(id)`).
- **API:** `GET /datasets/{id}`, `GET /datasets/{id}/preview`, `POST /datasets/upload`.
- **Key UI:** `StreamTable` (streams rows into view), `AutoNext`, phase checklist, DoneChip.

### 3.5 RawPreview — `RawPreview.tsx`
- **Purpose:** Stage 03. Untouched source of truth — show raw rows with per-column type/completeness badges; note gaps the DQ engine must fix.
- **Inputs:** `datasetId`; preview 40 rows + dataset metadata (provenance).
- **Outputs:** Auto-advances to `/schema/{datasetId}` after 8 s (**pass-through** stage).
- **API:** `GET /datasets/{id}`, `GET /datasets/{id}/preview`.
- **Key UI:** `RoomStage` layout — `Terminal` (jade, "RAW FILE SOURCE · untouched"), `DataPreview` (5 cols × 6 rows), `FlowConsole` ("rows staged"), `ExplainStrip` with evidence string, `DoneChip "Raw confirmed"`.

### 3.6 SchemaDiscovery — `SchemaDiscovery.tsx`
- **Purpose:** Stage 04. Auto-detect type, role and confidence per field; reveal columns one at a time (220 ms/column).
- **Inputs:** `datasetId`; "Discover schema" button when none exist.
- **Outputs:** `GET /schema` columns rendered as type-tagged chips with null counts / sem types; `markCompleted('schema_discovery')`.
- **API:** `GET /datasets/{id}/schema`, `POST /datasets/{id}/schema/discover`.
- **Algorithms shown:** per-column inference (`data_type`, `semantic_type`, statistics, null_rate).
- **Key UI:** per-column glass chips with type icons (datetime/float/int/text/boolean), `LiveBar`, `FlowStat` rollup, `AutoNext` → `/dq`.

### 3.7 DQEngine — `DQEngine.tsx` (+ the 8 DQ rules)
- **Purpose:** Stage 05. **Inspect flag** — animated row-by-row repair across 8 quality dimensions; live score lights up.
- **Inputs:** `datasetId`; auto-runs quality in auto mode; "run quality engine" button (emerald, bottom `aside`) otherwise.
- **Outputs:** `POST /dq/run` → `overall_score` (×100 shown), `by_dimension`; `markCompleted('dq_engine')`; `DiffStrip` "Raw → repaired".
- **API:** `GET /datasets/{id}`, `GET /datasets/{id}/preview`, `POST /datasets/{id}/dq/run`.
- **Algorithms shown — the 8 DQ rules** (from `GET /datasets/{id}/dq`, `EVIDENCE.md`; scores are **/100**, 5 dimensions):
  1. `completeness` → completeness · 100 (0 null / 43,200 cells)
  2. `validity_semantic_bounds` → validity · 100 (18,000/18,000 in bounds)
  3. `consistency_duplicates` → consistency · 100 (0 duplicate rows)
  4. `consistency_monotonic_timestamps` → consistency · 96.7 (120 non-monotonic rows)
  5. `validity_identifiers` → validity · 100 (5 unique assets)
  6. `accuracy_outliers_iqr` → accuracy · 98.4 (394 IQR outliers; min(rate,0.5)-clamped)
  7. `accuracy_zscore` → accuracy · 99.9 (3 extreme points, z-threshold 5)
  8. `timeliness_temporal_gaps` → timeliness · 100 (0 missed intervals)
  - `passed_count=8, failed_count=0`, severities 6 info / 2 warning.
- **Key UI:** `RoomStage` with three dark `Terminal` panels (RAW SIGNAL · ISSUES, QUALITY SIGNAL · ACHIEVED with `statRows`, and a pixelated "repaired stream" `PixelatedReveal`), `FlowConsole` "PROCESSING BRIDGE" with typewriter script, `DiffStrip`, LED state machine (idle → repairing → clean).

### 3.8 Transformations — `Transformations.tsx`
- **Purpose:** Stage 06. Raw → Processed with a live transformation log; runs a real operation chain animated op-by-op.
- **Inputs:** `datasetId`; "Run transformations" button.
- **Outputs:** `transformations.apply` chain; `Applied` counter; `markCompleted('transformation')`; `AutoNext` → `/features`.
- **API:** `GET /datasets/{id}/preview`, `GET /datasets/{id}/transformations`, `POST /datasets/{id}/transformations/apply`.
- **Operation chain actually sent** (note: keys differ from the API contract's `drop_columns/fill_missing/…` set): `fillna(interpolate)` on `energy_kwh`+`temperature_c`, `dedupe`, `normalize(min_max)` on `energy_kwh`, `clip(0,·)`, `log_transform` on `power_kw`.
- **Key UI:** `StreamTable` (8 rows), `LiveLog` terminal feed, pipeline "planes" visualization, `ENGINEERED_FEATURES` preview legend, `PulseDot` status.

### 3.9 FeatureEngineering — `FeatureEngineering.tsx`
- **Purpose:** Stage 07. AI generates explainable energy features (auto mode).
- **Inputs:** `datasetId`; "Generate features" button.
- **Outputs:** `features.engineer({auto:true})` → feature cards revealed one-by-one; `markCompleted('feature_engineering')`.
- **API:** `GET /datasets/{id}/features`, `POST /datasets/{id}/features/engineer`, `GET /datasets/{id}/preview`.
- **Algorithms shown:** feature set from API — temporal (hour/day/weekend/month), rolling (24 h mean/std), lags/horizon diffs, `load_factor`, `energy_density`; idempotence via server `messages`.
- **Key UI:** FlowStat (Features / mean importance / source columns / methods), feature cards with importance bars, `AutoNext` (arranged with `LiveBar`).

### 3.10 Prediction — `Prediction.tsx`
- **Purpose:** Stage 08. **Inspect flag** — three models train head-to-head on the processed dataset, then a forecast is generated from the winner.
- **Inputs:** `datasetId`; 3-turn fixed lineup (`random_forest`, `gradient_boosting`, `xgboost`); horizon selector 24/48/72/168 h.
- **Outputs:** `models.train` ×3 (reusing an existing per-dataset model when present), winner = highest `metrics.r2`; `predictions.run` forecast + `horizon_summary`; `markCompleted('prediction')`.
- **API:** `GET /models`, `POST /models/train`, `POST /predictions/predict`, `POST /workflows/start` (via `ensureRun`).
- **Algorithms shown:** Random Forest, Gradient Boosting, XGBoost cards with fake-timed `LiveBar` training progress (r2/rmse/mape per card).
- **Key UI:** winner trophy badge + glow, Recharts `LineChart` (upper/predicted/actual/lower), horizon summary (Total/Peak/CO₂/Cost), `AutoNext` → `/confidence/{runId}`.

### 3.11 ConfidenceGate — `ConfidenceGate.tsx`
- **Purpose:** Stage 09. **Inspect flag** — explainable trust score before decisions, with per-factor breakdown.
- **Inputs:** `runId`; resolves `datasetId` from `GET /workflows/{run}`.
- **Outputs:** trust gauge + verdict (high/moderate/low), factor rows, reasoning; `markCompleted('confidence_gate')`; `AutoNext` → `/comparison`.
- **API:** `GET /workflows/{run}`, `GET /ai/{ds}/confidence`, `POST /ai/{ds}/confidence/evaluate`.
- **Algorithms shown:** **locked formula (API_CONTRACT §3.14):** `trust_score = 0.40·prediction_confidence + 0.25·dq_score + 0.20·model_relevance + 0.15·shap_stability`; verdict bands `high_trust ≥ 80`, `moderate_trust 60–79`, `low_trust < 60`.
- **Key UI:** trust `Gauge`, verdict chip (Reliable / Reliable-with-caveats / Need-More-Data), factor list, reasoning bullets.

### 3.12 RawProcessedComparison — `RawProcessedComparison.tsx`
- **Purpose:** Stage 10. Prove DQ improves model performance — two models, identical features/split, raw vs processed.
- **Inputs:** `runId`; button **"Run comparison"** (`{target_column:'energy_kwh', algorithm:'xgboost'}`).
- **Outputs:** side-by-side metric cards (R²/RMSE/MAE/MAPE with Δ%), improvement strip, FlowStat deltas, conclusion banner; `markCompleted('raw_vs_processed')`; `AutoNext` → `/shap/{runId}`.
- **API:** `GET /workflows/{run}`, `GET /comparison/{run}/raw-processed`, `POST /comparison/{run}/raw-processed/run`.
- **Algorithms shown:** XGBoost trained on RAW frame vs PROCESSED frame; 5 locked metrics `r2, rmse, mae, mape, shap_stability`; `shap_divergence = |stab_raw−stab_proc| + |r2_raw−r2_proc|`.
- **Key UI:** red (raw) vs green (processed) `LiveBar`s, trophy on the processed side, `AnnotatedText` underline "+X% improvement" and highlight on conclusion.

### 3.13 SHAPExplainability — `SHAPExplainability.tsx`
- **Purpose:** Stage 11. Why the model decided — global feature importance with per-feature SHAP magnitudes.
- **Inputs:** `modelId` (route), with guard `modelId !== '$modelId'`.
- **Outputs:** top-15 features ranked by `|SHAP|`, revealed 220 ms apart; `markCompleted('shap')`.
- **API:** `GET /explanations/{modelId}/global?top_n=15`.
- **Algorithms shown:** global SHAP decomposition (base value, expected value, per-feature importance, `stability_index`). **Caution (EVIDENCE.md):** the API's `stability_index` here is a column-order alignment metric (`shap_stability`), not model-explanation stability; the real stability metric is `shap_service._stability` (Spearman feature-ranking correlation), stored as `__stability_index`.
- **Key UI:** FlowStats (features/`SHAP Stability`/base/expected), horizontal bar list with emerald (+) / rose (−) signed values, "Compute global SHAP" button.

### 3.14 AnomalyDetection — `AnomalyDetection.tsx`
- **Purpose:** Stage 12. Timeline scan for energy anomalies, severity-ranked, each with evidence/context.
- **Inputs:** `datasetId`; **"Run anomaly scan"** (`{method:'ensemble'}`).
- **Outputs:** `anomalies.detect` → item list + `by_severity` counts + (precision/recall/elapsed_ms when ground truth exists); `markCompleted('anomaly')`.
- **API:** `GET /anomalies/{ds}/anomalies`, `POST /anomalies/{ds}/detect`.
- **Algorithms shown:** ensemble detector (IsolationForest + z-score per asset per hour + trend breaks + domain rules), score 0–1, severity critical/high/warning/medium/low/info.
- **Key UI:** severity legend + colored chips, timeline positioning (`posOf`), expandable anomaly cards showing score/confidence/context/deviation.

### 3.15 Benchmarking — `Benchmarking.tsx` (+ leaderboard)
- **Purpose:** Stage 13. Model/portfolio comparison and percentile ranking with a clear winner.
- **Inputs:** `datasetId`; **"Run benchmark"** (`{}` → default set).
- **Outputs:** `benchmarks.run`; leaderboard rows (rank/name/algorithm/total_score + up to 4 metric columns), winner banner; `markCompleted('benchmarking')`; `AutoNext` → `/recommendations`.
- **API:** `GET /benchmarks/{ds}/benchmarks`, `POST /benchmarks/{ds}/benchmarks/run`.
- **Algorithms shown:** default comparison set — XGBoost, Random Forest, Gradient Boosting, Ridge; methodology `time_series_split` (chronological 70/30).
- **Key UI:** rank medallions (trophy #1, medal #2, award #3), `LiveBar` per model normalized to max `total_score`, winner glow + "wins — {r2} R²" strip, **`export csv`** button (`exportLeaderboard` → `downloadCSV`).

### 3.16 Recommendations — `Recommendations.tsx`
- **Purpose:** Stage 14. AI consultant presents evidence-backed actions with savings and confidence.
- **Inputs:** `datasetId`; **"Generate recommendations"** (`{top_k:8}`).
- **Outputs:** `recommendations.generate` → cards revealed 240 ms apart; `markCompleted('recommendation')`.
- **API:** `GET /recommendations/{ds}/recommendations`, `POST /recommendations/{ds}/recommendations/generate`.
- **Algorithms shown:** evidence basis = anomalies + SHAP top drivers + consumption trends + off-hours load + weekday/weekend; categories hvac/lighting/scheduling/load_shifting/maintenance/renewable; priority high/medium/low.
- **Key UI:** priority-colored chips (Zap/Target/Shield icons), savings kWh/% + confidence FlowStats, per-card `supporting_evidence` basis.

### 3.17 ExecutiveCenter — `ExecutiveCenter.tsx`
- **Purpose:** Stage 15. CEO briefing — the whole analysis in one view, dataset-selectable.
- **Inputs:** active dataset (route param → journey ctx → first from `GET /datasets`).
- **Outputs:** trust gauge, headline narrative, key findings, best model, anomaly summary + by_type, leaderboard, recommendations, SHAP drivers, Recharts bar chart of **stage durations** from the run timeline; `markCompleted('executive_center')`.
- **API:** `GET /datasets`, `GET /ai/{ds}/executive`, `GET /ai/{ds}/timeline`.
- **Key UI:** dataset `<select>` when several datasets exist, gradient brief panel, `Gauge`, bar chart colored per stage, findings bullets.

### 3.18 ReportGeneration — `ReportGeneration.tsx`
- **Purpose:** Stage 16. Compile audit-ready deliverables (PDF / HTML / CSV).
- **Inputs:** title, report type (`executive|performance|compliance|full`), format (`pdf|html|csv`), 8 fixed sections (Methodology → Appendix).
- **Outputs:** `reports.generate` → deliverable logged with byte size; list of past reports with per-row **Open** link; `markCompleted('report')`; `AutoNext` → `/history`.
- **API:** `GET /datasets`, `GET /reports`, `POST /reports/generate`, `GET /reports/{id}/download` (direct `downloadUrl`).
- **Key UI:** format cards (PDF audit-ready / HTML interactive / CSV raw), section chips, generation log, Deliverables table with format colour dots.

### 3.19 History / Registry — `History.tsx`
- **Purpose:** Stage 17. Reopen any past run (context-restoring deep link) and manage the model registry.
- **Inputs:** runs list (`GET /workflows`), registry (`GET /registry`), dataset lookup.
- **Outputs:** run detail (traces, `StageTimingStrip`, `TraceSummary`s, "Open in journey"); registry promotion/deprecation via slide-in drawer; `reopenRun` restores dataset/run/model + statuses and navigates to the deepest completed stage (or `/executive`).
- **API:** `GET /datasets`, `GET /workflows`, `GET /registry`, `GET /workflows/{run}`, `GET /models/{id}`, `POST /registry/{modelId}/promote`, `POST /registry/{modelId}/deprecate`.
- **Key UI:** Interaction-timeline list (#/17 stages, RUNNING/completed badges, `ScoreSpark` R² mini-bars, per-stage timing strip), Model Registry panel with CURRENT badge, detail drawer (performance, hyperparameters, notes, Promote/Deprecate), "Back to the Library" reset.

---

## 4. Key interactions

1. **RawProcessedComparison "Run comparison"** — `POST /api/v1/comparison/{runId}/raw-processed/run` with body `{target_column:'energy_kwh', algorithm:'xgboost'}`. The page then refetches `GET /comparison/{runId}/raw-processed`, marks stage done, shows Δ% bars, and auto-advances to `/shap/{runId}`.
2. **SHAP "Compute global SHAP"** — button only renders when `GET /explanations/{modelId}/global` returned nothing; clicking just re-fetches (`res.refetch`) and the reveal animation plays. (The compute itself is server-side `GET /explanations/{model_id}/global`.)
3. **Benchmark leaderboard CSV export** — `exportLeaderboard` flattens each row to `rank, name, algorithm, total_score, scores.<metric>…` (sorted metric keys) and fires `downloadCSV(…, 'ecomind-benchmark-leaderboard.csv')` (PROGRESS.md: "Benchmark CSV export · leaderboard flatten + downloadCSV").
4. **PDF report quick-link** — the JourneyMap header (every stage) carries a `FileDown` "PDF" button linking to `/reports` ("Generate & download a PDF audit report"); ReportGeneration's per-row **Open** anchor hits `GET /reports/{id}/download` (attachment).
5. **Theme toggle** — TopBar sun/moon + Settings "Appearance" button; `toggleTheme` flips `[data-theme]` and persists to `localStorage['ecomind_theme']` (default light).
6. **Journey resume / progress ring** — Dashboard shows an SVG `ProgressRing` (`pct = done/17`) next to a **"Resume where left off"** CTA that resolves the first non-done stage and deep-links via `stagePath`; History's "Open in journey" does the equivalent restore from persisted run state (`reopenRun` + `stageStatuses` reconstruction).

---

## 5. Visual system (industrial skeuomorphism) — `docs/DESIGN_SYSTEM.md`

- **Aesthetic:** "Industrial Realism" — top-left 45° light source, structural (not decorative) shadows, tactile precision. Levels: −1 recessed inputs, 0 chassis, +1 panels, +2 floating.
- **Theme:** **light is the default** (`--chassis #e0e5ec` desk) — "Light desk, dark screens." Terminal monitors always stay dark for signal clarity. **Dark was demoted to "legacy"** after the industrial redesign (PROGRESS.md).
- **Tokens** (`tokens.css`, `[data-theme='light']`):
  - **Surfaces:** `--chassis #e0e5ec`, `--panel-lt #f0f2f5`, `--muted #d1d9e6`, shadows `#babecc` / highlights `#ffffff` / deep `#a3b1c6`.
  - **Text:** `--ink/--t-hi #2d3436`, `--t-mid #4a5568`, `--t-lo #6b7684`.
  - **Accent (sparingly — interactive/status only):** safety orange `#ff4757` (= `--color-primary`); dark accent surfaces `#2d3436/#2c3e50` with white text.
  - **Neumorphic shadows:** `--shadow-card` `8px 8px 16px #babecc, -8px -8px 16px #ffffff`; `--shadow-floating`, `--shadow-pressed`, `--shadow-recessed`, glow variants.
  - **Radius:** 4 / 8 (`--radius-button`) / 16 (`--radius-card`) / 24 / 30+ / full.
  - **Textures:** fractal-noise overlay, CRT `scanlines` on terminals, blueprint grid, radial hotspot.
- **Typography:** Inter (body+display, `font-display`), JetBrains Mono for numbers/labels/metadata (uppercase, 0.05–0.08em tracking).
- **Signature elements:** `.screws`, `.vent-slot`, `.led` (+online/alert/warn/idle), `.scanlines`, `.blueprint-grid`, `.phys-key`, `.input-well`, `.connector-pipe`, `.device-bezel/.device-screen/.power-led`, `.glass-panel/.glass-card`.
- **Glass card / terminal conventions:** level+1 panels are light neumorphic (`glass-panel`/`glass-card`); terminals (`RoomStage`/`Terminal`) are dark monitors with scanlines + typewriter. Interaction primitives (lib/interactive): `RippleTransition`, `AnnotatedText`, `SplitFlapDisplay`, `MatrixRain`, `PixelatedReveal`.

### ⚠️ Known UI inconsistency (visual audit)
**DQEngine** renders three **dark terminal panels** (`bg-black/30`, `bg-dark-200/60`, `Terminal`/`FlowConsole` from `RoomStage`) **inside a light glass `RoomStage` theme** — the page's top-level surfaces follow the light chassis while its inner "windows" stay dark. This is defensible per the "terminals always stay dark" rule, but on every other light page the dark surfaces are limited to standalone Terminal monitors; on DQEngine the dark palette also covers the diff/explain strips and pixelated stream, so the page reads as a dark island in the light shell. **Documented as a known inconsistency; intentional fallout of the "dark screens" convention, not a bug to fix silently.**

---

## 6. Examples with real data (from `EVIDENCE.md`, queried 2026-09-23)

### Example A — Data Quality run (per-rule scores on `b61c2b04`, `GET /datasets/b61c2b04/dq`)
| Rule | Dimension | Score /100 | Detail |
|---|---|---|---|
| completeness | completeness | 100 | 0 null / 43,200 cells |
| validity_semantic_bounds | validity | 100 | 18,000/18,000 in bounds |
| consistency_duplicates | consistency | 100 | 0 duplicate rows |
| consistency_monotonic_timestamps | consistency | **96.7** | 120 non-monotonic rows |
| validity_identifiers | validity | 100 | 5 unique assets |
| accuracy_outliers_iqr | accuracy | **98.4** | 394 IQR outliers |
| accuracy_zscore | accuracy | **99.9** | 3 extreme points (z=5) |
| timeliness_temporal_gaps | timeliness | 100 | 0 missed intervals |

→ `passed_count=8, failed_count=0`, severities 6 info / 2 warning. **Caution:** the DQ **GET** `overall_score=159` is `Σ(rule scores)/#dimensions` (=795/5) — **not** a percentage and unbounded; the **POST-run** variant is `0.25×Σ(per-dimension means)` → max 125 (weights sum to 1.25, a known bug). **In the paper use per-rule /100 and the trust-gate `dq_score=100`** — never "overall DQ 159/100."

### Example B — Benchmark leaderboard (`GET /benchmarks/b61c2b04/benchmarks`, methodology `time_series_split`)
| Algorithm | R² | RMSE | MAE | MAPE | Expl.Var |
|---|---|---|---|---|---|
| xgboost | 0.9147 | 1.3740 | 0.1235 | 1.57 | 0.9149 |
| random_forest | 0.9162 | 1.3624 | 0.1191 | 1.44 | — |
| **gradient_boosting (winner)** | **0.9175** | **1.3517** | **0.1120** | **1.32** | 0.9176 |
| ridge | **1.0000** | 0.0048 | 0.0024 | 0.09 | 1.0000 |

→ **LEAKAGE WARNING:** ridge's r²=1.0 is a **target-leakage artifact**, not skill — `derive_features` runs *before* the split and creates `lag_1h=y_{t−1}` and `diff_1h=y_t−y_{t−1}` so `y_t = diff_1h + lag_1h` exactly; also `rolling_mean_24h` (window inclusive of `y_t`), `load_factor=y_t/power_kw`, `energy_density=y_t/occupancy`. Present **gradient_boosting as the best legitimate model** and report ridge's r²=1.0 honestly as a leakage case the platform detects. The Benchmarking UI shows this exact table (trophy rank #1 = gradient_boosting, CSV export available).

### Example C — Raw vs Processed comparison (`POST /comparison/{run}/raw-processed/run`, runs `776bf594` & `5c8dd728`, xgboost, 70/30 chronological split, 17 features both sides)
| Run | side | R² | RMSE | MAE | MAPE | shap_stability |
|---|---|---|---|---|---|---|
| 776bf594 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 11.0 |
| 776bf594 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 5.9 |
| 5c8dd728 | raw | 0.9153 | 1.3692 | 0.121 | 1.58 | 9.1 |
| 5c8dd728 | processed | 0.9153 | 1.3692 | 0.121 | 1.58 | 0.0 |

→ `r2_delta=0`, error deltas 0 (computed as absolute diffs, a naming misnomer), `shap_stability_delta = −5.1 / −9.1`, `shap_divergence = 5.1 / 9.1` (|stabΔ|+|r2Δ|, not cosine). System `conclusion` (both): *"Raw data matched or beat cleaned data here — possible over-cleaning or already-high quality input."* **Honest headline result: cleaning did NOT change predictive performance on already-clean seed data** — paper framing: the raw-vs-processed stage verifies correctness but yields Δ≈0, the honest negative result that DQ-driven cleaning is data-dependent (QED for the "DQ first" thesis). The UI renders exactly these metric rows with Δ% annotations.

---

*Polish context (PROGRESS.md): 18 routes, vitest 22/22, pytest 7/7, build green. Known seed artifact: one injected `completed` run has integer `stages_completed=1..18` inconsistent with key-based stage engine.*