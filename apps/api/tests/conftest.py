from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db import Base, build_session_factory
from app.main import create_app
from app.seed import ensure_admin, ensure_content

TEST_ORIGIN = "http://localhost:5173"
ADMIN_EMAIL = "admin@quakestudio.local"
ADMIN_PASSWORD = "test-password"


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        allowed_origins=TEST_ORIGIN,
        auto_create_tables=False,
    )
    app = create_app(settings, engine)
    session_factory = build_session_factory(engine)
    with session_factory() as db:
        user, _ = ensure_admin(
            db,
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            display_name="Test Administrator",
        )
        ensure_content(db, path=settings.seed_content_path, actor=user)
        db.commit()

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 200, response.text
    return client
