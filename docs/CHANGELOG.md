# Changelog — EcoMind AI

All work at the presentation layer. The backend pipeline, stage order, business logic and API
contracts were not touched in any entry below.

Format: newest first. Each entry lists **what changed**, **why**, and **how it was verified**.
Companion documents: [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) · [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) ·
[`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) · [`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md).

Legend: `FIX` correctness · `FEAT` new capability · `PERF` performance · `A11Y` accessibility ·
`DOC` documentation · `CHORE` hygiene.

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
- [`docs/IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md) — exact resume instructions.

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
