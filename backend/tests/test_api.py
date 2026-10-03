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
        # The seed creates a dataset and nothing else: a run is something a user
        # starts, so this test starts its own rather than reading one back.
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        run_id = c.post("/api/v1/workflows/start", json={"dataset_id": ds_id}, headers=h).json()[
            "run"
        ]["id"]
        r = c.get("/api/v1/workflows", headers=h)
        assert r.status_code == 200
        runs = r.json()["runs"]
        assert runs
        assert run_id in [x["id"] for x in runs]
        d = c.get(f"/api/v1/workflows/{run_id}", headers=h)
        assert d.status_code == 200
        detail = d.json()
        assert detail["run"]["id"] == run_id
        # A fresh run has no traces yet, but the key must be there for the rail.
        assert detail["traces"] == []


def test_workflow_totals_are_ten():
    """Regression: WorkflowRun.total_stages must stay in sync with TOTAL_STAGES (10).

    Asserted on a run this test creates rather than on a seeded run, so the check
    is about the code writing the number and not about whatever the seed left in
    the database.
    """
    from app.workflow.stages import STAGES, TOTAL_STAGES

    assert TOTAL_STAGES == 10
    assert len(STAGES) == 10
    assert [s["key"] for s in STAGES] == [
        "library",
        "import",
        "schema",
        "quality",
        "transformation",
        "model_selection",
        "anomaly",
        "forecast",
        "recommendation",
        "report",
    ]
    with _client() as c:
        h = _auth(c)
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        started = c.post("/api/v1/workflows/start", json={"dataset_id": ds_id}, headers=h)
        assert started.status_code == 200, started.text
        assert started.json()["run"]["total_stages"] == 10


def test_decision_stage_is_gated_on_preparation():
    """A decision stage must refuse to run before the six preparation stages pass.

    The 409 names every stage still outstanding, in pipeline order, so the client
    can show what is left rather than a generic failure.
    """
    from app.workflow.stages import PREPARATION_KEYS, STAGE_RUNNERS

    with _client() as c:
        h = _auth(c)
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        run_id = c.post("/api/v1/workflows/start", json={"dataset_id": ds_id}, headers=h).json()[
            "run"
        ]["id"]
        r = c.post(f"/api/v1/workflows/{run_id}/stages/anomaly/exec", json={}, headers=h)
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        # Every preparation stage is outstanding on a fresh run.
        for key in PREPARATION_KEYS:
            assert key in detail, (key, detail)
        assert "anomaly" in detail
        assert "library" in detail and "model_selection" in detail
        assert detail.index("library") < detail.index("model_selection")

        # Walk the preparation stages that have runners, checking after each one
        # that the gate's answer has shrunk by exactly that stage. Driven off
        # STAGE_RUNNERS rather than a literal list so this stays true as the
        # remaining stage runners land.
        #
        # The gate must still be shut after every stage *except the last*, which
        # is the one that leaves nothing outstanding — after it, the decision
        # stage is entitled to run, and asserting 409 there would be asserting
        # that a completed pipeline stays closed. That assertion passed only
        # while a preparation stage was still missing its runner, so it was
        # really testing the absence of a stage rather than the gate.
        pending = [k for k in PREPARATION_KEYS if k in STAGE_RUNNERS]
        for i, key in enumerate(pending):
            e = c.post(f"/api/v1/workflows/{run_id}/stages/{key}/exec", json={}, headers=h)
            assert e.status_code == 200, f"{key}: {e.text[:200]}"
            after = c.post(f"/api/v1/workflows/{run_id}/stages/anomaly/exec", json={}, headers=h)
            if i < len(pending) - 1:
                assert after.status_code == 409, after.text
                detail = after.json()["detail"]
                assert key not in detail, detail
                # Everything after this stage is still outstanding, in order.
                for later in pending[i + 1 :]:
                    assert later in detail, (later, detail)
            else:
                assert after.status_code == 200, after.text
