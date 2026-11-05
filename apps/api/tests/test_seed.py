from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, build_session_factory
from app.security import verify_password
from app.seed import ensure_admin


def test_if_missing_leaves_existing_admin_untouched() -> None:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        first, created = ensure_admin(
            db,
            email="admin@example.test",
            password="first-password",
            display_name="First Name",
        )
        assert created is True
        db.commit()

        second, created_again = ensure_admin(
            db,
            email="admin@example.test",
            password="second-password",
            display_name="Second Name",
            update_existing=False,
        )
        db.commit()

        assert created_again is False
        assert second.id == first.id
        assert second.display_name == "First Name"
        assert verify_password("first-password", second.password_hash)
