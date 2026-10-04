"""Regression tests for scoped-anomaly consistency.

The defect this exists for
---------------------------
`anomaly_service.page` filtered its row query by building but computed the
facet counts from a *separate* query filtered only by `dataset_id`. Routing the
function exposed that immediately: a Riverside request returned
`total: 1281` beside severity chips summing to the campus-wide `2227`.

Both numbers were correct in isolation and wrong together. A panel saying
"1,281 anomalies in Riverside" while its own filter chips offered counts that
add up to 2,227 is two contradictory truths on one screen -- the same failure
the frontend state reconciliation was written to remove. It shipped once and
was caught by reading the live response, so these tests exist to make that
unnecessary.

The invariant: for any scope, the facets must sum to the scoped total.
"""

from app.main import app
from fastapi.testclient import TestClient

HEADERS = None


def _client() -> TestClient:
    return TestClient(app)


def _login(c: TestClient) -> dict:
    r = c.post(
        "/api/v1/auth/login",
        json={"email": "admin@ecomind.ai", "password": "admin123"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _anomaly_dataset(c: TestClient, headers: dict) -> str:
    """A dataset that actually has anomalies, or skip."""
    r = c.get("/api/v1/datasets", headers=headers)
    assert r.status_code == 200, r.text
    for ds in r.json()["datasets"]:
        probe = c.get(
            f"/api/v1/datasets/{ds['id']}/anomalies", headers=headers, params={"page_size": 1}
        )
        if probe.status_code == 200 and probe.json().get("total", 0) > 0:
            return ds["id"]
    return ""


def test_facets_sum_to_total_when_unscoped():
    """The campus-wide case: facets must already agree with each other."""
    with _client() as c:
        headers = _login(c)
        ds = _anomaly_dataset(c, headers)
        assert ds, "no dataset with anomalies — run the pipeline first"

        body = c.get(f"/api/v1/datasets/{ds}/anomalies", headers=headers).json()
        total = body["total"]
        assert total > 0

        assert sum(body["severity_counts"].values()) == total, (
            "severity facets disagree with the total"
        )
        assert sum(body["class_counts"].values()) == total, (
            "class facets disagree with the total"
        )


def test_facets_follow_the_building_filter():
    """The regression: a building scope must scope the facets too.

    Before the fix this returned total=1281 with facets summing to 2227.
    """
    with _client() as c:
        headers = _login(c)
        ds = _anomaly_dataset(c, headers)
        assert ds, "no dataset with anomalies — run the pipeline first"

        whole = c.get(f"/api/v1/datasets/{ds}/anomalies", headers=headers).json()

        # Find a building that actually has findings.
        target = None
        for b in whole["anomalies"]:
            if b.get("building_code"):
                target = b["building_code"]
                break

        # Need at least one building known from the hierarchy.
        if target is None:
            hy = c.get(f"/api/v1/datasets/{ds}/hierarchy", headers=headers)
            if hy.status_code != 200:
                return
            levels = {lv["level"]: lv["values"] for lv in hy.json().get("levels", [])}
            if not levels.get("building_code"):
                return
            target = levels["building_code"][0]

        scoped = c.get(
            f"/api/v1/datasets/{ds}/anomalies",
            headers=headers,
            params={"building_code": target},
        )
        assert scoped.status_code == 200, scoped.text
        body = scoped.json()

        if body["total"] == 0:
            # No anomalies in that building; nothing to be inconsistent about.
            return

        assert sum(body["severity_counts"].values()) == body["total"], (
            f"severity facets for {target} do not sum to the scoped total"
        )
        assert sum(body["class_counts"].values()) == body["total"], (
            f"class facets for {target} do not sum to the scoped total"
        )

        # And the scope must actually narrow, or it is not being applied.
        assert body["total"] <= whole["total"]
        assert body["scope"]["building_code"] == target


def test_scoped_rows_belong_to_the_building():
    """Every returned row must honour the filter, not just the counts."""
    with _client() as c:
        headers = _login(c)
        ds = _anomaly_dataset(c, headers)
        assert ds, "no dataset with anomalies — run the pipeline first"

        whole = c.get(f"/api/v1/datasets/{ds}/anomalies", headers=headers).json()
        target = next((a["building_code"] for a in whole["anomalies"] if a.get("building_code")), None)
        if target is None:
            return

        body = c.get(
            f"/api/v1/datasets/{ds}/anomalies",
            headers=headers,
            params={"building_code": target, "page_size": 50},
        ).json()

        for row in body["anomalies"]:
            assert row["building_code"] == target, (
                f"row from {row['building_code']} leaked into a {target} scope"
            )


def test_severity_filter_narrows_rows_but_not_its_own_facet():
    """Facet navigation must stay possible while a facet is applied.

    Severity counts deliberately ignore the severity filter -- otherwise
    choosing 'high' would collapse every other chip to zero and there would be
    no way back. The building scope still applies.
    """
    with _client() as c:
        headers = _login(c)
        ds = _anomaly_dataset(c, headers)
        assert ds, "no dataset with anomalies — run the pipeline first"

        whole = c.get(f"/api/v1/datasets/{ds}/anomalies", headers=headers).json()
        if not whole["severity_counts"]:
            return

        sev = next((s for s, n in whole["severity_counts"].items() if n > 0), None)
        assert sev

        body = c.get(
            f"/api/v1/datasets/{ds}/anomalies", headers=headers, params={"severity": sev}
        ).json()

        # Every row is of that severity.
        assert all(r["severity"] == sev for r in body["anomalies"])
        # The facet still offers the other levels.
        assert any(n > 0 for s, n in body["severity_counts"].items() if s != sev)