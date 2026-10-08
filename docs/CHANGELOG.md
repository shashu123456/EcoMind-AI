# Changelog — EcoMind AI

All work at the presentation layer. The backend pipeline, stage order, business logic and API
contracts were not touched in any entry below.

Format: newest first. Each entry lists **what changed**, **why**, and **how it was verified**.
Companion documents: [`PROJECT_REPORT.md`](PROJECT_REPORT.md) · [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md)
· [`STATUS.md`](STATUS.md).

The agent-facing scaffolding docs (`PROJECT_AUDIT`, `PROJECT_ROADMAP`, `IMPLEMENTATION_PROGRESS`,
`FRONTEND_SPEC`) were removed in Session 5 — their live content sits in the report and this log, and
they are recoverable from git history.

Legend: `FIX` correctness · `FEAT` new capability · `PERF` performance · `A11Y` accessibility ·
`DOC` documentation · `CHORE` hygiene.

---

## [Unreleased] — Session 5b (make it demonstrable: sound, controls, charts, launcher)

Reviewing the product as a user rather than as a diff turned up a second wave of things that looked
finished but were not.

### FIX — The completion chime never played

- The chime scheduled its notes on an `AudioContext` that was never resumed. A suspended context has a
  frozen clock, so every note was scheduled at a time that never arrived — **silence**, on every
  machine, every time. `playNotes()` now awaits `resume()` and bails if the context is still not
  running.
- Chrome's autoplay policy only permits audio after a real gesture. `unlockAudio()` is now called from
  the first `pointerdown`/`keydown`, so the context is already running by the time a run begins.
- Added **`playStartTone()`** — a short, quiet two-note rise fired when a run or a stage starts. The
  product previously acknowledged only completion, which left a long stage feeling dead.

### FIX — A leftover launcher could block every future start

- `_check_duplicate()` refused to start whenever the recorded launcher pid was alive. A launcher left
  behind by a crashed terminal or a hard shutdown is alive but owns no running service, and it blocked
  the app from ever launching again. It is now reclaimed automatically; a launcher that *does* own a
  live service still blocks, with the same message.
- Verified: `python -m launcher.start --check` after reclaiming a zombie reported the environment clean.

### FEAT — Run controls on every page

- The only run controls lived on Mission control, so a demonstration had to keep navigating back to
  find **Run**. The context strip — which already travels with the user — now carries
  **Run · Step · Stop · New run** on every view.
- **Stop** is new: it calls `POST /workflows/{id}/abort` and states plainly that everything recorded
  before the stop is kept. **New run** starts a fresh run from stage 01.
- All four work on a dataset with no run; none of them can be permanently dead.

### FIX — Selecting a dataset was a dead end

- Clicking a dataset in the library only raised a toast. It now loads that dataset's recorded outputs
  and continues to **Schema discovery**, so the journey keeps moving instead of stopping on a
  notification.

### FIX — "Open related chart" did nothing

- The evidence inspector's primary action only played a sound. It now closes the drawer, opens the
  anomaly view and widens the time window so the selected event is actually on screen — and says so in
  the toast.
- The invented `source = shared_evidence_index` line was removed; the panel lists only recorded fields
  (`feature`, `reason`, `detected_at`, `baseline`).

### FIX — The Import page claimed an upload that never happened

- The right-hand panel merged two different facts — *a file chosen now* and *the dataset already in the
  workspace* — so it announced "Upload accepted: …" and "Dataset is ready" before anything was
  uploaded. It is now an **Ingestion state** panel that names which of the two it is describing, and
  the badge reads `ACTIVE` rather than `COMPLETE` for a dataset that was simply loaded.
- **Domain detection replaces the manual picker.** The section led with "Which signal is this?" and
  asked the user to choose — for a product whose whole claim is that it detects the domain. The card
  for the active dataset's recorded domain is now highlighted and labelled `detected`; clicking
  another card is explicitly an *override for the next upload* and is marked as such.
- The library import tile advertised `CSV, Parquet, JSON · up to 5 GB`. The API accepts `.csv` and
  `.xlsx`; the tile now says so. (The dropzone carried the same false claim; fixed in 5a.)

### FIX — Charts that did not explain themselves

- **Mission control** plotted the recorded observed-vs-baseline series under the label
  "ENERGY LOAD / LAST 24H", which was wrong on both counts: it is not always 24 hours, and it is a
  comparison, not a single load. It is now labelled with the recorded point count and carries a caption
  naming the solid series, the dashed series and the column they came from.
- **Prediction** ignored its own time-window control: the chart plotted the full series while the
  selector sliced a variable that was never drawn. It now plots the windowed series.
- The forecast gained a filled projection area, a `now` reference line at the observed/forecast
  boundary, unit-aware tooltips and axis ticks, and a readout strip (observed days, forecast days,
  peak day, average confidence band, horizon vs observed).

### FIX — Schema discovery left half the panel blank

- The derived signal families stacked in one narrow column, so the map left the right half of its panel
  empty and read as a broken layout. They now flow into as many columns as the panel can hold, at every
  width.

### CHORE — Fewer documents, one honest front door

- Removed `PROJECT_AUDIT.md`, `PROJECT_ROADMAP.md`, `IMPLEMENTATION_PROGRESS.md` and `FRONTEND_SPEC.md`,
  plus generated build artifacts (`IEEE_Paper.aux`, `IEEE_Paper.log`, a superseded draft) and the
  `logs/` tree. Their live content is in this log, `PROJECT_REPORT.md` and `DESIGN_DECISIONS.md`.
- `README.md` now documents the run controls, the twenty-field generator and the corrected document
  set, and no longer claims the pipeline auto-runs on first sign-in.

---

## [Unreleased] — Session 5 (every field, not just buildings; run controls that work)

Session 5 was driven by one instruction: **the product is not a buildings-only tool**, and every
control on screen must do what it says. Two entries below touch backend files; both are defensive
bug fixes to code paths that crashed or returned the wrong dataset. No stage order, contract or
business rule was changed, and no number was invented.

### FIX — The Import upload never worked

- The frontend posted the file to `POST /api/v1/datasets`. That path only serves `GET`, so every
  upload returned **405 Method Not Allowed** and the dropzone surfaced "Upload failed". The route is
  `POST /api/v1/datasets/upload`; `api.datasets.upload()` now calls it and unwraps the recorded
  `{ dataset: … }` envelope (it previously read `.id` off the envelope and got `undefined`).
- The backend ignored the display name the client sent, so every upload appeared in the library as
  `my-file-45d-hourly.csv`. `POST /datasets/upload` now accepts an optional `name` form field and
  `register_upload()` uses it when present, falling back to the filename.
- The dropzone advertised `CSV · JSON · Parquet · Excel`. The backend accepts `.csv` and `.xlsx`
  only, so the control now offers exactly those two.
- **Verified:** `python scripts/build_field_datasets.py` registers 20/20 datasets over this route,
  and the app's own dropzone path was exercised in the browser.

### FIX — Uploading a building-metered file crashed the backend (500)

- `_store_hierarchy()` selected `["building_code", "floor_no", "room_code", "device_code"]`
  unconditionally whenever the file carried `building_code` and `device_code`. A file metered at
  building level has no floor or room, so a perfectly valid upload raised `KeyError` → **HTTP 500**.
  Any campus, mall or estate file shaped like this was un-uploadable.
- The selection now reads only the columns the file actually carries; missing `floor_no` / `room_code`
  are stored as `NULL` exactly as before. **Verified:** *University Campus — Academic and Residential*
  uploads to 5 buildings / 5 devices at meter granularity.

### FEAT — Twenty energy fields, not one

- New generator [`scripts/build_field_datasets.py`](../scripts/build_field_datasets.py): deterministic
  (fixed seed per field, 45 days hourly, one planted fault window per field so the anomaly stage has
  something real to find, plus one malformed row for the quality stage to repair).
  `--prune` deletes its own earlier uploads so re-runs replace rather than duplicate.
- Fields: commercial building, manufacturing plant, hospital, university campus, shopping mall,
  warehouse cold chain, office complex, **data centre, solar PV plant, wind farm, EV charging hub,
  district heating, water treatment, airport terminal, hotel resort, telecom tower site, cold storage,
  mining site, railway station, cement plant**. Each carries its own hierarchy codes, equipment,
  extras and target column (`energy_kwh`, `generation_kwh`, `heat_kwh`).
- **Verified:** solar PV, district heating and telecom tower sites each ran the full ten stages
  end-to-end and recorded real outputs (baseline target/unit/date range, model competition, anomalies,
  forecast, recommendations, report).

### FEAT — The frontend now adapts to every field

- `BackendDomain` grew four members — `plant`, `transport`, `telecom`, `water` — with labels, icons
  and scenes, and the Import domain picker offers them. Specific rules run **before** the generic
  `/plant/` industry rule so a *Solar PV Plant* is generation, not manufacturing.
- Fixed two live misclassifications: **Data Centre** fell through to *Commercial building* (the regex
  required a word boundary after `cent`, which `centre` never has) and **Cold Storage** landed in
  *Industrial plant*.
- The unit vocabulary gained `W/m²`, `m/s`, `m³`, `L`, `NTU`, `µg/m³`, `bar`, `t`, `Erl`, `count`,
  `%` and `ratio`. The library preview and every table now read `clinker_tonnes → t`,
  `kiln_temp_c → °C`, `cost_inr → ₹`, `power_factor → ratio`.
- The schema family vocabulary gained inverter/tracker/nacelle/yaw/pitch/irradiance, blower/mixer/
  aerator, baggage, chamber temperature and `pue`, and the cost rule no longer captures `charger`.

### FIX — One dataset's run was shown under another dataset's name

- `pickRun()` fell back to *any* run when the active dataset had none. Opening a dataset that had
  never been analysed therefore displayed a different dataset's stages, baseline, model, anomalies and
  recommendations under the new dataset's heading — exactly the borrowed number the product forbids.
- The workspace now resolves a single **active dataset** (`workspace.activeDatasetId`) and every field
  on it belongs to that dataset; the run lookup is strict. The app opens on the dataset of the most
  recent completed run (so it lands on recorded work), and a dataset with no run shows honest empty
  states: `awaiting stage 06`, `awaiting stage 07`, `not started`.
- Selecting a dataset in the library now **reloads its recorded outputs** instead of leaving the
  previous dataset's stages on screen, and a fresh upload becomes the active dataset.
- **Verified:** with *Hospital* selected the strip read `BASELINE awaiting stage 06 · MODEL awaiting
  stage 07 · STAGES not started`, and every network request targeted that dataset's id.

### FIX — The adaptive time-window control was hidden and meaningless

- `deriveWindowOptions()` compared `field.role` to `"index"`, but `field.role` holds the backend's raw
  semantic type (`"energy timestamp"`), so the check never matched and the control **never appeared on
  any dataset**. It now derives the canonical role from the column name, exactly as the schema view does.
- The anomaly series was hard-downsampled to **14 points**, so all three options collapsed to the same
  slice and the buttons did nothing distinguishable. Recorded resolution is now preserved and the
  options are de-duplicated; when a series is coarser than the ladder, the two windows it can genuinely
  express are offered instead of three identical buttons.
- **Verified:** District Heating offers `7 d → 168 buckets`, `30 d → 720`, `60 d → 1008`, all captioned
  `dataset spans 45 d`; switching to `7 d` shrank the rendered path from 46,927 to 7,642 characters.

### FEAT — Step / Guided tour / Run all → report now start a run

- All three controls were disabled whenever the workspace had no run, so a newly imported dataset could
  never be analysed from the Overview — the buttons existed but could not be pressed.
- `ensureRun()` starts a workflow for the active dataset on demand. **Step** executes the next stage,
  **Guided tour** walks the remaining stages *visiting each page as its stage completes*, and
  **Run all → report** runs the remainder without leaving the page and lands on the executive report.
- **Verified in the browser:** *Water Treatment Plant* went 0/10 → 10/10 and landed on its report; the
  guided tour on *Railway Station* was observed walking Model competition → Prediction →
  Recommendations → Reports to 10/10 with **zero console errors**.

### FEAT — Report preview, schema flow, model head-to-head, baseline preview

- The report draft renders as structured sections (PROJECT SUMMARY · MODEL COMPETITION · ANALYTICS ·
  ANOMALIES · RECOMMENDATIONS) instead of one `<pre>` blob, with working **Copy briefing** and
  **Download .md**; the preview button is no longer disabled and the close button closes.
- The schema discovery flow was rebuilt with real per-row tracks and travelling packets instead of a
  distorted SVG. **Model competition** gained a head-to-head matrix listing every candidate against
  every metric with the winner marked. **Transformation** shows the baseline dataset preview — target,
  unit, rows, entity column, version, the min/P25/median/mean/P75/P95/max/std strip and the learned
  hour-of-week heatmap.

---

## [Unreleased] — Session 3 (truthfulness fixes, legibility, library preview, guided run)

### FIX — Hardcoded identity removed

- The topbar and profile popover showed **"Aarav Khanna" / "AK"** — a name nobody signed in as. Both
  now render the real `full_name`, its derived initials and the account role from `GET /auth/me`.
  Verified in the browser: `Admin User` / `AU`.
- The notifications popover listed invented alerts (`Load spike detected · meter_kw`). It now lists
  the three highest-severity **recorded** anomalies with their feature, timestamp and severity, and
  shows an explicit empty state when no run has produced any.

### FIX — Sign-in screen

- Removed the fake SSO button (it registered a password account and displayed an `N` glyph) and the
  `Forgot password?` control (the backend has no reset endpoint). The secondary action is now the
  honest one: *Create an account with this email*.
- Removed the unevidenced `SOC2-ready workspace controls` claim; the footer now states what is true
  (bearer-token scoped API, raw source never rewritten).
- `Build 1.4.0` replaced with a real build stamp injected by Vite `define.__BUILD_STAMP__`.
- The form pre-fills the seeded workspace account so a demonstration never starts from an unknown
  credential, with a visible note to replace it before deploying.
- Micro text on the entry screen was 7–9 px and is now 9.5–10.5 px.

### FIX — The pipeline no longer starts by itself

- Sign-in used to execute the ten stages silently. It now stages the run and says so; **Step** runs
  one stage and **Auto** runs the remainder, both from the pipeline rail.
- **Auto now walks the pages in pipeline order** as each stage completes (`VIEW_BY_STAGE_KEY`), so a
  demonstration follows the data instead of sitting on one screen.

### FIX — Context strip tells the truth

- `BASELINE`, `MODEL` and a new `STAGES` cell render an explicit pending state (`awaiting stage 06`,
  `awaiting stage 07`, `not started`) until the stage that produces them has recorded output, instead
  of defaulting to `Baseline v1` and a stale model name.
- When the stage traces carry no baseline version but the baseline endpoint recorded how much data it
  learned from, the label now reads `Adaptive baseline / 236K rows` rather than claiming a version
  that was never written.

### FEAT — Dataset preview and export in the library

- Every dataset card gained **Preview rows** and **Open** actions. Preview reads
  `GET /datasets/{id}/preview` and renders the recorded rows in a modal table whose headers carry the
  **derived unit** for each column; **Export CSV** downloads exactly those rows.
- The meaningless `···` affordance and the wrapping UUID were removed (the id now ellipsizes on one
  line with the full value in a tooltip).

### FEAT — Quality shows the overall run before the filter

- A new **Quality process** band summarises the structural check first: per-rule flagged counts, the
  DQ score with a meter, flagged-row and rule-type totals and average confidence — then the existing
  filter and three-panel view act as a drill-down on top of it.

### FEAT — Prediction day-by-day and business impact

- Added a **day-by-day** table (observed, forecast, interval, % vs observed with direction colour)
  and a **business impact** panel (cost opportunity, carbon avoided, backtest MAPE, selected model,
  horizon origin, baseline compared).

### FEAT — Anomaly detection breakdown

- Added a severity split bar, a severity legend and a ranked detected-class list with share bars, all
  read from the recorded anomaly output.

### FIX — Legibility and layout

- Micro text raised at the root: `.mono-note` 9 → 10.5 px, `.tiny-tag` 8 → 9.5 px,
  `.data-table__head` 8 → 9.5 px, `.data-table__row` → 11.5 px, `.metric-block__label` 9 → 10 px,
  chart legends → 10.5 px. Hovering a micro label strengthens its contrast and weight, which never
  reflows the layout.
- The hour-of-week heatmap no longer prints 168 numbers at once: cells show their value on hover.
- The activity terminal is **docked**: when it is open the shell reserves 252 px of bottom space, so
  it can no longer cover page content. This closes **GAP-4 / P3-6**.
- Dataset card titles and descriptions reserve a fixed minimum height so the grid stays aligned.

### DOC

- Added [`PROJECT_REPORT.md`](PROJECT_REPORT.md): the full end-to-end report (architecture, stage by
  stage behaviour with a real trace, API surface, contracts, verified status, gaps, a ten-minute
  demonstration script and a ranked improvement list).

### Verification (Session 3)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `pnpm build:static` | exit 0 · app 483.85 kB (143.76 kB gzip) · charts 403.49 kB · CSS 226.09 kB |
| Identity | `Admin User` / `AU` from `/auth/me` |
| Context strip, no run | `awaiting stage 06` / `awaiting stage 07` / `not started` |
| Context strip, recorded run | real baseline label / `ridge` / `10 / 10 complete` |
| Library preview | 100 recorded rows, units derived per column, CSV export |
| JS exceptions | 0 |

---

## [Unreleased] — Session 2 (audit, units, live wiring, hygiene)

### FIX — Units and derived labels are now a single vocabulary

- Added [`frontend/client/src/lib/units.ts`](../frontend/client/src/lib/units.ts): `unitForColumn()`
  maps a recorded column name to its unit (kWh / kW / kVA / ₹ / kgCO₂ / °C / %RH / V / A / ratio /
  people), `displayUnit()` renders the canonical symbol. `workspace.ts` records `targetColumn` +
  `targetUnit` read from the `model_selection` stage (falling back to `forecast`), and `AppShell`
  exposes `withUnit()` so a number is only ever suffixed with the unit the backend actually
  modelled.
- **The defect this closes:** the model-error card read `kW` while the trained target was
  `energy_kwh`, so MAE was labelled with a power unit instead of an energy unit. Verified live: the
  card and chart axis now read **`MAE 364.91 kWh`**.
- Deleted the dead `domainMeta.fmt` field, which asserted `kWh / m²`, `kWh / tonne` and
  `kWh / pallet` for datasets that record no floor area, mass or pallet count.
- Every remaining currency and carbon glyph now resolves through `displayUnit("INR")` /
  `displayUnit("kgCO2")` instead of a literal — same rendering, one source of truth.
  Sites: inspector excess cost, anomaly summary, recommendation savings, report synthesis text.

### FIX — Last fabricated field catalogue removed

- `defaultFieldsByDomain` (a hard-coded per-domain list of six field names with kW units) drove the
  schema "primary target" card, the meter-family strip and the relationship graph. It is deleted.
- Added [`frontend/client/src/lib/schema.ts`](../frontend/client/src/lib/schema.ts):
  - `roleForColumn(name, semanticType)` → `index` / `entity` / `context` / `target` / `signal`.
  - `familyForColumn(name)` → 23 real signal families (hvac, chiller, lighting, motor, process,
    compressor, conveyor, pump, cold chain, dock, generation, it load, thermal, humidity, voltage,
    current, power factor, emissions, cost, occupancy, production, meter, signal) derived from the
    column name, with `FAMILY_LABEL` for display.
  - `ROLE_ORDER` — schema fields are listed index → entity → context → target → signal (stable sort,
    backend order preserved inside a role).
- Schema view now shows: the real primary target (the modelled `target_column`, else the column whose
  role is `target`, else `—`), the real signal families with their real unit lists and field counts,
  and relationship-graph node counts computed from the recorded schema. Empty states replace the
  strip when no schema is recorded.
- Storage-operation panel no longer invents a table path: it lists the ingested row count, the real
  index column (with the first entity column), the field count served to the pipeline, and the
  dataset name as the import label.

### FIX — Visible character corruption

- Repaired 59 double-encoded UTF-8 sequences (`Â·`, `â€”`, `â‚¹`, `â‚‚`, `âˆ’`, `â€º`, `â†’`, `Ã—`,
  `âŒ˜` → `·`, `—`, `₹`, `₂`, `−`, `›`, `→`, `×`, `⌘`). Zero mojibake leaders remain in the frontend.

### FIX — Shell labels

- Context strip printed the accent token (`Baseline v1 / lime domain`) — now prints the domain label.
- Empty `MODEL` cell rendered as a blank chip — now "not selected yet".
- `"palettes"` → `"pallets"`.
- Three view components destructured fewer props than their declared types, so live data never
  reached them (Overview `baselineName`, Import `activeDataset` / `onUploaded`, History `onReplay`).

### FEAT — Live data everywhere

- Removed every module-level mock array — `datasets`, `energyData`, `forecastData`, `qualityIssues`,
  `modelData`, `anomalyData`, `anomalies`, `recommendations`, `activityEvents` now start `[]`, and an
  explicit `EMPTY_DATASET` sentinel (id `—`, name "No dataset loaded") stands in before a real
  dataset is selected.
- Wired the recorded values through all sixteen views: Overview (hero score, mini-chart total and
  delta, freshness, stage health, operations, next-best-action, run/stage counts), Inspector
  (deviation, cost, CO₂, detection score), Activity terminal, shell context strip (run id, dataset
  count, freshness, baseline label, model label), Models (R², MAE, train/test split, winner
  rationale, selected tag), Anomalies (total, severity split, detection rate, excess cost and CO₂,
  live threshold reference line, queue), Prediction (horizon total, MAPE, savings, CO₂ avoided,
  algorithm, origin, contribution factors from `competition.weights`), Quality (issue count, type
  counts, average confidence, DQ score), Library (domain counts and percentages, empty state),
  Schema, Transform (fit R², step and field counts, version labels), Recommendations (count,
  savings, CO₂, recomputed confidence ring — the fake fourth card is gone), Reports (section
  counts, timestamps, baseline version), Import (dataset row/column counts in the scan steps).
- Empty states added for library, schema fields, quality rows, anomaly queue, recommendation list,
  forecast factor panel and activity terminal.

### FEAT — Integration features that were missing

- **Real upload**: multipart `POST /api/v1/datasets` through `datasetsApi.upload`, replacing the
  simulated scan, with `uploading` / `uploadError` state and an inline error banner.
- **PDF export**: bearer-authenticated `GET /workflows/{runId}/report.pdf`, downloaded as a blob and
  saved. Verified in the network panel: `report.pdf → 200`.
- **Run replay** per dataset from Run history.
- **Step / Auto pipeline controls**: `POST /workflows/{runId}/stages/{key}/exec` driven by
  `execNextStage()` / `execRemainingStages()`, with `stageBusy` / `autoRunning` state, a completion
  chime and stage-status refresh.

### PERF — Build and bundle

- Single 951 kB chunk split into `vendor-react` 11.92 kB, `vendor-charts` 403.49 kB and a 462.20 kB
  application chunk (137.43 kB gzip), CSS 208.96 kB (35.38 kB gzip).
- Removed vendor build tooling from `vite.config.ts` and `client/index.html`: the JSX-source-loc
  plugin, the debug-log collector writing `.manus-logs/`, the `window.__MANUS_CONFIG__` injector and
  its `dist/api/platform/config.js` asset, and the `.manus*.computer` allowed-host entries.

### CHORE — Dead code and vendor branding

- Deleted: `pages/ComponentShowcase.tsx` (1,437 lines), `pages/Home.tsx`, `pages/NotFound.tsx`,
  `components/AIChatBox.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`,
  `ManusDialog.tsx`, `Map.tsx`, `_core/hooks/useAuth.ts`, `components/icons/AppIcon.tsx`,
  `components/foundation/ProcessingIndicator.tsx`, `const.ts`, `platform.d.ts`, and the orphan
  `frontend/frontend-complete-correct/` tree (which carried its own `node_modules`).
- Restored `components/icons/EcoMindMark.tsx` and `hooks/usePersistFn.ts` after they were deleted
  while still in use.

### DOC — Documentation set created

- [`docs/PROJECT_AUDIT.md`](PROJECT_AUDIT.md) — completed / incomplete / broken / dead modules,
  performance, accessibility, responsiveness, typography, colour, icons, UX findings, improvement
  ideas, with a verification table of what was *observed* versus inferred.
- [`docs/PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) — five hard constraints, a four-step verification
  gate, and Phases 0–9 with checkboxes so an interrupted agent resumes here.
- [`docs/DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) — identity, colour, typography, layout,
  navigation, motion, charts, icons, numbers and units, cards and panels, sign-in, accessibility
  commitments, plus a decision log D-1…D-12 and a `GAP` register.
- [`docs/CHANGELOG.md`](CHANGELOG.md) — this file.
- `docs/IMPLEMENTATION_PROGRESS.md` — exact resume instructions.

> Four of those files (`PROJECT_AUDIT`, `PROJECT_ROADMAP`, `IMPLEMENTATION_PROGRESS`, `FRONTEND_SPEC`)
> were removed in Session 5. They existed so an interrupted agent could resume; the product no longer
> ships scaffolding. Their live content is in this log, `PROJECT_REPORT.md` and `DESIGN_DECISIONS.md`,
> and the full text remains in git history.

### Verification (Session 2)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Production build | `pnpm build:static` | exit 0 |
| Backend health | `GET /api/v1/health` | `{"status":"ok","service":"ecomind-ai"}` |
| Browser walk | sign in → all views | 0 JS exceptions |
| Unit label | model error card, live run | `MAE 364.91 kWh` (was `kW`) |

---

## Session 1 — Audit, truthfulness pass, integration wiring

Pre-history for the entries above; recorded here because the previous session's log was never
committed.

- Initial reconnaissance of the single 3.7 kLOC `AppShell.tsx` shell, its sixteen views, its mock
  arrays and its live API surface.
- Removal of all frontend mock and placeholder data at source; introduction of `EMPTY_DATASET`.
- First live-wiring pass across every view (five scripted batches: 15 + 21 + 54 + 21 + 21 edits).
- First unit correction: `lib/units.ts` created, `targetColumn` / `targetUnit` plumbed from
  `model_selection`, `kW` → `kWh` on the model error card and chart axis.
- Build configuration cleaned of vendor branding; dead code purged; vendor chunking added.

---

## Pending — not yet in this changelog

These are scheduled, not done. See the roadmap for the acceptance criteria.

- **Prune the 331 recorded workflow runs** — most are orphaned or failed; the library, run history
  and `/workflows` payload are all affected.
- Sample datasets for the eight industries (`/sample-datasets`).
- `AppShell.tsx` decomposition, lazy routes, store, memoisation, table virtualisation.
- Semantic colour tokens, published type scale, mobile breakpoints, five extra domain identities.
- Chart interactions (cross-filter, brush, zoom, heatmap, device tree, scenarios).
- Storytelling band, Guided Demo Mode, Presentation Mode, SSE streaming, `Ctrl+K` search.
  (Auto already walks the pages in pipeline order; a narrated guided mode is still outstanding.)
- Meaningful motion bound to backend events.
- Accessibility: `aria-live` terminal, inspector focus trap, contrast pass, Lighthouse.
- Repo hygiene: CI workflow, Makefile, README, build-stamp, fresh-clone simulation, `pytest` gate.
