# EcoMind AI — Gap Analysis (Spec vs Implementation)

**Companion of `PROJECT_MASTER_SPEC.md` (v2.0.0).** Generated 2026-09-17 against the live
implementation. Re-run/update after every roadmap task closes.

Legend: ✅ done · 🟡 partial · ⬜ missing · 🔧 needs improvement · 🎨 UI polish · ⚙ API · 🐞 bug

---

## 1. Already Implemented (verified)

| Area | Evidence |
|---|---|
| Backend 17-stage workflow engine + runner registry (`workflow/stages.py`, `routes/workflow.py`) | `pytest` 6/6 green; `scripts/demo_end_to_end.py` 17/17 PASSED |
| 21-table SQLite schema (`db/models.py`) incl. provenance, traces, gates, comparisons, registry, audit | live DB `backend/data/ecomind.db` |
| Auth (JWT + bcrypt), admin seed, role field | live login verified (admin@ecomind.ai/admin123) |
| All stage services: schema, dq, transform, features, models, prediction, shap, anomaly, benchmark, recommend, trust, comparison, executive, report, registry, conversation | registered runners; stages executed in demo |
| Data Quality Engine with scored dimensions + severity + explanations (`dq_service`) | live exec: DQ 100 |
| Raw-vs-Processed comparison + comparison charts | API + stage runner present |
| Confidence Gate with locked formula + verdict | live Trust 94/100 (high_trust) |
| Executive summary aggregate | live via `/ai/{ds}/executive` |
| Reports (PDF via reportlab) | real PDFs in `backend/data/reports/` |
| SSE event bus (`events/event_bus.py`, `workflow/events.py`) | implemented, documented contract |
| Desktop launcher (spawn.py consoles, tees, logs, pid-guard, port-skip, system_check) | system_check ALL PASSED |
| Frontend: 19 pages, router, typed API client, hooks, zustand journey store | tsc + vite build green many times |
| Frontend design system: tokens.css, kit.tsx primitives, PipelineRail, split-screens, gauges | built into production bundle |
| Tests + demo + Makefile + pytest.ini + sample CSVs in Downloads | pytest green; artifacts present |

## 2. Partially Implemented (🟡)

| Item | Current state | Gap |
|---|---|---|
| SSE consumption on frontend | backend streams; frontend **polls** (`journey.ts`, 6s) | UI never opens `/workflows/{id}/stream` — loses live stage fidelity |
| Schema discovery UX | `/schema` page exists; endpoint works | `GET /datasets/{id}/schema` returns empty `columns` until a discovery run; page must handle empty state + run discovery |
| Anomaly precision/recall | `detect` returns precision/recall when `is_anomaly` column present | no UI surfacing of p/r; no regression test |
| Report types/formats | PDF works (executive-style) | HTML + CSV formats + report-type variants not demonstrated |
| Model registry detail | promote/deprecate + `is_current` implemented | no dedicated registry detail view (hyperparameters, version diff) in UI |
| AI chat | conversation_service present | not surfaced as a chat panel in UI; no tests |
| Timeline (AI Reasoning Timeline) | stage traces persisted; `/ai/{ds}/timeline` endpoint | not rendered as a timeline visual anywhere |
| PipelineRail | animated rail exists | not wired to SSE; stage transitions driven by poll |
| Docs | ARCHITECTURE/API_CONTRACT exist | PROGRESS.md stale (all ⬜); BUILD_LOG.md missing implementation entries; ARCHITECTURE references pre-implementation layout (`api/`, `domains/`, `pipeline/`, `quality/`, `features/`, `ml/`, `reports/`, `events/` differ from actual `routes/`, `domain/`, `workflow/`) |

## 3. Missing (⬜)

- **Frontend unit tests** — vitest installed; `frontend/src/**/*.test.*` = 0 files.
- **Browser/pixel QA** — no browse-based verification of any page rendering against live data.
- **SSE-driven live progress** in the UI.
- **AJAX/SSE fallback + reconnection** handling in `api.ts`.
- **Anomaly precision/recall + confidence curve** chart on Anomaly page.
- **Research artifact assets** — methodology figures (DQ composite curve, confidence-gate
  decomposition, raw-vs-processed panels, SHAP stability), dataset citation card, reproducible
  experiment script per run.
- **HTML/CSV report generation path** (code exists per contract; not exercised).
- **`docs/PROGRESS.md` updated stage matrix** (still all ⬜).
- **`.gitignore` / repo hygiene** — project dir is not a git repo; `data/` contents must never be
  committed; consider a `.gitignore` for any future VCS.

## 4. Needs Improvement (🔧)

- **`models.WorkflowRun.total_stages` default = 18** while `TOTAL_STAGES` = 17. Sync (bug).
- **api.ts type drift:** `PreviewPayload.columns: string[]` vs backend objects
  `{name, data_type}` — runtime tolerates, type is wrong (root cause of earlier crash).
- **Dynamic-import of `api.ts` inside `journey.ts poll()`** — trigger of the build warning;
  refactor to static import.
- **`as any` leaks** in pages/components — tighten with real contract types.
- **`prefers-reduced-motion`** — confirm all animated components honor it.
- **Accessibility audits** — focus indicators, ARIA labels on interactive elements, keyboard
  nav on tables/gauges not yet systematically verified.
- **Responsive breakpoints** — pages verified at desktop only.
- **Backend pagination consistency** — `limit`/`start` documented; not all list endpoints honor
  it identically.
- **SSE auth** through `?token=` vs Bearer; no client-side reconnect logic.

## 5. UI Polish Required (🎨)

- Dashboard/Mission Control: verify executive zero-data handling; tighten spacing consistency.
- DQEngine split-screen: confirm live rule-animation pacing; ensure processed table loads with
  skeleton shimmer.
- RawProcessedComparison: VS-panel improvement arrows should show real deltas (already populated;
  verify rendering).
- ConfidenceGate: component bars must tie to `factors` object; gauge legend clarity.
- SchemaDiscovery empty-state (needs discovery run) — make intent obvious with one-click run.
- Anomaly page: severity legend + per-anomaly expand + timeline density.
- History: run-reopen affordance (route deep-link) + registry detail drawer.
- Reports: preview card + download button UX; list refresh after generate.
- Login: error messages and loading state; Post-login redirect integrity.
- Table CSV export button where StreamTable is used (currently export capability not uniform).
- Consistent card radii/shadows across panels (audit against tokens).

## 6. Animation Improvements

- Wire moving progress to **SSE events** (`stage_started/completed`) rather than polling only.
- Skeleton shimmer on every async load (replace any spinner).
- PipelineRail traveling-light timing tied to real stage durations; add pulse on active stage.
- Numbers: standardize `AnimatedNumber` usage for all computed KPIs.
- `prefers-reduced-motion` audit pass.

## 7. API Improvements (⚙)

- Align `total_stages` in `models.py` with `TOTAL_STAGES`.
- Normalize pagination (`limit` cap 5000, `start` offset) across list endpoints.
- Add structured summary endpoints where pages compute client-side:
  e.g. `/history` aggregated run cards, `/registry` with model metadata joined in.
- Return `Cache-Control` per contract now that middleware exists (index no-store; assets immutable).
- Consider `GET /workflows/{id}` include `traces` count + latest trace for History page.
- Add `precision`/`recall` to anomaly detect response even when absent (null) for type stability.

## 8. Bug Fixes (🐞)

- `WorkflowRun.total_stages` default 18 → 17. **Priority 1.**
- api.ts `PreviewPayload.columns` type — restore accuracy. **Priority 1.**
- Schema page empty-`columns` crash risk — guard + a "Run discovery" action. **Priority 1.**
- Verify frontend handles `recommendations.by_category`/`savings_percent` absences gracefully
  (defensive defaults on Recommendations + Executive pages).
- Verify `benchmarks.leaderboard` missing-scores rendering.
- Regression: preview columns crash (fixed 2026-09-17) — add a unit test to prevent recurrence.
- SSH/SSE: reconnect + heartbeat edge cases.

## 9. Research Paper Improvements

- Methodology narrative per stage (already in spec; needs figures):
  - DQ composite score curve (score climbing per rule, dimension weights annotated).
  - Confidence-gate decomposition (four weighted components → verdict).
  - Raw-vs-Processed metric bars + SHAP divergence.
  - SHAP stability bootstrap illustration.
- Reproducibility package: seed → full run → report, with dataset citation + provenance snapshot.
- Tables of experiments: model leaderboard (R²/RMSE/MAE/MAPE), anomaly p/r, benchmark matrix.
- Limitations section written in paper voice (Section 35 of spec adapted).
- Baseline comparisons vs raw pipeline (quantified delta) as the headline IEEE contribution figure.

---

*Regenerate this file's statuses as tasks complete.*