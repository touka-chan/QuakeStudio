from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.engine import Engine

from . import models  # noqa: F401  (register metadata before create_all)
from .config import Settings, get_settings
from .db import Base, build_engine, build_session_factory
from .routers import admin, auth, content, feedback


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = engine or build_engine(settings.database_url)
    session_factory = build_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if settings.auto_create_tables:
            Base.metadata.create_all(bind=engine)
        yield

    docs_url = "/docs" if settings.enable_docs else None
    openapi_url = "/openapi.json" if settings.enable_docs else None
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "API for QuakeStudio content, admin sessions, and SUS feedback. "
            "Simulation stays in the browser Web Worker."
        ),
        docs_url=docs_url,
        redoc_url=None,
        openapi_url=openapi_url,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Requested-With"],
    )

    @app.middleware("http")
    async def reject_unknown_origins(request: Request, call_next):
        """Cookie-authenticated writes must come from a trusted frontend.

        CORS is not an authorisation boundary on its own: a browser sends a
        cross-site POST without reading the response. Checking Origin here stops
        a random website from driving the admin API. Requests with no Origin
        header (curl, pytest, the seed CLI) are allowed.
        """

        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin and origin not in settings.origins:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Origin not allowed."},
                )
        return await call_next(request)

    app.include_router(auth.router, prefix="/api/v1/auth")
    app.include_router(content.router, prefix="/api/v1")
    app.include_router(feedback.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as error:  # pragma: no cover - depends on the environment
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The database is not reachable.",
            ) from error
        return {"status": "ok", "database": "ok"}

    @app.get("/")
    def root() -> dict[str, str]:
        payload = {
            "name": settings.app_name,
            "environment": settings.environment,
            "health": "/api/v1/health",
        }
        if settings.enable_docs:
            payload["docs"] = "/docs"
        return payload

    return app


app = create_app()
