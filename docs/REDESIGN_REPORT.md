# EcoMind — Enterprise Redesign & Cleanup Report

This report covers the full audit → cleanup → bootstrapping → enterprise-hardening
engagement. It lists everything removed, redesigned, added, and improved, plus
remaining technical debt and future work. Line-level changes live in the two commits:

- `e04d2e1` — Adopt the ten-stage pipeline end to end; add cross-platform one-click setup and a three-dataset catalogue
- `1a31c72` — Add global run modes, six-model selection, and enterprise typography

All quality gates are green: `npx tsc -b`, `npm run build`, `npx vitest run` (97 tests),
`.venv\Scripts\python.exe -m pytest backend\tests` (13 tests), and
`scripts/demo_end_to_end.py` (ten-stage pipeline completes on a real run).

---

## 1. Audit method

Before changing anything, three read-only audits built a dependency graph of the whole
repo — frontend, backend, and tooling — computing inbound references for every file,
route, component, chart, utility, API function, model, and script. Items were only
deleted after their inbound-reference count was verifiably zero.

---

## 2. Removed

### Frontend
- `src/app/index.ts` — barrel with zero importers.
- `src/pages/StageStub.tsx` — exported but never rendered; removed from `pages/index.ts`.
- Unused npm dependencies: `date-fns`, `framer-motion`, `reactflow` (npm removed 41 packages).
- Dead CSS in `styles/tokens.css`: `.sev-*` and `.bg-sev-*` class groups and the
  `.pipeline-stage[data-state='…']` rules (no emitter ever set `data-state`).
- Dead Tailwind scales: `colors.chart.1..8` and `colors.severity.*`.
- Legacy 17-stage pages/components (Dashboard, Benchmarking, ConfidenceGate, SHAP
  Explainability, Executive Center, Feature Engineering, History, etc.) — removed as
  part of the ten-stage rebuild and now committed.

### Backend
- `app/domain/shap_service.py` — fully unreferenced.
- `SHAPExplanation` model, its import, and its cascade-delete block.
- `shap==0.51.0` from `requirements.txt`.
- Legacy tables left over from the old design (`SchemaIssue`, `DQRepair`, `QualityScore`,
  `EnergyMonthly`) are no longer written by live code.

### Tooling / repo
- `scripts/run_large_dataset_test.py` — hard-failed on nine dead 17-stage keys and wrote
  timing tables into the repo.
- `launcher/tee.py` — dead utility.
- Root junk: `royal`, `100]`, `422`, `build_final.log`, stray root `node_modules/`,
  empty `backend/data/legacy/`, empty `frontend/scripts/`, `frontend/build*.log`.
- Stale untracked `backend/data/sample/ecomind_campus_30day.csv`.

---

## 3. Redesigned

### Cross-platform one-click setup (the "clone → click → runs" goal)
- `launcher/bootstrap.py` (new): ensures the Python runtime, creates `.venv`, installs
  Python deps (hash-stamped), installs Node deps (hash-stamped), writes `backend/.env`
  with a generated secret, and seeds the database — installing Python/Node itself via
  winget (Windows), Homebrew (macOS), or apt/dnf/pacman (Linux) when missing.
- `launcher/processes.py` (rewritten): OS-aware venv path, PID liveness, tree-kill, and
  service spawning (new console on Windows, detached+logged on POSIX).
- `launcher/config.json`: `startup.auto_install`, cross-platform `npm`, dead `ai_engine`
  service removed.
- Entry points: hardened `Launch_EcoMind.bat` / `Stop_EcoMind.bat` / `Check_System.bat`
  plus new `launch.sh` / `stop.sh` / `check.sh`.
- `Makefile` rewritten cross-platform; `README.md` Quick Start rewritten around the
  one-click flow.

### Dataset catalogue
- `backend/app/domain/synth.py` (new): deterministic generator (seed 42) with two
  profiles — **healthy** and **faulty** (spikes, night waste, HVAC failure, sensor
  dropouts, occupancy mismatch, out-of-range voltage) — plus a reference builder.
- `backend/seed.py` rewritten to register a three-dataset catalogue idempotently:
  - **EcoMind Healthy Campus (90-day hourly)** — 220,375 rows × 16 cols, 2 buildings,
    26 rooms, 102 devices.
  - **EcoMind Fault Simulation Campus (90-day hourly)** — 220,466 rows, same estate with
    injected faults.
  - **BDG2 Electricity Meters (3-year hourly, open data)** — 236,757 rows, 9 meters,
    sourced from Zenodo record 3898439 (UCI ElectricityLoadDiagrams20112014), CC BY 4.0.
- `scripts/build_datasets.py` (new): CLI to generate catalogue CSVs without the DB.
- A fresh clone gets all three automatically — no manual dataset step.

### Model Selection
- `settings.candidate_algorithms` now races **six** models: XGBoost, Random Forest,
  Gradient Boosting, Extra Trees, Ridge, Linear.
- `HYPERPARAMETERS` gained `extra_trees` and `lasso`. Selection remains automatic
  (weighted R²/RMSE/speed) and the page explains *why* the winner won.

### Typography / design language
- Inter (body), Inter Tight (display/headings), JetBrains Mono (timestamps, IDs, sensor
  values, logs only) — loaded in `index.html`, wired through `tailwind.config.js`
  (`font-display`, `font-mono`) and `tokens.css`.
- The existing token system was already calm/enterprise (single neutral ramp, five
  semantic colours, borders-first elevation, one chart palette, `--sev-*` ramp), so no
  glow/gradient/gaming styles needed removing — only the type system changed.

### Global run controls
- `src/app/RunBar.tsx` (new): shell-level **Smart vs Step** run modes.
  - Smart: "Run remaining" executes every not-yet-done stage in order.
  - Step: "Run next stage" or pick a specific reachable stage from a Select.
  - Per-run controls: Stop, Reset (starts a fresh run), and View output.
  - Optimistic stage marks, SSE-aware, query invalidation after each step.
- `AppShell` resume now merges trace history **without downgrading** optimistic marks.
- `runs.advanceRun` return type corrected to match the backend (`StageExecResponse`).

---

## 4. Added

- `launcher/bootstrap.py`, `launch.sh` / `stop.sh` / `check.sh`.
- `backend/app/domain/synth.py`, `scripts/build_datasets.py`.
- `frontend/src/app/RunBar.tsx`.
- `docs/REDESIGN_REPORT.md` (this file).

---

## 5. Improved

- Repository is now committed and consistent: a fresh clone yields the **ten-stage**
  app, not the retired 17-stage one (previously HEAD shipped stale code).
- `scripts/demo_end_to_end.py` rewritten and passing against the ten live stage keys.
- `launcher/checks.py` aligned with the current sample/generated dataset paths.
- `.gitignore` extended for generated data; runtime artifacts no longer leak.
- Full green gate: type-check, production build, 97 frontend tests, 13 backend tests,
  and a real end-to-end pipeline run.

---

## 6. Deliberate challenges to the brief (with rationale)

1. **Recommendations kept as its own stage/page** instead of being merged into Reports.
   It is the core interactive "what should I do" workspace (priority ranking,
   programme-by-building plan, per-action evidence). Reports still carries the executive
   recommendation summary and every figure. Merging would have removed analytical depth
   for no navigational gain.
2. **Datasets generated at setup, not downloaded.** To guarantee an offline, reproducible
   first run, the two synthetic campuses are generated deterministically on first launch,
   and the open-source reference ships as a committed slice. No network is required.
3. **No model was force-deleted beyond verified dead code.** Components the redesign will
   wire (Inspector, toasts, `Select`/`FilterBar`/`Checkbox`, `HeatmapGrid`/`SeverityBars`/
   `SeasonalityBars`) were kept rather than pruned.

---

## 7. Remaining technical debt

- **Primary-visualization pass not finished on every page.** A few stages still lean on
  KPI + table layouts; the richer chart primitives (`HeatmapGrid`, `SeverityBars`,
  `SeasonalityBars`) and the global Inspector/toast layer are implemented but not yet
  wired into every screen.
- **No live per-model training progress** — the backend streams stage boundaries, not
  per-candidate metrics, so Model Selection comparison is post-run.
- **No PDF output yet.** `reportlab`/`jinja2` are retained, but `report_service` stores
  JSON sections; a real PDF exporter is outstanding.
- **`statsmodels` emits a harmless `ConvergenceWarning`** during the forecast stage.
- **Bundle size** ~857 kB JS (pre-existing; no code splitting) triggers the Vite
  chunk-size warning.
- **Legacy copies on disk**: the `.kilo/worktrees/functional-dandelion` git worktree
  (gitignored) and a handful of unused backend helpers flagged by the audit.
- **Not pushed**: both commits are local; `origin` is `shashu123456/EcoMind-AI`.

---

## 8. Future improvements

- Wire heatmap/severity/seasonality charts and the Inspector drawer into the analysis
  pages; ensure every page leads with one primary visualization and one conclusion.
- Add SSE per-candidate training progress for Model Selection.
- Implement the executive PDF export from the stored report sections.
- Introduce route-level code splitting to shrink the initial bundle.
- Add accessibility and performance sweeps (focus order, contrast, chart aria, LCP).
