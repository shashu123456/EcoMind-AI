"""Measure the real numbers the paper reports.

Every figure in the results section of the paper comes from this script. It
runs the actual analysis engine against the real dataset in the local SQLite
file and prints what it measured. Nothing here is illustrative.

    ../.venv/Scripts/python.exe -m scripts.measure_paper_numbers

Writes measurements.json next to this file for the paper to quote.
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import SessionLocal  # noqa: E402
from app.domain import anomaly_service, dataset_service, dq_service  # noqa: E402
from app.domain import forecast_service, recommend_service, transform_service  # noqa: E402

HERE = Path(__file__).resolve().parent
DATASET_ID = "317babde-23b5-4c06-a68e-51bea9769f4d"


def timed(fn, *args, **kwargs):
    """Return (result, wall_seconds, peak_extra_mb)."""
    start = time.perf_counter()
    out = fn(*args, **kwargs)
    return out, time.perf_counter() - start


def main() -> int:
    db = SessionLocal()
    m: dict = {"measured_at": datetime.now().isoformat(timespec="seconds")}

    # ---- corpus -----------------------------------------------------------
    ds = dataset_service.get_dataset(db, DATASET_ID)
    stats = ds.get("stats") or ds
    m["dataset"] = {
        "id": DATASET_ID,
        "name": ds.get("name"),
        "buildings": stats.get("buildings"),
        "floors": stats.get("floors"),
        "rooms": stats.get("rooms"),
        "devices": stats.get("devices"),
        "rows": stats.get("readings"),
        "start": stats.get("start"),
        "end": stats.get("end"),
    }

    # ---- detector ---------------------------------------------------------
    # `detect` returns the summary dict itself; it reads findings back out of
    # the database rather than re-deriving them, so these numbers are exactly
    # what a reader of the UI would see.
    res, secs = timed(anomaly_service.detect, db, DATASET_ID, {})
    by_class = {c["anomaly_class"]: c["count"] for c in res.get("by_class", [])}
    by_sev = {c["severity"]: c["count"] for c in res.get("by_severity", [])}
    m["anomaly"] = {
        "threshold": res.get("threshold"),
        "episodes": res.get("total"),
        "devices_affected": res.get("devices_affected"),
        "readings_scanned": res.get("readings_scanned"),
        "detection_rate_pct": res.get("detection_rate_pct"),
        "by_class": by_class,
        "by_severity": by_sev,
        "excess_kwh": res.get("excess_kwh"),
        "excess_cost": res.get("excess_cost"),
        "excess_co2_kg": res.get("excess_co2_kg"),
        "baseline_method": res.get("baseline_method"),
        "z_saturate": res.get("z_saturate"),
        "sigma_floor_for_detection": res.get("sigma_floor_for_detection"),
        "severity_bands": res.get("severity_bands"),
        "elapsed_ms_service": res.get("elapsed_ms"),
        "wall_seconds": round(secs, 3),
        "unreachable": [u["anomaly_class"] for u in res.get("unreachable_classes", [])],
        "buildings_flagged": len(res.get("by_building", [])),
    }

    # Detector cost as a function of corpus size: rows processed per second.
    m["anomaly"]["rows_per_second"] = int(
        (m["dataset"]["rows"] or 0) / max(secs, 1e-9)
    )

    # ---- data quality -----------------------------------------------------
    dq = dq_service.run_dq(db, DATASET_ID)
    m["dq"] = {
        "overall": dq.get("overall_score") or dq.get("score"),
        "summary": dq.get("summary"),
        "checks": len(dq.get("checks", [])),
        "issues": len(dq.get("issues", [])),
    }

    # ---- forecast ---------------------------------------------------------
    fc, fsecs = timed(forecast_service.forecast, db, DATASET_ID, {})
    m["forecast"] = {
        "model": fc.get("model") or fc.get("model_name"),
        "horizon_hours": fc.get("horizon_hours") or fc.get("horizon"),
        "metrics": fc.get("metrics"),
        "seconds": round(fsecs, 3),
    }

    # ---- recommendations --------------------------------------------------
    rec = recommend_service.recommend(db, DATASET_ID, {})
    m["recommend"] = {
        "count": len(rec.get("recommendations", []))
        if isinstance(rec, dict)
        else len(rec),
    }

    # ---- transform stage --------------------------------------------------
    tr, tsecs = timed(transform_service.apply_transformation, db, DATASET_ID, {})
    m["transform"] = {
        "seconds": round(tsecs, 3),
        "keys": sorted(tr.keys())[:12] if isinstance(tr, dict) else None,
    }

    # ---- detection cost at several operating points -----------------------
    sweep = []
    for t in (0.90, 0.75, 0.60):
        r, sec = timed(anomaly_service.detect, db, DATASET_ID, {"score_threshold": t})
        sweep.append(
            {
                "threshold": t,
                "episodes": r.get("total"),
                "devices_affected": r.get("devices_affected"),
                "excess_kwh": r.get("excess_kwh"),
                "excess_cost": r.get("excess_cost"),
                "seconds": round(sec, 3),
            }
        )
    m["threshold_sweep"] = sweep
    m["threshold_sweep_median_s"] = round(
        statistics.median(x["seconds"] for x in sweep), 3
    )

    db.close()

    out = HERE / "measurements.json"
    out.write_text(json.dumps(m, indent=2), encoding="utf-8")
    print(json.dumps(m, indent=2))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
