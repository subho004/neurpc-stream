"""FastAPI application entrypoint.

Creates the app, applies CORS middleware using settings from
``app.core.config``, registers the EDF REST/SSE router, and exposes
a ``/health`` route.

Run:
    source .venv/bin/activate
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import uvicorn

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import router as edf_router
from utils.response import success_response


# Configure basic logging
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """App factory."""
    app = FastAPI(
        title=settings.app_name,
        description="EDF real-time streaming viewer backend.",
        version="1.0.0",
    )

    # ── CORS ─────────────────────────────────────────────────────────────
    origins = settings.cors_origins or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(edf_router, prefix="/api/v1")

    # ── Health ────────────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health() -> object:
        """Health check endpoint."""
        return success_response(data={"status": "ok"}, message="healthy")

    return app


app = create_app()


if __name__ == "__main__":
    logger.info("Starting %s on %s:%s", settings.app_name, settings.host, settings.port)
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)

