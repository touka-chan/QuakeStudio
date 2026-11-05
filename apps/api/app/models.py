"""SQLAlchemy models for the QuakeStudio API.

The schema is deliberately small: admin identity, versioned content, feedback,
and an audit trail. Simulation results stay on the device, so there is no run
table and no time-history storage.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base

JsonType = JSON().with_variant(JSONB, "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator[datetime]):
    """Store UTC and always return a timezone-aware value.

    PostgreSQL's timestamptz does this already. SQLite (used by the test suite)
    returns a naive datetime, which Pydantic then serialises without an offset;
    a browser reads that as local time and shows e.g. "8 hours ago" for a
    publish made seconds earlier. Normalising here keeps both databases honest.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Administrator")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow
    )
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))


class ContentVersion(Base):
    __tablename__ = "content_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    document: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)

    creator: Mapped[AdminUser | None] = relationship(foreign_keys=[created_by_id], lazy="joined")

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'published')", name="ck_content_versions_status"),
        Index(
            "uq_content_versions_one_draft",
            "status",
            unique=True,
            postgresql_where=text("status = 'draft'"),
            sqlite_where=text("status = 'draft'"),
        ),
    )


class FeedbackResponse(Base):
    __tablename__ = "feedback_responses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    submitted_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, index=True
    )
    answers: Mapped[dict[str, int]] = mapped_column(JsonType, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    comments: Mapped[str | None] = mapped_column(Text)
    participant_id: Mapped[str | None] = mapped_column(String(64), index=True)
    app_version: Mapped[str | None] = mapped_column(String(32))
    content_version: Mapped[int | None] = mapped_column(Integer)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utcnow, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("admin_users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    detail: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
