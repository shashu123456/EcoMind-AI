# EcoMind-AI — Status

The single source of truth for what is built, what is not, and what is verified.

Superseded planning documents live in `docs/archive/` and describe the deleted
17-stage architecture. They are kept for history and must not be used as
specifications. Documents that are still live: `docs/ARCHITECTURE.md`,
`docs/DESIGN_SYSTEM.md`, `docs/DESIGN_PLAN.md`, `docs/BUILD_LOG.md`.

Legend: `[x]` done and verified · `[~]` done but unverified · `[ ]` not started.

---

## 1. The product in one paragraph

A facilities manager uploads a campus energy dataset and walks ten stages, in a
fixed order, from raw file to board-ready report: find the data, prove what it
contains, score its trustworthiness, reshape it, choose a model on measured
evidence, find what went wrong, project what happens next, price the fixes,
and assemble the paper. Each stage is executed once and recorded; every page
reads the stage's own recorded output, so no screen can disagree with what
actually ran.

---

## 2. Architecture (locked)

Ten stages, six preparation and four decision. Preparation must all complete
before any decision stage is reachable.

| # | Stage key | Route | Phase |
|---|-----------|-------|-------|
| 1 | `library` | `/library` | preparation |
| 2 | `import` | `/import` | preparation |
| 3 | `schema` | `/schema` | preparation |
| 4 | `quality` | `/quality` | preparation |
| 5 | `transformation` | `/transformation` | preparation |
| 6 | `model_selection` | `/model-selection` | preparation |
| 7 | `anomaly` | `/anomalies` | decision |
| 8 | `forecast` | `/forecast` | decision |
| 9 | `recommendation` | `/recommendations` | decision |
| 10 | `report` | `/report` | decision |

**There are no per-stage REST endpoints.** Every stage reads its content from
its own trace snapshot via `GET /workflows/{run_id}/stages/{stage_key}`. This is
the rule that makes "two views of one run must not disagree" structurally true
rather than a convention. The only exceptions are the dataset-scoped reads
(`/datasets`, `/datasets/{id}/preview`, `/content`, `/schema`) and the
library page, which browses all datasets rather than one run.

Canonical backend definitions: `backend/app/workflow/stages.py` (keys, numbers,
phases, gating) and `backend/app/domain/*_service.py` (payloads). Both are
authoritative over any document.

---

## 3. Done and verified

### 3.1 Backend — complete
- [x] Ten stage services built: library, import, schema, quality, transformation,
      model_selection, anomaly, forecast, recommendation, report.
- [x] `app.main` imports cleanly; 28 routes; all 10 stage runners registered.
- [x] Runner contract uniform: `{output, confidence, decision, trace_extra}`.
- [x] Positional gate (`missing_prior_stages`) returns 409 with the list of
      stages that must run first; re-running any stage is always allowed.
- [x] `GET /workflows/{run_id}/stages/{stage_key}` — the single read path every
      stage page uses. Returns the newest trace for that stage, 404 if never run.
- [x] SSE `/workflows/{run_id}/stream` with `?token=`.
- [x] `GET /datasets` returns `{datasets: [...]}`; item carries 27 fields.
- [x] `GET /datasets/{id}/preview|content` → `{rows, columns, row_count,
      column_count, start, limit, returned}`.
- [x] `GET /datasets/{id}/schema` → `{columns}`.
- [x] 13 backend tests pass (`backend/tests/`).

### 3.1.1 Backend correctness fixes (all verified)
- [x] **Data quality score no longer inflated.** The five dimension weights
      summed to 1.25 and the total was clamped at 100, so any dataset above
      80/dimension reported a perfect score. Weights are now normalised inside
      `_aggregate`.
- [x] **Monotonicity check no longer a false accusation.** It read the whole
      timestamp column as one series; a long-format export repeats each hour
      once per device, so it scored ~3/100 on a perfectly ordered file. It now
      checks *per device series*.
- [x] **The device key is found, not assumed.** The check looked only for
      `asset_id` — the *processed* name — so on a raw export (which uses
      `device_code`) it silently fell through to the single-series branch and
      the identifier check never ran at all. It now looks for
      `device_code | asset_id | device_id | meter_id`. Its denominator is now
      the number of readings, not the number of series (which produced a
      negative, clamped-to-zero score).
- [x] **A critical rule can no longer pass with violations.** A rule tagged
      `critical` now passes only with zero violations, regardless of the
      rounded score. Previously it could show `100.0` and a pass badge beside
      378 physically impossible readings.
- [x] **`floor_no` is text, not a binary blob.** A CSV round-trip restored a
      numeric dtype, and a numpy int64 written into a SQL `String` column stored
      its eight little-endian bytes, corrupting 639 anomaly and 66
      recommendation rows. `save_processed` now writes a dtype sidecar that
      `read_processed` uses to pin identifier columns back to text.

### 3.2 Verified full-pipeline run
Run `d5164744-de7c-4c4b-9e29-850df8f72658` on dataset
`9b4714a5-a653-4296-974d-e751f3f45826` ("EcoMind Synthetic Campus (30-day
hourly)", 21,654 rows × 24 columns). All ten stages executed in order, no
failures.

| Stage | Time | Headline |
|-------|------|----------|
| library | 0.2s | 1 dataset |
| import | 0.5s | 21,654 rows, 24 cols, ready |
| schema | 0.5s | 14 columns, 0 warnings |
| quality | 0.7s | **99.8/100** — 8 rules, 1 critical failure (378 out-of-range readings) |
| transformation | 2.3s | 21,654 rows in/out, 10 derived features |
| model_selection | 16.0s | Gradient Boosting, weighted 0.850, R² 0.9294, **near-tie** with XGBoost at margin 0.004 |
| anomaly | 10.8s | 639 anomalies, 28 devices, 1,998.84 kWh / ₹480.51 excess |
| forecast | 21.3s | 78,359 kWh / ₹15,369 / 39.18 tCO₂ over 30d; backtest MAPE 30.72% |
| recommendation | 0.4s | 33 recommendations, 3 P1; programme ₹271/mo against ₹13,500 — **payback 49.7 months, not viable** |
| report | 0.2s | 12 sections, ready |

Dimension means on the smoke dataset: completeness 99.9 · consistency 99.8 ·
accuracy 99.3 · timeliness 100.0 · validity 100.0. The dataset's own
`defect_rate` is `0.0015`: the seed does inject defects (450 null cells, 378
out-of-range readings). The score is earned.

### 3.3 Frontend — complete
- [x] `npx tsc -b` exits 0. `npx vitest run` = **97 tests passing** in 4 files
      (`sseStatusPatch` 10, `request` 26, `journey` 25, `chartScale` 36).
- [x] `router.tsx` — 12 routes, stage paths sourced from `journey.ts`.
- [x] `PageFrame.tsx` — purpose → hero → conclusion → evidence. `PageHero`
      throws unless rendered in the `hero` slot.
- [x] `AppShell`, `PhaseNav`, `RouteGuard`, `NotFound`, `RouteError`.
- [x] `lib/journey.ts` — zustand store persisted to `ecomind_journey`, stage
      keys aligned to the backend (`schema`, `quality`, `anomaly`).
- [x] `lib/ui/` — 12 modules: Button, Surface, Kpi, Badge, Progress, Feedback,
      DataGrid, DetailDrawer, Controls, Stepper, Toast.
- [x] `lib/charts/` — chartBase, scale (36 tests), TrendChart, HeatmapGrid,
      plus BarCompare / RankedBars / ForecastBand / DemandCurve / PipelineFlow /
      SeverityBars / SeasonalityBars.
- [x] `lib/format.ts`, `lib/cn.ts`, `lib/theme.tsx`, `ActiveDatasetContext`.
- [x] `lib/api/` — rewritten to the real contract. Only the modules that
      describe real routes remain: `client`, `auth`, `health`, `datasets`,
      `runs`, `types`. `quality.ts` / `preparation.ts` / `analytics.ts` (which
      targeted the deleted 17-stage routes) are gone.
- [x] `lib/stageOutput.ts` + `app/StageGate.tsx` — the single read path and the
      run gate every page shares.
- [x] All ten stage pages built: Library, Import, Schema, DataQuality,
      Transformation, ModelSelection, Anomalies, Forecast, Recommendations,
      Report.
- [x] `LoginPage`, `StatusPage` are real.

---

## 4. Remaining work

### 4.1 Documentation
- [ ] Rewrite `docs/API_CONTRACT.md` for the ten-stage contract (the archived
      copy describes the deleted 17-stage architecture).
- [ ] Update `README.md` — run instructions, credentials, current scope.
- [ ] Update `docs/ARCHITECTURE.md` to the ten-stage flow.

### 4.2 Housekeeping
- [x] Deleted `backend/_t.py`, `_dbg.py`, `_rec.py`, `_chain.py`.
- [x] Freed 1.63 GB of dead artifacts (runaway joblib, legacy SQLite backup,
      processed CSVs).
- [x] Removed stale launcher PID files.
- [ ] `frontend/index.html` title is mojibake
      (`EcoMind?? Enterprise Energy Analytics Platform`); the same damage
      appears in `frontend/src/lib/charts/HeatmapGrid.tsx`'s default legend.

---

## 5. Open questions a reader should not have to guess

1. **Why is the quality score 99.8 and not 100?** Because the data is not
   perfect. Eight rules run; seven pass. The one that fails is the critical
   bounds check: 378 readings (0.35%) fall outside physical limits. Before the
   scoring fixes this dataset reported a clamped 100/100 — the score was broken,
   not the data.
2. **Why is the recommendation payback 49.7 months?** Because the largest
   single recovery is ₹49/month against a ₹4,500 intervention. The anomalies are
   real and correctly priced; they are simply too small to fund repairs at those
   costs. The report states this rather than burying it.
3. **Why did the selected model change between runs?** Gradient Boosting and
   XGBoost sit inside the near-tie threshold (margin 0.004–0.007). The tie-break
   is documented and prefers the faster model, not the more accurate one.
4. **Why 639 anomalies for a "high quality" dataset?** Anomaly detection is not
   a data-quality measure. Clean telemetry and wasteful equipment coexist.
5. **Why is the code list for buildings not on the dataset?** The dataset row
   carries counts, not code lists. The codes live in the stage payloads that
   use them (`anomaly.by_building`, `forecast.compare.rows`,
   `recommendation.programme.buildings`). There is deliberately no hierarchy
   endpoint; inventing one from the counts would be a guess.

---

## 6. How to run

Backend and frontend must both be detached or they die with the shell.

```powershell
# backend  (venv is at the REPO ROOT, not backend\.venv)
Start-Process -FilePath ".\.venv\Scripts\python.exe" `
  -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" `
  -WorkingDirectory ".\backend" -WindowStyle Hidden

# frontend
Start-Process cmd.exe -ArgumentList "/c","npx vite --host 127.0.0.1 --port 5173" `
  -WorkingDirectory ".\frontend" -WindowStyle Hidden
```

- Backend `http://127.0.0.1:8000` · frontend `http://127.0.0.1:5173`
- Vite proxies `/api` → `http://localhost:8000`
- Login `admin@ecomind.ai` / `admin123`
- Checks: `.\.venv\Scripts\python.exe -m pytest backend\tests` ·
  `cd frontend; npx tsc -b; npx vitest run`
