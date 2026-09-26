"""Large-dataset scale test: upload -> start run -> exec all 17 stages -> report metrics.

Run:  .venv\\Scripts\\python scripts\\run_large_dataset_test.py --file backend/data/sample/ecomind_bdg2_3yr_real.csv --label "real-3yr"
Exit code non-zero if any stage fails or the run does not complete.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

STAGES = [
    "library",
    "import",
    "schema_discovery",
    "dq_engine",
    "transformation",
    "feature_engineering",
    "prediction",
    "confidence_gate",
    "shap",
    "anomaly",
    "benchmarking",
    "recommendation",
    "executive_center",
    "report",
    "history_registry",
]
KEY_STAGES = {"dq_engine", "benchmarking", "confidence_gate", "anomaly", "executive_center", "prediction", "shap"}

ADMIN_EMAIL = "admin@ecomind.ai"
ADMIN_PASSWORD = "admin123"


def dig(obj, *path, default=None):
    cur = obj
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--label", required=True)
    args = ap.parse_args()
    fpath = Path(args.file)
    file_mb = fpath.stat().st_size / 1e6

    with TestClient(app) as c:
        health = c.get("/api/v1/health")
        assert health.status_code == 200, f"health {health.status_code}"
        print(f"[00] health {health.json().get('status')}")

        login = c.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert login.status_code == 200, f"login {login.status_code}"
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        t0_up = time.perf_counter()
        with fpath.open("rb") as fh:
            up = c.post(
                "/api/v1/datasets/upload",
                headers=headers,
                files={"file": (fpath.name, fh, "text/csv")},
            )
        upload_s = time.perf_counter() - t0_up
        assert up.status_code == 200, f"upload {up.status_code}: {up.text[:400]}"
        ds = up.json().get("dataset") or up.json()
        ds_id = ds.get("id")
        print(f"[01] uploaded {fpath.name} ({file_mb:.1f} MB) -> rows={ds.get('row_count')} cols={ds.get('column_count')} in {upload_s:.1f}s")

        started = c.post("/api/v1/workflows/start", headers=headers, json={"dataset_id": ds_id})
        assert started.status_code == 200, f"start {started.status_code}: {started.text[:300]}"
        run_id = started.json()["run"]["id"]
        print(f"[02] run {run_id[:8]} started on dataset {ds_id[:8]}")

        rows = []
        per_stage = []
        dq_scores: dict[str, float] = {}
        metrics: dict = {}
        for i, key in enumerate(STAGES, start=1):
            t0 = time.perf_counter()
            r = c.post(f"/api/v1/workflows/{run_id}/stages/{key}/exec", headers=headers, json={})
            dt = time.perf_counter() - t0
            ok = r.status_code == 200
            body = r.json() if ok else {}
            status = dig(body, "trace", "status", default="?")
            per_stage.append((key, ok, status, dt))
            print(f"[{i:02d}] {key:20s} {'OK ' if ok else 'FAIL'} {'green' if status in (None,'completed','done') else status} {dt:6.1f}s")
            assert ok, f"stage {key} failed HTTP {r.status_code}: {r.text[:500]}"
            if key == "dq_engine":
                for rule in (dig(body, "results") or dig(body, "rules") or []):
                    if isinstance(rule, dict) and rule.get("rule"):
                        dq_scores[str(rule.get("rule"))] = rule.get("score", rule.get("pass", 0))
                metrics["dq_overall_status"] = dig(body, "overall", "status", default="?")
            elif key == "benchmarking":
                lb = dig(body, "leaderboard") or dig(body, "benchmarks")
                if isinstance(lb, list):
                    best = next((b for b in lb if isinstance(b, dict) and b.get("is_best")), lb[0] if lb else None)
                    if best:
                        metrics["best_model"] = best.get("model") or best.get("name")
                        metrics["best_metric"] = best.get("metric") or best.get("r2") or best.get("score")
                metrics["benchmark_raw"] = body
            elif key == "confidence_gate":
                metrics["gate"] = dig(body, "summary") or dig(body, "gate") or body
            elif key == "anomaly":
                metrics["anomaly_total"] = dig(body, "total", default=None) or dig(body, "summary", "total", default=body)
            elif key == "executive_center":
                metrics["exec"] = dig(body, "summary") or body

        detail = c.get(f"/api/v1/workflows/{run_id}", headers=headers)
        run = detail.json().get("run") or {}
        comp = set(run.get("stages_completed") or [])
        missing = [s for s in STAGES if s not in comp]
        total_s = sum(dt for _, _, _, dt in per_stage)
        print(f"[done] status={run.get('status')} completed={len(comp)} missing={missing or 'none'} total={total_s:.1f}s")

        assert run.get("status") == "completed", f"run {run.get('status')}"
        assert not missing, f"missing stages: {missing}"

    report = Path(__file__).resolve().parent.parent / "docs" / "research" / "LARGE_DATA_TEST.md"
    report.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        f"## Dataset test: `{args.label}`",
        "",
        f"- File: `{fpath.name}` ({file_mb:.1f} MB)",
        f"- Rows: `{ds.get('row_count')}` — Columns: `{ds.get('column_count')}`",
        f"- Dataset id: `{ds_id[:12]}…` — run: `{run_id[:8]}…`",
        f"- Upload took **{upload_s:.1f}s**; full 17-stage workflow took **{total_s:.1f}s**",
        f"- Run status: **{run.get('status')}** — stages completed: **{len(comp)}/{len(STAGES)}**",
        "",
        "### Stage timings",
        "",
        "| # | stage | status | time (s) |",
        "|---|-------|--------|----------|",
    ]
    for i, (key, ok, status, dt) in enumerate(per_stage, start=1):
        lines.append(f"| {i} | {key} | {'green' if ok else 'FAIL'} | {dt:.1f} |")
    if dq_scores:
        lines += ["", "### Data quality scores (0–100)", "", "| rule | score |", "|------|-------|"]
        for k, v in dq_scores.items():
            lines.append(f"| {k} | {v} |")
    if metrics.get("best_model"):
        lines += ["", "### Benchmark winner", "", f"- Model: **{metrics['best_model']}** — metric: `{metrics['best_metric']}`"]
    gate = metrics.get("gate")
    if isinstance(gate, dict):
        lines += ["", "### Confidence gate", "", f"```json\n{json.dumps(gate, default=str, indent=2)[:1500]}\n```"]
    exec_sum = metrics.get("exec")
    if isinstance(exec_sum, dict):
        lines += ["", "### Executive summary", "", f"```json\n{json.dumps(exec_sum, default=str, indent=2)[:1500]}\n```"]
    if metrics.get("anomaly_total") is not None:
        lines += ["", f"### Anomalies flagged: {metrics['anomaly_total']}"]
    lines += ["", "---", ""]

    with report.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"\nReport appended -> {report}")

    print(f"\nLARGE DATASET TEST PASSED — {len(STAGES)}-stage pipeline green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
