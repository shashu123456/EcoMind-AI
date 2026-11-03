# EcoMind — handoff

Everything below is the state of the working tree at the end of the session that
added the forecast generator, the recommendations desk, the reports API/studio,
the living hero, the command palette and the import studio. Nothing is committed.

---

## 1. Run it

```bash
# backend (no auto-reload — restart after any Python change)
cd backend && ../.venv/Scripts/python.exe run.py        # 127.0.0.1:8000

# frontend
cd frontend && npm run dev                              # 127.0.0.1:5177, /api proxied to 8000
```

Login: `admin@ecomind.ai` / `admin123`
Primary dataset: `63a076b7-8428-462b-9bed-600a4438103b` (Airport Terminal, 5,401 rows)

On Windows, `netstat -ano | grep 0.0.0.0:8000` then `taskkill //PID <pid> //F`
before restarting. Background starts via `nohup`/`(cmd &)` get killed — use the
tool's BACKGROUND mode.

## 2. Checks

```bash
cd frontend && npx tsc --noEmit        # expect exactly 2 errors, both pre-existing, in lib/useSound.ts
cd backend && ../.venv/Scripts/python.exe -c "import app.main; print('ok')"
```

`lib/useSound.ts(58,22)` and `(61,11)` were already broken before this work and
are untouched. Do not "fix" them as part of another task without saying so.

`sites_*` / deployment: none of this has been deployed. No commit has been made.

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
