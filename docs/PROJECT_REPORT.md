# EcoMind AI — Project Report

One document for the whole platform: what it is, how it is built, how a run works,
what has been verified, and what is deliberately left for later. This is the
authoritative operational brief; the README is the quick-start companion.

---

## 1. Purpose

EcoMind AI turns raw energy datasets into **trusted, explainable, actionable**
decisions through a transparent, end-to-end workflow. The product is not "the AI
says so"; it is "here is exactly what was recorded, by which stage, and how much
to trust it."

That means the platform is built around three honest constraints:

- Every prediction, recommendation and benchmark is **traceable** through a
  ten-stage pipeline.
- Users see not only *what* the system predicts, but *why*, and *how much to
  trust it*.
- No page can disagree with what actually ran, because every screen reads that
  stage's own recorded output.

The audience is facilities and operations teams in universities, hospitals,
offices, manufacturing, hotels, airports, malls and data centers — anyone who
has to make operating decisions from energy data and will not trust a number they
cannot trace.

---

## 2. What you get

A local, single-user platform that:

- understands a dataset before it models it (library, import, schema, data quality)
- turns it into model-ready signal (transformation)
- races candidate models on one identical split and lets the data choose (model selection)
- finds where and when energy is wasted, against each device's own baseline (anomalies)
- projects energy, spend and carbon over the window the dataset can express (forecast)
- turns insight into prioritized actions (recommendations)
- assembles the recorded story into an executive report (reports)

Preparation stages all pass before any decision stage is reachable.

The app is meant to be narrated by the run controls: **Run** executes the remaining
stages, **Step** executes one stage, **Stop** aborts the active run, and **New run**
starts fresh from stage 01. Those controls live on every page.

---

## 3. Architecture

The platform is three responsibilities, kept deliberately simple so a fresh clone
can become a running app with one command.

### Backend

`backend/` is FastAPI + SQLAlchemy, and it does four jobs:

- REST + SSE API on `/api/v1`
- JWT auth; every protected route requires `Authorization: Bearer`
- one service module per stage, plus the data, baseline and forecast logic
- serves the built SPA from `frontend/dist/` on **http://127.0.0.1:8000**

Key ideas:

- One service per stage. A stage is executed once and recorded; every screen reads
  that stage's own recorded output.
- The dataset is stored once as its uploaded CSV and never rewritten. Transformation
  and processing create derived artefacts; the source stays immutable.
- A versioned baseline ledger records the artefact newer stages build on, so a forecast
  or anomaly run can be traced to the baseline revision that produced it.
- Stream tokens for SSE are short-lived and single-purpose; ordinary session tokens
  are never sent to a stream endpoint.
- The built frontend is served by the same app, SPA-style with index.html fallback.

### Frontend

`frontend/client/src/` is the shell.

- React 19 + TypeScript, Vite, TanStack Query, Recharts, lucide icons
- pnpm; builds to `frontend/dist/`
- one large shell file owns layout, navigation and the pipeline rail; views and lib
  sit beside it

Key ideas:

- The app is viewport-locked; the main region is the only scroll container, and the
  sidebar scrolls internally.
- The run controls live in a bar under the topbar on every page.
- Charts render only recorded data. If the backend has not run a stage, the page does
  not invent one.
- Copy states what was recorded and by which stage. No invented thresholds, no fabricated
  progress.

### Launcher

`launcher/` plus `ecomind.bat` / `ecomind.sh` is the one start path. It handles
environment checks, dependency install, virtualenv, `.env` generation, DB seed, backend
start, health wait and browser open. That is what makes "from a bare clone" actually
mean that.

### Data

The dataset lives as its uploaded CSV. Derived artefacts live alongside it:

- `backend/data/generated/` — synthetic starter datasets
- `backend/data/processed/` — processed frames and their type sidecars
- `backend/data/reports/` — exported executive PDFs
- `backend/data/models/` — trained model artefacts
- `backend/data/ecomind.db` — the SQLite database

---

## 4. The ten stages

| # | Stage | What you get |
|---|-------|--------------|
| 1 | **Library** | Dataset library with provenance, row/column/device counts and defect rates |
| 2 | **Import** | Estate census: buildings, floors, rooms, devices, rows and date range |
| 3 | **Schema** | Every column, its detected type, the role it plays, and the evidence for trusting it |
| 4 | **Data Quality** | Structural rules across five dimensions, severity-scored; a critical rule passes only with zero violations |
| 5 | **Transformation** | Five steps (normalise, encode, scale, aggregate, derive) with field-level before/after |
| 6 | **Model Selection** | Candidates on one identical split, chosen on measured results — every candidate carries a written `selection_rationale`, near-ties stated |
| 7 | **Anomalies** | Where and when energy is wasted, measured against each device's own hour-of-week baseline — the baseline's version is recorded with every anomaly |
| 8 | **Forecast** | Hourly uncertainty band + per-horizon outlook, with the hour-of-week naive baseline for comparison |
| 9 | **Recommendations** | Prioritised actions with receipts, savings inventory, payback verdicts and a programme roll-up |
| 10 | **Report** | Twelve sections in locked order, assembled from the recorded stage outputs |

A stage is executed once and recorded. Adaptive baselines, artifact versions and audit
events are persisted and browsable.

---

## 5. How a run works

The important property is consistency, not speed: every screen reads the same recorded
object the run wrote.

1. Pick or import a dataset.
2. The platform loads the dataset's recorded outputs if any exist.
3. Run controls start a run when none exists, so a newly imported file is not stuck on a
   disabled button.
4. Each stage writes its own snapshot, trace and artefacts.
5. Every page reads the stage it is showing. The anomaly header cards read the recorded
   anomaly aggregate; the anomaly chart reads the recorded series. They cannot disagree
   because they read the same stored facts.

The forecast is a projection of the selected model, not a second opinion. It never
re-races algorithms, and `model_id` on every forecast row points at the one
`ModelSelection` chose. A user comparing the forecast page against the model page should
be looking at the same model, and the report cites the same id.

---

## 6. How the forecast works

The forecast is in two tiers, because one method cannot honestly span both.

- Short horizons (24h / 7d / 30d) use the selected model, walked recursively per device.
- The 12-month view uses additive Holt-Winters over the monthly history, and says so in
  `method` on every row it produces.

Three things matter:

- Recursive inference walks per device, never per row. Predicting campus totals
  recursively would feed the building's next hour with the previous device's prediction,
  which is a fabrication that reads as a trend. Each device is walked on its own timeline
  and the results are summed afterwards.
- The band is measured, not asserted. Before forecasting, the last 14 days are withheld
  and replayed through the exact recursive path, and the spread of those errors sets the
  band. Where the backtest cannot run (less than 21 days of history) the band is reported
  as `null` rather than as a number nobody measured.
- Exogenous features are held at their trailing same-hour-of-week mean over the next seven
  days, then flat. That is stated in `confidence_note` on every short horizon, because a
  30-day projection produced under a frozen August temperature is a projection of August,
  and the reader has to know that is what they are looking at.

---

## 7. How the anomaly engine works

Detection is statistical, never model-based, and the reason is specific. A predictive
model flags whatever it happens to predict badly, which means it rediscovers its own error
distribution and calls it an anomaly. A median hour-of-week profile per device cannot be
moved by the event you are looking for, so a spike stays a spike instead of being absorbed
into the baseline and explained away.

Three decisions worth stating:

- The baseline is a median, shrunk toward the hour-of-day profile. 30 days of hourly data
  gives about four samples per hour-of-week bin, and a median of four is not a baseline, it
  is a rumour. The profile is a count-weighted blend of the hour-of-week median and the
  hour-of-day median, which has ~30 samples behind it.
- Only overuse is an anomaly. A building that reads 20% below its baseline has saved money,
  and reporting that as a fault would be wrong in a way a user cannot easily see through.
  Deviations are signed, the cost is computed on the positive side only, and `excess_kwh`
  is never negative.
- Consecutive readings become one anomaly, not thirty. A chiller tripping at 02:00 and
  staying tripped produces 24 hourly rows that are one event. Grouping them into an episode
  is what makes `window_start`/`window_end` meaningful and what lets a facilities manager act
  on something.

Severity is defined in **sigma** against each device's own learned MAD scale, so no single
kWh value is "the threshold". The chart rail is the empirical lowest flagged reading, and
the basis panel states the real rule: a reading enters the queue at 6.0σ (score 0.60),
plus `critical ≥ 9σ · high ≥ 7.5σ · medium ≥ 6σ`.

---

## 8. API surface

The backend exposes the pipeline and the dataset-scoped reads.

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

### Datasets

- `GET /api/v1/datasets`
- `POST /api/v1/datasets/upload`
- `GET /api/v1/datasets/{id}`
- `GET /api/v1/datasets/{id}/hierarchy`
- `GET /api/v1/datasets/{id}/preview`
- `GET /api/v1/datasets/{id}/content`
- `POST /api/v1/datasets/{id}/refresh`
- `DELETE /api/v1/datasets/{id}`
- `GET /api/v1/datasets/{id}/schema`
- `POST /api/v1/datasets/{id}/schema/discover`
- `GET /api/v1/datasets/{id}/dq`
- `POST /api/v1/datasets/{id}/dq/run`
- `GET /api/v1/datasets/{id}/baseline`
- `POST /api/v1/datasets/{id}/baseline`
- `GET /api/v1/datasets/{id}/baseline/versions`
- `GET /api/v1/datasets/{id}/anomalies`
- `GET /api/v1/datasets/{id}/anomalies/chart`
- `GET /api/v1/datasets/{id}/forecast/chart`
- `GET /api/v1/datasets/{id}/anomalies/stage`

### Workflow

- `POST /api/v1/workflows/start`
- `GET /api/v1/workflows`
- `GET /api/v1/workflows/{run_id}`
- `GET /api/v1/workflows/{run_id}/stages/{stage_key}`
- `POST /api/v1/workflows/{run_id}/advance`
- `POST /api/v1/workflows/{run_id}/stages/{stage_key}/exec`
- `POST /api/v1/workflows/{run_id}/abort`
- `GET /api/v1/workflows/{run_id}/report.pdf`

### System

- `GET /api/v1/health`
- `GET /api/v1/activity`
- `GET /api/v1/competitions/...`

Frontend speaks to this surface through one REST client in `frontend/client/src/lib/api.ts`.

---

## 9. Verified status

What has been verified and is safe to treat as done:

- The shell layout is viewport-locked and scrolls internally. The sidebar no longer
  stretches to the full page height when the document scrolls.
- The context strip is split so the run controls stay pinned and the metadata scrolls
  sideways.
- Responsive clipping breakpoints are tightened so content that used to be unreachable
  between 881px and 1180px is now reachable.
- Dead CSS that sat before the live definitions and therefore never applied has been
  removed.
- Auth is one token probe on boot, so a stale token costs exactly one 401 instead of a
  storm of them. A sign-out control exists on the profile popover.
- The anomaly chart now uses one shared data array, so the series is no longer compressed
  into a fraction of the plot.
- The inspector panel scrolls internally instead of hiding two-thirds of itself.
- The chart no longer prints a fabricated threshold. Severity is in sigma against each
  device's own learned scale; the basis block states the real detection rule.
- Pins now stick: clicking a point pins it, the panel follows the pinned reading, and
  leaving the chart clears the preview.
- Step, Auto, Guided tour and replay can start a run when none exists, so a newly imported
  file is not stuck on a disabled control.
- The run controls are on every page and work from any stage.
- Dataset file handling no longer silently falls back to a bundled sample when a dataset's
  own file is missing. A missing file is now an error you can see.
- Uploaded estate columns under alternate names are renamed to canonical names before any
  analytics read them, so the estate identity block no longer blanked out.
- A numpy value handed to a SQL string column is now converted explicitly, and the
  processed-file sidecar pins string column types across the round trip, so floor numbers
  no longer came back as binary noise.
- The anomaly list supports backend-scoped paging with severity, class and building filters
  and the facet counts the UI needs.
- Dataset content and preview accept scope parameters, so the Explore scope bar actually
  narrows the page.
- Facet counts obey the building filter but not the severity/class filters, so the counts
  stay truthful as the scope changes.

What is deliberately absent or limited:

- The demo seed and the seeded account are for local evaluation. They are the easiest thing
  to forget to replace before a wider rollout.
- Multi-tenant workspaces, Docker Compose, live meter integration and scheduled retraining
  are roadmap items, not current features.
- The anomaly chart is hourly, so a long window can still look like a barcode even though
  the basis block explains what is plotted.
- Some recommendation, report and forecasting surfaces are only as deep as the stage that
  produced them. Where a stage has not run, the page says so rather than inventing detail.

---

## 10. Test and check posture

Backend:

```bash
.venv/Scripts/python.exe -m pytest -q
```

Frontend:

```bash
cd frontend
pnpm check
pnpm build:static
```

The backend also serves `frontend/dist`, so after any frontend change you must rebuild
before refreshing or you will see stale code.

Useful logs: `logs/launcher.log`, `logs/backend.log`.

---

## 11. Demo script

A short walkthrough that exercises the platform end to end:

1. Start the app from the repository root.
2. Open http://127.0.0.1:8000.
3. Sign in with the demo account.
4. Land on Mission control. Read session, config and baseline ledger.
5. Open the Dataset library and select the seeded dataset.
6. Continue to Import and watch the ingestion state.
7. Step through schema, data quality and transformation.
8. Run model selection and read the winner and its rationale.
9. Open anomalies, pin a point, read the inspector panel.
10. Open prediction and read the forecast and its band.
11. Open recommendations and read the top actions.
12. Open the report and export it as PDF.

That script is short on purpose. The product is meant to be narrated by the run controls,
not by a long prose demo.

---

## 12. Known limits and what they mean

- The forecast is a projection of the selected model. It never re-races algorithms, so if
  you want a different model you re-run model selection; the forecast then follows the new
  selection.
- The 12-month view is Holt-Winters on monthly history, not a longer recursion of the hourly
  model. It says so in `method` on every row.
- The band is measured from a 14-day withheld backtest replayed through the exact recursive
  path. Where that cannot run, the band is null, not a guessed number.
- Exogenous features are frozen at their trailing same-hour-of-week mean after seven days.
  The forecast page states that, because a 30-day projection under a frozen August temperature
  is a projection of August.
- The anomaly engine only flags overuse and stopped meters. It deliberately does not report a
  building that is below its baseline as a fault, because that has saved money and that is not
  a fault.
- Severity is in sigma against each device's own learned scale. There is no single kWh threshold.
- The UI sound policy uses short synthetic tones, not audio files. They are meant to be quiet
  acknowledgement, not a fanfare. Browsers will not play audio until a real user gesture has
  happened; the app unlocks on the first pointer/key interaction, so the first click is when the
  milestone sounds become possible. If the workspace feels silent after a fresh reload, interact
  once before starting a run.

---

Built with ⚡ by **Shashank Gowda N C** — MIT license.
