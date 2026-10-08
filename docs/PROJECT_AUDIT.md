# EcoMind AI — Project Audit

**Auditor:** Product Architect / Senior Frontend Engineer / Quality Reviewer role
**Date:** 2026-10-08
**Scope:** frontend, backend read-only, integration, UX, performance, accessibility
**Method:** static inspection + live end-to-end run against the real FastAPI backend

> **Backend is frozen.** Nothing in this audit proposes a pipeline, business-logic or API-contract change.
> All findings are additive or corrective at the presentation layer.

---

## 0. How this audit was verified

Everything marked **[verified]** was observed on the running system, not inferred.

| Check | Command / action | Result |
|---|---|---|
| Frontend typecheck | `npx tsc --noEmit` | **0 errors** [verified] |
| Production build | `pnpm build:static` | **exit 0**, app chunk 462.20 kB / gzip 137.43 kB, vendor-charts 403.49 kB, vendor-react 11.92 kB, CSS 208.96 kB [verified] |
| Backend health | `GET /api/v1/health` | `{"status":"ok","service":"ecomind-ai"}` [verified] |
| Auth | `POST /api/v1/auth/login` | 165-char JWT issued [verified] |
| Dataset reads | `/datasets/{id}/{schema,baseline/versions,anomalies,anomalies/chart,forecast/chart,preview,dq}` | all **200** [verified] |
| Full pipeline | auto-run on first sign-in | **10 / 10 stages complete** [verified] |
| Model competition | `model_selection` trace | **6 candidates** with backend rationales [verified] |
| Anomalies | `anomaly` trace + `/anomalies` | **5,541** detected, 3,271 critical/high [verified] |
| Recommendations | `recommendation` trace | **78** generated [verified] |
| Report PDF | `GET /workflows/{id}/report.pdf` with bearer | **200**, blob downloaded [verified] |
| Browser JS errors | console during sign-in → all views | **0 exceptions** [verified] |
| Unit correctness | model error card on a live `energy_kwh` run | **`MAE 364.91 kWh`** — was wrongly `kW` [verified] |
| Fabricated data | full grep for mock arrays, placeholder field lists, unit literals | **none remain** [verified] |
| Backend unit tests | `pytest backend` | **not re-run this session** — STATUS.md claims 106 passed |
| Mojibake | grep for `Â`/`â`/`Ã` leaders in `client/src` | **0 occurrences** [verified] |

---

## 1. Completed modules

### 1.1 Backend (locked, complete)
- Ten stage services + runner contract `{output, confidence, decision, trace_extra}`.
- Positional gating (409 lists prerequisite stages), single read path per stage.
- Auth (register/login/me), bcrypt cost 12, 24 h JWT.
- Adaptive baselines: 168-cell hour-of-week, per-device, versioned snapshots, `ArtifactVersion` ledger.
- Model competition persists `selection_rationale` on every ranked candidate — visible in the UI as
  *"#1 of 6 with composite 1.0. highest weighted blend of accuracy, error and speed…"* [verified].
- Anomaly stage records `baseline_version`; forecast exposes `mape_backtest`; recommendation carries
  `savings_kwh` / `savings_cost_inr` / `savings_co2_kg`.
- Audit feed `GET /activity`.

### 1.2 Frontend shell
- Single shell `AppShell.tsx`, 14 views + sign-in, switched by `activeView` (no router).
- Real auth with automatic register fallback; session restore from token.
- Live-data loader `lib/workspace.ts` maps recorded stage outputs → view shapes.
- Sign-in / entry (FE-003): dark-glass card, floating chips, travelling spark, orbit core, radar rings.
- Activity terminal streaming live audit events (verified: `report / workflow / recommendation` rows).
- Evidence inspector drawer.
- Pipeline rail with per-stage status and real per-stage durations (23 ms → 1 m 22 s) [verified].

### 1.3 Presentation layer completed this session
- **All module-level mock data removed** (`datasets`, `energyData`, `forecastData`, `qualityIssues`,
  `modelData`, `anomalyData`, `anomalies`, `recommendations`, `activityEvents` now start empty).
  An explicit `EMPTY_DATASET` sentinel replaced the fake "Eco Cloud / Riverton Works / Aster Logistics"
  library. Nothing renders as a metric until the backend returns it.
- Hardcoded KPIs replaced with recorded values across Overview, Models, Anomalies, Prediction,
  Quality, Library, Schema, Transform, Recommendations, Reports, Inspector, Activity terminal,
  and the top context strip (MODEL, WINDOW/RUN ID, SYNC).
- Empty states added for library, schema, quality, model list, anomaly queue, recommendation list.
- **Unit correctness** (see §4 — this was the largest correctness defect).
- Real dataset upload through `POST /datasets` (multipart) replacing the mock scan.
- Report export now fetches the authenticated PDF and downloads a blob.
- Run history replay per dataset.
- Step / Auto pipeline execution controls that call `POST /workflows/{id}/stages/{key}/exec`.
- Dead code and vendor branding removed; vendor chunk splitting added.

---

## 2. Incomplete modules

| # | Module | State | Notes |
|---|---|---|---|
| I-1 | `docs/FRONTEND_SPEC.md` P2 visual backlog | not started | Baseline 24×7 heatmap page, anomaly timeline/heatmap/device tree/compare mode, forecast scenario cards, recommendations kanban + impact matrix, report PDF-preview pages |
| I-2 | Guided Demo Mode (`Ctrl+D`) + Presentation Mode | not started | Spec §4.15 |
| I-3 | Global search (`Ctrl+K`) / command palette / notification centre depth | partial | Search + notification popovers exist but are not wired to backend entities |
| I-4 | Enterprise sample datasets for 8 industries | not started | `/sample-datasets` does not exist; only healthy / faulty / BDG2 built-ins |
| I-5 | Chart interaction depth | partial | No zoom, brush, pan, cross-filter or linked hover; recharts defaults only |
| I-6 | Storytelling layer per page | partial | View headers explain intent but pages do not narrate provenance → outcome |
| I-7 | SSE live streaming in the UI | not wired | Backend offers stream tokens; frontend polls/reloads instead |
| I-8 | Fresh-clone simulation | not re-run | Launcher path unverified this session |
| I-9 | CI / Makefile | stale | `ci.yml` still npm + deleted `frontend/src/`; Makefile references `npm run dev`, `npx tsc -b`, `Launch_EcoMind.bat` |
| I-10 | README | stale | documents `frontend/src/`, npm, port 5173 as primary |
| I-11 | Package version display | stale | sign-in footer shows `Build 1.4.0`, unrelated to `package.json` 1.0.0 |

---

## 3. Broken / risky components (fixed this session vs. outstanding)

**Fixed**
- Fabricated units: model error was labelled **kW** while the modelled column is `energy_kwh` → **kWh**.
  Chart axis `MAE / kW` → `MAE / kWh`. *This is the defect the product owner flagged.*
- Dead `domainMeta.fmt` asserted intensity units the data never contained
  (`kWh / m²`, `kWh / tonne`, `kWh / pallet`). Removed — the field had zero consumers.
- `defaultFieldsByDomain` unit typo `"palettes"` → `"pallets"`.
- Fake report draft line emitted `kWh` unconditionally → now uses the recorded unit.
- 55 double-encoded UTF-8 sequences rendered as visible mojibake (`Â·`, `â€”`, `â‚¹`, `â‚‚`, `âˆ’`, `â€º`, `â†’`, `Ã—`).
  Repaired to `·`, `—`, `₹`, `₂`, `−`, `›`, `→`, `×`. Zero mojibake leaders remain.
- The context strip printed the raw accent token (`Baseline v1 / lime domain`). Now prints the domain label.
- `MODEL` in the context strip rendered an empty `<strong>` before a model run. Now *"not selected yet"*.
- Schema role inference collapsed every column to `signal`; now classifies `index` / `entity` /
  `context` / `target` / `signal` from the recorded name + semantic type.
- View props added to the type but not the destructuring (silent runtime holes) — three view signatures repaired.

**Outstanding**
- Sign-in footer `Build 1.4.0` is a literal, not a build value.
- One console `401` on cold load when a stale token exists. Intentional (token clearing) but noisy.
- `NavId` includes `notifications`, so a stray notification view exists outside the "14 views + landing" freeze.

---

## 4. Missing backend integration

| Surface | Backend available | Frontend state |
|---|---|---|
| Datasets, stages, anomalies, forecast, recommendations, activity, baseline versions, schema | yes | **wired** [verified] |
| Report PDF (bearer) | yes | **wired** [verified] |
| Upload multipart | yes | **wired** [verified path exists; not exercised with a real file this session] |
| Stage exec / advance | yes | **wired** (Step / Auto) |
| SSE stream + stream tokens | yes | **not wired** — frontend polls |
| `GET /datasets/{id}/dq` | yes | exposed in client, not surfaced in the DQ view (view reads the `quality` stage) |
| Hierarchy / code lists | **no endpoint** | correctly not invented (STATUS.md §6.4) |

---

## 5. Performance

**Measured**
- App chunk **457.19 kB** (gzip 135.54 kB); vendor-react 11.92 kB; vendor-charts 403.49 kB; CSS 208.96 kB (gzip 35.38 kB).
- Builder warning: no chunk exceeds 500 kB after splitting. Before this session a single 951.07 kB chunk shipped.

**Outstanding**
- `vendor-charts` is a separate chunk but still **eagerly loaded** (imported directly by AppShell).
  True deferral needs `React.lazy` on chart-bearing views, which requires splitting the 3.7 kLOC shell
  into per-view modules.
- No virtualisation on `data-table` rows (anomaly queue caps at 24 rows client-side, so impact is currently low).
- No memoisation on the heavy derived arrays (recomputed every render).
- Every view re-reads module-level `let` state; correct only because `setWorkspace` re-renders the shell.

---

## 6. Accessibility

**Present**
- `skip-link`, `aria-label` on icon buttons, `aria-pressed` on toggles, `aria-label` on the terminal
  and inspector regions, tables with header rows, severity always labelled (colour never alone),
  `prefers-reduced-motion` honoured for the CSS keyframe set.

**Outstanding**
- No keyboard roving focus model inside the pipeline rail or the anomaly queue.
- The activity terminal re-renders rows without an `aria-live` region, so screen readers miss updates.
- Chart canvases (recharts) expose no accessible data table alternative.
- Inspector drawer does not trap focus, and does not restore focus to its opener on close.
- Contrast of `--eco-text-muted` on `--eco-panel` is marginal for the 8–9 px mono labels.

---

## 7. Responsiveness

- Verified at 1600×1000 desktop. Sign-in has explicit breakpoints at 980 px and 620 px.
- The dashboard grid, `schema-layout`, `import-layout`, `quality-three-panel`, `anomaly-table-panel`
  and `models-layout` have **no mobile breakpoints** — the three-terminal DQ layout is the worst case.
- Mobile was not visually verified this session.

---

## 8. Typography, colour, icons

**Typography** — Inter with `ui-monospace` labels at `.05em–.16em` tracking. The scale is inconsistent:
view titles use `clamp(26px, 3vw, 42px)` while hero headings use `clamp(42px, 5.2vw, 72px)`, and mono
micro-labels range from 7 px to 11 px with no token. There is no documented type scale.

**Colour** — `:root` defines ink/panel/line/text plus mint, blue, violet, orange, coral, yellow.
Semantics are assigned in the spec (mint=success, blue=running, violet=evidence, orange=warning,
coral=critical, yellow=medium) but **the palette is not tokenised in charts**: views pass raw literals such as
`#b6f36b`, `#8d86ff`, `#f5a56d` directly into chart props. A palette change cannot be made in one place.

**Icons** — lucide throughout, with a per-meter-family icon map (`fieldIconFor`) and a per-domain icon
map. Gaps: hospital, university, mall, office, data-centre have **no distinct domain icon** — they all
fall back to building/industry/logistics because `domainOf()` only classifies three domains.

---

## 9. Duplicate / unused code

**Removed this session**
- `pages/ComponentShowcase.tsx` (1,437 lines), `pages/Home.tsx`, `pages/NotFound.tsx`
- `components/AIChatBox.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`, `ManusDialog.tsx`, `Map.tsx`
- `_core/hooks/useAuth.ts`, `components/icons/AppIcon.tsx`, `components/foundation/ProcessingIndicator.tsx`
- `const.ts`, `platform.d.ts`
- `frontend/frontend-complete-correct/` (orphan duplicate tree containing its own `node_modules`)
- Vendor build plugins: `@builder.io/vite-plugin-jsx-loc`, the "Manus" debug-log collector writing
  `.manus-logs/`, the `window.__MANUS_CONFIG__` platform-config injector, `.manus*.computer` allowed hosts,
  and the `dist/api/platform/config.js` asset the injector emitted (no backend consumer existed).

**Still unused / should be reviewed**
- ~58 of the 60 files in `components/ui/` are **not imported by the app** (only `sonner` and `tooltip` are).
  They are tree-shaken out of the bundle but still typechecked and maintained. Removing them would also
  free 14 dependencies (`cmdk`, `vaul`, `embla-carousel-react`, `input-otp`, `react-day-picker`,
  `react-resizable-panels`, `next-themes`, `date-fns`, `streamdown`, `wouter`, `framer-motion`, …).
- Unimported dependencies still declared: `framer-motion`, `@trpc/*` (3), `drizzle-orm`, `express`,
  `mysql2`, `@aws-sdk/*` (2), `jose`, `superjson`, `nanoid`, `zod`, `axios`, `cookie`,
  `@hookform/resolvers`, `@types/express`, `drizzle-kit`, `@types/google.maps`, `add`.
- `frontend/shared/` is aliased as `@shared` but unverified as used.

---

## 10. UX findings

1. **Silent failure.** `loadWorkspace()` returns `null` on any thrown error and the shell keeps the last
   state. A backend outage looks like stale data rather than a problem.
2. **No connectivity indicator** for a degraded/failed API beyond the settings view's health probe.
3. **Auto-pipeline on first sign-in** is surprising: the user is dropped into a long run with toasts
   but no explicit opt-in or progress surface.
4. **The inspector is under-used** — only the anomaly queue opens it. Quality issues and recommendations
   have `onInspect`-shaped affordances but do not drive it.
5. **Terminal overlap.** The expanded activity terminal covers page content (visible over the anomaly
   chart's dataset/baseline sub-block). It is an overlay with no reserved space.
6. **Colour-only severity in charts**; the queue labels severity, the chart legend does not.
7. **Number formatting is inconsistent** — `en-IN` grouping (2,36,757) alongside Western grouping
   (5541, 75,76,850) and mixed decimal precisions.

---

## 11. Improvement ideas (candidate, not yet scheduled)

**Visual**
- Tokenise the palette into semantic CSS custom properties and delete chart literals.
- Publish a documented type scale (`.eco-eyebrow`, `.eco-micro`, `.eco-body`, `.eco-title`, `.eco-hero`).
- Add the five missing domain icons + `domainOf()` classifications so hospitals, campuses, malls,
  offices and data centres adapt as the spec requires.
- Give the activity terminal reserved layout space or a proper docked mode.

**Architecture**
- Split `AppShell.tsx` (~3.7 kLOC) into `views/*` + `shell/*` modules; enables `React.lazy` per view and
  removes the last eager chart dependency.
- Replace module-level `let` state with a real store (or React context) so views are pure and testable.
- Add a frontend test surface (Vitest is declared but no config exists).

**Demo / presentation**
- Guided Demo Mode driven by real stage events, narrating provenance → understanding → decision.
- Presentation Mode that hides dev chrome and enlarges KPIs and charts.
- Storytelling band per page: *where the data came from · what EcoMind understood · what happened · why · what's next*.

**Charts**
- Linked hover / cross-filter across anomaly timeline, heatmap, device tree and inspector.
- Brush + zoom on the anomaly and forecast charts; scenario comparison cards on forecast.

---

## 12. Summary judgement

The platform is **functionally live end-to-end** and now contains **no fabricated metrics, datasets,
units or branding** that I could find. Typecheck and build are clean, and every API the UI depends on
returned 200 in a real browser session with zero JS exceptions.

It does **not** yet meet the "world-class enterprise" bar. The gap is concentrated in three places:
1. **Visual system** — untokenised palette, undocumented type scale, no mobile breakpoints, no chart interaction depth.
2. **Structure** — a single 3.7 kLOC shell module that blocks lazy loading, memoisation and unit testing.
3. **Narrative** — the platform shows correct numbers but does not yet *teach* what it is doing,
   and has no self-presenting demo mode.

Those three, plus the eight-industry sample dataset set, are the remaining work. See
[`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md) for the ordered plan and
[`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md) for how to resume.
