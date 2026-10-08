# EcoMind AI — Frontend Master Specification (EM-FE-MASTER-001)

> Single authoritative reference for the EcoMind AI frontend. Consolidates every product
> prompt (landing, pages, animations, analytics, integration, polish) into one spec plus an
> ordered implementation backlog. The backend workflow is **frozen** — the frontend only
> visualizes the 10-stage pipeline: Library → Import → Schema → Quality → Transformation →
> Model Selection → Anomaly → Forecast → Recommendation → Report.

---

## 0. Project Goal

EcoMind is **not** a static dashboard. It is an enterprise AI platform that visually
demonstrates every backend pipeline stage in real time. The user should feel they are
watching an AI system think, process, learn, and decide. Every page must answer:

- What is happening?
- Why is it happening?
- What data is being used?
- What output is being generated?
- What is the next stage?

No page is ever static. No page is ever a placeholder.

Reference quality bar: Microsoft Fabric, Azure AI Studio, Databricks, Palantir Foundry,
Bloomberg Terminal, Siemens Insights Hub / EcoStruxure, Power BI — while keeping EcoMind's
**own** identity (dark theme, mint/blue/violet/coral palette, mono labels, glassmorphism).

**Hard rules**
1. Never redesign an already-shipped page unless the task explicitly says so.
2. Never add/move navigation views; the 14 views + landing are final.
3. Never compute analytics on the frontend — every number, chart, KPI, justification comes
   from backend APIs and stage traces.
4. Every animation must represent a real backend event. No decorative motion.
5. Sounds: **no per-interaction sounds**; only a completion chime when a process finishes.

---

## 1. Application Flow (navigation is frozen)

```
Landing
  ↓
Library → Import → Schema Discovery → Data Quality → Transformation
  → Model Selection (Baseline Generation) → Anomaly Detection → Forecast
  → Recommendations → Reports → History → Settings
```

- Stages cannot be skipped; each unlocks after the previous completes.
- Pipeline status is always visible (waiting / running / completed / failed; running glows,
  connectors animate like energy flow).
- Every backend event has a frontend visualization.

## 2. Design Language

- Dark theme, glassmorphism (`backdrop-filter` blur), premium enterprise UI.
- Smooth enterprise-grade motion (ease-out / ease-in-out / spring / natural deceleration;
  **no** bounce / elastic / playful).
- Consistent typography: Inter + `ui-monospace` labels with letter-spacing (`.08em–.16em`).
- Current `:root` tokens: `--eco-ink #0a110e`, `--eco-panel #101c15`, `--eco-line #253a2e`,
  `--eco-text #ecf6ee`, accents `--eco-mint #b6f36b`, `--eco-blue #79d6c4`,
  `--eco-violet #8d86ff`, `--eco-orange #f5a56d`, `--eco-coral #f07f6e`,
  `--eco-yellow #e6ca78`.

### Color semantics
- mint = success / complete / AI core
- blue = information / running / active
- violet = evidence / AI thinking
- orange = high priority / warning
- coral = critical / error
- yellow = medium

### Global layout (already implemented in AppShell)
- Persistent left nav: EcoMind logo, workspace selector, sectioned nav (Workspace /
  Understand / Analyze / System) with per-item status badges; current stage glows,
  completed shows check-like state, locked shows disabled.
- Top bar: breadcrumb (`Workspace / Dataset`), context strip, search, notifications,
  theme toggle, profile.
- Right Inspector drawer (per-context: anomaly / model / baseline / schema).
- Bottom Activity Console (terminal) streaming backend logs / stage events, auto-scroll.

## 3. Dataset Adaptation

The whole UI must adapt to the uploaded dataset domain **without changing layout**:

Buildings, Factories/Manufacturing, Industrial plants, HVAC, Smart homes, Hospitals,
Universities, Data Centers, Solar, Wind, Retail/Malls, Campuses, Warehouses, Energy grids,
Water treatment, Airports.

Switches on detected domain: icons, illustrations, hierarchy labels (e.g. Hospital →
`Bed → Ward → ICU / MRI / HVAC`; Factory → `Plant → Line → Motor/Compressor`), demo cards,
terminology, units, KPI focus. Backend metadata (`semantic_type`, dataset `description`,
`domain` heuristics) drives this — frontend only maps tokens to visuals.

Current implementation: `domainOf()` + `domainMeta` in AppShell (lime/orange/violet accents,
`Building2/Factory/Warehouse`, unit system). Extend, don't replace.

## 4. Page-by-page Spec

### 4.1 Landing / Hero (FE-003) — requires redesign
Cinematic landing: an animated **energy city** (buildings, factories, solar panels, wind
turbines, power lines), energy particles, idle AI network, floating glass stat chips
(datasets, rows, anomalies, savings), live workflow step rail (INGEST → UNDERSTAND →
REPAIR → PREDICT → ACT) lighting up sequentially, scrolling storytelling, CTA, radar/orbit
core, backend-connection indicators. Pre-auth so chip values stay tasteful/mock.

### 4.2 Dataset Library (FE-004)
AI Dataset Hub: dynamic domain cards (icon, preview, metadata, accent), search, filters,
pinned/recent, continue-analysis, remove, clone, import button, empty state
("No datasets available. Import your first dataset.").

### 4.3 Import (FE-005)
Drag & drop (CSV/Excel/DB), upload progress, streaming parse/validation logs, storage +
database animations, detected domain + stats preview, errors, success celebration. Real
backend upload via `api.datasets.upload` (File FormData) → refresh workspace → runPipeline.

### 4.4 Schema Discovery (FE-006)
Visualize AI understanding the file: column detection, relationships, timestamp detection,
hierarchy tree, devices, units, semantic types. Animated node graph / building+factory
wireframe, "AI thinking" animation, live discovery process from `GET /schema`.

### 4.5 Data Quality Engine (FE-007) — highlight, three-terminal
- LEFT: only problematic rows (target: null / timestamp / duplicate / datatype / unit).
  **No outlier repair.**
- CENTER: animated AI repair engine (reading → analysing → repairing → normalising →
  converting → database write), live logs, progress, explanation, timeline.
- RIGHT: only repaired rows, before ↓ after, filter by issue type.
- Store repaired dataset separately; raw dataset never overwritten.
- Backend is structural-only DQ; map `quality` stage results (rules, `columns_with_gaps`,
  `global_null_rate`).

### 4.6 Transformation (FE-008)
Backend preparing data: feature engineering, normalization, encoding, aggregation, scaling,
time-series prep, baseline creation begins here. Animated processing pipeline following
`transformation` stage; decisions shown.

### 4.7 Baseline Generation (FE-009) — unique page
Show the AI *learning normal behaviour* from the uploaded dataset: weekdays/weekends,
morning/afternoon/night, seasonal patterns, learning curve, hourly **heatmap (24h × 7d)**,
generated 168-cell hour-of-week profile, confidence, statistics, baseline dataset preview.
Baseline is auto-generated from the uploaded dataset — never external. Tie to baseline
versions ledger (`GET /baseline/versions`).

### 4.8 Model Race (FE-010) — highlight
XGBoost, Random Forest, Gradient Boosting, Extra Trees, Ridge, Linear Regression competing
simultaneously: animated leaderboard, progress bars, R² / RMSE / MAE / time / memory,
rankings updating live, winner celebration, near-tie indicator, **reason why selected**
(`selection_rationale`), per-model rationale. Consume `model_selection` stage output.

### 4.9 Anomaly Detection (FE-011) — flagship, biggest highlight
- Top KPIs: total, critical/medium/low (high), average deviation %, peak consumption/demand,
  CO₂ impact, estimated financial loss — animated up.
- Center: multi-layer interactive chart (baseline vs actual vs anomaly points vs optional
  forecast overlay), hover enlarges anomaly, rich tooltip.
- Filters: date/hour/week/month/year/device/building/floor/room/equipment/severity/type.
- Timeline view (clickable anomaly points, hover expands, selection syncs all), heatmap
  (hours × days), equipment hierarchy tree, baseline comparison split view, scatter +
  distribution + deviation histogram + hourly/weekly/monthly patterns + radar + trend.
- Anomaly detail drawer: ID, timestamp, device, sensor, severity, deviation, baseline,
  actual, expected, confidence, supporting metrics, related forecast/recommendation,
  evidence IDs, stage trace.
- Explainability: why it's an anomaly, which baseline, expected vs observed vs difference,
  confidence, model used, evidence — no black box.
- Right inspector (sticky): anomaly metadata, baseline snapshot, model, confidence,
  equipment info, previous occurrences, related forecast/recommendation, export evidence.
- Compare mode (2+ anomalies), global search, severity colors always labelled.
- Animations: detection pulse, glow, scan, energy flow, node flash, marker expand.
- Entirely read-only/backend-driven: `GET /anomalies`, `GET /anomalies/chart`, baseline
  snapshot, model from `model_selection`.

### 4.10 Forecast (FE-012) — second highlight
- Predict energy (kWh), power (kW), cost (₹), CO₂ (kg CO₂e), demand (kVA), peak load.
- Always relative to adaptive baseline; split view of baseline → current → forecast.
- Confidence bands, interactive timeline, scenario comparison (normal/optimistic/
  conservative/worst/best), heatmap, trend analysis, business impact cards (cost/energy/
  CO₂/demand increase, potential savings, risk).
- Horizon selectors (7d/30d/90d/6mo/1yr) drive backend recalculation.
- Consume `forecast` stage + `GET /forecast/chart`. Units always labelled.

### 4.11 Recommendations (FE-013)
Cards: priority (P1-P3), device, reason, evidence, energy/cost/CO₂ savings, confidence,
implementation difficulty, ROI, payback. Kanban by priority (Critical/High/Medium/Low),
explainability panel (why it exists, supporting anomalies/forecast/baseline, decision
rules), savings visualization, impact matrix (effort × impact, bubble = savings, color =
priority), action simulator (toggle on/off), implementation timeline, relationship graph
(recommendation→anomaly→forecast→baseline→equipment→dataset), business impact section.
Consume `recommendation` stage output entirely.

### 4.12 Reports (FE-014)
Executive report builder: 12 chapters (exec summary → dataset → schema → quality →
transformation → baseline → model → anomaly → forecast → recommendations → business impact
→ conclusion), live PDF-like preview, chart gallery toggle, AI summary (backend-generated),
download center (PDF/CSV/Excel/JSON/PNG/SVG), custom section builder, version history,
export settings (page size/orientation/margins/logo/watermark), print mode.
Consume `report` stage; PDF route needs bearer header (`reportPdfUrl`).

### 4.13 History (FE-015)
Workflow runs: resume / replay (pipeline replay), clone, delete, compare, timeline.
Already implemented (`HistoryView` from `liveRuns`) — deepen replay.

### 4.14 Settings / Notifications / Global Search / Command Palette
- Settings (workspace/session, network health, pipeline model+baseline, baseline ledger).
- Notification center (workflow completed, dataset imported, forecast ready, recs, report,
  errors; dismiss / mark-read).
- Global search (Ctrl+K, Ctrl+/): datasets, devices, anomalies, recommendations, forecasts,
  reports, workflows.
- Command palette, shortcuts (Ctrl+R refresh, Ctrl+E export, Ctrl+D demo, Esc close).

### 4.15 Presentation & Demo Mode (final polish phase)
- **Presentation Mode**: hide dev controls, larger spacing, keep key KPIs, fullscreen
  charts, distraction-free, elegant transitions.
- **Guided Demo Mode (Ctrl+D)**: auto-walks the full pipeline (landing → library →
  import → … → report) with narration per stage ("Uploading dataset…", "Detecting
  schema…", "Repairing quality issues…", "Generating adaptive baseline…", "Training
  candidate models…", "Selecting best model…", "Detecting anomalies…", "Forecasting
  future energy…", "Generating AI recommendations…", "Preparing executive report…").
  Narration maps 1:1 to backend stages. Also an interactive **auto / step-by-step**
  pipeline control (Step executes next stage, Auto runs the rest) — this is the P0
  interactive mode, not just the filmstrip.

## 5. Global Component System

Reusable: Dataset Card, Pipeline Card, Metric/KPI Card (title, value, unit, previous,
baseline, delta, trend, confidence, status, timestamp, sparkline, tooltip, inspector),
Baseline Card, Anomaly Card, Forecast Card, Recommendation Card, Evidence Card, Report
Card, Health Card, Risk Card, Timeline Card, Quality Card. Every component has states:
loading (skeleton), hover, selected, disabled, success, warning, error, streaming,
expanded, collapsed, responsive.

KPI set: energy consumption (kWh), power demand (kW), peak demand (kW), energy cost (₹),
CO₂ (kg CO₂e), active devices, anomalies (total + critical), forecast accuracy,
recommendation count, estimated savings.

## 6. Chart / Analytics Engine (FE-analytics)

Chart types: line, area, bar, stacked bar, pie/donut, scatter, bubble, heatmap, calendar
heatmap, treemap, radar, histogram, box plot, parallel coordinates, timeline, sankey,
hierarchy tree, node graph, sunburst, gauge, waterfall, correlation matrix.

Every chart: zoom, pan, brush, fullscreen, export, tooltip, legend, comparison mode,
crosshair, **linked hover across all charts**. Selecting an anomaly highlights chart +
timeline + inspector + device + recommendation + forecast (global synchronization).
Every chart answers a business question; no decorative charts; all values backend-driven.

## 7. Motion / AI visualization system (FE-animation)

- Pipeline rail animates like energy flowing; completed = green, running = blue pulse,
  waiting = grey, failed = red.
- Database write animation (DB icon rotates, particles move, storage fills, timestamp
  updates, logs update) on: upload, save processed/baseline/anomalies/forecast/recs/reports.
- AI thinking animation (nodes activating, connections lighting, reasoning pulse,
  confidence growth) during schema / baseline / model selection / anomaly / forecast / recs.
- Streaming log system (bottom console): timestamp, stage, action, status, duration,
  warnings/errors, auto-scroll, filter, search, pause, download.
- Loading: **never empty spinners** — show stage, operation, records processed, estimated
  time, streaming logs, animated skeletons, dataset + database status.
- Success: green pulse + checkmark + pipeline advances + logs update. Errors: calm, with
  problem/reason/retry/logs/recovery. No shake.
- Prefer CSS keyframes (existing: `view-in`, `pulse-ring`, `orbit-spin`, `signal`, `blink`,
  `terminal-*`, `flow-line`, `flow-node`, `radar-*`, `core-breathe`, `signin-*`). Add GPU
  acceleration (`transform/opacity` only), honor `prefers-reduced-motion`.

## 8. Backend Synchronization (non-negotiable)

- Replace every mock source: datasets → `GET /datasets`; runs → `GET /workflows` +
  stage traces (`output_snapshot`); quality → `quality` stage; schema → `GET /schema`;
  models/competition → `model_selection` stage (`selection_rationale`); anomalies →
  `GET /anomalies` + `GET /anomalies/chart`; forecast → `forecast` stage +
  `GET /forecast/chart`; recommendations → `recommendation` stage; report → `report`
  stage + PDF (bearer); activity → `GET /activity`; baseline versions →
  `GET /baseline/versions`.
- No frontend business calculations. Animations start when backend starts, stop when it
  finishes. Stage order enforced. SSE/WebSocket consumed where the backend offers it
  (`/workflows/{id}/stream-token`, SSE) — falls back to poll/exec for now.
- Optimistic UI only where genuinely appropriate. Loading skeletons, API error handling,
  retries, SSE reconnect.

## 9. Accessibility & Performance

- A11y: keyboard nav, ARIA, focus indicators, contrast, `prefers-reduced-motion`,
  screen-reader labels, accessible tables, colour never used alone (severity labelled).
- Responsive: 4K / ultra-wide / desktop / laptop / tablet / mobile. On mobile: cards
  first, optimized charts, fullscreen inspector.
- Performance: lazy loading, virtualized tables, memoized components/charts, code
  splitting, progressive + streaming rendering. Lighthouse ~90+.

## 10. Implementation Backlog (ordered)

### P0 — Foundation interaction (NEXT)
1. **Sound policy**: silence all 49 per-interaction `sound.play` calls (make hook `play()`
   a no-op); add a Web Audio **completion chime** fired only when a pipeline stage/run
   finishes (and sign-in success). TSX untouched → zero risk.
2. **Entry / Hero redesign (FE-003)**: dark-glass unified sign-in, floating glass stat
   chips, sequential flow-step activation with travelling energy spark, orbit/radar kept
   + particle drift, CTA glow. 
3. **Auto + Step-by-step pipeline**: pipeline-panel controls (Step / Auto / status) that
   exec the next pending stage via `workflow.execStage` (step) or run the remainder
   (auto), chime per completion, live stage glow/duration. Unlocks the guided demo.

### P1 — Every view live (finish wiring)
4. Overview: pipeline rail live states/durations, RUN ID, hero quality score (DONE).
5. Library: `datasets.length`, live issue badges, promoted model, empty state, real
   import trigger. 
6. Schema: live `liveSchema` fields + count (fallback `defaultFieldsByDomain`).
7. Quality: Metrics from `liveQualityMeta` + `qualityIssues.length` + baselineName +
   three-terminal layout (FE-007). 
8. Transform: live enabled steps/field counts + processing animation.
9. Models: WHY winner + rationale + per-model metrics + race animations (FE-010).
10. Anomalies: KPIs from `liveAnomalyMeta`, enriched tooltips, inspector live metrics,
    baseline/meta strings (FE-011 partial). 
11. Prediction: KPI 4,812 kWh → live totals; algorithm/MAPE/origin; unit cards (FE-012).
12. Recommendations: counts → `liveRecMeta`; card live values.
13. Reports: 7 anomalies → live; PDF via bearer blob download; live chapter counts.
14. InspectorDrawer + ActivityTerminal live values (partially done).

### P2 — Premium visuals
15. Baseline Generation view (heatmap 24×7, learning curve) from snapshot/hour_of_week.
16. Anomaly flagship: timeline + heatmap + device tree + compare mode.
17. Forecast: confidence band expansion, horizon selector hitting backend, scenario cards.
18. Recommendations: kanban columns, impact matrix, action simulator.
19. Reports: PDF-preview pages, chart gallery, export settings.
20. History replay + notifications center + global search (Ctrl+K) + command palette.

### P3 — Demo / polish
21. Guided Demo Mode (narrated auto-walk, Ctrl+D) + Presentation Mode.
22. World-class page transitions (view-in/glow/breadcrumb anim), chalk empty states,
    skeletons everywhere.
23. A11y + responsiveness + Lighthouse pass; final `pytest 106 / tsc 0 / build / CDP
    0 JS errors`; final commit.

---
*Written from the consolidated product prompts (EM-FE-MASTER-001, FE-001..019, analytics,
animation, integration, dataset-adaptation, production-refinement phases). Backend workflow
is frozen; everything here is frontend-only.*