"""Application settings.

The API is intentionally a local-only service for now. Defaults bind it to
localhost, CORS trusts only the Vite dev server, and cookies are not marked
Secure because the local server is plain HTTP. Nothing here is a production
configuration.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

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

    app_name: str = "QuakeStudio local API"
    environment: str = "local"

    database_url: str = (
        "postgresql+psycopg://quakestudio:quakestudio@localhost:5432/quakestudio"
    )
    auto_create_tables: bool = False

    # Comma-separated. Both spellings matter: the Vite dev server may be opened
    # at either localhost or 127.0.0.1, and cookies are same-site only when the
    # browser and API use the same hostname spelling.
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    session_cookie_name: str = "quakestudio_admin_session"
    session_ttl_hours: int = 12
    cookie_secure: bool = False

    content_schema_path: Path = API_ROOT / "app" / "content_schema.json"
    seed_content_path: Path = API_ROOT / "seed" / "content.json"

    # Used only by `python -m app.seed`. Never expose these through the API.
    admin_email: str = "admin@quakestudio.local"
    admin_password: str = ""
    admin_display_name: str = "Administrator"

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
