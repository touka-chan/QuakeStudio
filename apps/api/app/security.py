"""Password hashing, opaque session tokens, and cookie helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AdminSession, AdminUser, utcnow

_hasher = PasswordHasher()

# Verified when the email does not exist, so a missing account takes roughly
# the same time as a wrong password instead of revealing which emails exist.
DUMMY_PASSWORD_HASH = _hasher.hash("quakestudio-placeholder-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(
    db: Session,
    user: AdminUser,
    *,
    ttl_hours: int,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[str, AdminSession]:
    token = secrets.token_urlsafe(48)
    session = AdminSession(
        token_hash=hash_session_token(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(hours=ttl_hours),
        user_agent=(user_agent or "")[:255] or None,
        ip_address=(ip_address or "")[:64] or None,
    )
    db.add(session)
    user.last_login_at = utcnow()
    db.flush()
    return token, session


def resolve_session(db: Session, token: str) -> tuple[AdminSession, AdminUser] | None:
    if not token:
        return None
    session = db.scalar(
        select(AdminSession)
        .where(AdminSession.token_hash == hash_session_token(token))
        .where(AdminSession.revoked_at.is_(None))
    )
    if session is None:
        return None

    expires_at = _as_aware(session.expires_at)
    if expires_at <= utcnow():
        return None

    user = db.get(AdminUser, session.user_id)
    if user is None or not user.is_active:
        return None
    return session, user


def revoke_session(db: Session, session: AdminSession) -> None:
    session.revoked_at = utcnow()
    db.flush()


def set_session_cookie(
    response: Response, *, name: str, token: str, ttl_hours: int, secure: bool
) -> None:
    max_age = max(1, ttl_hours * 3600)
    response.set_cookie(
        key=name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, *, name: str) -> None:
    response.delete_cookie(key=name, path="/", httponly=True, samesite="lax")


def _as_aware(value: datetime) -> datetime:
    """SQLite drops timezone information; Postgres keeps it. Normalise both."""

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
