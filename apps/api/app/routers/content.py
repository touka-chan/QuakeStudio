from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import audit, current_admin
from ..models import AdminUser, ContentVersion
from ..schemas import (
    ContentEnvelope,
    ContentState,
    ContentVersionList,
    ContentVersionSummary,
    DraftSaveRequest,
    PublishRequest,
    RestoreRequest,
)
from ..validation import ContentValidationError, validate_content

router = APIRouter(tags=["content"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _latest_published(db: Session) -> ContentVersion | None:
    return db.scalar(
        select(ContentVersion)
        .where(ContentVersion.status == "published")
        .order_by(ContentVersion.version.desc())
        .limit(1)
    )


def _current_draft(db: Session) -> ContentVersion | None:
    return db.scalar(select(ContentVersion).where(ContentVersion.status == "draft"))


def _next_version(db: Session) -> int:
    highest = db.scalar(select(func.max(ContentVersion.version)))
    return int(highest or 0) + 1


def _envelope(version: ContentVersion) -> ContentEnvelope:
    return ContentEnvelope(
        id=version.id,
        version=version.version,
        status=version.status,
        document=version.document,
        note=version.note,
        created_at=version.created_at,
        updated_at=version.updated_at,
        published_at=version.published_at,
        created_by=version.creator.email if version.creator else None,
    )


def _summary(version: ContentVersion) -> ContentVersionSummary:
    return ContentVersionSummary(
        id=version.id,
        version=version.version,
        status=version.status,
        note=version.note,
        created_at=version.created_at,
        updated_at=version.updated_at,
        published_at=version.published_at,
        created_by=version.creator.email if version.creator else None,
    )


def _stamp(document: dict[str, Any]) -> dict[str, Any]:
    stamped = dict(document)
    stamped["schemaVersion"] = 1
    stamped["updatedAt"] = _now().isoformat()
    return stamped


def _validated_or_422(document: dict[str, Any]) -> dict[str, Any]:
    try:
        validate_content(document)
    except ContentValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=error.issues,
        ) from error
    return _stamp(document)


def _upsert_draft(
    db: Session,
    *,
    document: dict[str, Any],
    note: str | None,
    actor: AdminUser,
) -> ContentVersion:
    draft = _current_draft(db)
    if draft is None:
        draft = ContentVersion(
            version=_next_version(db),
            status="draft",
            document=document,
            note=note,
            created_by_id=actor.id,
        )
        db.add(draft)
    else:
        draft.document = document
        if note is not None:
            draft.note = note
        draft.updated_at = _now()
    db.flush()
    return draft


@router.get("/content/published", response_model=ContentEnvelope)
def get_published_content(db: Session = Depends(get_db)) -> ContentEnvelope:
    published = _latest_published(db)
    if published is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No published content exists yet.",
        )
    return _envelope(published)


@router.get("/admin/content", response_model=ContentState)
def get_content_state(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> ContentState:
    published = _latest_published(db)
    draft = _current_draft(db)
    return ContentState(
        published=_envelope(published) if published else None,
        draft=_envelope(draft) if draft else None,
    )


@router.put("/admin/content/draft", response_model=ContentEnvelope)
def save_draft(
    payload: DraftSaveRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> ContentEnvelope:
    document = _validated_or_422(payload.document)
    draft = _upsert_draft(db, document=document, note=payload.note, actor=admin)
    audit(
        db,
        actor=admin,
        action="content.draft_save",
        detail={"version": draft.version},
        request=request,
    )
    db.commit()
    db.refresh(draft)
    return _envelope(draft)


@router.delete("/admin/content/draft", status_code=status.HTTP_204_NO_CONTENT)
def discard_draft(
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> Response:
    draft = _current_draft(db)
    if draft is not None:
        version = draft.version
        db.delete(draft)
        audit(
            db,
            actor=admin,
            action="content.draft_discard",
            detail={"version": version},
            request=request,
        )
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/content/publish", response_model=ContentEnvelope)
def publish_content(
    payload: PublishRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> ContentEnvelope:
    document = _validated_or_422(payload.document)
    version_row = _upsert_draft(db, document=document, note=payload.note, actor=admin)
    version_row.status = "published"
    version_row.published_at = _now()
    version_row.updated_at = _now()
    audit(
        db,
        actor=admin,
        action="content.publish",
        detail={"version": version_row.version},
        request=request,
    )
    db.commit()
    db.refresh(version_row)
    return _envelope(version_row)


@router.get("/admin/content/versions", response_model=ContentVersionList)
def list_versions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> ContentVersionList:
    total = db.scalar(select(func.count(ContentVersion.id))) or 0
    rows = db.scalars(
        select(ContentVersion)
        .order_by(ContentVersion.version.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return ContentVersionList(items=[_summary(row) for row in rows], total=int(total))


@router.get("/admin/content/versions/{version}", response_model=ContentEnvelope)
def get_version(
    version: int,
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> ContentEnvelope:
    row = db.scalar(select(ContentVersion).where(ContentVersion.version == version))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return _envelope(row)


@router.post("/admin/content/versions/{version}/restore", response_model=ContentEnvelope)
def restore_version(
    version: int,
    request: Request,
    payload: RestoreRequest | None = None,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> ContentEnvelope:
    source = db.scalar(select(ContentVersion).where(ContentVersion.version == version))
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

    note = (payload.note if payload else None) or f"Restored from version {version}"
    draft = _current_draft(db)
    document = _stamp(source.document)
    if draft is None:
        draft = ContentVersion(
            version=_next_version(db),
            status="draft",
            document=document,
            note=note,
            created_by_id=admin.id,
        )
        db.add(draft)
    else:
        draft.document = document
        draft.note = note
        draft.updated_at = _now()

    audit(
        db,
        actor=admin,
        action="content.restore",
        detail={"from_version": version, "draft_version": draft.version},
        request=request,
    )
    db.commit()
    db.refresh(draft)
    return _envelope(draft)
