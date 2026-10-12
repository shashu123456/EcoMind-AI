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


def test_charts_are_private_without_token():
    """Chart payloads carry rich provenance, so they must be auth-gated.

    This is the contract that keeps the frontend single-request model safe: if
    the chart endpoint were public, anyone could enumerate dataset provenance.
    """
    with _client() as c:
        # A public dataset listing is itself gated, so we must know a dataset id
        # to probe the chart path. The auth-guard tests above prove the chart
        # path is private once you have an id; this one proves the bare path is
        # still private even when called without first authenticating.
        ds = c.post("/api/v1/auth/login", json={"email": "admin@ecomind.ai", "password": "admin123"})
        assert ds.status_code == 200, ds.text
        did = ds.json()["user"]["id"] or c.get("/api/v1/datasets", headers={"Authorization": f"Bearer {ds.json()['access_token']}"}).json()["datasets"][0]["id"]
        # Call the chart paths without a token and verify they are private.
        for path in ("/api/v1/datasets/dummy/anomalies/chart", "/api/v1/datasets/dummy/forecast/chart"):
            r = c.get(path)
            assert r.status_code in (401, 403), (path, r.status_code, r.text[:160])


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


# ---------------------------------------------------------------------------
# Rich chart payload contracts (Option A)
#
# The frontend tooltip + inspector must never fabricate estate, model, baseline
# or tariff context. These tests assert that every plotted point the backend
# returns already carries enough provenance to drive those panels without a
# second API call.
# ---------------------------------------------------------------------------

ANOMALY_POINT_FIELDS = (
    "timestamp",
    "observed_energy_kwh",
    "baseline_energy_kwh",
    "predicted_energy_kwh",
    "deviation_percent",
    "severity",
    "confidence",
    "anomaly_type",
    "building_code",
    "building_name",
    "floor_no",
    "room_code",
    "zone",
    "device_code",
    "device_name",
    "device_type",
    "dataset_id",
    "dataset_name",
    "domain",
    "workflow_run_id",
    "baseline_version",
    "model_name",
    "model_version",
    "origin",
)

FORECAST_DAY_FIELDS = (
    "day",
    "observed_energy_kwh",
    "forecast_energy_kwh",
    "lower_kwh",
    "upper_kwh",
    "expected_cost_inr",
    "expected_co2_kg",
    "is_future",
)


def _auth_header(c: TestClient) -> dict:
    return _auth(c)


def test_anomaly_chart_returns_self_contained_points():
    """Every plotted anomaly point carries full provenance for the tooltip +
    inspector, so the frontend never needs a second request to explain a dot.
    """
    with _client() as c:
        h = _auth_header(c)
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        r = c.get(f"/api/v1/datasets/{ds_id}/anomalies/chart", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, dict)
        series = body.get("series")
        assert isinstance(series, list) and series, "anomaly chart must return at least one point"

        for i, point in enumerate(series):
            assert isinstance(point, dict), f"point[{i}] must be a dict"
            for field in ANOMALY_POINT_FIELDS:
                assert field in point, (field, i)
            # Numeric essentials are never None on a real plotted point.
            assert isinstance(point["timestamp"], str) and point["timestamp"]
            assert isinstance(point["observed_energy_kwh"], (int, float))
            assert isinstance(point["baseline_energy_kwh"], (int, float))
            assert isinstance(point["deviation_percent"], (int, float))
            assert isinstance(point["dataset_id"], str)
            assert isinstance(point["dataset_name"], str)
            # Estate strings: a flat dataset will be empty, that is fine.
            assert isinstance(point["building_code"], str)
            assert isinstance(point["device_code"], str)
            assert isinstance(point["device_name"], str)
            assert isinstance(point["device_type"], str)
            assert isinstance(point["origin"], str)

        # Metadata block mirrors the dataset the points belong to.
        meta = body.get("metadata")
        assert isinstance(meta, dict)
        assert meta.get("dataset_id") == series[0]["dataset_id"]
        assert meta.get("dataset_name") == series[0]["dataset_name"]
        assert isinstance(meta.get("domain"), str)
        assert isinstance(meta.get("target_column"), str)
        assert isinstance(meta.get("baseline_method"), str)
        assert isinstance(meta.get("origin"), str)


def test_anomaly_chart_truncates_to_readable_window():
    """Dense exports must be downsampled to a chartable ceiling so the payload
    never grows without bound.
    """
    with _client() as c:
        h = _auth_header(c)
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        r = c.get(f"/api/v1/datasets/{ds_id}/anomalies/chart", headers=h)
        assert r.status_code == 200, r.text
        series = r.json().get("series", [])
        assert len(series) <= 1008, f"series capped at 1008 points, got {len(series)}"


def test_anomaly_chart_is_auth_guarded():
    with _client() as c:
        ds_id = c.get("/api/v1/datasets", headers=_auth_header(c)).json()["datasets"][0]["id"]
        r = c.get(f"/api/v1/datasets/{ds_id}/anomalies/chart")
        assert r.status_code in (401, 403), r.status_code


def test_forecast_chart_publishes_per_day_metadata():
    """The forecast chart must return per-day values with cost and CO2 so the
    prediction tooltip can summarise the horizon without extra calls.
    """
    with _client() as c:
        h = _auth_header(c)
        ds_id = c.get("/api/v1/datasets", headers=h).json()["datasets"][0]["id"]
        r = c.get(f"/api/v1/datasets/{ds_id}/forecast/chart", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, dict)
        days = body.get("days")
        assert isinstance(days, list)

        if days:
            for i, d in enumerate(days):
                assert isinstance(d, dict), f"day[{i}] must be a dict"
                for field in FORECAST_DAY_FIELDS:
                    assert field in d, (field, i)
                assert isinstance(d["day"], str)
                assert isinstance(d["observed_energy_kwh"], (int, float, type(None)))
                assert isinstance(d["forecast_energy_kwh"], (int, float, type(None)))
                assert isinstance(d["lower_kwh"], (int, float, type(None)))
                assert isinstance(d["upper_kwh"], (int, float, type(None)))
                assert isinstance(d["expected_cost_inr"], (int, float, type(None)))
                assert isinstance(d["expected_co2_kg"], (int, float, type(None)))
                assert isinstance(d["is_future"], (bool, type(None)))

            # When both bounds are present the band must enclose the forecast.
            bounded = [d for d in days if isinstance(d.get("lower_kwh"), (int, float)) and isinstance(d.get("upper_kwh"), (int, float)) and isinstance(d.get("forecast_energy_kwh"), (int, float))]
            for d in bounded:
                assert d["lower_kwh"] <= d["forecast_energy_kwh"] <= d["upper_kwh"], d

        # Metadata carries the model + baseline provenance the prediction view
        # renders even when the horizon is empty.
        meta = body.get("metadata")
        assert isinstance(meta, dict)
        assert isinstance(meta.get("dataset_id"), str)
        assert isinstance(meta.get("dataset_name"), str)
        assert isinstance(meta.get("domain"), str)
        assert isinstance(meta.get("model_name"), str)
        assert isinstance(meta.get("baseline_method"), str)
        assert isinstance(meta.get("units"), dict)
        assert meta.get("units", {}).get("energy") in ("kWh", "kW", "")


def test_forecast_chart_is_auth_guarded():
    with _client() as c:
        ds_id = c.get("/api/v1/datasets", headers=_auth_header(c)).json()["datasets"][0]["id"]
        r = c.get(f"/api/v1/datasets/{ds_id}/forecast/chart")
        assert r.status_code in (401, 403), r.status_code
