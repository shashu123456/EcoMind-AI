"""End-to-end demo: login -> start a run -> execute all ten workflow stages ->
assert the run completes.

Run:  .venv\\Scripts\\python scripts\\demo_end_to_end.py   (Windows)
      .venv/bin/python scripts/demo_end_to_end.py        (macOS/Linux)
Exit code is non-zero if any stage fails or the run does not reach completed.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

STAGES = [
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

ADMIN_EMAIL = "admin@ecomind.ai"
ADMIN_PASSWORD = "admin123"


def main() -> int:
    with TestClient(app) as c:
        health = c.get("/api/v1/health")
        assert health.status_code == 200, f"health {health.status_code}"
        print(f"[01] health ok -> {health.json().get('status')}")

        login = c.post(
            "/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert login.status_code == 200, f"login {login.status_code}"
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"[02] login ok (admin, token len={len(token)})")

        dlist = c.get("/api/v1/datasets", headers=headers)
        assert dlist.status_code == 200
        datasets = dlist.json().get("datasets") or []
        assert datasets, "no datasets in DB — run `python backend/seed.py` first"
        ds = datasets[0]
        print(f"[03] datasets ok -> {len(datasets)} ({ds['name']}, rows={ds['row_count']})")

        started = c.post(
            "/api/v1/workflows/start", headers=headers, json={"dataset_id": ds["id"]}
        )
        assert (
            started.status_code == 200
        ), f"workflow start {started.status_code} {started.text}"
        run_id = started.json()["run"]["id"]
        print(f"[04] workflow started -> run {run_id[:8]} on dataset {ds['id'][:8]}")

        for i, key in enumerate(STAGES, start=1):
            t0 = time.perf_counter()
            r = c.post(
                f"/api/v1/workflows/{run_id}/stages/{key}/exec", headers=headers, json={}
            )
            dt = (time.perf_counter() - t0) * 1000
            ok = r.status_code == 200
            body = r.json() if ok else {}
            status = body.get("trace", {}).get("status", "?") if isinstance(body, dict) else "?"
            print(f"[{i:02d}] {key:18s} {'OK ' if ok else 'FAIL'} {str(status):9s} {dt:7.0f}ms")
            assert ok, f"stage {key} failed HTTP {r.status_code}: {r.text[:300]}"

        detail = c.get(f"/api/v1/workflows/{run_id}", headers=headers)
        assert detail.status_code == 200
        run = detail.json()["run"]
        traces = detail.json().get("traces") or []
        print(
            f"[done] run status={run['status']} "
            f"stages_completed={len(run.get('stages_completed') or [])} traces={len(traces)}"
        )

        assert run["status"] == "completed", f"run did not complete: {run['status']}"
        completed = set(run.get("stages_completed") or [])
        missing = [s for s in STAGES if s not in completed]
        assert not missing, f"missing stages: {missing}"
        assert len(traces) >= len(STAGES), "trace count mismatch"

    print("\nE2E DEMO PASSED — ten-stage pipeline green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
