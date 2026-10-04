# EcoMind AI — Complete Project Handoff

**Snapshot date:** 2026-10-04 · **Branch:** `main` · **HEAD:** `13c1d53` · **Working tree:** dirty, nothing committed

Copy everything below into a fresh session to continue without re-deriving context.

---

## 1. What this project is

EcoMind AI is an energy-analytics platform. You load a metered consumption dataset, run it
through a ten-stage pipeline, and get back a forecast, an anomaly list, and an organisational
report with an action plan. It is a full-stack app: FastAPI + SQLite backend, React + Vite
frontend, launched with a one-click script on Windows or bash.

- **Backend:** Python, FastAPI, SQLAlchemy, pandas, scikit-learn, XGBoost, statsmodels
- **Frontend:** TypeScript, React 18, Vite, TanStack Router + Query, Recharts, Zustand, Tailwind
- **Size:** ~15,300 lines frontend · ~9,600 lines backend

---

## 2. Architecture

### Backend layout

```
backend/
  app/
    core/       config.py (pydantic-settings), security.py (JWT + bcrypt)
    db/         base.py, models.py (SQLAlchemy ORM)
    domain/     one service per stage + synth.py (data generator),
                tariff.py, snapshots.py, stage_runners.py, framing.py
    events/     event_bus.py (pub/sub for SSE)
    routes/     auth.py, datasets.py, dq.py, health.py, schema.py, workflow.py
    workflow/   stages.py (stage registry), events.py
  seed.py       generates demo datasets
  tests/        conftest.py, test_api.py, test_dataset_cascade.py
launcher/       Python package: bootstrap, spawn, start, stop, checks, config
scripts/        build_datasets.py, build_large_dataset.py,
                demo_end_to_end.py, find_python.sh
```

The `workflow` service owns all ten stages. Stages expose their output through
`/runs/{id}/stages/{key}`, which is what the frontend reads. A stage is never a page — it is
a key, a label, a path, and a runner.

### Frontend layout

```
frontend/src/
  app/       AppShell, Sidebar, TopBar, RunBar, RouteGuard, StageGate,
             CommandPalette, EventConsole, Inspector, Mark, PageFrame
  lib/
    api/     client.ts (fetch wrapper, SSE), runs.ts, datasets.ts, auth.ts, types.ts
    charts/  chartBase.tsx (ChartFrame, SERIES, axis/grid/tooltip tokens),
             TrendChart.tsx (TrendChart, BarCompare, RankedBars),
             HeatmapGrid.tsx (ForecastBand, DemandCurve, HeatmapGrid,
                              PipelineFlow, SeverityBars, SeasonalityBars),
             scale.ts (decimate, aggregateBy, niceDomain, ticks, …)
    ui/      Button, Badge, Kpi, Surface, Progress, Stepper, Toast,
             DataGrid, DetailDrawer, Feedback, Controls
    format.ts, journey.ts (stage definitions), nav.ts, stageOutput.ts,
    theme.tsx, workspace.tsx, qualityDetails.ts
  pages/     16 page components (5,553 lines)
  router.tsx, styles/tokens.css
```

### The two single-sources-of-truth

This is the most important thing to know before editing:

1. **`lib/journey.ts`** — every stage's key, label, phase, path, dependencies. The router
   reads paths from here so a URL is declared exactly once. `stageRoute()` in `router.tsx`
   throws at module load if router and journey disagree.
2. **`lib/nav.ts`** — the sidebar. Pure data, no rendering. `navItemLocked()` decides locking.

---

## 3. The ten stages

Nine have their own route. The tenth (recommendation) is deliberately a **tab of the report
page**, so the person who wants to know what to do is never navigated away from the document
that tells them.

| # | Key | Label | Phase | Path |
|---|-----|-------|-------|------|
| 1 | `library` | Dataset Library | preparation | `/library` |
| 2 | `import` | Import | preparation | `/import/$datasetId` |
| 3 | `schema` | Schema Discovery | preparation | `/schema/$datasetId` |
| 4 | `quality` | Data Quality | preparation | `/quality/$datasetId` |
| 5 | `transformation` | Transformation | preparation | `/transformation/$datasetId` |
| 6 | `model_selection` | Prediction | preparation | `/model-selection/$datasetId` |
| 7 | `anomaly` | Anomaly Detection | decision | `/anomalies/$datasetId` |
| 8 | `forecast` | Forecast | decision | `/forecast/$datasetId` |
| 9 | `recommendation` | Action plan | decision | `/report/$datasetId` **tab 3** |
| 10 | `report` | Organization Report | decision | `/report/$datasetId` |

`StageDef.tab?: 'action-plan'` was added for the merge. `stagePath()` emits
`/report/x#action-plan`; `stageForPath` skips tab-stages so a report URL resolves to `report`.

### API surface (all under `/api/v1`)

```
POST   /auth/register          GET /auth/me            POST /auth/login
GET    /datasets               POST /datasets/upload   GET /datasets/{id}
DELETE /datasets/{id}          GET /datasets/{id}/preview
GET    /datasets/{id}/content  POST /datasets/{id}/refresh
GET    /datasets/{id}/dq       POST /datasets/{id}/dq/run
GET    /datasets/{id}/schema   POST /datasets/{id}/schema/discover
POST   /workflow/start         GET  /workflow           GET /workflow/{run_id}
GET    /workflow/{id}/traces   POST /workflow/{id}/stages/{key}/exec
GET    /workflow/{id}/stages/{key}   POST /workflow/{id}/advance
GET    /workflow/{id}/stream         GET /health
```

`listRuns()` returns a bare `Run[]`, **not** `{ runs }`. That detail matters.

---

## 4. Everything changed in this redesign round

### 4a. Stage locking removed — the core request

You asked for no locked steps. Locking was removed from five places, deliberately not by
deleting the concept but by relocating it:

| File | Change |
|---|---|
| `app/RouteGuard.tsx` | Deleted the `isReachable` redirect and the `stage` prop. The `stage` param is now `string \| null` — kept for typing, no longer enforced. |
| `lib/nav.ts` | `navItemLocked()` now returns true for only **two** reasons: page not built, or no active dataset for a dataset-scoped route. |
| `app/Sidebar.tsx` | Lock icon removed. A status dot replaced it. |
| `app/StageGate.tsx` | `canRun` no longer requires prerequisites. Added an info Callout explaining what the stage depends on. |
| `app/RunBar.tsx` | `runnable` = all not-done stages, not just the sequential next one. |

**The reasoning**, which is written into the `nav.ts` doc comment so it survives: the pipeline
still refuses to *execute* anomaly detection before a model exists, and that refusal is real
and enforced server-side. Whether a person may *open* the anomaly page to look at what is
there is a different question. Sequencing now appears where it belongs — as an explanation on
the page and a disabled control in the run bar — instead of as a redirect that discards a URL
someone was sent.

`nav.test.ts` (9 tests) locks this behaviour in so it can't silently regress.

### 4b. Four new pages — zero unbuilt nav items

All 14 sidebar entries now have `built: true`. No "SOON" placeholders remain.

| Page | Path | What it does |
|---|---|---|
| `ExplorePage.tsx` (508 ln) | `/explore/$datasetId` | Six measures, trend lines, hour-of-week heatmap, raw grid |
| `ComparePage.tsx` (418 ln) | `/compare/$datasetId` | Mean-indexed overlay, size-gap warning, metric table |
| `DatasetDetailPage.tsx` (278 ln) | `/datasets/$datasetId` | Profile, provenance, trend |
| `RecentAnalysesPage.tsx` (230 ln) | `/analyses` | Run history with per-stage coverage bars |

These are **workspace pages**, not stages — they carry no `StageDef`, read the dataset
directly, and work whether or not any stage has run. `router.tsx` gained a `workspaceRoute()`
helper for them, distinct from `stageRoute()`.

### 4c. Recommendations merged into Report

`RecommendationsPage.tsx` **deleted**. The action plan is now tab 3 of `ReportPage.tsx`, fed by
a second `useStageOutput<RecommendationResult>('recommendation')` hook. Backend
`workflow/stages.py` label → "Action plan", route → `/report#action-plan`.
`docs/API_CONTRACT.md` and `docs/STATUS.md` updated to match.

### 4d. The chart-rendering bug class — `ChartFrame.empty`

**Root cause:** `ChartFrame`'s `empty` prop is a **replacement** for children, not an
overlay. Any component that passed a JSX element *unconditionally* shadowed its own chart
with the empty state. Five components had this:

`TrendChart`, `BarCompare`, `ForecastBand`, `DemandCurve`, `SeverityBars`, `SeasonalityBars`.

**Fix:** `empty={rows.length === 0 ? <EmptyState …/> : undefined}` — supply the node only
when there is genuinely nothing to draw. The contract is now documented on
`ChartFrameProps.empty` in `chartBase.tsx` so it can't recur.

Note: `DemandCurve` turned out to be **correct all along** — it renders an HTML `<table>`
heatmap (24h × 7d = 168 cells, background-fill coloured), not a recharts SVG. My first probe
searched for `svg.recharts-surface` and wrongly reported it missing. Don't "fix" it.

### 4e. Data-correctness bugs

- **`energy()` unit ladder** — divided by 1e3 at the kWh step, so 76,956 kWh rendered
  "76.96 kWh". Now kWh → MWh → GWh. 5 tests added.
- **`co2Kg()` added** — 6 sites were emitting tonnes where the field name said kg.
- **`streamRun` double-wrapped `streamUrl`** — produced `/api/v1/api/v1/...?token=..?token=..`
  → 404. Now `streamUrl` throws if given a pre-prefixed path.
- **`Run.stages_completed`** mistyped `number`; it is actually `string[]`. Corrected.
- **Explore "90 days" overclaim** — the endpoint is a row cap, not a window. Relabelled
  `SAMPLE_SIZES` with the real computed span.
- **Mojibake** — `' Â· 1 stage failed'` → `' · 1 stage failed'` in `HeatmapGrid.tsx`.

### 4f. Launcher made cross-platform

New shared `scripts/find_python.sh`, sourced by `launch.sh`, `stop.sh`, `check.sh`. It
checks **both** `.venv/Scripts/python.exe` and `.venv/bin/python` and validates the candidate
by *executing* it, not by existence. The three `.bat` files were rewritten the same way — they
used to trust `where py`, which returns a launcher that may not be a working Python.

`backend/app/core/config.py` now declares `env: str = "local"` and `extra="ignore"`, which
fixed a Pydantic settings failure on cold start.

### 4g. Design tokens

`--chart-1` … `--chart-8` exposed via the `SERIES` export in `chartBase.tsx`. Note the naming:
it is `--chart-N`, **not** `--series-N`. `int()` uses en-IN digit grouping (1,14,562).

---

## 5. Verification — all green as of this snapshot

| Check | Command | Result |
|---|---|---|
| Types | `cd frontend && ./node_modules/.bin/tsc -b` | **exit 0** |
| Frontend tests | `cd frontend && ./node_modules/.bin/vitest run` | **123 passed / 6 files** |
| Backend tests | `cd backend && ../.venv/Scripts/python.exe -m pytest -q` | **13 passed**, exit 0 |
| Format | `./node_modules/.bin/prettier --write "src/**/*.{ts,tsx,css}"` | clean |
| Build | `npm run build` | exit 0 — 891.93 kB / 257.81 kB gzip |
| Browser | manual pass over all pages | verified |

Test files: `chartScale` (36), `journey` (29), `request` (27), `format` (12),
`sseStatusPatch` (10), `nav` (9).

---

## 6. Environment gotchas — save yourself the pain

1. **Use `./node_modules/.bin/tsc -b` and `./node_modules/.bin/vitest run` from `frontend/`.**
   `npx tsc` resolves to a decoy stub that prints *"This is not the tsc command you are
   looking for"*, and `npx` from the repo root fails outright.
2. **The `edit` tool is unreliable for partial-file slices.** A Python slice of
   `ExplorePage.tsx` corrupted it — brace-balance still passed, only esbuild found the real
   error. Prefer whole-file `write_file`. **After any slice: run esbuild parse + tsc.**
3. **`ripgrep` is broken in this environment** (`ENOENT: vendored ripgrep not found`). Use
   `grep` via terminal instead of the `code_search` tool.
4. `HeatmapGrid.tsx` greps as a "binary file" — two NUL bytes are a **deliberate** `\x00`
   separator in a composite Map key. Not corruption. Use `grep -a`.
5. Backend `:8000`, Vite `:5173` (`strictPort`, proxies `/api` + `/ws`).
6. Demo creds `admin@ecomind.ai` / `admin123`. Fault Simulation dataset
   `b13c23f0-0666-4d1e-82b3-06d4b488935a`; a completed run
   `0af1984d-bba6-4705-b8a7-c3bd168f33f8` for browser testing.

---

## 7. Known limitations — real, not hedged

1. **Bundle is 892 kB and trips Vite's >500 kB warning.** Route-level code splitting is not
   done — all 15 routes bundle eagerly and Recharts dominates. This is the single largest
   outstanding engineering item.
2. **Seasonality chart shows only 3 bars** (2025-01…03) because the dataset spans ~3 months,
   but the empty-state copy says *"needs at least 12 months."* So you get a chart whose own
   framing admits it cannot support a 12-month extrapolation. Needs an explicit caveat on the
   frame itself.
3. **`session-ses_f09d.md`** is a stale untracked scratch file at repo root. Delete or
   gitignore it before committing.
4. **No linting is configured.** Prettier runs; there is no ESLint.
5. **No CI.** Nothing runs on push. The whole verification suite is manual.
6. **No route-level error boundaries** — `RouteError` exists at the router level but a crash
   inside a page still takes out that page wholesale.
7. **Nothing is committed.** 44 tracked files changed (22 staged, 32 with unstaged
   edits) and 9 untracked. All of section 4 is
   uncommitted work sitting in the working tree.

---

## 8. Recommended next steps, prioritised

### P1 — Commit what exists
The entire redesign is uncommitted. Review `git diff`, drop `session-ses_f09d.md`, and commit
in logical chunks: (a) launcher, (b) backend config + stages, (c) chart + format fixes,
(d) unlock, (e) new pages, (f) report merge. Then open a PR.

### P2 — Route-level code splitting
`React.lazy` every page in `router.tsx` behind the existing `stageRoute`/`workspaceRoute`
helpers. Target: under 400 kB initial. This is mostly mechanical and fixes the only build
warning in the project.

### P3 — Seasonality honesty
When span < 12 months, render the chart *with* a visible caveat rather than letting the
empty-state text contradict it. Same pattern as the "Read the band before the number" callout
already on the forecast page.

### P4 — Accessibility and interaction audit
No systematic keyboard/contrast/screen-reader pass has been done. There is a command palette
and a live console; both need real focus-management testing.

### P5 — ESLint + CI
Wire up ESLint and a GitHub Actions workflow running `tsc -b`, `vitest run`, `pytest`, and
`prettier --check` on every push. Prevents the entire class of regression above.

---

## 9. Where the other docs are

| File | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/API_CONTRACT.md` | Endpoint-by-endpoint contract (updated this round) |
| `docs/STATUS.md` | Current status (updated this round) |
| `docs/REDESIGN_REPORT.md` | The enterprise redesign write-up |
| `docs/DESIGN_SYSTEM.md` | Tokens, typography, components |
| `docs/DESIGN_PLAN.md` | Original design intent |
| `docs/BUILD_LOG.md` | Day-by-day build history |
| `docs/EcoMind_IEEE_Paper.tex` | IEEE paper source |
| `docs/archive/`, `docs/research/` | Superseded and research material |