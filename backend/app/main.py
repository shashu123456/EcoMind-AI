"""FastAPI application factory.

Ownership: S1. Contract: docs/API_CONTRACT.md §1.
"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import Response

from .db.base import init_db
from .events.event_bus import event_bus


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    event_bus.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title="EcoMind AI",
    description="Adaptive Explainable Energy Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Import and register routers ──
# Only routers that exist are registered. A router is added here in the same
# phase that creates it, so an import of app.main either yields a working API
# or fails loudly — it can never half-serve the old pipeline.
from .domain import stage_runners  # noqa: E402,F401  registers the stage runners
from .routes import (  # noqa: E402
    auth,
    datasets,
    dq,
    health,
    workflow,
)
from .routes import (  # noqa: E402
    schema as schema_route,
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["datasets"])
app.include_router(schema_route.router, prefix="/api/v1/datasets", tags=["schema"])
app.include_router(dq.router, prefix="/api/v1/datasets", tags=["dq"])
app.include_router(workflow.router, prefix="/api/v1/workflows", tags=["workflows"])

# Serve built frontend in production (SPA with fallback to index.html)
frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():

    @app.middleware("http")
    async def spa_cache_headers(request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        if request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif request.url.path in ("/", "/index.html"):
            response.headers["Cache-Control"] = "no-store"
        return response

    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str = ""):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = frontend_dist / full_path if full_path else None
        if candidate and candidate.is_file():
            return FileResponse(str(candidate))
        res = FileResponse(str(frontend_dist / "index.html"))
        res.headers["Cache-Control"] = "no-store"
        return res
