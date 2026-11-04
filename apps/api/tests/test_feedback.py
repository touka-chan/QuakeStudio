from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import TEST_ORIGIN

PERFECT_ANSWERS = {
    "1": 5,
    "2": 1,
    "3": 5,
    "4": 1,
    "5": 5,
    "6": 1,
    "7": 5,
    "8": 1,
    "9": 5,
    "10": 1,
}


def _submit(client: TestClient, **overrides: object) -> dict:
    payload = {
        "answers": PERFECT_ANSWERS,
        "comments": "Clear enough for a first run.",
        "participantId": "P01",
        "appVersion": "0.2.0",
        "contentVersion": 1,
        "score": 0,
        **overrides,
    }
    response = client.post(
        "/api/v1/feedback",
        json=payload,
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_server_recomputes_score(client: TestClient) -> None:
    payload = _submit(client)
    assert payload["score"] == 100.0
    assert payload["participantId"] == "P01"
    assert payload["comments"] == "Clear enough for a first run."
    assert payload["submittedAt"]


def test_incomplete_sus_is_rejected(client: TestClient) -> None:
    answers = dict(PERFECT_ANSWERS)
    answers.pop("8")
    response = client.post(
        "/api/v1/feedback",
        json={"answers": answers},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 422


def test_out_of_range_answer_is_rejected(client: TestClient) -> None:
    answers = dict(PERFECT_ANSWERS)
    answers["4"] = 6
    response = client.post(
        "/api/v1/feedback",
        json={"answers": answers},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 422


def test_admin_can_list_summarise_export_and_delete(signed_in: TestClient) -> None:
    first = _submit(signed_in)
    _submit(signed_in, answers={str(number): 1 for number in range(1, 11)}, participantId="P02")

    listing = signed_in.get("/api/v1/admin/feedback")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["total"] == 2
    assert len(payload["items"]) == 2
    assert payload["summary"]["participants"] == 2
    assert payload["summary"]["mean"] == 75.0
    assert payload["summary"]["meetsTarget"] is True

    export = signed_in.get("/api/v1/admin/feedback/export")
    assert export.status_code == 200
    exported = export.json()
    assert exported["format"] == "quakestudio-sus"
    assert exported["version"] == 1
    assert exported["targetScore"] == 68
    assert exported["exportedAt"].endswith("Z")
    assert len(exported["responses"]) == 2
    assert exported["responses"][0]["submittedAt"].endswith("Z")
    assert "id" not in exported["responses"][0]

    deleted = signed_in.delete(
        f"/api/v1/admin/feedback/{first['id']}",
        headers={"Origin": TEST_ORIGIN},
    )
    assert deleted.status_code == 204
    assert signed_in.get("/api/v1/admin/feedback").json()["total"] == 1

    cleared = signed_in.delete("/api/v1/admin/feedback", headers={"Origin": TEST_ORIGIN})
    assert cleared.status_code == 200
    assert cleared.json()["deleted"] == 1
    assert signed_in.get("/api/v1/admin/feedback").json()["total"] == 0

    actions = {
        item["action"] for item in signed_in.get("/api/v1/admin/activity").json()["items"]
    }
    assert {"feedback.delete", "feedback.clear"} <= actions


def test_delete_unknown_feedback_returns_404(signed_in: TestClient) -> None:
    response = signed_in.delete(
        "/api/v1/admin/feedback/00000000-0000-0000-0000-000000000000",
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 404


def test_stats_endpoint(signed_in: TestClient) -> None:
    _submit(signed_in)
    stats = signed_in.get("/api/v1/admin/stats")
    assert stats.status_code == 200
    payload = stats.json()
    assert payload["publishedVersion"] == 1
    assert payload["hasDraft"] is False
    assert payload["feedbackCount"] == 1
    assert payload["feedbackMean"] == 100.0
    assert payload["contentVersions"] == 1
