"""Pydantic request/response contracts.

Field names are snake_case in Python and camelCase on the wire, matching the
existing browser types. FastAPI's OpenAPI document therefore describes the
same shape the frontend actually sends.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

CamelModelConfig = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CamelModel(BaseModel):
    model_config = CamelModelConfig


class HealthOut(CamelModel):
    status: Literal["ok"]
    database: Literal["ok"]


class LoginRequest(CamelModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.strip().lower()


class AdminOut(CamelModel):
    email: str
    display_name: str


class LoginOut(CamelModel):
    admin: AdminOut
    expires_at: datetime


class ContentEnvelope(CamelModel):
    id: UUID
    version: int
    status: Literal["draft", "published"]
    document: dict[str, Any]
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    created_by: str | None = None


class ContentState(CamelModel):
    published: ContentEnvelope | None = None
    draft: ContentEnvelope | None = None


class ContentVersionSummary(CamelModel):
    id: UUID
    version: int
    status: Literal["draft", "published"]
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None
    created_by: str | None = None


class ContentVersionList(CamelModel):
    items: list[ContentVersionSummary]
    total: int


class DraftSaveRequest(CamelModel):
    document: dict[str, Any]
    note: str | None = Field(default=None, max_length=500)


class PublishRequest(CamelModel):
    document: dict[str, Any]
    note: str | None = Field(default=None, max_length=500)


class RestoreRequest(CamelModel):
    note: str | None = Field(default=None, max_length=500)


FeedbackAnswer = Annotated[int, Field(strict=True, ge=1, le=5)]


class FeedbackCreate(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    answers: dict[str, FeedbackAnswer]
    comments: str | None = Field(default=None, max_length=4_000)
    participant_id: str | None = Field(default=None, max_length=64)
    app_version: str | None = Field(default=None, max_length=32)
    content_version: int | None = Field(default=None, ge=1)
    # Accepted for compatibility with the existing browser payload, but the
    # server recomputes the score from the answers and ignores this value.
    score: float | None = Field(default=None, ge=0, le=100)
    submitted_at: datetime | None = None

    @field_validator("answers")
    @classmethod
    def require_all_ten_items(cls, value: dict[str, int]) -> dict[str, int]:
        expected = {str(number) for number in range(1, 11)}
        actual = set(value)
        if actual != expected:
            missing = sorted(expected - actual, key=int)
            extra = sorted(actual - expected)
            parts: list[str] = []
            if missing:
                parts.append(f"missing items {', '.join(missing)}")
            if extra:
                parts.append(f"unexpected items {', '.join(extra)}")
            raise ValueError(f"A complete SUS response is required ({'; '.join(parts)}).")
        return value


class FeedbackOut(CamelModel):
    id: UUID
    submitted_at: datetime
    answers: dict[str, int]
    score: float
    comments: str | None = None
    participant_id: str | None = None
    app_version: str | None = None
    content_version: int | None = None


class SusSummary(CamelModel):
    participants: int
    mean: float
    median: float
    min: float
    max: float
    standard_deviation: float
    confidence95: float
    interpretation: Literal["Excellent", "Good", "OK", "Poor", "Awful"]
    grade: Literal["A", "B", "C", "D", "F"]
    meets_target: bool


class FeedbackList(CamelModel):
    items: list[FeedbackOut]
    total: int
    summary: SusSummary | None = None


class DeleteResult(CamelModel):
    deleted: int


class ActivityOut(CamelModel):
    id: UUID
    at: datetime
    action: str
    detail: dict[str, Any]
    actor: str | None = None


class ActivityList(CamelModel):
    items: list[ActivityOut]


class AdminStats(CamelModel):
    published_version: int | None = None
    published_at: datetime | None = None
    has_draft: bool = False
    draft_version: int | None = None
    content_versions: int = 0
    feedback_count: int = 0
    feedback_mean: float | None = None
    last_activity_at: datetime | None = None
