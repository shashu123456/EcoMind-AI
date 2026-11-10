# EcoMind — handoff

State of the working tree at the end of the 2026-11-10 release pass.
HEAD is `b483aa6` plus the unpushed commits on top of it (see §6).
This file was rewritten on that pass; the stale port, test count and
"backend not touched" lines below were measured false and are corrected here.

---

## 1. Run it

```bash
# backend (no auto-reload — restart after any Python change)
cd backend && ../.venv/Scripts/python.exe run.py        # 127.0.0.1:8000

# frontend — the dev server is optional; the built SPA is served by the backend
cd frontend && pnpm dev:static                            # 127.0.0.1:5173, /api proxied to 8000
```

Login: `admin@ecomind.ai` / `admin123` — **demo only, rotate before any public deployment**.
Primary dataset: `63a076b7-8428-462b-9bed-600a4438103b` (Airport Terminal, 5,401 rows).

On Windows, `netstat -ano | findstr 0.0.0.0:8000` then `taskkill //PID <pid> //F`
before restarting.

## 2. Checks

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest -q        # 247 passed, 0 failed
cd frontend && pnpm check && pnpm build:static               # tsc 0 errors; build green
```

`lib/useSound.ts(58,22)` and `(61,11)` were already broken before this work and
are untouched. Do not "fix" them as part of another task without saying so.

`sites_*` / deployment: none of this has been deployed. The work is committed
locally as `b483aa6` and has not been pushed.

---

## 3. Done (verified against the live stack)

### Forecast / Prediction
- `backend/app/domain/model_artifacts.py` — joblib + `.meta.json` (feature order,
  target, hyperparameters). `model_service` now persists every candidate and sets
  `model_path`; previously the estimator was thrown away, so nothing could predict.
- `cost_inr` / `co2_kg` removed from the model matrix (they are exact functions of
  the target — R² 1.0 / MAPE 0% leakage). Model now: extra_trees, R² 0.955,
  MAPE 4.02%, trend 98.09%.
- `forecast_service.py` rewritten: recursive hourly inference per device,
  exogenous columns held at trailing same-hour-of-week mean, band from held-out
  residual std growing √h, cost via tariff, peaks, 7 horizons + 12m, versioned
  rows, per-horizon snapshots, `detail/history/restore`, chart reader fixed for
  both hourly and monthly point shapes. Generation 191s → ~33s.
- Routes in `backend/app/routes/datasets.py`: `GET/POST /{id}/forecast`,
  `GET /{id}/forecast/history`, `POST /{id}/forecast/restore`.
- Frontend `components/shell/ForecastLab.tsx` + `forecast-lab.css`, mounted at
  `case "prediction"`. Verified: 30d = 720 points, 6,279,211 kWh, ₹1,241,840,
  3,139,606 kg CO₂, 9 KPIs, pagination 2/30, horizon switch to 24h → 2,09,725 kWh.

### Recommendations
- `backend/app/routes/recommendations.py` (new, registered in `main.py`):
  list with filters/KPIs/facets/matrix, detail (root causes from cited anomalies),
  status, assign, simulate, `export/all`.
- `recommend_service.py` carries status/assignment/history forward on regeneration
  (stored inside `supporting_evidence` JSON — schema is fixed).
- Frontend `RecommendationDesk.tsx` + `recommendation-desk.css` at
  `case "recommendations"`.

### Reports
- `backend/app/routes/reports.py` (new, registered in `main.py`): generate, list
  (history with model / accuracy / baseline version / forecast version / owner /
  size), detail (sections as a document), rename, duplicate, delete, compare,
  and `export?format=pdf|docx|xlsx|pptx|csv|json`.
- `python-docx` and `python-pptx` installed **into `.venv`** (they existed only in
  the system Python, which caused the first 500s). Reportlab/openpyxl were already
  present.
- Frontend `ReportStudio.tsx` + `report-studio.css` + `lib/reports.ts` at
  `case "reports"`. Document preview with thumbnails, page jump, zoom, search,
  print, fullscreen, paper mode; history table with all actions; comparison table.
- Verified: 12 sections, all six exports 200 with real byte sizes, rename with
  Unicode 200, duplicate/delete 200, compare 55 figure rows.

### Landing / shell
- `LivingHero.tsx` + `living-hero.css` — single rAF canvas (rings, node network,
  packets, pulses, scan, breathing core), DPR capped at 2, pauses when hidden,
  static frame under reduced-motion; mounted inside the existing
  `.hero-panel__visual` without removing its markup.
- `CommandPalette.tsx` + `command-palette.css` — Ctrl/⌘+K and `/`, lists all
  fourteen modules plus every dataset, arrows/enter/escape, drives the real `goTo`.
- Library: search wired, sort cycling (Newest → Rows → Health → A–Z), favourites in
  `localStorage` (`ecomind.favorites`) sorted first, animated circular health ring.

### Import
- `ImportStudio.tsx` + `import-studio.css` replaces `ImportView` at
  `case "import"`. Dropzone → `datasetsApi.upload` → shell `onUploaded`.
  Intelligence panel, quality gauge, 12 category modules (counts derived from the
  real dataset list), 9-node pipeline timeline, 4 capability cards, sessions table.

---

## 4. Still to do — in priority order

### P0 — correctness / cleanup

1. ✅ **Recommendation reset** — `T1-A-HVAC` (P1) is back to `open`, note "reset from smoke test".
2. ✅ **Database cleanup** — report history 4 → 1 (newest `ea202a16` kept, rest deleted
   through the API, which also unlinks their PDFs); forecasts 44 → 16 (newest two per
   horizon across the eight horizons).
3. ✅ **Dead code removed** — `ReportsView`, `ReportPreviewModal`, `PredictionView`,
   `RecommendationsView` and `ImportView` deleted from `AppShell.tsx` (~5,514 → 3,714
   lines). No dangling references; `tsc` reports only the two pre-existing `useSound.ts`
   errors.


### P1 — the honest gaps from the last three requests
4. **Report sections the spec asked for but the module forbids.** The report has
   no Transformation, Model Selection or Baseline Learning section, so those stage
   rows read "Not recorded by the pipeline". This is because
   `backend/app/domain/report_service.py` enforces a locked section order
   (`settings.report_sections`) *and* `_assert_no_model_metrics()`, which
   deliberately keeps model metrics out of the PDF. Lifting that is a product
   decision: change `settings.report_sections`, add builders reading the
   `transformation` / `model` / `baseline` snapshots, and relax or delete the
   silence assertion (check for tests asserting it first).
5. **Dataset metadata.** Cards and the import panel cannot show missing values,
   duplicate %, sampling rate, time range, total/peak/average load, owner or file
   size because the `Dataset` record does not carry them. Add them to the dataset
   payload (profiling stage already computes most of it) and then fill the cards,
   the import panel and the library filters.
6. **Landing page items not built:** live status bar (CPU/memory/inference),
   counter-animated KPIs, pipeline timeline packet flow with hover stats, dataset
   card tabs (hourly/daily/weekly/monthly with brush/zoom), right-hand live
   monitor, animated activity feed, boot/loading sequence, real-time clock and
   session timer, floating AI assistant.
7. **Import page items not built:** drag-and-drop for anything beyond CSV/XLSX,
   upload progress percentage (only a spinner), schema preview before commit,
   estimated processing time, Framer-Motion animation (not a dependency — CSS
   animations used instead), preview side panel with the first 100 rows.

### P2 — polish
8. Global search in the top bar (the palette covers modules and datasets; the
   header input at `AppShell.tsx` ~line 1726 is still inert).
9. Report charts: section pages show KPI tiles and sparklines for numeric arrays;
   real area/heatmap/pie charts need the report to store series, not aggregates.
10. Forecast progress: generation takes ~33s for all horizons; the UI shows a
    spinner, not streamed stage events.
11. `reportsApi.duplicate` returns the copy but the studio reloads the whole list
    instead of inserting it — fine, slightly wasteful.

---

## 5. Constraints worth knowing before editing

- **Backend has no reload.** Any route/service change needs a process restart.
- **Section order and the model-metrics silence are enforced in code**, not just
  convention — `build_sections()` raises if the keys drift from
  `settings.report_sections`.
- **Forecast rows are append-only versions.** "Restore" clones an old row forward;
  it does not mutate. Do not add a schema field for this; history lives in
  `artifact_versions`.
- **Recommendation approvals are stored in JSON**, keyed `(device_code, category)`,
  and are carried forward on regeneration.
- **`AppShell.tsx` is ~4,900 lines** with no `noUnusedLocals`, which is why new
  pages are mounted as separate components instead of editing the inline views.
- **Vite HMR does not always apply a newly imported component** — if a new page
  renders blank, do a full reload before debugging.
- **Navigation is state-driven, not hash-driven.** Changing `location.hash` alone
  does not switch views; click a nav item or use the palette.
- **Local-storage keys introduced:** `ecomind.favorites`.
- **Installed packages:** `python-docx`, `python-pptx` (venv only).

---

## 6. File map of this session

```
backend/app/domain/model_artifacts.py        new
backend/app/domain/model_service.py          artifact save + leakage fix
backend/app/domain/forecast_service.py       rewritten
backend/app/domain/recommend_service.py      status carry-forward
backend/app/routes/datasets.py               forecast endpoints
backend/app/routes/recommendations.py        new
backend/app/routes/reports.py                new
backend/app/main.py                          routers registered

frontend/client/src/lib/api.ts               forecastApi, recommendationsApi, types
frontend/client/src/lib/reports.ts           new
frontend/client/src/lib/useSound.ts          earlier tone-ref fix (2 pre-existing errors remain)
frontend/client/src/components/shell/
  ForecastLab.tsx / forecast-lab.css          new
  RecommendationDesk.tsx / recommendation-desk.css  new
  ReportStudio.tsx / report-studio.css        new
  LivingHero.tsx / living-hero.css            new
  CommandPalette.tsx / command-palette.css    new
  ImportStudio.tsx / import-studio.css        new
  AppShell.tsx / AppShell.css                 wiring, library search/sort/favourites, health ring
  AnomalyLab.tsx                              earlier wheel-zoom listener fix
```

---

## 7. Git state (observed at handoff)

**Committed:** `b483aa6` — 48 files, local only, not pushed. Backup files
(`*.bak`, `*.bak2`) were stripped from the commit with an amend.

Modified: `forecast_service.py`, `model_service.py`, `recommend_service.py`,
`main.py`, `routes/datasets.py`, `AppShell.tsx`, `AppShell.css`, `lib/api.ts`,
`lib/useSound.ts`, `lib/workspace.ts`.

New from this session: `model_artifacts.py`, `routes/recommendations.py`,
`routes/reports.py`, `ReportStudio`, `ImportStudio`, `LivingHero`,
`CommandPalette`, `ForecastLab`, `RecommendationDesk` (+ their CSS), `lib/reports.ts`.

**Untracked cruft that predates or is unrelated to this session — review before
committing:**
- `backendappcoreexecutionsession_store.py` — looks like a path typed without
  separators; decide whether it is real code or junk before deleting.
- `frontend/client/src/components/shell/AppShell.tsx.bak2` — backup file, safe to remove.
- `backend/workflow_definition.py`, `workflow_definition_backup.py`,
  `workflow_definition_orig.py`, `backend/test_workflow.yaml` — parallel copies,
  unclear which is authoritative.
- `backend/app/core/execution/` — untracked package referenced by the app path.
- `.cloud-attachments/`, `PRODUCT_EXCELLENCE_REPORT.md` — unrelated to the pipeline.

Careful: `AppShell.tsx` shows ~2,400 changed lines because the unused views were
never deleted while new pages were mounted; the diff is noisy for that reason.

---

## 8. Simplification + animated front page (latest session)

### What changed (all in `frontend/client/src`)

**New shared design layer**
- `styles/blocks.css` — the single card language every page now uses: `.blk`,
  `.blk-head`, `.blk-kpis`, `.blk-kpi`, `.blk-launch`, `.blk-rail`, `.blk-grid`,
  `.blk-rows`, `.blk-row`, `.blk-meter`, `.hero-block`. Imported from `index.css`
  right after `styles/tokens.css`.
- Every pipeline page's lead (`sd-hero`, `ql-hero`, `tl-hero`, `ml-hero`,
  `is-hero`) is restyled by `blocks.css` into one compact header block: left
  accent bar, 19–25px title, 12px one-line context. No markup change needed there.

**Front page (Mission control) — rebuilt**
- `OverviewView` in `shell/AppShell.tsx` is now: animated hero → KPI strip →
  pipeline rail → active dataset + health + next action.
- Removed: the old marketing hero, the mini chart (`recharts` AreaChart), the
  "Transparent by default" activity panel, the overview footer, the duplicate
  command block.
- Hero contains **Guided run** and **Auto run**; Guided = `onAuto` (walks pages as
  stages complete), Auto = `onRunAll` (`execAllAndReport`, ends on the report).
- KPI/quality/anomaly values use `components/fx/NumberTicker.tsx` (rAF count-up).
  It renders the settled value first and only animates once a real frame is
  available, so a hidden/throttled tab can never show 0.

**Open-source animation kit (new, vendored, MIT)**
- `components/fx/AnimatedBeam.tsx` — Magic UI `AnimatedBeam`, adapted from
  `motion/react` to the already-installed `framer-motion`.
- `components/fx/NumberTicker.tsx` — Magic UI `NumberTicker`, same adaptation.
- `components/fx/EnergyFlow.tsx` — EcoMind layout: dataset node → 4 stage nodes,
  one animated beam per link (uses the vendored beam).
- `components/fx/fx.css` — hero block, scan line, flow nodes, beam positioning.
- `docs/open-source-credits.md` — attribution for the vendored files.
- `LivingHero` (already in the repo) is back as the hero's canvas particle field.

**Import page — was broken, now rebuilt**
- `shell/ImportStudio.tsx` had been reduced to a background canvas + empty
  header (about 120 lines of real UI missing) and rendered a blank page. It is a
  full working page again: drop zone, file picker, real `POST /datasets/upload`,
  success card with the returned dataset, error card, and "what happens next".
  No fake pipeline timings or placeholder metrics.
- `shell/import-studio.css` rewritten for that markup.

**Filler removed per page**
- Library: raw UUIDs, "AI CLASSIFIED" tag stretch, favourite button, and the two
  bottom panels (classification % / object-store blurb).
- Schema: "Discovery events" feed and "How the columns connect" chip map.
- Quality: repair timeline, AI-repair explanation, the three decorative charts,
  weakness heatmap and version snapshots panel (evidence table + rules kept).
- Models: radar, composite-score line chart, residual/confidence panel,
  training-pipeline strip (candidates, matrix, feature importance kept).
- Anomalies: heatmap + AI-insight grid and device-impact table.
- The generic shell `view-header` is only rendered on `library` and `import`
  (`PLAIN_HEADER_VIEWS`), so no page shows two headlines.

### Checks run
```bash
cd frontend/client && npx tsc --noEmit      # clean
cd frontend && npx vite build               # succeeds (only the chunk-size warning)
```

### Still open (next agent can pick these up)
1. `TransformLab`: "When this dataset behaves normally" and "Raw column to
   prediction" panels are still decorative — decide keep/remove.
2. `ReportStudio`: still on its own `rs-` CSS and it opens with a full-height
   cover-page mock plus a section list that says "Queued" for every block even
   when a stored report exists. Replace the cover with a compact report summary
   and drive the section list from the recorded document.
3. `ForecastLab` / `RecommendationDesk`: only the hero was compacted; their inner
   cards are still page-local styles.
4. `HistoryView`, `NotificationsView`, `SettingsView`: untouched beyond the
   header change — settings still renders sections that may not be needed.
5. Overview: the `ActivityTerminal` drawer still floats over the bottom-right of
   the content.
6. The context strip fades at its right edge; verify on a 1280px screen that no
   label is clipped mid-word.
7. Nothing is committed or pushed yet for this session.

## 9. Density + alignment pass (latest session)

The complaint that drove this pass: too many blocks per page, too much spacing
between them, and layouts that did not line up when the window was narrowed or
the browser zoomed.

### Root causes found and fixed
- A global "readability" rule in `AppShell.css` set `.view-shell` to
  `padding: 38px 42px 100px; max-width: 1680px` at every width, inflated the
  page h1 to `clamp(31px, 3.6vw, 52px)`, and reserved a 100–252px blank strip at
  the bottom of every page for the floating activity terminal. `.view-shell` is
  now `1440px / 18px 22px 56px`, the terminal reserves 132px only while open,
  and page h1 sizes are back to a caption scale.
- `.view-content` had no shared rhythm: every page added its own margins on top
  of whatever gap the parent had. It is now a grid with one 14px gap, and direct
  children can no longer carry vertical margins (`.view-content > *`).
- Page grids were fixed-column (`minmax(...)` pairs, `repeat(4, 1fr)`), so a
  narrowing window left half-empty rows. `sd-layout`, `ql-top`, `tl-layout`,
  `fl-grid2`, `al-grid2`, `desk-layout`, `.blk-kpis`, `.ql-hero__counters`,
  `.al-kpis`, `.fl-kpis`, `.desk-kpis` now use `auto-fit` with one gap value.
- The context strip clipped a label mid-word ("DOMA") at narrow widths; the
  secondary metadata is hidden below 1080px and the separators drop out.

### Blocks removed / merged per page
- Schema: the 10-cell dataset summary panel and the AI-reasoning column are
  gone; the hero keeps 4 counters + 7 actions (4 of them icon-only) and the
  health panel moved next to the field explorer.
- Quality: dropped the duplicate repair-detail table (the rule cards already
  carry the evidence), the scan strip, and the closing save/guardrail/footnote
  strips. The gauge is now 128px and shares its row with the dimension bars.
- Models: dropped the comparison matrix (duplicate of the leaderboard), the
  training strip, and the four generic prose columns inside each candidate.
- Anomalies: 10 KPIs → 5, 16-field focus grid → 8, dropped the contribution
  bars and the root-cause/distribution pair.
- Transform: dropped the second 10-cell dataset summary, the explainer + stats
  side column, and the heatmap/lineage pair. Hero copy is one line.
- Forecast: 9 KPIs → 5, dropped "Peaks in this horizon" (the values are in the
  KPI strip) and the footer; model panel shows 4 rows + 4 gauges.
- Recommendations: dropped the ENERGY/COST/CARBON tiles (the header already
  states them), the "Human in the loop" prose panel and the footer; card
  rationales clamp to three lines.
- Reports: removed the 455px cover-page mock, the generation panel is a normal
  block (its button had no CSS at all), section rows no longer say "Queued"
  when the document holds them, and `.rs-page` is 380px instead of 520px.
- Import: dropped "What happens next"; the dropzone no longer reserves 500px.
- Run history: it rendered **506 rows / 41,855px**; now the newest 40 with a
  note that the rest stay in the audit trail.

### Checks run
```bash
cd frontend/client && npx tsc --noEmit   # clean
cd frontend && npx vite build            # succeeds (chunk-size warning only)
```
Verified in the running preview by measuring each view's DOM: no horizontal
overflow anywhere (`scrollWidth === clientWidth`), and block counts per page are
now Schema 3, Quality 3, Models 3, Anomalies 5, Transform 4, Forecast 5,
Recommendations 4, Reports 3, Import 2 (plus systems pages, which were already
two blocks).

### Still open
1. The preview window used for verification is ~766 CSS px, so pages stack; the
   two-column behaviour above 1100px was verified by measurement, not visually.
   Re-check `sd-layout` / `tl-layout` / `desk-layout` at ≥1280px in a maximised
   window.
2. `Layout` of the report *preview* page (`.rs-page`, thumbnails) was only
   measured, not reviewed on screen.
3. `ActivityTerminal` still floats over the bottom-right of content; it is
   collapsed by default, but it is the one overlay left on every page.
4. Nothing from sessions 8–9 is committed or pushed.
