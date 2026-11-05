"""Application settings.

Defaults are for local development. A hosted deployment such as Render
overrides these through environment variables; see docs/render.md at the
repository root.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = API_ROOT.parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="QUAKESTUDIO_",
        env_file=(".env", str(API_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "QuakeStudio API"
    environment: str = "local"

    database_url: str = (
        "postgresql+psycopg://quakestudio:quakestudio@localhost:5432/quakestudio"
    )
    auto_create_tables: bool = False

    # Comma-separated. Both spellings matter locally: the Vite dev server may be
    # opened at either localhost or 127.0.0.1, and cookies are same-site only
    # when the browser and API use the same hostname spelling. A hosted
    # deployment should list only its frontend origin.
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    session_cookie_name: str = "quakestudio_admin_session"
    session_ttl_hours: int = 12
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    # The interactive docs are convenient locally and unnecessary on a public
    # deployment. Set QUAKESTUDIO_ENABLE_DOCS=false on Render.
    enable_docs: bool = True

    content_schema_path: Path = API_ROOT / "app" / "content_schema.json"
    seed_content_path: Path = API_ROOT / "seed" / "content.json"

    # Used only by `python -m app.seed`. Never expose these through the API.
    admin_email: str = "admin@quakestudio.local"
    admin_password: str = ""
    admin_display_name: str = "Administrator"

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        """Accept the plain URLs that hosts such as Render inject.

        Render's `connectionString` is `postgres://...` or `postgresql://...`,
        while SQLAlchemy needs the psycopg driver named explicitly.
        """

        value = value.strip()
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return f"postgresql+psycopg://{value[len(prefix) :]}"
        return value

    @model_validator(mode="after")
    def _validate_cookie_settings(self) -> Settings:
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError(
                "QUAKESTUDIO_COOKIE_SECURE must be true when "
                "QUAKESTUDIO_COOKIE_SAMESITE is 'none'."
            )
        return self

    @property
    def origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
