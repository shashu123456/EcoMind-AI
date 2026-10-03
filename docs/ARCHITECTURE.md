# EcoMind AI — Architecture

The authoritative companion to this document is `docs/STATUS.md` (what is built
and verified) and `docs/API_CONTRACT.md` (the wire contract). Superseded
planning documents are archived under `docs/archive/` and describe the deleted
17-stage architecture; they are history, not specification.

## The shape of the system

One idea holds the system together: **a stage is executed once and recorded;
every screen reads the stage's own recorded output.** There are no per-stage
REST resources that recompute anything. The frontend never derives a number
that the backend did not measure, so two views of one run cannot disagree.

## Ten stages

```
preparation ────────────────────────────────────────────────┐
 1 library      browse datasets, start a run                │
 2 import       census: rows, columns, devices, provenance  │
 3 schema       every column, its type and its role         │
 4 quality      scored rules across five dimensions         │
 5 transformation  five steps, field-level before / after   │
 6 model_selection five candidates, identical split         │
decision ───────────────────────────────────────────────────┤
 7 anomaly      excess vs each device's own hour-of-week    │
 8 forecast     short tier (recursive) + long tier          │
 9 recommendation prioritised actions, programme roll-up    │
10 report       12 sections, assembled from snapshots       │
└───────────────────────────────────────────────────────────┘
```

Six preparation stages must all pass before any decision stage is reachable
(positional gate). Re-running any stage is always allowed. The stage keys and
phases live in `backend/app/workflow/stages.py` and are the single source of
truth for the frontend's `lib/journey.ts`.

## Runtime

- Backend: `uvicorn app.main:app --host 127.0.0.1 --port 8000` (from `backend/`)
- Frontend: `npx vite --host 127.0.0.1 --port 5173` (from `frontend/`, proxies
  `/api` → `:8000`)
- DB: SQLite (`backend/data/`), WAL

The Python virtualenv lives at the **repository root** (`.venv/`), not
`backend/.venv/`.

## Backend layout

```
backend/app/
  main.py            app factory, CORS, mounts the routers
  core/              config, security (JWT), storage
  db/                base.py (engine/session), models.py (all tables)
  routes/            auth, datasets, health, workflow
  domain/            one service per stage + shared helpers
                     (data, framing, hierarchy, snapshots, tariff,
                      stage_runners, stage output readers)
  workflow/          stages.py (keys, order, gating), events.py (SSE bus)
```

A stage service exposes a runner registered through
`workflow/stages.register_stage_runner`, with the uniform contract
`{output, confidence, decision, trace_extra}`. The route layer never reaches
into a stage's internals; it executes a runner and records the trace.

## Frontend layout

```
frontend/src/
  app/               AppShell, PhaseNav, RouteGuard, PageFrame, StageGate
  pages/             one page per stage + Library, Login, Status
  router.tsx         routes; stage paths sourced from journey.ts
  lib/
    journey.ts       stage registry + zustand store (persisted)
    api/             client, auth, health, datasets, runs, types
    stageOutput.ts   the single stage-output read hook
    ui/              Button, Surface, Kpi, Badge, Progress, Feedback,
                     DataGrid, DetailDrawer, Controls, Stepper, Toast
    charts/          TrendChart, HeatmapGrid, BarCompare, RankedBars,
                     ForecastBand, DemandCurve, PipelineFlow, ...
    format.ts        number / currency / date formatting (en-IN)
    ActiveDatasetContext.tsx
```

`lib/api/` contains only modules that describe real routes. The old
`quality.ts`, `preparation.ts` and `analytics.ts` modules called per-stage REST
resources that the ten-stage backend does not expose, and were deleted.

## Reading a stage from the frontend

Every stage page uses `useStageOutput<T>(stageKey)` and renders inside
`<StageGate>`. The hook reads
`GET /workflows/{run_id}/stages/{stage_key}`; a `404` means the stage has not
been run yet (the ordinary opening state of every page) and is handled as an
invitation to run it, not an error.

## Data honesty rules encoded in the code

- The report builder refuses to emit model metrics (`r2`, `rmse`, `mae`, `shap`,
  `benchmark`, `confidence_gate`, feature importance). A board paper that prints
  an R² reads as a building rating.
- A data-quality rule tagged `critical` passes only with zero violations,
  regardless of its rounded score.
- The monotonicity check reads each device series independently; the
  long-format campus export repeats every hour once per device.
- The `floor_no` identifier survives the CSV round-trip as text, via a dtype
  sidecar written next to the processed file.
- Missing figures print "not reported" / "could not be determined", never a zero
  that would read as a measurement.
