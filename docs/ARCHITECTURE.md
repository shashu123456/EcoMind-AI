# EcoMind AI — Architecture (Pointer)

The authoritative architecture is **`PROJECT_MASTER_BLUEPRINT.md`** (sections 4–15): layers, stack, repo structure, workflow, database schema, API design, models, reports.

This doc is a fast lookup index.

## Runtime
- Backend: `uvicorn app.main:app --port 8000` (from `backend/`)
- Frontend: `npm run dev` (from `frontend/`, port 5173, proxies `/api` + `/stream` → :8000)
- DB: `data/ecomind.db` (SQLite, WAL)

## Backend layout
```
app/
  main.py          # app factory, CORS, mounts routers
  core/            # config, storage, security(JWT), db session
  db/              # base.py (engine/session), models.py (all tables)
  api/             # routers (one per stage/domain)
  domains/         # workflow orchestration
  pipeline/        # upload, import, sample, library
  quality/         # DQ engine
  features/        # feature engineering
  ml/              # prediction, comparison, explain, trust, anomalies, bench, recommend
  reports/         # pdf/html/csv
  events/          # SSE event bus
```

## Frontend layout
```
src/
  main.tsx, App.tsx
  app/            # AppShell, Router, PipelineRail, providers
  stages/         # 18 stage screens
  components/ui, viz, flow
  api/            # typed client + hooks
  state/          # Context providers + custom hooks
  styles/tokens.css
```

## Contracts (subagent reference)
- All API responses: `{ data } | { error: {detail} }`. SSE events: `event:<name>\ndata:{json}\n\n`.
- SSE event names: `stage.enter`, `stage.progress`, `stage.complete`, `quality.score`, `quality.correction`, `import.row`, `transformation.log`, `feature.created`, `model.metrics`, `prediction.point`, `anomaly.detected`, `benchmark.row`, `recommendation.created`, `report.generated`, `run.done`, `run.failed`.