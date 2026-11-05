from __future__ import annotations

import pytest
from fastapi import Response
from pydantic import ValidationError

from app.config import Settings
from app.security import clear_session_cookie, set_session_cookie


def test_render_database_url_is_normalised() -> None:
    settings = Settings(database_url="postgres://user:pass@db.example.com:5432/app")
    assert settings.database_url == "postgresql+psycopg://user:pass@db.example.com:5432/app"


def test_plain_postgresql_url_is_normalised() -> None:
    settings = Settings(database_url="postgresql://user:pass@db.example.com:5432/app")
    assert settings.database_url == "postgresql+psycopg://user:pass@db.example.com:5432/app"


def test_origins_drop_trailing_slashes() -> None:
    settings = Settings(allowed_origins="https://example.test/, http://localhost:5173/")
    assert settings.origins == ["https://example.test", "http://localhost:5173"]


def test_samesite_none_requires_secure_cookie() -> None:
    with pytest.raises(ValidationError, match="QUAKESTUDIO_COOKIE_SECURE"):
        Settings(cookie_samesite="none", cookie_secure=False)


def test_cross_site_cookie_attributes() -> None:
    response = Response()
    set_session_cookie(
        response,
        name="session",
        token="token",
        ttl_hours=1,
        secure=True,
        samesite="none",
    )
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=none" in cookie


def test_cleared_cookie_matches_hosted_settings() -> None:
    response = Response()
    clear_session_cookie(response, name="session", secure=True, samesite="none")
    cookie = response.headers["set-cookie"].lower()
    assert "max-age=0" in cookie
    assert "secure" in cookie
    assert "samesite=none" in cookie
