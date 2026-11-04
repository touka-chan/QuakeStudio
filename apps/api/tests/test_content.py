from __future__ import annotations

import copy
import json

from fastapi.testclient import TestClient

from app.config import get_settings
from .conftest import TEST_ORIGIN


def _seed_document() -> dict:
    return json.loads(get_settings().seed_content_path.read_text(encoding="utf-8"))


def test_published_content_is_public(signed_in: TestClient) -> None:
    response = signed_in.get("/api/v1/content/published")
    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == 1
    assert payload["status"] == "published"
    assert payload["document"]["schemaVersion"] == 1
    assert payload["document"]["branding"]["appName"]


def test_draft_publish_and_history(signed_in: TestClient) -> None:
    state = signed_in.get("/api/v1/admin/content")
    assert state.status_code == 200
    assert state.json()["published"]["version"] == 1
    assert state.json()["draft"] is None

    document = copy.deepcopy(_seed_document())
    document["branding"]["appName"] = "QuakeStudio Local Test"

    saved = signed_in.put(
        "/api/v1/admin/content/draft",
        json={"document": document, "note": "Test draft"},
        headers={"Origin": TEST_ORIGIN},
    )
    assert saved.status_code == 200, saved.text
    draft = saved.json()
    assert draft["version"] == 2
    assert draft["status"] == "draft"
    assert draft["document"]["branding"]["appName"] == "QuakeStudio Local Test"

    state = signed_in.get("/api/v1/admin/content").json()
    assert state["draft"]["version"] == 2
    assert state["published"]["version"] == 1

    published = signed_in.post(
        "/api/v1/admin/content/publish",
        json={"document": document, "note": "Publish test"},
        headers={"Origin": TEST_ORIGIN},
    )
    assert published.status_code == 200, published.text
    published_payload = published.json()
    assert published_payload["version"] == 2
    assert published_payload["status"] == "published"
    assert published_payload["publishedAt"] is not None
    assert published_payload["publishedAt"].endswith(("Z", "+00:00"))

    public = signed_in.get("/api/v1/content/published").json()
    assert public["version"] == 2
    assert public["document"]["branding"]["appName"] == "QuakeStudio Local Test"

    versions = signed_in.get("/api/v1/admin/content/versions").json()
    assert versions["total"] == 2
    assert [item["version"] for item in versions["items"]] == [2, 1]


def test_discard_draft(signed_in: TestClient) -> None:
    document = _seed_document()
    document["branding"]["appName"] = "Throw me away"
    saved = signed_in.put(
        "/api/v1/admin/content/draft",
        json={"document": document},
        headers={"Origin": TEST_ORIGIN},
    )
    assert saved.status_code == 200

    discarded = signed_in.delete(
        "/api/v1/admin/content/draft",
        headers={"Origin": TEST_ORIGIN},
    )
    assert discarded.status_code == 204
    assert signed_in.get("/api/v1/admin/content").json()["draft"] is None


def test_restore_version_creates_a_draft(signed_in: TestClient) -> None:
    document = copy.deepcopy(_seed_document())
    document["branding"]["appName"] = "Version two"
    signed_in.put(
        "/api/v1/admin/content/draft",
        json={"document": document},
        headers={"Origin": TEST_ORIGIN},
    )
    signed_in.post(
        "/api/v1/admin/content/publish",
        json={"document": document},
        headers={"Origin": TEST_ORIGIN},
    )

    restored = signed_in.post(
        "/api/v1/admin/content/versions/1/restore",
        json={"note": "Back to the seed"},
        headers={"Origin": TEST_ORIGIN},
    )
    assert restored.status_code == 200, restored.text
    payload = restored.json()
    assert payload["status"] == "draft"
    assert payload["version"] == 3
    assert payload["note"] == "Back to the seed"
    assert payload["document"]["branding"]["appName"] == _seed_document()["branding"]["appName"]


def test_invalid_document_is_rejected(signed_in: TestClient) -> None:
    document = _seed_document()
    document["branding"]["appName"] = ""

    response = signed_in.put(
        "/api/v1/admin/content/draft",
        json={"document": document},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail[0]["path"].startswith("branding.appName")


def test_admin_routes_require_a_session(client: TestClient) -> None:
    assert client.get("/api/v1/admin/content").status_code == 401
    assert client.get("/api/v1/admin/feedback").status_code == 401
    assert client.get("/api/v1/admin/stats").status_code == 401
