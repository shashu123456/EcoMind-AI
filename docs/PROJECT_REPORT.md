# EcoMind AI — Complete Project Report

**Adaptive Explainable Energy Intelligence Platform**
Written for a reviewer, a professor, or an engineer who needs to understand the whole system in one
pass: what the backend is, what the frontend is, how a dataset becomes a decision, and what is
verified versus still open.

**Date:** 2026-10-08 · **Branch:** `main` · **Frontend:** verified `tsc` 0 errors, `pnpm build:static`
exit 0 · **Backend:** running on `127.0.0.1:8000`, health `ok`.

Companion documents: [`README`](../README.md) · [`STATUS.md`](STATUS.md) (backend truth) ·
[`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) · [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) ·
[`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) · [`CHANGELOG.md`](CHANGELOG.md) ·
[`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md).

---

## 1. What the product is

EcoMind turns a raw energy telemetry file into an explainable chain of decisions. One upload starts a
fixed eleven-stage pipeline. Every stage records what it did, and the interface shows only what was
recorded — no sample rows, no invented numbers, no placeholder charts. When a stage has not run, the
screen says so.

**The claim it makes to a reviewer:** every number on screen can be traced back to a signed stage
output, and the whole chain is inspectable without reading the source.

---

## 2. System shape

```
┌──────────────────────────── browser ────────────────────────────┐
│  React 19 SPA  (frontend/dist, served by FastAPI on :8000)      │
│  ── one shell, 16 views, module-level live state in AppShell    │
│  ── lib/api.ts  ── typed fetch client, bearer token             │
│  ── lib/workspace.ts ── loads every recorded stage output       │
│  ── lib/units.ts, lib/schema.ts ── derived units + field roles  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST /api/v1  (JSON + multipart + PDF)
┌───────────────────────────────▼─────────────────────────────────┐
│  FastAPI  (backend/app)                                         │
│  routes/   10 modules, 37 endpoints                             │
│  workflow/ stages.py, events.py  ← the locked eleven-stage graph│
│  domain/   23 services (schema, dq, transform, baseline, models,│
│            anomaly, forecast, recommend, report, tariff, synth…)│
│  db/       SQLAlchemy + SQLite + pandas/sklearn/xgboost         │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Size |
|---|---|---|
| Backend | FastAPI, SQLAlchemy, SQLite, pandas, NumPy, scikit-learn, XGBoost, statsmodels | 57 Python files |
| Domain services | schema, quality (structural + enhanced), transformation, adaptive baseline, model competition, anomaly, forecast, recommendations, PDF/HTML report, tariff, hierarchy, synthesis | 23 modules |
| API | 10 route modules, 37 endpoints | `activity`, `auth`, `baseline`, `datasets`, `dq`, `health`, `model_competition`, `schema`, `workflow` |
| Frontend | React 19, TypeScript 5.9, Vite 7, Tailwind 4, Recharts, lucide-react | 69 TS/TSX files |
| Frontend entry | `AppShell.tsx` 4,651 lines · `workspace.ts` 1,031 lines | the single shell + all mappers |
| Package manager | pnpm 10.18.0 | — |
| Deployment shape | one process, one port: FastAPI serves the built SPA from `frontend/dist` | no CORS surface |

---

## 3. The locked pipeline, stage by stage

Eleven stages in a fixed order. Order, gating, contracts and business logic are **frozen**.

| # | Stage key | What the backend does | What the frontend shows |
|---|---|---|---|
| 1 | `library` | Lists analysed datasets with row counts, status, freshness | Dataset library with domain classification, per-dataset **Preview rows** and **Export CSV**, filter counts |
| 2 | `import` | Accepts multipart CSV/Parquet/JSON, creates an immutable version | Real upload dropzone with progress, error banner, scan steps carrying the recorded row/column counts |
| 3 | `schema` | Infers column data types, semantic type, nullability, samples | Column table with derived **unit**, derived **role**, plus an animated understanding map (dataset → signal families → roles) |
| 4 | `quality` | Structural repair only: nulls, timestamps, duplicates, dtypes, units, schema shape, invalid categoricals | Overall rule-outcome band and DQ score first, then the filter and the three-panel source / context / version view |
| 5 | `transformation` | Records every step it ran with `purpose`, `affected_columns`, `rows_changed` and per-column `before → after` | The recorded steps with expandable per-column evidence (no toggles, no fabricated steps) |
| 6 | adaptive baseline | Computes this dataset's own normal profile: statistics (mean/median/std/p25/p75/p95/min/max) and an `hour_of_week` learned table | Baseline dataset preview: identity (target, unit, rows, entity column, generated at) + statistics + 7×24 hour-of-week heatmap |
| 7 | `model_selection` | Races candidate models (linear, ridge, random forest, gradient boosting, extra trees, XGBoost) and records metrics plus a written `selection_rationale` | Winner card with R², MAE in the **modelled target's unit**, train/test split, the backend rationale, and the full leaderboard |
| 8 | `anomaly` | Compares the current data against the generated baseline; records total, severity split, detected classes, devices affected, detection rate, threshold, excess cost and CO₂ | Anomaly chart with the live threshold reference line, severity + class breakdown, and the evidence queue with an inspector |
| 9 | `forecast` | Projects the horizon with the winning model and backtests it (`mape_backtest`) | Forecast chart with confidence band, contribution factors from real model weights, day-by-day table, business-impact panel |
| 10 | `recommendation` | Generates ranked actions with savings, cost, CO₂, priority and confidence | Recommendation cards with recomputed confidence rings, evidence and impact |
| 11 | `report` | Assembles the executive report and renders the PDF | Report builder with live section counts, timestamps, baseline version, and a bearer-authenticated PDF download |

**Baseline rule enforced by design:** the baseline is generated per dataset. There is no global or
downloaded baseline anywhere in the system, and the UI labels the baseline with the number of rows it
learned from when no version number was written.

---

## 4. How a dataset becomes a decision (one real trace)

Verified on the recorded run for **BDG2 Electricity Meters (3-year hourly, open data)**,
236,757 rows × 24 columns:

| Stage | Recorded result |
|---|---|
| library | dataset registered, 236,757 rows |
| import | 2.10 s — immutable version created |
| schema | 2.12 s — **14 columns** with types, nullability and samples |
| quality | DQ score **100 / 100**, zero structural defects on the active run |
| transformation | recorded steps with per-column before → after evidence (normalisation, encoding, …) |
| adaptive baseline | 235,574 readings, mean 479.88, median 248, p95 1,643, target `energy_kwh`, unit `kWh`, plus a 168-cell hour-of-week profile |
| model_selection | winner `ridge`, candidates raced with R² and MAE recorded; MAE shown in **kWh** |
| anomaly | thousands of anomalies with severity split, detected classes, threshold and excess cost |
| forecast | horizon with `mape_backtest` and a confidence interval |
| recommendation | ranked actions with INR savings and kgCO₂ avoided |
| report | executive sections + downloadable PDF (`report.pdf → 200`) |

**Data quality is not anomaly detection.** Quality repairs integrity only. High load, spikes and
abnormal behaviour are explicitly excluded from stage 4 and belong to stage 8 — the UI states this
on the quality page itself.

---

## 5. API surface

All routes are under `/api/v1`. Bearer JWT from `POST /auth/login`.

| Module | Representative endpoints |
|---|---|
| `health` | `GET /health` |
| `auth` | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` |
| `datasets` | `GET/POST /datasets`, `GET/DELETE /datasets/{id}`, `POST /datasets/{id}/refresh`, `GET /datasets/{id}/preview` |
| `schema` | `GET /datasets/{id}/schema`, `POST /datasets/{id}/schema/discover` |
| `dq` | `GET /datasets/{id}/dq`, `POST /datasets/{id}/dq/run` |
| `baseline` | `GET/POST /datasets/{id}/baseline`, `GET /datasets/{id}/baseline/versions` |
| `model_competition` | dataset-scoped candidate metrics and selection |
| `workflow` | `POST /workflows/start`, `GET /workflows`, `GET /workflows/{id}`, `GET /workflows/{id}/stages/{key}`, `POST /workflows/{id}/stages/{key}/exec`, `POST /workflows/{id}/advance`, `POST /workflows/{id}/abort`, report PDF |
| `activity` | `GET /activity` — the event feed behind the activity terminal |

**Unit contract.** The backend records the *column* it modelled (`energy_kwh`) and, in the baseline
record, its `unit` (`kWh`). It does not record a display unit for model error. The frontend therefore
owns formatting only: `lib/units.ts` maps a column token to one unit, and no view holds a unit literal.

**Schema contract.** The backend records column names, types and a semantic type. It does not ship a
field catalogue. `lib/schema.ts` derives role (`index` / `entity` / `context` / `target` / `signal`)
and signal family (hvac, chiller, cold chain, it load, …) from the real column name, and falls back to
`signal` with no unit when it cannot tell. An honest blank beats a plausible guess.

---

## 6. Frontend structure and behaviour

- **One shell.** `AppShell.tsx` holds the topbar, sidebar, context strip, pipeline rail, all sixteen
  views, the activity terminal, the evidence inspector and the sign-in screen.
- **Sixteen views:** Mission control, Dataset library, Import, Schema discovery, Data quality,
  Transformation, Model competition, Anomaly detection, Prediction, Recommendations, Reports,
  Run history, Notifications, Workspace settings, plus the sign-in entry and the evidence inspector.
- **Live state** is a module-level set of `live*` bindings (`liveStages`, `liveCompetition`,
  `liveBaseline`, `liveTransform`, …) filled by `loadWorkspace()` and `applyWorkspace()`.
- **Pipeline control.** The pipeline never starts by itself. When a run is staged the rail offers
  **Step** (one stage) and **Auto** (the remaining stages). Auto walks the pages in pipeline order as
  each stage completes, so a demonstration follows the data.
- **Context strip honesty.** `BASELINE`, `MODEL` and `STAGES` render an explicit pending label until
  the stage that produces them has actually recorded output.
- **Identity.** The topbar name, initials and role come from `GET /auth/me` — never hardcoded.
- **Empty states** exist for library, schema fields, quality rows, model list, anomaly queue,
  recommendation list, forecast factors, activity terminal and the baseline preview.

### Verified in the browser this session

| Check | Result |
|---|---|
| Sign in with the seeded account | succeeds, topbar shows the real `full_name` and derived initials |
| Context strip before a run | `awaiting stage 06` / `awaiting stage 07` / `not started` |
| Context strip after the recorded run | real baseline label, `ridge`, `10 / 10 complete` |
| Dataset library | 4 datasets, 4 Preview/Open action rows |
| Dataset preview | 100 real rows, per-column units (kWh, kW, V, A, ratio, °C, %RH, people) |
| Identity | `Admin User` / `AU` from `/auth/me` (no hardcoded name remains) |
| JS exceptions | 0 |

---

## 7. Repository layout

```
EcoMind-AI-main/
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app, static SPA mount
│   │   ├── routes/                 10 modules · 37 endpoints
│   │   ├── domain/                 23 services (schema → report)
│   │   ├── workflow/               stages.py (locked graph) · events.py
│   │   ├── db/                     SQLAlchemy models + session
│   │   └── core/                   config, security
│   └── seed.py                     seeded admin workspace
├── frontend/
│   ├── client/src/
│   │   ├── components/shell/       AppShell.tsx + AppShell.css (design system + views)
│   │   ├── lib/                    api.ts · workspace.ts · units.ts · schema.ts · useSound.ts
│   │   ├── contexts/ hooks/ styles/ types/
│   │   └── main.tsx App.tsx index.css
│   ├── vite.config.ts              react + tailwind, vendor chunks, build stamp
│   └── package.json                pnpm scripts: dev:static · build:static · check
├── docs/                           this report + audit, roadmap, decisions, changelog, status
├── scripts/                        dataset generators, installers, end-to-end demo
├── launcher/ · ecomind.bat · ecomind.sh · Makefile
└── pyproject.toml · pytest.ini
```

---

## 8. How to run it

```bash
# Backend + SPA on one port
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
curl -s http://127.0.0.1:8000/api/v1/health

# Frontend
cd frontend
pnpm install
npx tsc --noEmit          # 0 errors
pnpm build:static         # writes ../dist, which the API serves
# open http://127.0.0.1:8000  ·  admin@ecomind.ai / admin123
```

---

## 9. Honest status: verified, open, and known gaps

**Verified**

- Typecheck 0 errors, production build exit 0 (app 483.85 kB / 143.76 kB gzip, charts 403.49 kB,
  CSS 226.09 kB).
- Backend health `ok`; sign-in, datasets, schema, baseline, workflow, anomaly, forecast, report PDF
  and activity endpoints all return 200 through the UI.
- Units are derived, never guessed; the model error card reads `kWh` for an `energy_kwh` target.
- No mock arrays, no placeholder field catalogue, no hardcoded identity, no fake SSO control.

**Open (scheduled, not done)**

| Item | Where |
|---|---|
| **331 workflow runs recorded, most orphaned/failed** — the library and history are noisy and `/workflows` is heavy. Needs a prune/retention tool. | new |
| Sample datasets for the eight industries in `/sample-datasets` | roadmap P7 |
| Split `AppShell.tsx`, lazy routes, store, memoisation, table virtualisation | roadmap P2 |
| Tokenised chart palette, published type scale, remaining mobile breakpoints | roadmap P3 |
| Chart cross-filtering, brush/zoom, data-table alternatives | roadmap P4 |
| Guided demo mode, presentation mode, SSE streaming, `Ctrl+K` search | roadmap P5 |
| Motion bound to backend events | roadmap P6 |
| `aria-live` terminal, inspector focus trap, contrast pass, Lighthouse | roadmap P8 |
| CI workflow, Makefile, README refresh, fresh-clone simulation | roadmap P9 |
| `pytest backend` not re-run in this session — `STATUS.md` claims 106 passing | must be re-verified |

---

## 10. How to present this (ten-minute demo script)

1. **Sign in** — the identity is real, the build stamp is real, no invented compliance badges.
2. **Dataset library** — four datasets, three domains detected. Open **Preview rows** on BDG2 and
   point at the units column: `energy_kwh → kWh`, `voltage_v → V`, `humidity_pct → %RH`. Export CSV.
3. **Import** — upload a file, then stop. Nothing runs. The pipeline is staged, not started.
4. **Auto** — press it. The app walks Library → Import → Schema → Quality → Transformation → Models →
   Anomalies → Prediction → Recommendations → Reports, one stage at a time, narrating each completion.
5. **Schema** — the animated map shows the dataset flowing into the signal families it actually
   contains, with role counts underneath.
6. **Quality** — the overall rule run comes first, then the filter narrows it. State clearly that
   outliers are *not* here; they belong to the anomaly stage.
7. **Transformation** — open a step and read the recorded before → after with its column list; then
   show the baseline dataset preview and hover the hour-of-week heatmap for exact medians.
8. **Models** — the leaderboard is a race with recorded metrics; the winner's rationale is the
   backend's own prose, and MAE carries the target's unit.
9. **Anomalies** — the threshold line is the recorded threshold; the breakdown is the recorded
   severity and class split.
10. **Prediction** — the horizon, the confidence band, the day-by-day table, and what the horizon is
    worth in ₹ and kgCO₂.
11. **Reports** — download the PDF with the bearer token; it is generated by the backend.

**The one sentence to land:** *nothing on this screen is a mock — every figure is a recorded stage
output, and where a stage has not run the interface says so instead of inventing a number.*

---

## 11. Improvement ideas, ranked by impact

**Presentation-critical**

1. **Prune the 331 orphan runs** — biggest single credibility risk today: a reviewer opening Run
   history sees hundreds of failed runs.
2. **Guided demo mode (`Ctrl+D`)** — one keystroke that runs the pipeline, walks the pages and
   narrates. Nothing else raises the perceived quality as much in a live demo.
3. **Presentation mode** — hide the sidebar and terminal, enlarge KPIs and charts, fullscreen.
4. **Anomaly + Prediction as flagship dashboards** — cross-filtering (click a point → the timeline,
   inspector, device and forecast all react), brush/zoom, device heatmap, scenario comparison.

**High value**

5. **Chart palette tokenisation + published type scale** — one file to re-skin the whole product.
6. **Table virtualisation** on the anomaly queue and quality rows — the recorded runs are large.
7. **`Ctrl+K` command palette** over datasets, devices, anomalies, recommendations, reports, runs.
8. **SSE wiring** so the activity terminal streams instead of polling.
9. **Accessibility pass** — `aria-live` on the terminal, inspector focus trap, WCAG AA contrast on
   micro labels.
10. **Split the shell** into `views/*` with lazy routes — smaller first paint and a place to put tests.

**Longer bets**

11. **Explainable-by-default drill-down** on every number: click any figure to see the stage, the
    recorded inputs and the formula.
12. **Compare mode** — two datasets side by side, baseline vs baseline, model vs model.
13. **Portfolio view** — many sites, one ranked list of what to fix first.
14. **Forecast scenarios** — ask "what if occupancy drops 20%" and render the backend's answer.
15. **Public demo dataset** with a deliberately planted quality defect and a planted anomaly, so the
    pipeline has something to find without touching the generators' honesty.
