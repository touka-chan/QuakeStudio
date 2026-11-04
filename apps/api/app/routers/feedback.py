from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import audit, current_admin
from ..models import AdminUser, FeedbackResponse
from ..schemas import DeleteResult, FeedbackCreate, FeedbackList, FeedbackOut
from ..sus import TARGET_SCORE, score_sus, summarise_scores

router = APIRouter(tags=["feedback"])


def _out(row: FeedbackResponse) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        submitted_at=row.submitted_at,
        answers=row.answers,
        score=row.score,
        comments=row.comments,
        participant_id=row.participant_id,
        app_version=row.app_version,
        content_version=row.content_version,
    )


def _scores(db: Session, participant_id: str | None = None) -> list[float]:
    statement = select(FeedbackResponse.score)
    if participant_id is not None:
        statement = statement.where(FeedbackResponse.participant_id == participant_id)
    return [float(value) for value in db.scalars(statement).all()]


@router.post("/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
) -> FeedbackOut:
    # No IP address or user agent is stored with a participant response. The
    # study promises anonymous SUS data; the admin audit log keeps request
    # metadata for admin actions only.
    row = FeedbackResponse(
        submitted_at=datetime.now(timezone.utc),
        answers=payload.answers,
        score=score_sus(payload.answers),
        comments=(payload.comments or "").strip() or None,
        participant_id=(payload.participant_id or "").strip() or None,
        app_version=(payload.app_version or "").strip() or None,
        content_version=payload.content_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/admin/feedback", response_model=FeedbackList)
def list_feedback(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    participant_id: str | None = Query(default=None, alias="participantId"),
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> FeedbackList:
    filters = []
    if participant_id:
        filters.append(FeedbackResponse.participant_id == participant_id)

    count_statement = select(func.count(FeedbackResponse.id))
    list_statement = select(FeedbackResponse).order_by(FeedbackResponse.submitted_at.desc())
    if filters:
        count_statement = count_statement.where(*filters)
        list_statement = list_statement.where(*filters)

    total = int(db.scalar(count_statement) or 0)
    rows = db.scalars(list_statement.offset(offset).limit(limit)).all()
    return FeedbackList(
        items=[_out(row) for row in rows],
        total=total,
        summary=summarise_scores(_scores(db, participant_id)),
    )


@router.get("/admin/feedback/export")
def export_feedback(
    db: Session = Depends(get_db),
    _: AdminUser = Depends(current_admin),
) -> JSONResponse:
    rows = db.scalars(
        select(FeedbackResponse).order_by(FeedbackResponse.submitted_at.asc())
    ).all()
    responses = []
    for row in rows:
        item: dict[str, object] = {
            "submittedAt": _iso(row.submitted_at),
            "answers": row.answers,
            "score": row.score,
        }
        if row.comments:
            item["comments"] = row.comments
        if row.participant_id:
            item["participantId"] = row.participant_id
        responses.append(item)

    payload = {
        "format": "quakestudio-sus",
        "version": 1,
        "instrument": "System Usability Scale — Bangor, Kortum & Miller (2008)",
        "exportedAt": _iso(datetime.now(timezone.utc)),
        "targetScore": TARGET_SCORE,
        "responses": responses,
    }
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": 'attachment; filename="quakestudio-sus-responses.json"'
        },
    )


@router.delete("/admin/feedback/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feedback(
    feedback_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> Response:
    row = db.get(FeedbackResponse, feedback_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not found.")
    audit(
        db,
        actor=admin,
        action="feedback.delete",
        detail={"id": str(feedback_id)},
        request=request,
    )
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/admin/feedback", response_model=DeleteResult)
def clear_feedback(
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(current_admin),
) -> DeleteResult:
    deleted = int(db.scalar(select(func.count(FeedbackResponse.id))) or 0)
    audit(
        db,
        actor=admin,
        action="feedback.clear",
        detail={"deleted": deleted},
        request=request,
    )
    db.query(FeedbackResponse).delete()
    db.commit()
    return DeleteResult(deleted=deleted)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
