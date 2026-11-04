from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..db import get_db
from ..dependencies import audit, client_meta, require_session
from ..models import AdminSession, AdminUser
from ..schemas import AdminOut, LoginOut, LoginRequest
from ..security import (
    DUMMY_PASSWORD_HASH,
    clear_session_cookie,
    issue_session,
    resolve_session,
    revoke_session,
    set_session_cookie,
    verify_password,
)

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=LoginOut)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginOut:
    settings: Settings = request.app.state.settings
    user = db.scalar(select(AdminUser).where(AdminUser.email == payload.email))

    password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    valid = verify_password(payload.password, password_hash)
    if user is None or not valid or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Those credentials were not accepted.",
        )

    user_agent, ip_address = client_meta(request)
    token, session = issue_session(
        db,
        user,
        ttl_hours=settings.session_ttl_hours,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    audit(
        db,
        actor=user,
        action="auth.login",
        detail={"email": user.email},
        request=request,
    )
    db.commit()

    set_session_cookie(
        response,
        name=settings.session_cookie_name,
        token=token,
        ttl_hours=settings.session_ttl_hours,
        secure=settings.cookie_secure,
    )
    return LoginOut(
        admin=AdminOut(email=user.email, display_name=user.display_name),
        expires_at=session.expires_at,
    )


@router.get("/me", response_model=LoginOut)
def me(
    resolved: tuple[AdminSession, AdminUser] = Depends(require_session),
) -> LoginOut:
    session, user = resolved
    return LoginOut(
        admin=AdminOut(email=user.email, display_name=user.display_name),
        expires_at=session.expires_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    settings: Settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name, "")
    resolved = resolve_session(db, token)
    if resolved is not None:
        session, user = resolved
        revoke_session(db, session)
        audit(
            db,
            actor=user,
            action="auth.logout",
            detail={"email": user.email},
            request=request,
        )
        db.commit()

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, name=settings.session_cookie_name)
    return response
