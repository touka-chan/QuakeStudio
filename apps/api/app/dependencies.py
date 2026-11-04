"""FastAPI dependencies shared by the routers."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import Settings
from .db import get_db
from .models import AdminAuditLog, AdminSession, AdminUser
from .security import resolve_session


def app_settings(request: Request) -> Settings:
    return request.app.state.settings


def client_meta(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    forwarded = request.headers.get("x-forwarded-for")
    ip_address = forwarded.split(",")[0].strip() if forwarded else None
    if ip_address is None and request.client is not None:
        ip_address = request.client.host
    return (user_agent[:255] if user_agent else None, ip_address[:64] if ip_address else None)


def require_session(
    request: Request,
    db: Session = Depends(get_db),
) -> tuple[AdminSession, AdminUser]:
    settings: Settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name, "")
    resolved = resolve_session(db, token)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
        )
    return resolved


def current_admin(
    resolved: tuple[AdminSession, AdminUser] = Depends(require_session),
) -> AdminUser:
    return resolved[1]


def audit(
    db: Session,
    *,
    actor: AdminUser | None,
    action: str,
    detail: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AdminAuditLog:
    user_agent: str | None = None
    ip_address: str | None = None
    if request is not None:
        user_agent, ip_address = client_meta(request)
    entry = AdminAuditLog(
        actor_id=actor.id if actor else None,
        action=action,
        detail=detail or {},
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
