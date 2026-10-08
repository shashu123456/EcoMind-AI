# Implementation Progress — resume here

**Purpose.** If the implementation is interrupted, the next agent must be able to continue by reading
**this file + [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md)** only. Nothing important may live only in a
chat transcript.

**Last updated:** Session 3 (truthfulness fixes, legibility, library preview, guided run).
**Branch:** `main` · **Workspace root:** `C:\Users\kavitha\Downloads\EcoMind-AI-main` · Windows / git-bash.

---

## 1. Status at a glance

| Area | State |
|---|---|
| Frontend truthfulness (no mock/placeholder data) | **Done, verified** |
| Real upload / PDF export / run replay / Step-Auto pipeline | **Done, verified** |
| Unit vocabulary (`lib/units.ts`) | **Done, verified live** |
| Derived labels from real columns (`lib/schema.ts`) | **Done, verified by typecheck + build** |
| Dead code + vendor branding removal | **Done** |
| Build split into vendor chunks | **Done** |
| Typecheck (`npx tsc --noEmit`) | **0 errors** |
| Production build (`pnpm build:static`) | **exit 0** |
| Backend | **running**, PID `8852`, `http://127.0.0.1:8000`, health `ok` |
| Documentation set (`PROJECT_AUDIT`, `PROJECT_ROADMAP`, `DESIGN_DECISIONS`, `CHANGELOG`, this file) | **Complete and current** |
| End-to-end report ([`PROJECT_REPORT.md`](PROJECT_REPORT.md)) | **Written** |
| Real identity from `/auth/me` (no hardcoded name) | **Done, verified** |
| Explicit Step / Auto (no silent auto-run) + Auto walks the pages | **Done, verified** |
| Context strip pending states + baseline label from recorded rows | **Done, verified** |
| Dataset preview + CSV export in the library | **Done, verified** |
| Quality overall-run band, prediction day-by-day + impact, anomaly breakdown | **Done** |
| Micro-type legibility pass + docked activity terminal (GAP-4 closed) | **Done** |
| 331 orphan/failed workflow runs | **Open** — prune tool not written |
| `pytest backend` | **Still unverified** (STATUS.md claims 106) |
| Sample datasets (`/sample-datasets`) | **Not started** — roadmap Phase 7 |
| `AppShell.tsx` decomposition, lazy routes, store, memoisation | **Not started** — roadmap Phase 2 |
| Design system, charts, storytelling, motion, demo mode, a11y, repo hygiene | **Not started** — roadmap Phases 3–9 |
| `pytest backend` | **Not run this session.** `docs/STATUS.md` claims 106 passing. Report as *unverified*, never as passing |

---

## 2. Environment and how to run it

```bash
# Backend (already running on this machine; serves the built SPA on the same port)
.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
curl -s http://127.0.0.1:8000/api/v1/health     # {"status":"ok","service":"ecomind-ai","uptime_s":…}

# Frontend — run from frontend/
pnpm install                 # package manager is pnpm@10.18.0, never npm
npx tsc --noEmit             # verification gate 1: must be 0 errors
pnpm build:static            # verification gate 2: vite build → ../dist, exit 0
```

- **Sign in:** `admin@ecomind.ai` / `admin123`. Token is stored in `localStorage` under
  `ecomind_token`; API base is `/api/v1`. A stale token produces one expected `401` before sign-in.
- The backend serves `frontend/dist`, so after `pnpm build:static` the whole product is at
  `http://127.0.0.1:8000` — one port, no CORS surface. Use that URL for browser verification.
- The frontend has **no test runner configured** yet (roadmap P2-7). Typecheck + build + browser walk
  is the current gate.

---

## 3. Ground rules (re-read before every change)

1. **The backend pipeline is frozen.** Eleven stages, fixed order: Library → Import → Schema →
   Quality → Transformation → Adaptive Baseline → Model Selection → Anomaly → Forecast →
   Recommendation → Executive Report. Never change stage order, gating, contracts or business logic.
2. **Nothing fabricated.** No mock KPIs, no placeholder datasets, no invented units, no invented
   endpoints, no mock branding. Every number, chart, unit and rationale must come from a recorded
   backend stage output. When the backend recorded nothing, render an empty state.
3. **Data-quality scope is structural only** — nulls, timestamps, duplicates, dtypes, units, schema
   mismatch, invalid categoricals, formatting. Outliers and abnormal behaviour belong exclusively to
   the anomaly stage.
4. **Adaptive baseline only** — per dataset, never a global or downloaded baseline.
5. Delete nothing you did not author without confirming it is unused; `git checkout -- <path>`
   restores a file deleted by mistake. **Never `git add -A`.** Do not commit unless asked.

---

## 4. Files that matter

| File | Role |
|---|---|
| [`frontend/client/src/components/shell/AppShell.tsx`](../frontend/client/src/components/shell/AppShell.tsx) | The single shell (~3.9 kLOC) containing all sixteen views. Centre of all frontend work. |
| [`frontend/client/src/components/shell/AppShell.css`](../frontend/client/src/components/shell/AppShell.css) | Design tokens, every view style, keyframes, empty-state and pipeline-control rules. |
| [`frontend/client/src/lib/workspace.ts`](../frontend/client/src/lib/workspace.ts) | `loadWorkspace()`, `runPipeline()`, `STAGE_KEYS`, every stage → view mapper, `targetColumn` / `targetUnit`. |
| [`frontend/client/src/lib/api.ts`](../frontend/client/src/lib/api.ts) | Typed API client: `auth`, `datasets` (incl. `upload`), `workflow`, `domain`, `activity`, `getToken` / `setToken`, `ApiError`. |
| [`frontend/client/src/lib/units.ts`](../frontend/client/src/lib/units.ts) | Unit vocabulary: `unitForColumn()`, `displayUnit()`. **Extend here** when a new quantity type appears. |
| [`frontend/client/src/lib/schema.ts`](../frontend/client/src/lib/schema.ts) | Schema vocabulary: `roleForColumn()`, `familyForColumn()`, `FAMILY_LABEL`, `ROLE_ORDER`, `FieldRole`, `FieldFamily`. |
| [`frontend/client/src/lib/useSound.ts`](../frontend/client/src/lib/useSound.ts) | `play()` (silent no-op by default) and `playCompletionChime()`. |
| [`frontend/vite.config.ts`](../frontend/vite.config.ts) · [`frontend/client/index.html`](../frontend/client/index.html) | Cleansed build config and document head. |
| [`docs/STATUS.md`](STATUS.md) · [`docs/FRONTEND_SPEC.md`](FRONTEND_SPEC.md) | Pre-existing backend truth doc and master frontend spec; remaining backlog source. |
| [`scripts/build_datasets.py`](../scripts/build_datasets.py) | Existing data generator — **extend it** for `/sample-datasets`, do not add a new pipeline. |

### Key symbols inside `AppShell.tsx`

Views: `OverviewView`, `LibraryView`, `ImportView`, `SchemaView`, `QualityView`, `TransformView`,
`ModelsView`, `AnomaliesView`, `PredictionView`, `RecommendationsView`, `ReportsView`, `HistoryView`,
`NotificationsView`, `SettingsView`, `SignInView`, `ActivityTerminal`, `InspectorDrawer`.
Helpers: `EMPTY_DATASET`, `domainMeta`, `navSections`, `pipelineStages`, `viewMeta`,
`STAGE_LABEL_TEXT`, `STAGE_KEY_BY_VIEW`, `withUnit`, `fieldIconFor`, `datasetDomainIcon`,
`fmtCount`, `fmtRunClock`, `fmtRunDuration`, `fmtLiveDuration`.
Module-level live state (`let`): `liveStages`, `liveCompetition`, `liveQualityMeta`, `liveAnomalyMeta`,
`liveForecastMeta`, `liveRecMeta`, `liveRuns`, `liveSchema`, `liveBaselineVersions`, `liveRunId`,
`liveTargetUnit`, `liveTargetColumn`, `energyData`, `forecastData`, `qualityIssues`, `modelData`,
`anomalyData`, `anomalies`, `recommendations`, `datasets`. Phase 2 replaces this block with a store.

---

## 5. How the last sessions actually edited code

Large mechanical edits were applied by writing a Python script to the temp directory and running it,
because the shell file is ~4 kLOC and each batch touched dozens of anchored regions:

```bash
# scripts live in the OS temp dir, not the repo
python "$LOCALAPPDATA/Temp/eco_stepN.py"      # git-bash on Windows
```

Traps that cost time — read before writing any similar script:

- **Plain `%`-formatting collides with TypeScript template literals** (`${…}`). Use a token
  substitution helper instead: `#DASH#`→`—`, `#MID#`→`·`, `#RUP#`→`₹`, `#SUB2#`→`₂`, `#RSQ#`→`²`.
- **`\uXXXX` escapes inside a replacement string raise `re.error: bad escape \u`.** Emit the literal
  character or use the token helper.
- **Set `PYTHONIOENCODING=utf-8`** for any diagnostic that prints Unicode; the cp1252 console raises
  `UnicodeEncodeError` on `₂`.
- **Anchor regexes tightly with bounded spans** (`.{0,900}?`): strings like `operation-list`,
  `quality-table` and `health-list` occur more than once in the file.
- Prefer the normal editing tools for small changes. The scripted approach is only worth it for
  broad, repetitive batches, and every batch must be followed by `tsc --noEmit`.

### Browser verification traps

- `preview_type` addressed by snapshot `uid` has failed once with *"No node found for given backend id"*.
  Prefer `locator` form (`role=button[name="…"]`) and re-snapshot after any page change.
- Take a fresh snapshot before acting; uids expire on every re-render.
- A human can take control of the tab mid-action; if that happens, re-read state before continuing.

---

## 6. What the next agent should do

Work strictly in roadmap order. Phase 2 is the next unblocked phase; Phase 7 (sample datasets) is
independent and can be interleaved.

1. **Phase 2 — structure & performance** (P2-1…P2-7). Splitting `AppShell.tsx` is the precondition
   for everything else in Phase 2 and for any frontend test surface.
2. **Phase 7 — `/sample-datasets`** for the eight industries by extending `scripts/build_datasets.py`.
   Each dataset must carry a realistic hierarchy, equipment list, IDs, timestamps, schedules,
   departments/rooms/buildings, metadata and units, and must naturally produce quality issues, a
   baseline, model training, anomalies, a forecast and recommendations. When a dataset introduces a
   new quantity type, add its unit to `lib/units.ts` and its family to `lib/schema.ts` in the same
   change.
3. Then Phases 3 → 9 in order.

**After every task, update all five documents in the same change** and re-run the four-part gate:

```
cd frontend && npx tsc --noEmit          # 0 errors
cd frontend && pnpm build:static         # exit 0
curl -s http://127.0.0.1:8000/api/v1/health
# browser at http://127.0.0.1:8000: sign in → walk the touched views → 0 JS exceptions
```

Only then check the item off in `PROJECT_ROADMAP.md` and add a `CHANGELOG.md` entry.

---

## 7. Open questions and unverified claims

| Item | Status |
|---|---|
| `pytest backend` (STATUS.md claims 106 passing) | **Unverified** this session — must be run at the Phase 9 gate |
| Lighthouse score target ≈ 90+ | Target only; never measured |
| Reduced-motion behaviour of existing keyframes | Not audited yet — Phase 8 |
| Contrast of micro-labels at 8–9 px | Suspected below AA — Phase 8 |
| SSE streaming (`/workflows/{id}/stream-token`) | Endpoint exists; frontend still polls — Phase 5 |
| Device/hierarchy endpoint | **Does not exist by design** (`STATUS.md` §6.4). Never invent one. |
