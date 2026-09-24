"""Shared pytest fixtures for the EcoMind backend."""
import pytest
from fastapi.testclient import TestClient

ADMIN_EMAIL = "admin@ecomind.ai"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth(client):
    r = client.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    # Ensure auth works.
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return headers


@pytest.fixture(scope="session")
def dataset_id(client, auth):
    r = client.get("/api/v1/datasets", headers=auth)
    assert r.status_code == 200, r.text
    ds = r.json()["datasets"]
    assert ds, "no datasets — seed the database first"
    return ds[0]["id"]


@pytest.fixture(scope="session")
def run_id(client, auth, dataset_id):
    """Returns a workflow run bound to the seed dataset."""
    r = client.post("/api/v1/workflows/start", json={"dataset_id": dataset_id}, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()["run"]["id"]