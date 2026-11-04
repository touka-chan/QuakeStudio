from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import current_admin
from ..models import AdminAuditLog, AdminUser, ContentVersion, FeedbackResponse
from ..schemas import ActivityList, ActivityOut, AdminStats

router = APIRouter(tags=["admin"])


@router.get("/admin/stats", response_model=AdminStats)
def stats(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> AdminStats:
    published = db.scalar(
        select(ContentVersion)
        .where(ContentVersion.status == "published")
        .order_by(ContentVersion.version.desc())
        .limit(1)
    )
    draft = db.scalar(select(ContentVersion).where(ContentVersion.status == "draft"))
    version_count = int(db.scalar(select(func.count(ContentVersion.id))) or 0)
    feedback_count = int(db.scalar(select(func.count(FeedbackResponse.id))) or 0)
    feedback_mean = db.scalar(select(func.avg(FeedbackResponse.score)))
    last_activity = db.scalar(select(func.max(AdminAuditLog.at)))

    return AdminStats(
        published_version=published.version if published else None,
        published_at=published.published_at if published else None,
        has_draft=draft is not None,
        draft_version=draft.version if draft else None,
        content_versions=version_count,
        feedback_count=feedback_count,
        feedback_mean=round(float(feedback_mean), 2) if feedback_mean is not None else None,
        last_activity_at=last_activity,
    )


@router.get("/admin/activity", response_model=ActivityList)
def activity(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> ActivityList:
    rows = db.execute(
        select(AdminAuditLog, AdminUser.email)
        .outerjoin(AdminUser, AdminUser.id == AdminAuditLog.actor_id)
        .order_by(AdminAuditLog.at.desc())
        .limit(limit)
    ).all()
    return ActivityList(
        items=[
            ActivityOut(
                id=entry.id,
                at=entry.at,
                action=entry.action,
                detail=entry.detail,
                actor=email,
            )
            for entry, email in rows
        ]
    )
