# EcoMind AI — Implementation Roadmap

**Companion of `PROJECT_MASTER_SPEC.md` (v2.0.0).** Ordered by dependency: **never skip**.
After every completed task: append to `docs/BUILD_LOG.md` and sync spec/gap-analysis status.

Rating scales:
- **Pri** = Critical / High / Medium / Low
- **Effort** = S (<0.5 day) · M (0.5–1 day) · L (1–3 days) · XL (3+ days)
- **Research** = research importance 0–5
- **Presentation** = demo/paper importance 0–5

Status: ⬜ todo · 🔄 in progress · ✅ done

---

## Phase A — Correctness & type integrity (do first)

| # | Task | Pri | Effort | Research | Presentation | Status |
|---|---|---|---|---|---|---|
| A1 | Fix `WorkflowRun.total_stages` default 18 → 17 (`backend/app/db/models.py`); add migration-safe default; assert `TOTAL_STAGES == 17` consistency. | Critical | S | 3 | 2 | ✅ |
| A2 | Restore frontend type-truth: `api.ts` `PreviewPayload.columns: (ColumnMeta)[]` where `ColumnMeta={name,data_type}` (matches backend); update other drifted types (exec/CONF receivers); keep rendering tolerant (`colLabel` already). | Critical | M | 2 | 3 | ✅ |
| A3 | Schema page (`/schema/$datasetId`) empty-columns guard: show "Run schema discovery" CTA + trigger POST discover; never crash on empty list. | Critical | S | 2 | 3 | ✅ |
| A4 | Add regression test: preview columns-as-objects render path (vitest on StreamTable colLabel + api parse); backend pytest for `total_stages`=17 on a started run. | Critical | M | 3 | 2 | ✅ |

## Phase B — Live runtime fidelity (streaming + history)

| # | Task | Pri | Effort | Research | Presentation | Status |
|---|---|---|---|---|---|---|
| B1 | Refactor `journey.ts` poll: static import of api client; remove "dynamically imported" build warning; keep best-run dataset selection. | High | S | 1 | 2 | ✅ |
| B2 | SSE live stage progress: journey store opens `/workflows/{run_id}/stream` (EventSource w/ token), applies `stage_started|stage_completed|run_completed` to stageStatuses + refreshToken; auto reconnect; polling remains as fallback. | High | L | 3 | 4 | ✅ |
| B3 | History page: deep-link reopen of past runs (route carries runId → sets journey datasetId+runId), run-card statuses, "open in Mission Control" affordance. | High | M | 2 | 4 | ✅ |
| B4 | Model registry detail drawer on `/history`: hyperparameters, metrics, promote/deprecate actions, `is_current` badge; wire existing `/registry` endpoints. | High | M | 3 | 3 | ✅ |
| B5 | Anomaly page: surface precision/recall when ground truth exists; severity legend; timeline density + expandable rows; defensive defaults for `by_type/by_severity` absences. | High | M | 4 | 3 | ✅ |

## Phase C — Verification & test coverage (gate to polish)

| # | Task | Pri | Effort | Research | Presentation | Status |
|---|---|---|---|---|---|---|
| C1 | Frontend test harness: vitest config + first suites — `lib/kit.tsx` (colLabel, StreamTable), `lib/api.ts` request/error/401, `lib/journey.ts` poll dataset selection + SSE reducer; `npm run test` green. | High | L | 3 | 2 | ✅ |
| C2 | Browser-grade runtime QA of all 19 pages against live server: reproduce, log, fix every rendering bug found; capture before/after evidence. | Critical | L | 4 | 5 | ⬜ |
| C3 | Executive/Recommendations/Benchmark defensive rendering: verify every optional field has defaults (leaderboard, by_category, savings_pct, shap_drivers, anomalies empty). | High | M | 3 | 3 | ⬜ |
| C4 | Backend harden: normalize pagination (`limit`≤5000, `start`) across list endpoints; null-safe anomaly `precision/recall`; workflow list includes trace counts. | High | M | 2 | 2 | ⬜ |

## Phase D — Research & paper assets

| # | Task | Pri | Effort | Research | Presentation | Status |
|---|---|---|---|---|---|---|
| D1 | Reproducibility script `scripts/run_experiment.py`: seed → full 17-run → scrape DQ/exec/gate/comparison/leaderboard/anomaly-p/r → JSON results file (paper data). | High | L | 5 | 4 | ⬜ |
| D2 | Methodology figures rendered from real run data (SVG/PNG export): DQ composite curve, confidence-gate decomposition, raw-vs-processed bars, SHAP stability; saved under `research/figures/`. | High | L | 5 | 5 | ⬜ |
| D3 | Dataset citation card + provenance appendix text (BDG2-inspired) for paper; CSV of experiment tables. | Medium | S | 4 | 3 | ⬜ |
| D4 | Paper-voice Limitations section (adapt spec §35), methodology narrative, claims scoped to measured results. | Medium | S | 4 | 3 | ⬜ |

## Phase E — Docs sync & polish pass

| # | Task | Pri | Effort | Research | Presentation | Status |
|---|---|---|---|---|---|---|
| E1 | Sync docs: `PROGRESS.md` stages → ✅ files; `ARCHITECTURE.md` layout → actual (`routes/`,`domain/`,`workflow/`); `API_CONTRACT.md` deltas; `BUILD_LOG.md` full implementation history. | High | M | 2 | 3 | ⬜ |
| E2 | Design-polish audit vs tokens (radii/shadows/spacing), `prefers-reduced-motion`, focus indicators, keyboard nav, responsive mobile→4K; fix violations. | Medium | M | 1 | 4 | ⬜ |
| E3 | CSV export parity on all `StreamTable` surfaces; empty states + skeleton shimmer everywhere. | Medium | S | 1 | 3 | ⬜ |
| E4 | Repo hygiene: `.gitignore` (backend/data, node_modules, dist, logs, .venv), README refresh (make targets, launch, legacy doc pointers), root doc index. | Medium | S | 1 | 2 | ⬜ |

## Phase F — Future / optional (explicitly out of polish scope; roadmap only)

| # | Task | Pri | Effort | Research | Presentation |
|---|---|---|---|---|---|
| F1 | AI chat panel in UI (conversation_service exists) | Low | M | 3 | 3 |
| F2 | Timeline visual for AI Reasoning Timeline | Low | M | 4 | 3 |
| F3 | Report HTML/CSV formats end-to-end | Low | M | 2 | 2 |
| F4 | Multi-tenant/org scope (spec §34 future) | Low | XL | 4 | 2 |
| F5 | i18n | Low | L | 1 | 1 |

---

## Execution notes

1. Tasks are order-gated within phases and across phases (Phase A → B → C → D → E).
2. Do not skip a task to reach a later one; if blocked, surface the blocker.
3. Each completion: run `npx tsc -b` + `vite build` (frontend) and/or `pytest` (backend), append
   `docs/BUILD_LOG.md`, update this table to ✅, and refresh `GAP_ANALYSIS.md` statuses.
4. The immediate next task to start: **C2**.

*Generated 2026-09-17.*