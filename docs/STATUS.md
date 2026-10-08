# EcoMind-AI — Status

The single source of truth for what is built, what is not, what is verified,
what is broken, and what comes next. Everything else in the repo is code.

Legend: `[x]` done and verified · `[~]` done but unverified · `[ ]` not started.

---

## 1. The product in one paragraph

A facilities manager uploads an energy dataset and walks ten stages, in a
fixed order, from raw file to board-ready report: find the data, prove what it
contains, score its trustworthiness, reshape it, choose a model on measured
evidence, find what went wrong, project what happens next, price the fixes,
and assemble the paper. Each stage executes once and is recorded; every page
reads that stage's own recorded output, so no screen can disagree with what
actually ran. Every prediction carries its baseline version, its model
rationale and its audit trail.

---

## 2. Architecture (locked)

Ten stages — six preparation, four decision. Preparation must all complete
before any decision stage is reachable.

| # | Stage key | What it produces |
|---|-----------|------------------|
| 1 | `library` | Dataset catalogue with provenance, counts, defect rates |
| 2 | `import` | Estate census: buildings, floors, rooms, devices, date range |
| 3 | `schema` | Column types, roles, evidence for trusting each column |
| 4 | `quality` | Structural DQ score (5 dimensions, 8 rules), severity-scored |
| 5 | `transformation` | Normalise / encode / scale / aggregate / derive, before-after |
| 6 | `model_selection` | Candidate competition on one identical split + `selection_rationale` per candidate |
| 7 | `anomaly` | Z-score scan against each device's hour-of-week baseline (`baseline_version` recorded) |
| 8 | `forecast` | Hourly band + per-horizon outlook, hour-of-week naive baseline |
| 9 | `recommendation` | Prioritised actions with savings, payback, forecast basis |
| 10 | `report` | 12 sections assembled from recorded stage outputs |

Canonical definitions: `backend/app/workflow/stages.py` (keys, numbers,
phases, gating) and `backend/app/domain/*_service.py` (payloads). Both are
authoritative over any document.

Layout:

```
backend/     FastAPI + SQLAlchemy + pandas/sklearn domain services
frontend/    Vite + React SPA (client/src), pnpm, builds to frontend/dist
launcher/    The one start path: bootstrap, checks, spawn, stop, monitor
ecomind.bat  Windows entry (start | stop | check | verify)
ecomind.sh   macOS / Linux entry (same commands)
docs/        STATUS.md (this file) + IEEE paper + research assets
```

The backend serves the built SPA from `frontend/dist/` at
`http://127.0.0.1:8000` — one port, one process. The vite dev server
(`pnpm dev:static`, port 5173) is optional and only for HMR work.

---

## 3. Done and verified

### 3.1 Backend — complete (106 tests, green)
- [x] Ten stage services; runner contract `{output, confidence, decision, trace_extra}`.
- [x] Positional gate returns 409 listing prerequisite stages; re-run allowed.
- [x] `GET /workflows/{run_id}/stages/{stage_key}` — single read path per stage.
- [x] SSE stream with 60-second single-purpose stream tokens (never session JWTs).
- [x] Auth: register/login/me, bcrypt cost 12, JWT 24 h, all dataset routes authed.
- [x] Adaptive baselines: statistics + 168-cell hour-of-week + per-device +
      trend + seasonality + operational patterns, versioned snapshots with
      history, `ArtifactVersion` ledger (monotonic per dataset/kind/scope).
- [x] Model competition persists `selection_rationale` on every ranked candidate.
- [x] Anomaly stage records `baseline_version` + `baseline_snapshot_generated_at`.
- [x] Forecast chart data built from stored snapshots (hour-of-week medians).
- [x] `GET /api/v1/activity` — audit log feed; audit events written by
      baseline / recommend / report stages.
- [x] Structural-only DQ: outlier rules removed (outliers belong to the anomaly stage).
- [x] Full 10-stage E2E via REST verified live (run `50e930f9…`, BDG2 dataset,
      236,757 rows: DQ 100/100, Linear Regression won with rationale,
      5,541 anomalies on 9 devices, 3.44 GWh/30 d forecast, 34 recommendations,
      12 report sections).
- [x] `pytest backend` = **106 passed**.

### 3.2 Frontend — wired to live data
- [x] Single shell: `frontend/client/src/components/shell/AppShell.tsx`, 14 views.
- [x] Real auth: sign-in calls `/auth/login` with automatic register fallback.
- [x] `client/src/lib/workspace.ts` — live-data loader maps REST payloads
      (datasets, stage traces, anomalies, anomaly chart, forecast chart,
      activity) into every view; `runPipeline()` executes all ten stages.
- [x] Session restore via token; first sign-in with no completed run
      auto-starts the pipeline with progress toasts.
- [x] All views read live data: overview, library, import, schema, quality,
      transform, models, anomalies, prediction, recommendations, reports,
      history, activity terminal, inspector drawer.
- [x] `npx tsc --noEmit` = 0 errors · `pnpm build:static` = green ·
      CDP browser run: sign-in → live data → navigation, **0 JS errors**.

### 3.3 Launcher — one entry
- [x] `ecomind.bat` / `ecomind.sh` dispatch to `python -m launcher.start`
      (start | stop | check | verify). Everything real lives in `launcher/`.
- [x] Bootstrap: installs Python/Node if missing, creates `.venv`, installs
      backend requirements, runs `pnpm install --ignore-scripts` when a
      pnpm lockfile is present (npm fallback), writes `.env` with a random
      secret, seeds the database — all idempotent.
- [x] `python -m launcher.start --check` = ALL PASS on this machine.
- [x] Fresh-clone bootstrap proven green in CI (`./ecomind.sh verify` job).

---

## 4. Broken / known issues (fix next)

- [ ] **CI is stale.** `.github/workflows/ci.yml` still uses `npm ci` +
      `frontend/package-lock.json`, `eslint`, `vitest`, `npx tsc -b` and the
      deleted `frontend/src/` tree. Rewrite for pnpm + `tsc --noEmit` +
      `pnpm build:static` (drop lint/vitest steps — no configs exist).
- [ ] **Makefile is stale.** References `npm run dev` (frontend is pnpm,
      `dev:static`), `npx tsc -b`, `Launch_EcoMind.bat` (does not exist).
- [ ] **Dead package.json scripts**: `dev`, `build`, `start` (target the
      deleted `server/` express app), `test`, `db:push`, `db:migrate`
      (drizzle removed). Keep `dev:static`, `build:static`, `check`, `format`.
- [ ] **README** still documents `frontend/src/`, npm, port 5173 as the
      primary URL, and `docs/archive/` — needs rewrite (in progress).
- [ ] Frontend chunk 937 kB > any sane budget — code-split the entry.

## 5. Remaining work (the plan)

### 5.1 Cleanup (in progress)
- [x] Remove junk: `.kilo/`, `logs/`, `.freebuff/`, `Historical/`, `Schema/`,
      manuscript leftovers, LaTeX build artifacts.
- [x] Docs collapsed to this file + README + IEEE paper/research.
- [x] Remove duplicate/dead frontend trees (`frontend/src/`, `frontend-complete-correct/`,
      `drizzle/`, `server/`).
- [ ] Fix Makefile + CI + dead npm scripts (see §4).
- [ ] Rewrite README (proper quick start, current structure, credentials).
- [ ] Commit cleaned tree locally.

### 5.2 Fresh-clone reliability
- [ ] Simulate: `git clone` → `ecomind.bat start` → zero errors, login works.
- [ ] Fix whatever that shakes out (the user-reported clone/start errors).

### 5.3 Frontend elite pass (the big one)
- [ ] Fix editor "red" diagnostics until `tsc --noEmit` and the editor agree on 0.
- [ ] Remove every leftover mock/placeholder so each view is 100% live data.
- [ ] Show the backend process throughout: 10-stage pipeline visual with real
      per-stage timings/decisions, model competition table with rationales,
      baseline version badges, anomaly/forecast detail with the numbers that
      matter, activity/audit feed.
- [ ] Visual upgrade so the app presents the project, not a generic dashboard.

### 5.4 Verification + ship
- [ ] pytest 106 · tsc 0 · build green · CDP run 0 JS errors · screenshots.
- [ ] Final local commit.

---

## 6. Open questions a reader should not have to guess

1. **Why is the quality score not 100 when the data looks clean?** Because a
   critical rule passes only with zero violations; the score is earned, not
   clamped.
2. **Why did the selected model differ between runs?** Candidates can sit
   inside the near-tie threshold; the tie-break is documented in the
   `selection_rationale` and prefers the faster model.
3. **Why thousands of anomalies on a high-quality dataset?** Anomaly detection
   measures waste against a baseline, not data quality. Clean telemetry and
   wasteful equipment coexist.
4. **Why is there no hierarchy endpoint?** Dataset rows carry counts, not code
   lists. Codes live in the stage payloads that use them. Inventing an
   endpoint from counts would be a guess.

---

## 7. How to run

```powershell
# One click (installs anything missing, seeds, starts, opens the browser)
.\ecomind.bat            # then: \ecomind.bat stop | check | verify
```

Open **http://127.0.0.1:8000** and sign in with the seeded account
(`admin@ecomind.ai` / `admin123`) or register a new one.

```powershell
# Manual / development
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # in backend/
cd frontend; pnpm dev:static        # optional HMR on :5173, proxies /api to :8000

# Checks
cd backend; ..\.venv\Scripts\python.exe -m pytest -q
cd frontend; npx tsc --noEmit; pnpm build:static
```
