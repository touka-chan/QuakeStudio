from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import ADMIN_EMAIL, ADMIN_PASSWORD, TEST_ORIGIN


def test_health_reports_database(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_login_me_logout(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401

    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["admin"]["email"] == ADMIN_EMAIL
    assert payload["admin"]["displayName"] == "Test Administrator"
    assert "expiresAt" in payload

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["admin"]["email"] == ADMIN_EMAIL

    logout = client.post("/api/v1/auth/logout", headers={"Origin": TEST_ORIGIN})
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_wrong_password_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": "not-the-password"},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 401
    assert "accepted" in response.json()["detail"]


def test_unknown_email_is_rejected_without_enumeration(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "whatever"},
        headers={"Origin": TEST_ORIGIN},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Those credentials were not accepted."


def test_untrusted_origin_cannot_submit_login(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403
