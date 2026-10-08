"""Recommendations: an action, and the evidence that justifies it.

The `Recommendation` docstring says a recommendation exists only if it can cite
both the anomalies that motivate it and the forecast that sizes the prize. That
is the rule this module is built around, and it is worth being explicit about
why it is more than a schema constraint.

An anomaly is retrospective: it says a meter read 4x its baseline at 02:00 on a
Tuesday. On its own that is a fact, not an argument. A forecast is prospective:
it says the estate will consume 81,266 kWh over the next 30 days at Rs 15,500.
Also on its own that is a number nobody is obliged to act on. What a facilities
manager can take to a budget meeting is the pair — "this meter is wasting
X kWh, and the estate's forward load is Y kWh, so this is Z% of the problem" —
and that pairing is what gets stored. `anomaly_ids` is the receipt, the
`forecast_basis` is the arithmetic, and a recommendation whose two halves
disagree is a recommendation that has been wrong somewhere.

Three honesty constraints shape the numbers, and each exists because the
obvious alternative is a fabrication:

**Savings are a recovery fraction, not the excess.** An anomaly's `excess_kwh`
is the gap between actual and expected at the moment it was detected. Claiming
all of it as recoverable overstates every recommendation on the page. The
recoverable share depends entirely on what the anomaly *is*: a sustained
overuse is a behaviour or a schedule that can be fixed and keeps paying back
for the rest of the horizon, while a single extreme spike is over the moment it
ends and recovering it would require something to be wrong again tomorrow. A
meter drift has no recoverable energy at all — the energy was always consumed,
we just measured it wrongly — so its action is to verify the meter and its
savings are zero. Zero is the correct number and it is reported as zero.

**Savings are not summed across overlapping anomalies.** A meter with fifty
night-time anomalies has one root cause, not fifty. Recommendations are grouped
by device and by anomaly class before any arithmetic happens, and the group's
saving is computed once from the grouped excess. Without that, one faulty meter
dominates the total and every other building's recommendations are rounded out of
existence. `savings_inventory` reports the grouped figure alongside the raw sum
so the difference between the two is visible rather than buried.

**Payback uses the quoted action cost, not a guessed one.** `payback_months` is
the action cost divided by monthly savings. Where no plausible action cost can
be defended for the category, payback is `None` rather than a number that looks
like it came from somewhere.

Recommendations are generated per (device, anomaly class) group, plus one
estate-level peak-shaving recommendation per building, and are written to the
`recommendations` table with a snapshot per building so the page can filter
without re-deriving anything.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Iterable

from app.db.models import Anomaly, Dataset, Recommendation
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.hierarchy import device_label
from app.domain.tariff import CO2_KG_PER_KWH, CURRENCY, co2_of, cost_of
from app.workflow.events import emit
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

# ── Recommendation playbooks ────────────────────────────────
# One entry per anomaly class. `recovery` is the defensible share of the grouped
# excess that a completed action actually removes; `action` is what a technician
# would be asked to do; `cost` is the installed cost of that action in rupees,
# used only for payback. `None` cost means no defensible figure exists and
# payback is reported as unknown rather than invented.
#
# The recovery fractions are not arbitrary. They encode the difference between a
# standing fault and a transient one:
#   - sustained_overuse  0.70 — a schedule or a control setting; once changed it
#                            keeps paying for the whole horizon.
#   - night_usage        0.55 — usually an override or a stuck schedule, but
#                            partly genuine occupancy on a 24/7 site.
#   - equipment_failure  0.00 — an equipment fault wastes energy, but no
#                            maintenance action recovers the energy already
#                            burned without also replacing the equipment, which
#                            is a capital decision this report cannot make.
#   - extreme_spike      0.10 — one event. Recovering it requires a recurrence.
#   - meter_drift        0.00 — nothing was wasted; the measurement was wrong.
#   - weekend_anomaly    0.40 — a schedule left running over the weekend.
#   - wrong_room_map     0.00 — a mapping error mislabels consumption, it does
#                            not create any. Fix it for attribution accuracy.
PLAYBOOK: dict[str, dict[str, Any]] = {
    "sustained_overuse": {
        "category": "consumption_optimisation",
        "action": "Review the scheduling and setpoints for this meter. The baseline "
        "is already exceeded consistently, so this is a standing "
        "condition rather than an incident.",
        "cost": 4500.0,
        "recovery": 0.70,
    },
    "night_usage": {
        "category": "schedule_optimisation",
        "action": "Audit out-of-hours operation. Check for override schedules, "
        "unattended equipment and lighting or HVAC left running.",
        "cost": 2500.0,
        "recovery": 0.55,
    },
    "weekend_anomaly": {
        "category": "schedule_optimisation",
        "action": "Trim the weekend schedule to the hours the space is actually "
        "occupied. This pattern usually comes from a schedule left on "
        "its weekday setting.",
        "cost": 2500.0,
        "recovery": 0.40,
    },
    "equipment_failure": {
        "category": "equipment_maintenance",
        "action": "Inspect the equipment for a fault. Prioritise by the peak hours "
        "in the evidence rather than the total, since the fault itself "
        "is not recoverable energy.",
        "cost": 12000.0,
        "recovery": 0.0,
    },
    "meter_drift": {
        "category": "meter_verification",
        "action": "Verify the meter against a reference reading. Drift misstates "
        "consumption and every downstream number built on it, so this is "
        "a measurement fix rather than a saving.",
        "cost": 3500.0,
        "recovery": 0.0,
    },
    "extreme_spike": {
        "category": "load_investigation",
        "action": "Identify the event behind the spike from the hour and the "
        "concurrent meters, and rule out a start-up or a data fault "
        "before treating it as consumption.",
        "cost": None,
        "recovery": 0.10,
    },
    "wrong_room_map": {
        "category": "data_correction",
        "action": "Correct the room mapping for this meter. Consumption is being "
        "attributed to the wrong space, which misleads every scoped "
        "decision.",
        "cost": 1500.0,
        "recovery": 0.0,
    },
}

#: Fallback for a class this build does not know about. `recovery=0` and no
#: action, because inventing an instruction for an anomaly class nobody has
#: characterised would be the single most dangerous thing this module could do.
UNKNOWN_PLAYBOOK = {
    "category": "investigation",
    "action": "Investigate this anomaly class manually. It is not in the "
    "playbook, so no recovery is claimed and no payback calculated.",
    "cost": None,
    "recovery": 0.0,
}

#: Priority is decided by *rank* within this dataset, not by an absolute rupee
#: threshold, and the reason is that no fixed threshold is defensible across the
#: range of datasets this platform accepts. A 3-meter flat file and a 500-meter
#: campus differ by two orders of magnitude in recoverable rupees, so any fixed
#: cut either marks the small estate's entire estate as urgent or marks the large
#: one as entirely routine. Ranks mean the top of this estate's list is always
#: the top of this estate's list.
#:
#: P1 additionally fires on an absolute monthly figure, because past that number
#: the saving is worth the attention regardless of what else is on the page.
P1_ABSOLUTE_MONTHLY_INR = 4000.0
P1_RANK_FRACTION = 0.10
P1_MAX_ROWS = 10
P2_RANK_FRACTION = 0.30
P2_MAX_ROWS = 30

#: Share of a meter's grouped recoverable excess that counts towards the
#: "avoidable" claim in the forecast basis. The remainder is inherent variance
#: around the baseline and is not claimed as a saving.
RECOVERABLE_TO_FORECAST_RATIO = 0.60

#: Payback beyond this is not a payback, it is a reason not to do the work. It is
#: reported as such rather than as a precise number of months, because "92.6
#: months" invites a reader to believe the arithmetic has more precision than a
#: recovered-energy estimate over a median baseline can support.
PAYBACK_VIABLE_MONTHS = 12.0
PAYBACK_MARGINAL_MONTHS = 36.0

SEVERITY_RANK = {"critical": 0, "high": 1, "moderate": 2, "low": 3}


def _playbook(anomaly_class: str) -> dict[str, Any]:
    return PLAYBOOK.get(anomaly_class, UNKNOWN_PLAYBOOK)


def _load_anomalies(db: Session, dataset_id: str) -> list[Anomaly]:
    return (
        db.query(Anomaly)
        .filter(Anomaly.dataset_id == dataset_id)
        .order_by(Anomaly.priority_rank.asc(), Anomaly.timestamp.asc())
        .all()
    )


def _group(anomalies: Iterable[Anomaly]) -> dict[tuple[str, str], list[Anomaly]]:
    """Group anomalies into one bucket per (device_code, anomaly_class).

    The grouping is the whole trick. Fifty night-time anomalies on one meter are
    one standing condition, and pricing them as fifty separate actions would
    both inflate the count and double count the energy behind them.
    """
    buckets: dict[tuple[str, str], list[Anomaly]] = {}
    for a in anomalies:
        key = (a.device_code or "unknown", a.anomaly_class or "unknown")
        buckets.setdefault(key, []).append(a)
    return buckets


def _group_savings(rows: list[Anomaly], anomaly_class: str) -> tuple[float, float]:
    """Recoverable kWh and rupees for one group.

    ``excess_kwh`` is summed across the group's rows and then multiplied by the
    class's recovery fraction. The excess is already expressed in kWh at the
    detected tariff, so the rupees come from `cost_of` on the recovered amount
    rather than from the excess cost column, which prices energy that is not
    being claimed.
    """
    excess = float(sum(a.excess_kwh or 0.0 for a in rows))
    recovery = _playbook(anomaly_class)["recovery"]
    recoverable = excess * float(recovery)
    return recoverable, cost_of(recoverable)


def _monthly_savings(rupees: float, history_hours: int | None) -> float:
    """Scale a detected-window saving to a monthly figure for payback.

    `estimated_savings_rupees` is the price of the recoverable excess *as it was
    detected*, which is a property of however much history the dataset holds. A
    dataset of 90 days and one of 24 months therefore produce different monthly
    rates from identical anomalies, and payback computed without dividing by the
    window would flatter a short dataset by exactly the ratio of the two.

    The divisor is the history length in months, taken from the forecast
    snapshot, because the anomaly stage does not carry it.
    """
    months = (float(history_hours) / (24 * 30)) if history_hours else 1.0
    if months < 1.0:
        # Less than a month of history. The detected excess is already a
        # sub-monthly figure, and scaling it up to a month would extrapolate
        # past the data. Treated as a month, which understates rather than
        # overstates the payback.
        months = 1.0
    return rupees / months


def _peak_hours(rows: list[Anomaly], limit: int = 5) -> list[str]:
    """The hours carrying the most excess, as HH:MM.

    Ranked by excess rather than listed in time order, because "most active at
    02:00, 03:00, 04:00" tells a technician where to go and "most active between
    00:00 and 05:00" only tells them the range the other three sit in.
    """
    totals: dict[str, float] = {}
    for a in rows:
        if not a.timestamp:
            continue
        key = a.timestamp.strftime("%H:%M")
        totals[key] = totals.get(key, 0.0) + float(a.excess_kwh or 0.0)
    ranked = sorted(totals.items(), key=lambda kv: -kv[1])
    return [h for h, _ in ranked[:limit]] or ["no timestamped reading"]


def _forecast_basis(
    group_kwh: float, forecast: dict | None, building_total: float | None
) -> tuple[str, float | None]:
    """A sentence tying this recommendation to the forward load, and the share.

    The share is the fraction of the horizon's projected energy this group's
    recoverable excess represents, after the `RECOVERABLE_TO_FORECAST_RATIO`
    haircut. The haircut exists because the anomaly baseline is a median, and a
    median leaves genuine day-to-day variance on both sides of it; claiming all
    of that as avoidable would be claiming the variance is waste.
    """
    if not forecast:
        return (
            "No forward forecast is available for this dataset, so this "
            "recommendation is priced on the detected excess alone and the "
            "share of the estate's forward load cannot be stated.",
            None,
        )

    short = [h for h in forecast.get("horizons", []) if h.get("tier") == "short"]
    lead = short[-1] if short else (forecast.get("horizons") or [{}])[0]
    horizon_kwh = float(lead.get("total_kwh") or 0.0)
    share = None
    basis = (
        f"The {lead.get('horizon', '30d')} projection for this dataset is "
        f"{horizon_kwh:,.0f} kWh at Rs {float(lead.get('total_cost_inr') or 0):,.0f}. "
    )
    if horizon_kwh > 0:
        share = group_kwh * RECOVERABLE_TO_FORECAST_RATIO / horizon_kwh
        basis += (
            f"This recommendation's recoverable excess is {share * 100:.2f}% "
            f"of that volume, after discounting the day-to-day variance a "
            f"median baseline necessarily leaves behind. "
        )
    if building_total:
        basis += (
            f"The affected building accounts for {building_total:,.0f} kWh "
            f"of the same projection. "
        )
    return basis.strip(), round(share * 100, 3) if share is not None else None


def _payback_verdict(payback: float | None) -> str:
    if payback is None:
        return "unknown"
    if payback <= PAYBACK_VIABLE_MONTHS:
        return "viable"
    if payback <= PAYBACK_MARGINAL_MONTHS:
        return "marginal"
    return "not_viable"


def _assign_priorities(groups: list[dict]) -> None:
    """Assign P1/P2/P3 across the whole set, by rank, then hand back.

    Each entry needs `monthly_inr` and `worst_severity`; the assigned `priority`
    is written onto it. Ranking is by monthly rupees descending, so a group with
    no recoverable energy at all sorts last and can only be promoted by severity.
    """
    groups.sort(key=lambda g: (-float(g["monthly_inr"]), SEVERITY_RANK.get(g["worst_severity"], 9)))
    n = len(groups)
    p1_cut = max(1, min(P1_MAX_ROWS, int(round(n * P1_RANK_FRACTION))))
    p2_cut = max(p1_cut, min(P2_MAX_ROWS, int(round(n * P2_RANK_FRACTION))))

    for i, g in enumerate(groups):
        monthly = float(g["monthly_inr"])
        severity = g["worst_severity"]
        if i < p1_cut or monthly >= P1_ABSOLUTE_MONTHLY_INR:
            priority = "P1"
        elif i < p2_cut or severity == "critical":
            priority = "P2"
        elif severity in ("high", "moderate"):
            # A real deviation with a real but small price. It is not urgent and
            # it is not noise, so it sits at P3 with its payback labelled, which
            # is the only thing that tells the reader whether to bother.
            priority = "P3"
        else:
            priority = "P3"
        g["priority"] = priority
        g["rank"] = i + 1


def _building_forecasts(forecast: dict | None) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in (forecast or {}).get("compare", {}).get("rows", []) or []:
        code = row.get("building_code")
        if code and row.get("total_kwh") is not None:
            out[code] = float(row["total_kwh"])
    return out


def recommend(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Generate, persist and return this dataset's recommendations."""
    params = params or {}
    started = time.time()
    run_id = params.get("run_id")
    emit(params.get("run"), "recommendation_progress", processed=0, total=1)

    ds = db.query(Dataset).get(dataset_id)
    if ds is None:
        raise ValueError(f"Dataset {dataset_id} not found")

    anomalies = _load_anomalies(db, dataset_id)
    forecast = snapshots.latest_snapshot(db, "forecast", dataset_id)
    building_kwh = _building_forecasts(forecast)

    # One snapshot per building is what the page filters on. A dataset with no
    # building column still gets a single campus-level row, because an empty
    # buildings table would read as "nothing to do" rather than "flat meters".
    groups = _group(anomalies)
    building_kwh = _building_forecasts(forecast)
    history_hours = (forecast or {}).get("history_hours")

    # Priorities are decided across the whole set before any row is written,
    # because a rank is only a rank relative to the other recommendations on the
    # same page. Scoring each group in isolation is what produced a page with no
    # P1 at all on a dataset whose largest genuine recovery was the best it had.
    staged: list[dict] = []
    for (device_code, anomaly_class), members in groups.items():
        head = members[0]
        play = _playbook(anomaly_class)
        recoverable, rupees = _group_savings(members, anomaly_class)
        worst = min(((m.severity or "low") for m in members), key=lambda s: SEVERITY_RANK.get(s, 9))
        staged.append(
            {
                "head": head,
                "members": members,
                "device_code": device_code,
                "anomaly_class": anomaly_class,
                "play": play,
                "recoverable": recoverable,
                "rupees": rupees,
                "monthly_inr": _monthly_savings(rupees, history_hours),
                "worst_severity": worst,
                "building_code": head.building_code or "ALL",
            }
        )
    _assign_priorities(staged)

    # One snapshot per building is what the page filters on. A dataset with no
    # building column still gets a single campus-level row, because an empty
    # buildings table would read as "nothing to do" rather than "flat meters".
    by_building: dict[str, list[dict]] = {}
    rows: list[Recommendation] = []

    for item in staged:
        head = item["head"]
        members = item["members"]
        play = item["play"]
        anomaly_class = item["anomaly_class"]
        device_code = item["device_code"]
        recoverable = item["recoverable"]
        rupees = item["rupees"]
        monthly_inr = item["monthly_inr"]
        worst = item["worst_severity"]
        priority = item["priority"]
        basis, share = _forecast_basis(
            recoverable, forecast, building_kwh.get(item["building_code"])
        )

        estimated_cost = play["cost"]
        payback = None
        if estimated_cost and monthly_inr > 0:
            payback = round(estimated_cost / monthly_inr, 1)

        row = Recommendation(
            dataset_id=dataset_id,
            run_id=run_id,
            priority=priority,
            category=play["category"],
            title=f"{device_label(head.device_category, device_code)}: "
            f"{_class_label(anomaly_class)} on {device_code}",
            description=(
                f"{len(members)} reading{'s' if len(members) != 1 else ''} on this "
                f"meter matched a {_class_label(anomaly_class).lower()} pattern "
                f"against its median hour-of-week baseline, totalling "
                f"{float(sum(m.excess_kwh or 0.0 for m in members)):,.1f} kWh "
                f"above expected."
            ),
            reason=(
                f"Rank {item['rank']} of {len(staged)} by recoverable value. "
                f"{worst.capitalize()} severity, most active at "
                f"{', '.join(_peak_hours(members))}. "
                f"{play['recovery'] * 100:.0f}% of the excess is treated as "
                f"recoverable on the basis of this anomaly class, giving "
                f"{recoverable:,.1f} kWh / Rs {rupees:,.0f} over the detected "
                f"window. " + basis
            ),
            building_code=head.building_code,
            floor_no=head.floor_no,
            room_code=head.room_code,
            device_code=device_code,
            device_category=head.device_category,
            anomaly_ids=[m.id for m in members][:50],
            forecast_basis=basis,
            estimated_savings_kwh=round(recoverable, 3),
            estimated_savings_rupees=round(rupees, 2),
            estimated_savings_percent=share,
            maintenance_action=play["action"],
            payback_months=payback,
            estimated_cost_inr=estimated_cost,
            supporting_evidence={
                "anomaly_count": len(members),
                "severity": worst,
                "anomaly_class": anomaly_class,
                "peak_hours": _peak_hours(members),
                "excess_kwh": round(float(sum(m.excess_kwh or 0.0 for m in members)), 3),
                "recovery_fraction": play["recovery"],
                "recoverable_kwh": round(recoverable, 3),
                "monthly_recoverable_inr": round(monthly_inr, 2),
                "rank": item["rank"],
                "payback_verdict": _payback_verdict(payback),
                "first_seen": members[0].timestamp.isoformat() if members[0].timestamp else None,
                "last_seen": members[-1].timestamp.isoformat() if members[-1].timestamp else None,
                "forecast_horizon": next(
                    (
                        h.get("horizon")
                        for h in (forecast or {}).get("horizons", [])
                        if h.get("tier") == "short"
                    ),
                    None,
                ),
                "savings_window_days": round(float(history_hours or 720) / 24.0, 1),
                "savings_window_note": (
                    "estimated_savings_* is the recoverable excess over the "
                    "detected window. payback_months divides the action cost by "
                    "the window-normalised monthly rate."
                ),
                "currency": CURRENCY,
            },
            status="open",
            confidence=round(min(1.0, 0.4 + 0.6 * float(play["recovery"])), 3),
        )
        db.add(row)
        rows.append(row)
        by_building.setdefault(item["building_code"], []).append(row)

    db.flush()

    result = _list_payload(db, dataset_id, run_id)
    result["programme"] = _programme(db, rows, history_hours)
    result["savings_inventory"] = {
        "grouped_recoverable_kwh": round(sum(r.estimated_savings_kwh or 0.0 for r in rows), 3),
        "raw_excess_kwh": round(
            sum(float(sum(m.excess_kwh or 0.0 for m in members)) for members in groups.values()), 3
        ),
        "note": (
            "Savings are computed per (device, anomaly class) group and "
            "discounted by the class recovery fraction. The grouped figure "
            "is what the recommendations claim; the raw excess is what was "
            "detected."
        ),
        "groups": len(groups),
    }
    result["forecast_basis_available"] = bool(forecast)
    result["elapsed_ms"] = int((time.time() - started) * 1000)

    # The snapshot gets the *whole* payload, not a hand-picked subset. A
    # snapshot is the answer the report reads, and when the two were written
    # separately this page rendered a programme and a cost breakdown that the
    # report could not see — the report silently fell back to "no savings
    # could be estimated" while the recommendations page showed real figures.
    # Two views of one run must not disagree.
    for building_code, items in by_building.items():
        scoped = dict(result)
        scoped["building_code"] = building_code
        scoped["recommendations"] = [_payload(r) for r in items]
        scoped["total"] = len(items)
        scoped["scope"] = building_code
        snapshots.snapshot(
            db,
            dataset_id,
            "recommendation",
            scoped,
            scope=building_code,
            run_id=run_id,
            row_count=len(items),
        )
    snapshots.snapshot(db, dataset_id, "recommendation", result, run_id=run_id, row_count=len(rows))

    emit(
        params.get("run"),
        "recommendations_completed",
        processed=1,
        total=1,
        found=len(rows),
        elapsed_ms=result["elapsed_ms"],
    )
    from app.domain.dataset_service import audit

    audit(db, None, "execute", "recommendation", dataset_id,
          {"recommendations": len(rows), "total_savings_inr": result.get("total_savings_inr")})
    return json_safe(result)


def _class_label(anomaly_class: str) -> str:
    from app.domain.anomaly_service import ANOMALY_CLASSES

    return ANOMALY_CLASSES.get(anomaly_class, anomaly_class.replace("_", " ").capitalize())


def _payload(r: Recommendation) -> dict:
    """DB row -> the shape `frontend/src/lib/api/types.ts` declares."""
    kwh = float(r.estimated_savings_kwh or 0.0)
    return {
        "id": r.id,
        "dataset_id": r.dataset_id,
        "priority": r.priority,
        "category": r.category,
        "title": r.title,
        "reason": r.reason,
        "action": r.maintenance_action,
        "building_code": r.building_code or "ALL",
        "floor_no": r.floor_no,
        "room_code": r.room_code,
        "device_code": r.device_code,
        "device_label": device_label(r.device_category, r.device_code),
        "savings_kwh": round(kwh, 3),
        "savings_cost_inr": round(float(r.estimated_savings_rupees or 0.0), 2),
        "savings_co2_kg": co2_of(kwh),
        "payback_months": r.payback_months,
        "payback_verdict": _payback_verdict(r.payback_months),
        "anomaly_ids": list(r.anomaly_ids or []),
        "forecast_basis": r.forecast_basis or "",
        "estimated_cost_inr": r.estimated_cost_inr,
        "status": r.status,
        "confidence": r.confidence,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _list_payload(db: Session, dataset_id: str, run_id: str | None) -> dict:
    q = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id)
    if run_id:
        q = q.filter(Recommendation.run_id == run_id)
    rows = q.all()
    order = {"P1": 0, "P2": 1, "P3": 2}
    rows.sort(key=lambda r: (order.get(r.priority, 3), -float(r.estimated_savings_rupees or 0.0)))
    payloads = [_payload(r) for r in rows]
    by_priority = {p: sum(1 for r in rows if r.priority == p) for p in ("P1", "P2", "P3")}
    return {
        "run_id": run_id,
        "dataset_id": dataset_id,
        "recommendations": payloads,
        "total": len(payloads),
        "by_priority": by_priority,
        "total_savings_kwh": round(sum(p["savings_kwh"] for p in payloads), 3),
        "total_savings_inr": round(sum(p["savings_cost_inr"] for p in payloads), 2),
        "total_savings_co2_kg": round(sum(p["savings_co2_kg"] for p in payloads), 4),
        "co2_kg_per_kwh": CO2_KG_PER_KWH,
        "priority_basis": (
            "Ranked within this dataset: P1 is the top "
            f"{int(P1_RANK_FRACTION * 100)}% by recoverable monthly value (max "
            f"{P1_MAX_ROWS}), P2 the next {int(P2_RANK_FRACTION * 100)}%, P3 the "
            f"rest. Any group at or above Rs {P1_ABSOLUTE_MONTHLY_INR:,.0f}/month "
            "is P1 regardless of rank, and a critical-severity group is never "
            "below P2. Absolute cut-offs are not used alone because a 3-meter "
            "dataset and a 500-meter campus differ by two orders of magnitude in "
            "recoverable rupees."
        ),
        "payback_thresholds_months": {
            "viable": PAYBACK_VIABLE_MONTHS,
            "marginal": PAYBACK_MARGINAL_MONTHS,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def recommendations_state(db: Session, dataset_id: str) -> dict | None:
    """Last generated recommendations, from the snapshot."""
    return snapshots.latest_snapshot(db, "recommendation", dataset_id)


def page(
    db: Session,
    dataset_id: str,
    priority: str | None = None,
    building_code: str | None = None,
    limit: int = 100,
) -> dict | None:
    """Stored recommendations for the page, filtered in the database."""
    q = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id)
    if priority:
        q = q.filter(Recommendation.priority == priority)
    if building_code:
        q = q.filter(Recommendation.building_code == building_code)
    rows = q.limit(max(1, min(500, int(limit)))).all()
    return json_safe(
        {
            "dataset_id": dataset_id,
            "recommendations": [_payload(r) for r in rows],
            "total": len(rows),
        }
    )


def _programme(db: Session, rows: list[Recommendation], history_hours: int | None) -> dict:
    """Roll the per-meter recommendations up into a costed programme.

    The per-recommendation payback is almost always `not_viable`, and that is
    not a bug in the arithmetic — it is what the arithmetic says. A single meter
    recovering Rs 48 a month does not repay a Rs 4,500 intervention, and
    presenting thirty-three of those as thirty-three decisions to take is
    presenting the reader with a list where every line means "no".

    The savings do pay back once they are combined, and this is where that
    happens. The programme cost is one mobilisation per building, not the sum of
    every line item: a technician correcting a schedule does not make a separate
    visit to each of eleven meters on the floor, and pricing it as though they
    did would invent a cost that overstates the prize's cost by an order of
    magnitude — which is the one error that would make a good programme look
    bad. The estimate is the most expensive distinct action in the building,
    which is the conservative reading: it assumes the mobilisation buys the
    most expensive job once and treats the rest as marginal.
    """
    per_building: dict[str, dict] = {}
    for r in rows:
        scope = r.building_code or "ALL"
        entry = per_building.setdefault(
            scope,
            {
                "building_code": scope,
                "recommendations": 0,
                "devices": set(),
                "monthly_recoverable_inr": 0.0,
                "total_recoverable_kwh": 0.0,
                "action_costs": set(),
                "p1": 0,
            },
        )
        entry["recommendations"] += 1
        entry["devices"].add(r.device_code)
        entry["total_recoverable_kwh"] += float(r.estimated_savings_kwh or 0.0)
        monthly = _monthly_savings(float(r.estimated_savings_rupees or 0.0), history_hours)
        entry["monthly_recoverable_inr"] += monthly
        if r.priority == "P1":
            entry["p1"] += 1
        if r.estimated_cost_inr:
            entry["action_costs"].add(float(r.estimated_cost_inr))

    out: dict[str, dict] = {}
    estate_monthly = 0.0
    estate_kwh = 0.0
    for code, entry in sorted(per_building.items()):
        monthly = round(entry["monthly_recoverable_inr"], 2)
        cost = max(entry["action_costs"]) if entry["action_costs"] else None
        payback = round(cost / monthly, 1) if cost and monthly > 0 else None
        out[code] = {
            "building_code": code,
            "recommendations": entry["recommendations"],
            "devices_affected": len(entry["devices"]),
            "p1_actions": entry["p1"],
            "recoverable_kwh": round(entry["total_recoverable_kwh"], 3),
            "monthly_recoverable_inr": monthly,
            "annual_recoverable_inr": round(monthly * 12, 2),
            "programme_cost_inr": cost,
            "payback_months": payback,
            "payback_verdict": _payback_verdict(payback),
        }
        estate_monthly += monthly
        estate_kwh += entry["total_recoverable_kwh"]

    estate_cost = (
        sum(float(e["programme_cost_inr"]) for e in out.values() if e["programme_cost_inr"])
        if out
        else None
    )
    estate_monthly = round(estate_monthly, 2)
    estate_payback = (
        round(estate_cost / estate_monthly, 1) if estate_cost and estate_monthly > 0 else None
    )
    return {
        "method": (
            "Per-recommendation savings are recovered at the anomaly class "
            "recovery fraction and normalised to a month by the detected window. "
            "Programme cost is one mobilisation per building, priced at the most "
            "expensive distinct action in it."
        ),
        "buildings": out,
        "estate": {
            "recommendations": len(rows),
            "recoverable_kwh": round(estate_kwh, 3),
            "monthly_recoverable_inr": estate_monthly,
            "annual_recoverable_inr": round(estate_monthly * 12, 2),
            "annual_recoverable_co2_kg": co2_of(12 * estate_kwh),
            "programme_cost_inr": estate_cost,
            "payback_months": estate_payback,
            "payback_verdict": _payback_verdict(estate_payback),
        },
    }


@register_stage_runner("recommendation")
def recommend_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = recommend(db, dataset_id, {**params, "run_id": run.id, "run": run})

    top = result["recommendations"][0] if result["recommendations"] else None
    estate = (result.get("programme") or {}).get("estate") or {}
    if top:
        decision = (
            f"{result['total']} recommendations, {result['by_priority']['P1']} of them "
            f"P1. Largest single recovery is {top['savings_kwh']:,.0f} kWh / "
            f"Rs {top['savings_cost_inr']:,.0f} on {top['device_code']} "
            f"({top['priority']}). Taken as one programme the estate recovers "
            f"{estate.get('recoverable_kwh', 0):,.0f} kWh / "
            f"Rs {estate.get('monthly_recoverable_inr', 0):,.0f} a month against a "
            f"programme cost of Rs {estate.get('programme_cost_inr') or 0:,.0f} — "
            f"payback {estate.get('payback_months')} months "
            f"({estate.get('payback_verdict')}). "
            f"Individually, almost none of these pay back, and the programme is "
            f"the only reading in which the work is worth doing."
        )
    else:
        decision = (
            "No recommendations: the anomaly scan found nothing this "
            "platform has a defensible action for. An empty page here "
            "means a clean scan, not a missing stage."
        )
    return {
        "output": result,
        "confidence": 0.7 if result["total"] else 0.9,
        "decision": decision,
        "trace_extra": {
            "recommendation_count": result["total"],
            "by_priority": result["by_priority"],
            "forecast_basis_available": result.get("forecast_basis_available"),
        },
    }
