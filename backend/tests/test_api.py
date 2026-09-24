"""API smoke tests for the EcoMind AI backend."""
from app.main import app
from fastapi.testclient import TestClient


def _client() -> TestClient:
    return TestClient(app)


def test_health_ok():
    with _client() as c:
        r = c.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


def test_datasets_require_auth():
    with _client() as c:
        r = c.get("/api/v1/datasets")
        assert r.status_code in (401, 403)


def test_login_returns_token():
    with _client() as c:
        r = c.post("/api/v1/auth/login", json={"email": "admin@ecomind.ai", "password": "admin123"})
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        assert body["user"]["role"] == "admin"


def _auth(c: TestClient) -> dict:
    r = c.post("/api/v1/auth/login", json={"email": "admin@ecomind.ai", "password": "admin123"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_datasets_and_schema():
    with _client() as c:
        h = _auth(c)
        r = c.get("/api/v1/datasets", headers=h)
        assert r.status_code == 200
        datasets = r.json()["datasets"]
        assert datasets
        ds_id = datasets[0]["id"]
        s = c.get(f"/api/v1/datasets/{ds_id}/schema", headers=h)
        assert s.status_code == 200
        if not s.json()["columns"]:
            d = c.post(f"/api/v1/datasets/{ds_id}/schema/discover", headers=h, json={})
            assert d.status_code == 200, d.text
            s = c.get(f"/api/v1/datasets/{ds_id}/schema", headers=h)
        assert s.json()["columns"]


def test_dq_results_present():
    with _client() as c:
        h = _auth(c)
        r = c.get("/api/v1/datasets", headers=h)
        ds_id = r.json()["datasets"][0]["id"]
        d = c.get(f"/api/v1/datasets/{ds_id}/dq", headers=h)
        assert d.status_code == 200
        body = d.json()
        assert "overall_score" in body


def test_workflow_list_and_detail():
    with _client() as c:
        h = _auth(c)
        r = c.get("/api/v1/workflows", headers=h)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert runs
        run_id = runs[0]["id"]
        d = c.get(f"/api/v1/workflows/{run_id}", headers=h)
        assert d.status_code == 200
        detail = d.json()
        assert detail["run"]["id"] == run_id
        assert "traces" in detail


def test_workflow_totals_are_seventeen():
    """Regression: WorkflowRun.total_stages must stay in sync with TOTAL_STAGES (17)."""
    from app.workflow.stages import STAGES, TOTAL_STAGES

    assert TOTAL_STAGES == 17
    assert len(STAGES) == 17
    with _client() as c:
        h = _auth(c)
        r = c.get("/api/v1/workflows", headers=h)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert runs
        assert runs[0]["total_stages"] == 17