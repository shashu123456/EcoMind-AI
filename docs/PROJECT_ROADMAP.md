# EcoMind AI — Implementation Roadmap

**Living document.** Check items off as they land. If work is interrupted, a new agent must be able to
resume by reading **this file + [`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md)** only.

Legend: `[x]` done and verified · `[~]` done but unverified · `[ ]` not started · `[!]` blocked

**Hard constraints (never violate)**
1. The backend pipeline, business logic and API contracts are **frozen**. Eleven stages, fixed order:
   Library → Import → Schema → Quality → Transformation → Adaptive Baseline → Model Selection →
   Anomaly → Forecast → Recommendation → Executive Report.
2. No fabricated values anywhere: no mock KPIs, no placeholder datasets, no invented units, no fake branding.
3. Every number, chart, unit and rationale must originate from a recorded backend stage output.
4. When the backend has recorded nothing, render an explicit empty state — never sample data.

**Verification gate for every task** — all four must pass before a task is checked off:
```
cd frontend && npx tsc --noEmit          # 0 errors
cd frontend && pnpm build:static         # exit 0
curl -s http://127.0.0.1:8000/api/v1/health
# browser: sign in → walk views → 0 JS exceptions in console
```

---

## Phase 0 — Truthfulness & correctness (COMPLETE)

- [x] Remove every module-level mock array; introduce `EMPTY_DATASET` sentinel.
- [x] Wire Overview / Inspector / Activity terminal / shell context strip to recorded values.
- [x] Wire Models, Anomalies, Prediction, Quality, Library, Schema, Transform, Recommendations, Reports.
- [x] Add empty states for library, schema, quality, model list, anomaly queue, recommendations.
- [x] **Unit correctness** — derive display units from the recorded `target_column` via `lib/units.ts`.
      Model error was labelled `kW` for an `energy_kwh` target; now `kWh`. Axis `MAE / kW` → `MAE / kWh`.
- [x] Delete the dead `domainMeta.fmt` field that asserted `kWh / m²`, `kWh / tonne`, `kWh / pallet`.
- [x] Fix `"palettes"` → `"pallets"` unit typo.
- [x] Repair 55 double-encoded UTF-8 sequences (visible mojibake) — zero remain.
- [x] Fix context strip printing the accent token (`… / lime domain`) and the empty `MODEL` cell.
- [x] Sharpen schema role inference: `index` / `entity` / `context` / `target` / `signal`.
- [x] Repair three view signatures where props existed in the type but not the destructuring.
- [x] **Delete the last fabricated field catalogue** (`defaultFieldsByDomain`) and derive every
      schema label from recorded columns via `lib/schema.ts` (`roleForColumn`, `familyForColumn`,
      `FAMILY_LABEL`, `ROLE_ORDER`). The schema view's primary target, signal-family strip and
      relationship-graph counts now reflect the real schema, with empty states when none is recorded.
- [x] Route the remaining currency and carbon glyphs through `displayUnit("INR")` / `displayUnit("kgCO2")`
      so no view holds a unit literal.
- [x] Remove the invented storage table path; the database-operations panel now reports the ingested
      row count, the real index column, the field count served to the pipeline and the dataset name.
- [x] Repair a further 4 double-encoded UTF-8 sequences found during the schema rewrite (59 total).

## Phase 1 — Integration completeness (COMPLETE)

- [x] Real dataset upload via multipart `POST /datasets`, replacing the mock scan.
- [x] Bearer-authenticated report PDF export (verified `report.pdf → 200`, blob downloaded).
- [x] Run history replay per dataset.
- [x] Step / Auto pipeline execution controls calling `POST /workflows/{id}/stages/{key}/exec`.
- [x] Remove dead code: 1,437-line `ComponentShowcase`, `Home`, `NotFound`, `AIChatBox`,
      `DashboardLayout(+Skeleton)`, `ManusDialog`, `Map`, `useAuth`, `AppIcon`, `ProcessingIndicator`,
      `const.ts`, `platform.d.ts`, and the orphan `frontend-complete-correct/` tree.
- [x] Strip vendor branding from the build: no debug-log collector, no `window.__MANUS_CONFIG__`
      injector, no `.manus*.computer` allowed hosts, no `dist/api/platform/config.js` asset.
- [x] Vendor chunk splitting (single 951 kB chunk → 457 kB app + 403 kB charts + 12 kB react).

## Phase 0b — Truthfulness fixes (COMPLETE)

- [x] Remove the hardcoded topbar identity (`Aarav Khanna` / `AK`); render the real `/auth/me` user.
- [x] Replace the invented notification alerts with the highest-severity recorded anomalies.
- [x] Remove the fake SSO control, the `Forgot password?` control and the unevidenced SOC2 claim from
      the entry screen; add a real build stamp.
- [x] Stop the pipeline from starting on sign-in; Stage / Step and Auto are explicit.
- [x] Make **Auto** walk the pages in pipeline order as stages complete.
- [x] Context strip renders explicit pending states until a stage has recorded output.
- [x] Label the baseline from the rows it learned from when no version was written.
- [x] Dataset preview + CSV export in the library.
- [x] Quality shows the overall rule run before the filter.
- [x] Prediction gains a day-by-day table and a business-impact panel.
- [x] Raised every micro type size and docked the activity terminal (closes GAP-4).
- [ ] **Prune the 331 recorded runs** — most are orphaned or failed; affects library noise, run
      history and `/workflows` payload size.

## Phase 2 — Structure & performance (NEXT)

> **Next action.** P2-1 is the precondition for the rest of Phase 2 and for any frontend test surface.
> Phase 7 (`/sample-datasets`) is independent and may be interleaved.

- [ ] **P2-1** Split `AppShell.tsx` (~3.7 kLOC) into `client/src/views/*` + shared shell modules.
      Precondition for lazy loading, per-view memoisation and any frontend test.
- [ ] **P2-2** `React.lazy` + `<Suspense>` per view; make `vendor-charts` a genuinely async chunk.
- [ ] **P2-3** Replace module-level `let` live state with a store/context so views render from props.
- [ ] **P2-4** Memoise the derived arrays (`energyTotal`, counts, `typeCounts`, `avgConfidence`) with `useMemo`.
- [ ] **P2-5** Virtualise long tables (anomaly queue, quality rows, activity terminal).
- [ ] **P2-6** Delete unused `components/ui/*` (~58 of 60 files) and prune the ~16 unused dependencies
      they justify; keep `sonner` + `tooltip` and their transitive needs.
- [ ] **P2-7** Add a frontend test surface (Vitest config + unit tests for `lib/units.ts`, `lib/workspace.ts`).

## Phase 3 — Design system (the visual bar)

- [ ] **P3-1** Tokenise the palette as semantic CSS custom properties
      (`--eco-success`, `--eco-running`, `--eco-evidence`, `--eco-warning`, `--eco-critical`,
      `--eco-medium`, `--eco-neutral`) and replace every chart literal (`#b6f36b`, `#8d86ff`, `#f5a56d`,
      `#f07f6e`, `#718b7b`, `#2..., #15231b`, `#30473a`) with token references.
- [ ] **P3-2** Publish a documented type scale and apply it
      (`.eco-hero` / `.eco-title` / `.eco-subtitle` / `.eco-body` / `.eco-micro` / `.eco-eyebrow`).
- [ ] **P3-3** Normalise number formatting: one locale, one grouping rule, declared decimal precision per unit.
- [ ] **P3-4** Mobile/tablet breakpoints for every layout (`dashboard-grid`, `schema-layout`,
      `import-layout`, `quality-three-panel`, `models-layout`, `anomaly-table-panel`, `recommendation-layout`).
- [x] **P3-5** Domain expansion: all eight industries are classified (`lib/workspace.ts` domain rules +
      declared-domain match) with dedicated icons, accents, hierarchy anchors and cadences
      (buildings, industry, logistics, hospital, campus, mall, office complex, data centre). The import
      picker offers all eight.
- [x] **P3-6** The activity terminal is docked: the shell reserves 252 px of bottom space while it is
      open (300 px below 1180 px, 330 px below 620 px), so it never covers page content.

## Phase 4 — Charts & analytics engine

- [ ] **P4-1** Linked hover / cross-filter: anomaly point → timeline + inspector + device + forecast.
- [ ] **P4-2** Brush + zoom on anomaly and forecast charts; fullscreen; PNG/SVG export.
- [ ] **P4-3** Accessible data-table alternative behind every chart.
- [ ] **P4-4** Anomaly flagship extras: hourly × day heatmap, device hierarchy tree, compare mode (2+).
- [ ] **P4-5** Forecast extras: horizon selector driving the backend, scenario comparison cards,
      baseline → current → forecast split view.
- [ ] **P4-6** Baseline generation page: 24 × 7 hour-of-week heatmap from the recorded snapshot +
      learning curve.

## Phase 5 — Storytelling & demo

- [ ] **P5-1** Provenance → understanding → decision → next band on each page (backend-derived text).
- [ ] **P5-2** Guided Demo Mode (`Ctrl+D`): narrated auto-walk driven by real stage events.
- [ ] **P5-3** Presentation Mode: hide dev chrome, enlarge KPIs and charts, fullscreen transitions.
- [ ] **P5-4** Wire SSE (`/workflows/{id}/stream-token`) so the terminal streams instead of polling.
- [ ] **P5-5** Global search (`Ctrl+K`) + command palette over datasets, devices, anomalies,
      recommendations, forecasts, reports, runs.

## Phase 6 — Motion (meaningful, not decorative)

- [ ] **P6-1** Pipeline rail energy-flow: completed = success token, running = running token pulse,
      waiting = neutral, failed = critical.
- [ ] **P6-2** Database-write animation on upload / save / baseline / anomalies / forecast / recs / report.
- [ ] **P6-3** AI-reasoning animation (node activation, connection lighting, confidence growth) during
      schema, baseline, model selection, anomaly, forecast, recommendation.
- [ ] **P6-4** Every animation bound to a real backend event; all `prefers-reduced-motion` safe;
      transform/opacity only.

## Phase 7 — Sample datasets (`/sample-datasets`)

- [ ] **P7-1** Commercial Building
- [ ] **P7-2** Manufacturing Industry
- [ ] **P7-3** Hospital
- [ ] **P7-4** University Campus
- [ ] **P7-5** Shopping Mall
- [ ] **P7-6** Warehouse
- [ ] **P7-7** Office Complex
- [ ] **P7-8** Data Centre

Each must carry a realistic hierarchy, equipment list, equipment IDs, timestamps, operating schedules,
departments/rooms/buildings, metadata and units — and must naturally produce quality issues, a baseline,
model training, anomalies, a forecast and recommendations without fabricated values.
Extend the existing `scripts/build_datasets.py` generator; do **not** add a new pipeline.
> Note: this is data generation, not a workflow change. RULE 1 is respected — stages, contracts and
> order are untouched.

## Phase 8 — Accessibility & polish

- [ ] **P8-1** `aria-live` on the activity terminal; roving focus in the pipeline rail and anomaly queue.
- [ ] **P8-2** Inspector focus trap + focus restore to opener.
- [ ] **P8-3** Contrast pass on `--eco-text-muted` micro-labels (target WCAG AA at 8–9 px).
- [ ] **P8-4** Lighthouse pass (target ≈90+), reduced-motion audit, keyboard-only walkthrough.

## Phase 9 — Repo hygiene & ship

- [ ] **P9-1** Rewrite `.github/workflows/ci.yml` for pnpm + `tsc --noEmit` + `build:static` (drop the
      deleted `frontend/src/` tree, npm, eslint and vitest steps — no configs exist).
- [ ] **P9-2** Fix the Makefile (`npm run dev` → `pnpm dev:static`, `npx tsc -b` → `tsc --noEmit`,
      remove `Launch_EcoMind.bat`).
- [ ] **P9-3** Rewrite README (pnpm, `frontend/client/src`, `:8000` as the primary URL, credentials).
- [ ] **P9-4** Replace the literal `Build 1.4.0` sign-in footer with a real build value.
- [ ] **P9-5** Fresh-clone simulation: `git clone` → `ecomind.bat start` → login works, zero errors.
- [ ] **P9-6** Final gate: `pytest backend` (106) · `tsc` 0 · build green · browser 0 JS exceptions.

---

## Deliberately out of scope

- Any change to stage order, gating, contracts or business logic.
- New backend endpoints where the data to serve them does not exist (e.g. a hierarchy endpoint built
  from row counts alone — see STATUS.md §6.4).
- Copying any commercial product's visual design. Only principles are borrowed.
