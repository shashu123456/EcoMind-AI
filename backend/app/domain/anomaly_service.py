"""Anomaly detection: find the readings that cost money, and say why.

Ownership: S5. Contract: docs/API_CONTRACT.md §4.1.

Detection is statistical, never model-based, and the reason is specific. A
predictive model flags whatever it happens to predict badly, which means it
rediscovers its own error distribution and calls it an anomaly. A median
hour-of-week profile per device cannot be moved by the event you are looking
for, so a spike stays a spike instead of being absorbed into the baseline and
explained away.

Three decisions worth stating
-----------------------------

**The baseline is a median, and it is shrunk toward the hour-of-day profile.**
30 days of hourly data gives about four samples per hour-of-week bin, and a
median of four is not a baseline, it is a rumour. The profile is therefore a
count-weighted blend of the hour-of-week median and the hour-of-day median,
which has ~30 samples behind it. Sparse bins fall back toward the coarser
profile; well-populated ones barely move.

**Only overuse is an anomaly.** A building that reads 20% below its baseline
has saved money, and reporting that as a fault would be wrong in a way a user
cannot easily see through. Deviations are signed, the cost is computed on the
positive side only, and `excess_kwh` is never negative.

**Consecutive readings become one anomaly, not thirty.** A chiller tripping at
02:00 and staying tripped produces 24 hourly rows that are one event. Grouping
them into an episode is what makes `window_start`/`window_end` meaningful, what
keeps the anomaly table readable, and what lets a facilities manager act on
something. The per-reading detail survives in `context.readings`.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from app.core.config import settings
from app.db.models import Anomaly, DatasetDevice
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.dataset_service import audit, load_dataframe
from app.domain.feature_service import target_column
from app.domain.feature_utils import find_ts_column
from app.domain.hierarchy import device_label
from app.domain.tariff import co2_of, cost_of
from app.workflow.events import emit
from app.workflow.stages import register_stage_runner
from sqlalchemy import func
from sqlalchemy.orm import Session

#: Hours counted as night, matching the off-peak/shoulder boundary in tariff.py.
#: A building that burns energy here is burning it at the worst possible price.
NIGHT_HOURS = frozenset({22, 23, 0, 1, 2, 3, 4, 5})

#: An episode of consecutive anomalous readings longer than this is reported as a
#: sustained pattern rather than an event. Two days of overrunning air handling
#: is a different conversation from one bad hour.
SUSTAINED_HOURS = 3

#: MAD -> sigma for a standard normal. Without it the robust z-scores are
#: systematically too small and the threshold has to be tuned by eye instead of
#: meaning something.
MAD_TO_SIGMA = 0.6745

#: The robust z at which a reading scores a perfect 1.0. Every score in this
#: module is a fraction of this, so `settings.anomaly_score_threshold` reads as
#: "the fraction of ten sigma that counts as an anomaly" and the number in the
#: config is comparable across datasets of wildly different noise levels.
Z_SATURATE = 10.0

#: Fallback scale when a device's readings are near-constant. Without a floor,
#: a meter that never moves divides by zero and every rounding difference
#: becomes a 40-sigma event.
MIN_SCALE_KWH = 0.05

#: Anomaly classes, with the label the UI shows. Order is display order.
ANOMALY_CLASSES: dict[str, str] = {
    "equipment_failure": "Equipment failure",
    "sustained_overuse": "Sustained overuse",
    "night_usage": "Night-time usage",
    "meter_drift": "Meter drift",
    "extreme_spike": "Extreme spike",
    "weekend_anomaly": "Weekend anomaly",
    "wrong_room_map": "Wrong room mapping",
}

#: Severity thresholds on the normalised score, highest first.
SEVERITY_BANDS = (
    (0.90, "critical"),
    (0.75, "high"),
    (0.60, "moderate"),
)


def _severity(score: float) -> str:
    for floor, name in SEVERITY_BANDS:
        if score >= floor:
            return name
    return "low"


def _hour_of_week(ts: pd.Series) -> pd.Series:
    """0-167, Monday 00:00 at 0."""
    return ts.dt.dayofweek * 24 + ts.dt.hour


def _build_baseline(frame: pd.DataFrame) -> pd.DataFrame:
    """Per-device expected value and scale, indexed like `frame`.

    The expected value blends two profiles by how much evidence sits behind
    each: an hour-of-week bin holding 30 samples is trusted far more than one
    holding 3. The scale is the MAD of the residuals rather than the MAD of the
    raw readings, because a device that genuinely swings at 08:00 every day
    should not produce 168 false alarms.
    """
    out = frame.copy()
    out["_how"] = _hour_of_week(out["timestamp"])
    out["_hod"] = out["timestamp"].dt.hour

    # Coarse profile: hour of day. ~30 samples per bin on a 30-day window.
    by_hod = out.groupby(["device_code", "_hod"], observed=True)["_value"].median()
    out["_expected_hod"] = out.set_index(["device_code", "_hod"]).index.map(by_hod)

    # Fine profile: hour of week, blended toward the coarse one by sample count.
    by_how = out.groupby(["device_code", "_how"], observed=True)["_value"].median()
    how_counts = out.groupby(["device_code", "_how"], observed=True)["_value"].size()
    out["_expected_how"] = out.set_index(["device_code", "_how"]).index.map(by_how)

    def _blend(how_value, how_n, hod_value) -> float:
        """Trust the fine profile in proportion to how much data stands behind it.

        `how_n` is capped at 8, so a bin with 30 samples counts for a full 8 and
        a bin with 3 counts for 3/8. The remainder always comes from the coarse
        profile, which is the one that cannot be a rumour.
        """
        if how_value is None or (isinstance(how_value, float) and np.isnan(how_value)):
            return float(hod_value)
        if hod_value is None or (isinstance(hod_value, float) and np.isnan(hod_value)):
            return float(how_value)
        weight = min(float(how_n or 0), 8.0) / (min(float(how_n or 0), 8.0) + 4.0)
        return weight * float(how_value) + (1.0 - weight) * float(hod_value)

    out["_expected"] = [
        _blend(how_v, how_counts.get((dev, how), 0), hod_v)
        for dev, how, how_v, hod_v in zip(
            out["device_code"], out["_how"], out["_expected_how"], out["_expected_hod"]
        )
    ]

    # Scale from residuals, floored so a flat meter cannot divide by nothing.
    # This is the MAD of the *deviation from the profile*, not the MAD of the
    # readings: a device that genuinely swings at 08:00 every day should not
    # produce 168 false alarms just because its raw variance is large.
    residual = (out["_value"] - out["_expected"]).abs()
    mad = residual.groupby(out["device_code"], observed=True).median()
    out["_scale"] = (out["device_code"].map(mad) * MAD_TO_SIGMA).clip(lower=MIN_SCALE_KWH)
    return out


def _classify(episode: dict) -> tuple[str, str]:
    """Pick the one class that best explains an episode, and say why.

    Ordered by how specific the evidence is, so a genuine failure is not
    mislabelled "spike" just because spikes are checked first. Every branch
    names the signal it fired on: a class the user cannot interrogate is a class
    they will not trust.
    """
    hours = episode["hours"]
    n = len(hours)
    ratio = episode["mean_ratio"]

    peak = max(h["ratio"] for h in episode["per_reading_ratio"])
    if episode["mean_z"] >= 6.0 and n <= 2 and peak >= 4.0:
        return "extreme_spike", (
            f"{n} reading(s) reached {peak:.1f}x the expected baseline, the worst of them "
            f"{max(episode['per_reading_excess']):.3f} kWh over."
        )

    if n >= SUSTAINED_HOURS and all(h in NIGHT_HOURS for h in hours):
        return "night_usage", (
            f"Overuse ran {n} consecutive hours between "
            f"{min(hours):02d}:00 and {max(hours):02d}:00, which bills at the shoulder rate "
            "rather than off-peak."
        )

    if n >= SUSTAINED_HOURS and all(h >= 5 for h in hours):
        return "sustained_overuse", (
            f"Overuse held for {n} consecutive hours at {episode['mean_ratio']:.1f}x baseline, "
            "long enough to read as a setting left wrong rather than a spike."
        )

    if episode["all_weekend"]:
        return "weekend_anomaly", (
            "Every reading fell on a weekend day, when this device's baseline is the "
            "shoulder-rate profile and should be near its weekday floor."
        )

    if n >= 24 and ratio < 1.0:
        return "equipment_failure", (
            f"{n} consecutive readings sat {ratio:.0%} of baseline — a device that has stopped "
            "consuming is offline, not efficient."
        )

    if n >= 12 and 1.0 <= ratio <= 1.25:
        return "meter_drift", (
            f"A steady {ratio:.0%} of baseline across {n} readings with no single large "
            "deviation. Persistent small over-consumption reads as drift, not as an event."
        )

    if episode["is_constant_mirror"]:
        return "wrong_room_map", (
            "Readings mirror another device on the same floor exactly and at floor level, "
            "which is the signature of a feed mapped to the wrong room."
        )

    return "sustained_overuse", (
        f"{n} reading(s) averaged {ratio:.2f}x the expected baseline, an excess of "
        f"{episode['excess_kwh']:.3f} kWh."
    )


def detect(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Scan every device, write the anomalies, and return the page payload."""
    params = dict(params or {})
    started = time.perf_counter()
    run_id = params.get("run_id")

    ds, df = load_dataframe(db, dataset_id, use_processed=True)
    target = target_column(df)
    if not target:
        raise ValueError(
            f"No energy column found in dataset {dataset_id}. Expected one of "
            "energy_kwh / power_kw. Anomaly detection has nothing to measure without it."
        )
    ts_col = find_ts_column(df)
    if not ts_col:
        raise ValueError("No timestamp column found; anomalies cannot be placed in time.")

    frame = df.copy()
    frame["timestamp"] = pd.to_datetime(frame[ts_col])
    frame["_value"] = pd.to_numeric(frame[target], errors="coerce")
    frame = frame.dropna(subset=["_value", "timestamp"])
    frame = frame.sort_values(["device_code", "timestamp"])
    if frame.empty:
        raise ValueError("No usable readings to scan.")

    threshold = float(params.get("score_threshold") or settings.anomaly_score_threshold)
    if not 0.0 < threshold < 1.0:
        raise ValueError(f"score_threshold must be between 0 and 1, got {threshold}.")

    devices = sorted(frame["device_code"].dropna().unique())
    emit(params.get("run"), "anomaly_scan_progress", processed=0, total=len(devices), found=0)

    found: list[dict] = []
    readings_scanned = 0
    for i, device in enumerate(devices, start=1):
        block = frame[frame["device_code"] == device]
        readings_scanned += len(block)
        if block.empty:
            continue
        found.extend(_scan_device(block, target, threshold))
        emit(
            params.get("run"),
            "anomaly_scan_progress",
            processed=i,
            total=len(devices),
            device_code=device,
            found=len(found),
        )

    found.sort(key=lambda a: (-a["excess_cost"], -a["score"]))
    for rank, item in enumerate(found, start=1):
        item["priority_rank"] = rank

    _persist(db, dataset_id, run_id, found, ds)
    # The summary reads the anomalies back out of the database rather than
    # re-deriving them, so it reflects exactly what was persisted. That means it
    # has to see the inserts, and the rows do not exist to query until flushed.
    db.flush()
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    result = _summary(db, dataset_id, run_id, found, readings_scanned, threshold, elapsed_ms)
    snapshots.snapshot(db, dataset_id, "anomaly", result, run_id=run_id)
    audit(
        db,
        None,
        "execute",
        "anomaly",
        dataset_id,
        {"anomalies": len(found), "readings_scanned": readings_scanned},
    )
    db.commit()

    emit(params.get("run"), "anomaly_detection_completed", found=len(found), elapsed_ms=elapsed_ms)
    return result


def _scan_device(block: pd.DataFrame, target: str, threshold: float) -> list[dict]:
    """Anomalous episodes for one device, from its own baseline."""
    block = _build_baseline(block)
    block["_z"] = (block["_value"] - block["_expected"]) / block["_scale"]
    block["_flag"] = block["_z"] >= _z_for(threshold)

    hits = block[block["_flag"]]
    if hits.empty:
        return []

    # Group flagged readings that are consecutive in this device's own timeline.
    # A gap of more than one sampling interval ends the episode, because
    # "consecutive" has to mean consecutive and not merely near each other.
    grouper = (block["_flag"] != block["_flag"].shift()).cumsum()
    episodes = [g for _, g in block[block["_flag"]].groupby(grouper[block["_flag"]])]
    if not episodes:
        return []

    floor_rows = _floor_shares(block)
    out = []
    for group in episodes:
        gaps = group["timestamp"].diff().dropna()
        max_gap = gaps.max() if not gaps.empty else pd.Timedelta(0)
        expected_step = block["timestamp"].diff().median() or pd.Timedelta(hours=1)
        if pd.notna(max_gap) and max_gap > 1.5 * expected_step:
            # Flagged readings with normal readings between them are separate
            # events that happen to share a class, and must not be summed into
            # one window that claims to be continuous.
            out.extend(
                e
                for e in (
                    _episode(s, block, floor_rows, target)
                    for _, s in group.groupby(grouper.loc[group.index])
                )
                if e is not None
            )
            continue
        episode = _episode(group, block, floor_rows, target)
        if episode is not None:
            out.append(episode)
    return out


def _text(value) -> str | None:
    """A hierarchy key as a plain Python string, or None.

    Every one of these columns is stored in a SQL `String`, and a numpy int64
    handed to one is written as its eight little-endian bytes rather than its
    decimal text — so `floor_no` of 2 came back out of the database as
    `b'\\x02\\x00\\x00\\x00\\x00\\x00\\x00\\x00'` and 639 anomaly rows reported a
    floor of binary noise. `str()` is the conversion that means what it says.
    Missing stays missing: None is a real answer for a meter-grain dataset with
    no floor, and the string `"None"` is not.
    """
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", "replace")
    if isinstance(value, float) and float(value).is_integer():
        return str(int(value))
    text = str(value).strip()
    return text or None


def _z_for(threshold: float) -> float:
    """Score threshold expressed in raw robust-z terms.

    The score is a fraction of `Z_SATURATE`, so the configured threshold is just
    that fraction multiplied back out. Working in z units internally means the
    same configured threshold means the same thing on a steady meter and a
    noisy one, which a raw score does not.
    """
    return float(np.clip(threshold, 0.0, 1.0)) * Z_SATURATE


def _floor_shares(block: pd.DataFrame) -> dict:
    """Mean reading per (floor, device), for the mis-mapping check."""
    if "floor_no" not in block.columns:
        return {}
    g = block.groupby(["floor_no", "device_code"], observed=True)["_value"].mean()
    return {k: float(v) for k, v in g.items()}


def _episode(
    group: pd.DataFrame, block: pd.DataFrame, floor_rows: dict, target: str
) -> dict | None:
    expected = float(group["_expected"].sum())
    actual = float(group["_value"].sum())
    excess = actual - expected
    if expected <= 0 or excess <= 0:
        return None

    first = group.iloc[0]
    n = len(group)
    mean_z = float(group["_z"].mean())
    score = float(np.clip(mean_z / Z_SATURATE, 0.0, 1.0))
    # A device that is consistently 15% over on twenty-four readings is a more
    # certain finding than one that spikes once, so persistence lifts the score.
    persistence = min(1.0, (n - 1) / 24.0)
    score = float(np.clip(score * (0.75 + 0.25 * persistence), 0.0, 1.0))

    floor = _text(first.get("floor_no"))
    device = _text(first.get("device_code"))
    peers = [v for (f, d), v in floor_rows.items() if f == floor and d != device and v > 0]
    mean_peer = float(np.mean(peers)) if peers else None
    mirror = bool(mean_peer and float(first["_value"]) >= 0.98 * mean_peer)

    episode = {
        "device_code": device,
        "device_category": _text(first.get("device_category")),
        "building_code": _text(first.get("building_code")),
        "floor_no": floor,
        "room_code": _text(first.get("room_code")),
        "timestamp": first["timestamp"].to_pydatetime(),
        "window_start": group["timestamp"].iloc[0].to_pydatetime(),
        "window_end": group["timestamp"].iloc[-1].to_pydatetime(),
        "hours": [int(h) for h in group["timestamp"].dt.hour.tolist()],
        "readings": n,
        "expected_kwh": round(expected, 4),
        "actual_kwh": round(actual, 4),
        "excess_kwh": round(excess, 4),
        "deviation_pct": round(excess / expected * 100.0, 2),
        "mean_z": mean_z,
        "score": score,
        "mean_ratio": actual / expected,
        "per_reading_excess": [float(x) for x in (group["_value"] - group["_expected"]).tolist()],
        "per_reading_ratio": [
            {"ratio": float(a / b) if b > 0 else 0.0, "excess": float(a - b)}
            for a, b in zip(group["_value"], group["_expected"])
        ],
        "all_weekend": bool((group["timestamp"].dt.dayofweek >= 5).all()),
        "is_constant_mirror": mirror,
        "touched": target,
    }
    anomaly_class, evidence = _classify(episode)
    episode["anomaly_class"] = anomaly_class
    episode["evidence"] = evidence
    episode["severity"] = _severity(score)
    # Cost and carbon are priced here rather than only on the way to the row, so
    # that ranking by money happens before persistence instead of after it.
    episode["excess_cost"] = cost_of(excess, episode["window_start"])
    episode["excess_co2_kg"] = co2_of(excess)
    return episode


def _persist(db: Session, dataset_id: str, run_id: str | None, found: list[dict], ds) -> None:
    """Replace this dataset's anomalies, then write the new ones.

    A re-scan replaces rather than appends, because a resolved fault that is
    still listed is worse than no list at all. Detection history lives in the
    stage traces.
    """
    db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id).delete(synchronize_session=False)
    devices = {
        d.id: d
        for d in db.query(DatasetDevice).filter(DatasetDevice.dataset_id == dataset_id).all()
    }

    for item in found:
        db.add(
            Anomaly(
                dataset_id=dataset_id,
                run_id=run_id,
                device_id=(
                    devices.get(item["device_code"]).id
                    if devices.get(item["device_code"])
                    else None
                ),
                building_code=item["building_code"],
                floor_no=item["floor_no"],
                room_code=item["room_code"],
                device_code=item["device_code"],
                device_category=item["device_category"],
                timestamp=item["timestamp"],
                window_start=item["window_start"],
                window_end=item["window_end"],
                anomaly_type="excess",
                anomaly_class=item["anomaly_class"],
                severity=item["severity"],
                score=item["score"],
                deviation_pct=item["deviation_pct"],
                expected_kwh=item["expected_kwh"],
                actual_kwh=item["actual_kwh"],
                excess_kwh=item["excess_kwh"],
                excess_cost=item["excess_cost"],
                excess_co2_kg=item["excess_co2_kg"],
                priority_rank=item["priority_rank"],
                baseline_method=settings.anomaly_baseline_method,
                is_confirmed=False,
                description=item["evidence"],
                context=json_safe(
                    {
                        "readings": item["readings"],
                        "hours": item["hours"],
                        "robust_z_mean": round(item["mean_z"], 3),
                        "class_label": ANOMALY_CLASSES[item["anomaly_class"]],
                    }
                ),
            )
        )


def _anomaly_payload(a: Anomaly) -> dict:
    context = a.context or {}
    return {
        "id": a.id,
        "dataset_id": a.dataset_id,
        "run_id": a.run_id,
        "building_code": a.building_code,
        "floor_no": a.floor_no,
        "room_code": a.room_code,
        "device_code": a.device_code,
        "device_label": device_label(a.device_category) or a.device_code,
        "device_category": a.device_category,
        "detected_at": a.timestamp.isoformat() if a.timestamp else None,
        "window_start": a.window_start.isoformat() if a.window_start else None,
        "window_end": a.window_end.isoformat() if a.window_end else None,
        "anomaly_class": a.anomaly_class,
        "class_label": context.get("class_label")
        or ANOMALY_CLASSES.get(a.anomaly_class, a.anomaly_class),
        "severity": a.severity,
        "score": a.score,
        "baseline_method": a.baseline_method,
        "expected_kwh": a.expected_kwh,
        "actual_kwh": a.actual_kwh,
        "deviation_pct": a.deviation_pct,
        "excess_kwh": a.excess_kwh,
        "excess_cost": a.excess_cost,
        "excess_co2_kg": a.excess_co2_kg,
        "priority_rank": a.priority_rank,
        "evidence": a.description,
    }


def _summary(
    db: Session,
    dataset_id: str,
    run_id: str | None,
    found: list[dict],
    readings_scanned: int,
    threshold: float,
    elapsed_ms: int,
) -> dict:
    rows = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id).all()
    by_class: dict[str, dict] = {}
    by_sev: dict[str, float] = {}
    by_building: dict[str, dict] = {}
    by_device: dict[str, dict] = {}
    for a in rows:
        c = by_class.setdefault(
            a.anomaly_class,
            {
                "anomaly_class": a.anomaly_class,
                "label": ANOMALY_CLASSES.get(a.anomaly_class, a.anomaly_class),
                "count": 0,
                "excess_kwh": 0.0,
                "excess_cost": 0.0,
            },
        )
        c["count"] += 1
        c["excess_kwh"] = round(c["excess_kwh"] + (a.excess_kwh or 0.0), 4)
        c["excess_cost"] = round(c["excess_cost"] + (a.excess_cost or 0.0), 2)
        by_sev[a.severity] = by_sev.get(a.severity, 0) + 1
        b = by_building.setdefault(
            a.building_code or "unknown",
            {"building_code": a.building_code, "count": 0, "excess_kwh": 0.0, "excess_cost": 0.0},
        )
        b["count"] += 1
        b["excess_kwh"] = round(b["excess_kwh"] + (a.excess_kwh or 0.0), 4)
        b["excess_cost"] = round(b["excess_cost"] + (a.excess_cost or 0.0), 2)
        d = by_device.setdefault(
            a.device_code,
            {
                "device_code": a.device_code,
                "label": device_label(a.device_category) or a.device_code,
                "count": 0,
                "excess_kwh": 0.0,
            },
        )
        d["count"] += 1
        d["excess_kwh"] = round(d["excess_kwh"] + (a.excess_kwh or 0.0), 4)

    excess_kwh = round(sum(a.excess_kwh or 0.0 for a in rows), 4)
    excess_cost = round(sum(a.excess_cost or 0.0 for a in rows), 2)
    return json_safe(
        {
            "run_id": run_id,
            "dataset_id": dataset_id,
            "total": len(rows),
            "devices_affected": len(by_device),
            "readings_scanned": readings_scanned,
            "detection_rate_pct": (
                round(len(rows) / readings_scanned * 100.0, 4) if readings_scanned else 0.0
            ),
            "excess_kwh": excess_kwh,
            "excess_cost": excess_cost,
            "excess_co2_kg": round(sum(a.excess_co2_kg or 0.0 for a in rows), 4),
            "by_class": sorted(by_class.values(), key=lambda c: -c["excess_cost"]),
            "by_severity": [
                {
                    "severity": k,
                    "count": v,
                    "excess_kwh": round(
                        sum(a.excess_kwh or 0.0 for a in rows if a.severity == k), 4
                    ),
                }
                for k, v in sorted(by_sev.items())
            ],
            "by_building": sorted(by_building.values(), key=lambda b: -b["excess_cost"]),
            "top_devices": sorted(by_device.values(), key=lambda d: -d["excess_kwh"])[:10],
            "baseline_method": settings.anomaly_baseline_method,
            "threshold": threshold,
            "analysed_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_ms": elapsed_ms,
        }
    )


# ── Read paths ────────────────────────────────────────────────
def summary(db: Session, dataset_id: str) -> dict | None:
    """The last scan's summary, or None if anomalies have not been run."""
    return snapshots.latest_snapshot(db, "anomaly", dataset_id)


def page(
    db: Session,
    dataset_id: str,
    page: int = 1,
    page_size: int = 50,
    severity: str | None = None,
    anomaly_class: str | None = None,
    building_code: str | None = None,
) -> dict:
    """One page of anomalies, plus the counts the UI needs for its filters.

    Facets obey the *building* filter but deliberately not the severity or
    class filters, so the counts still show what switching to a different
    severity would yield. They must obey the building filter, though: a panel
    reading "1,281 anomalies in Riverside" beside severity chips that sum to the
    campus-wide 2,227 is two contradictory truths on one screen, which is the
    failure this whole filtering path exists to avoid.

    The counts are grouped in SQL. Loading every matching row into Python to
    count them in a comprehension was quadratic in exactly the way that hurts
    on the estates this is built for.
    """
    # The estate-level scope every query in this function shares.
    base_q = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id)
    if building_code:
        base_q = base_q.filter(Anomaly.building_code == building_code)

    # Rows additionally honour the two facet filters.
    q = base_q
    if severity:
        q = q.filter(Anomaly.severity == severity)
    if anomaly_class:
        q = q.filter(Anomaly.anomaly_class == anomaly_class)

    page = max(1, int(page))
    page_size = max(1, min(500, int(page_size)))
    total = q.count()
    rows = (
        q.order_by(Anomaly.priority_rank.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    def _group(column, wanted) -> dict:
        facet_q = db.query(column, func.count(Anomaly.id)).filter(
            Anomaly.dataset_id == dataset_id
        )
        if building_code:
            facet_q = facet_q.filter(Anomaly.building_code == building_code)
        found = {str(value): int(n) for value, n in facet_q.group_by(column).all()}
        # Report every known level, including zero, so a filter row does not
        # appear and vanish as the scope changes.
        return {key: found.get(key, 0) for key in wanted}

    return json_safe(
        {
            "dataset_id": dataset_id,
            "anomalies": [_anomaly_payload(a) for a in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "severity_counts": _group(Anomaly.severity, ("critical", "high", "moderate", "low")),
            "class_counts": _group(Anomaly.anomaly_class, tuple(ANOMALY_CLASSES)),
            "scope": {
                "building_code": building_code,
                "severity": severity,
                "anomaly_class": anomaly_class,
            },
        }
    )


@register_stage_runner("anomaly")
def anomaly_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = detect(db, dataset_id, {**params, "run_id": run.id, "run": run})
    if result["total"] == 0:
        decision = (
            f"No anomaly exceeded the {result['threshold']} score across "
            f"{result['readings_scanned']} readings on a "
            f"{result['baseline_method']} baseline."
        )
    else:
        top = result["by_class"][0] if result["by_class"] else None
        decision = (
            f"{result['total']} anomal{'y' if result['total'] == 1 else 'ies'} across "
            f"{result['devices_affected']} device(s), costing {result['excess_cost']} rupees and "
            f"{result['excess_kwh']} kWh. Baseline: {result['baseline_method']}."
        )
        if top:
            decision += f" Largest category: {top['label']} ({top['count']} anomalies)."
    return {
        "output": result,
        # Confidence is about the *scan*, not about any single finding: a
        # detection rate far above the cap means the baseline is absorbing
        # rather than separating, and a rate of exactly zero on messy data
        # usually means the threshold is too high, not that the estate is clean.
        "confidence": round(
            min(1.0, max(0.0, 1.0 - abs(result["detection_rate_pct"] - 2.0) / 10.0)), 3
        ),
        "decision": decision,
        "trace_extra": {
            "anomaly_count": result["total"],
            "excess_kwh": result["excess_kwh"],
        },
    }
