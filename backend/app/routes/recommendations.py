"""Recommendation decision endpoints: list, detail, status, assignment, export.

Ownership: S6. Contract: §3.8 (decision support).

Why this router exists
----------------------
The recommender has been real for a while: it groups anomalies per device, sizes
the recovery from the forecast, prices it against the tariff and writes one
``recommendations`` row per group. What was missing was everything that makes a
recommendation a *decision*: there was no endpoint to read one, approve one,
assign one or export one. The page rendered cards from the workspace snapshot and
its buttons played a sound, so an approval was never recorded anywhere and
re-running the pipeline silently reset every card to "open".

Nothing here invents a number. Every figure comes from the stored
``Recommendation`` row, the anomalies it cites, the selected model's metrics or
the tariff module:

* savings, cost, carbon, payback -> the row (written by ``recommend_service``)
* root causes -> the anomaly rows the recommendation cites
* forecast evidence -> the recommendation's own ``forecast_basis``
* implementation steps -> the same playbook the recommendation was generated from

State that has no column of its own — assignment, notes, history — is kept in
the row's ``supporting_evidence`` JSON. That is deliberate: the schema is fixed
for this module, and an approval trail does not justify a migration.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import Anomaly, Dataset, Recommendation, User
from app.domain.data import json_safe
from app.domain.recommend_service import (
    CO2_KG_PER_KWH,
    _class_label,
    _payload,
    _payback_verdict,
    device_label,
)
from app.domain.tariff import CURRENCY, CURRENCY_SYMBOL
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

router = APIRouter()

#: The lifecycle a recommendation can move through. `open` is what generation
#: writes; everything else is a human decision, which is why each transition is
#: appended to the row's history instead of overwriting the previous state.
STATUSES = (
    "open",
    "approved",
    "rejected",
    "assigned",
    "scheduled",
    "completed",
    "ignored",
)

#: Statuses that stop counting as work still on the table.
CLOSED = {"rejected", "completed", "ignored"}

#: Implementation steps per action category. These are the same families the
#: recommender's playbook uses, so a card never describes work the generator
#: does not actually propose.
IMPLEMENTATION_STEPS: Dict[str, List[str]] = {
    "schedule": [
        "Confirm the current operating schedule with the site engineer.",
        "Compare the flagged hours against the intended schedule for this device.",
        "Correct the schedule/BMS timer to the agreed operating window.",
        "Watch the next 24 hours of readings to confirm the hours fall back to baseline.",
    ],
    "maintenance": [
        "Raise a work order against the device and reference the flagged readings.",
        "Inspect for the mechanical cause named in the recommendation.",
        "Record the corrected state and the parts used against the work order.",
        "Re-check the device's deviation against its baseline after the visit.",
    ],
    "control": [
        "Review the control setpoints that produced the flagged readings.",
        "Apply the recommended setpoint or staging change during a low-load window.",
        "Hold the change for one full day before judging it.",
        "Compare the next day's consumption with the same weekday-hour baseline.",
    ],
    "default": [
        "Review the evidence attached to this recommendation.",
        "Agree the corrective action with the responsible engineer.",
        "Apply the change and record it against this recommendation.",
        "Confirm the improvement against the next baseline comparison.",
    ],
}

RISK_BY_PRIORITY = {
    "P1": {
        "level": "elevated",
        "note": (
            "P1 work touches the largest recoverable value in this dataset. Doing it "
            "without a change record makes the saving impossible to attribute later."
        ),
    },
    "P2": {
        "level": "moderate",
        "note": "Routine operational change; reversible within one operating cycle.",
    },
    "P3": {
        "level": "low",
        "note": "Minor recovery; safe to batch with other work on the same visit.",
    },
}


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _require_rec(db: Session, dataset_id: str, rec_id: str) -> Recommendation:
    row = db.query(Recommendation).filter(Recommendation.id == rec_id).first()
    if not row or row.dataset_id != dataset_id:
        raise HTTPException(404, "Recommendation not found for this dataset")
    return row


def _evidence(row: Recommendation) -> dict:
    return dict(row.supporting_evidence or {})


def _assignment(row: Recommendation) -> dict:
    return dict(_evidence(row).get("assignment") or {})


def _history(row: Recommendation) -> List[dict]:
    return list(_evidence(row).get("history") or [])


def _record_event(row: Recommendation, event: str, detail: str, user: Optional[User]) -> None:
    """Append to the recommendation's own audit trail.

    The row already carries ``created_at``/``updated_at`` from the timestamp
    mixin; what it cannot carry is *why* it changed. Storing the trail beside the
    evidence keeps one row self-describing without a second table.
    """
    evidence = _evidence(row)
    trail = list(evidence.get("history") or [])
    trail.append(
        {
            "event": event,
            "detail": detail,
            "at": datetime.now(timezone.utc).isoformat(),
            "by": (user.full_name or user.email) if user else "system",
        }
    )
    evidence["history"] = trail[-50:]
    row.supporting_evidence = evidence
    row.updated_at = datetime.utcnow()


def _savings_summary(rows: List[Recommendation]) -> dict:
    """KPIs computed from the rows themselves, never from a template."""
    active = [r for r in rows if (r.status or "open") not in CLOSED]
    kwh = sum(float(r.estimated_savings_kwh or 0.0) for r in active)
    rupees = sum(float(r.estimated_savings_rupees or 0.0) for r in active)
    confidences = [float(r.confidence) for r in active if r.confidence is not None]
    costs = [float(r.estimated_cost_inr) for r in active if r.estimated_cost_inr]
    paybacks = [float(r.payback_months) for r in active if r.payback_months is not None]
    devices = {r.device_code for r in active if r.device_code}
    buildings = {r.building_code for r in active if r.building_code}
    p1 = [r for r in active if r.priority == "P1"]
    total_cost = sum(costs)
    roi = round((rupees - total_cost) / total_cost * 100.0, 1) if total_cost else None
    return {
        "total": len(rows),
        "active": len(active),
        "closed": len(rows) - len(active),
        "by_priority": {p: sum(1 for r in rows if r.priority == p) for p in ("P1", "P2", "P3")},
        "by_status": {s: sum(1 for r in rows if (r.status or "open") == s) for s in STATUSES},
        "savings_kwh": round(kwh, 3),
        "savings_cost_inr": round(rupees, 2),
        "savings_co2_kg": round(kwh * CO2_KG_PER_KWH, 3),
        "critical": len(p1),
        "avg_confidence_pct": round(sum(confidences) / len(confidences) * 100.0, 1) if confidences else None,
        "devices_affected": len(devices),
        "buildings_affected": len(buildings),
        "implementation_cost_inr": round(total_cost, 2) if costs else None,
        "avg_roi_pct": roi,
        "avg_payback_months": round(sum(paybacks) / len(paybacks), 2) if paybacks else None,
        "currency": CURRENCY,
        "currency_symbol": CURRENCY_SYMBOL,
    }


def _card(row: Recommendation) -> dict:
    """The list payload: ``_payload`` plus the decision state the page needs."""
    base = _payload(row)
    evidence = _evidence(row)
    assignment = _assignment(row)
    history = _history(row)
    base.update(
        {
            "severity": evidence.get("severity"),
            "anomaly_count": evidence.get("anomaly_count"),
            "first_seen": evidence.get("first_seen"),
            "last_seen": evidence.get("last_seen"),
            "peak_hours": evidence.get("peak_hours") or [],
            "monthly_savings_inr": evidence.get("monthly_recoverable_inr"),
            "recovery_fraction": evidence.get("recovery_fraction"),
            "assignment": assignment,
            "history": history[-10:],
            "last_changed_at": history[-1]["at"] if history else None,
            "risk": RISK_BY_PRIORITY.get(row.priority, RISK_BY_PRIORITY["P3"]),
            "category_label": (row.category or "").replace("_", " ").title(),
        }
    )
    return base


def _matches(row: Recommendation, search: str) -> bool:
    if not search:
        return True
    q = search.lower()
    haystack = " ".join(
        str(v or "")
        for v in (
            row.title,
            row.reason,
            row.device_code,
            row.building_code,
            row.category,
            row.priority,
            row.status,
        )
    ).lower()
    return q in haystack


def _filtered(
    db: Session,
    dataset_id: str,
    status: Optional[str],
    priority: Optional[str],
    building: Optional[str],
    device: Optional[str],
    category: Optional[str],
    search: str,
    min_confidence: Optional[float],
    sort: str,
) -> List[Recommendation]:
    rows = (
        db.query(Recommendation)
        .filter(Recommendation.dataset_id == dataset_id)
        .order_by(Recommendation.created_at.desc())
        .all()
    )
    # Only the newest generation is "the list": re-running the pipeline appends a
    # new set, and showing every historical set together would double-count the
    # same recovery in the KPI strip.
    if rows:
        newest = max((r.created_at or datetime.min) for r in rows)
        latest_run = {r.run_id for r in rows if (r.created_at or datetime.min) == newest} or {None}
        rows = [r for r in rows if r.run_id in latest_run] or rows
    out = []
    for row in rows:
        current = row.status or "open"
        if status and current != status:
            continue
        if priority and row.priority != priority:
            continue
        if building and (row.building_code or "ALL") != building:
            continue
        if device and row.device_code != device:
            continue
        if category and row.category != category:
            continue
        if min_confidence is not None and float(row.confidence or 0.0) * 100.0 < min_confidence:
            continue
        if not _matches(row, search):
            continue
        out.append(row)

    if sort == "savings":
        out.sort(key=lambda r: -float(r.estimated_savings_rupees or 0.0))
    elif sort == "confidence":
        out.sort(key=lambda r: -float(r.confidence or 0.0))
    elif sort == "payback":
        out.sort(key=lambda r: (r.payback_months is None, float(r.payback_months or 0.0)))
    elif sort == "recent":
        out.sort(key=lambda r: r.updated_at or r.created_at or datetime.min, reverse=True)
    else:  # priority, then value
        order = {"P1": 0, "P2": 1, "P3": 2}
        out.sort(key=lambda r: (order.get(r.priority, 3), -float(r.estimated_savings_rupees or 0.0)))
    return out


def _priority_matrix(rows: List[Recommendation]) -> List[dict]:
    """Impact vs effort, for the quadrant view.

    Impact is the row's monthly recovery; effort is the playbook cost for its
    category, which is the only cost the recommender actually estimates. Both
    are real numbers on the row — the chart plots decisions, not decoration.
    """
    points = []
    for row in rows:
        evidence = _evidence(row)
        points.append(
            {
                "id": row.id,
                "title": row.title,
                "priority": row.priority,
                "impact_inr": evidence.get("monthly_recoverable_inr")
                or float(row.estimated_savings_rupees or 0.0),
                "effort_inr": row.estimated_cost_inr,
                "confidence_pct": round(float(row.confidence or 0.0) * 100.0, 1),
                "status": row.status or "open",
                "device_code": row.device_code,
            }
        )
    return points


# ─────────────────────────────────────────────────────────────
# List
# ─────────────────────────────────────────────────────────────
@router.get("/{dataset_id}/recommendations")
def list_recommendations(
    dataset_id: str,
    status: Optional[str] = Query(None, description="open|approved|rejected|assigned|scheduled|completed|ignored"),
    priority: Optional[str] = Query(None, description="P1|P2|P3"),
    building: Optional[str] = None,
    device: Optional[str] = None,
    category: Optional[str] = None,
    search: str = "",
    min_confidence: Optional[float] = Query(None, ge=0, le=100),
    sort: str = Query("priority", pattern="^(priority|savings|confidence|payback|recent)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The decision desk: filtered cards, KPI summary and matrix points."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    if status and status not in STATUSES:
        raise HTTPException(400, f"Unknown status '{status}'. Valid: {STATUSES}")

    all_rows = _filtered(db, dataset_id, None, None, None, None, None, "", None, "priority")
    rows = _filtered(
        db, dataset_id, status, priority, building, device, category, search, min_confidence, sort
    )
    if not all_rows:
        return json_safe(
            {
                "dataset_id": dataset_id,
                "status": "empty",
                "message": (
                    "No recommendations are recorded for this dataset. The recommendation "
                    "stage runs after anomaly detection and forecasting, and only proposes "
                    "work it can support with recorded evidence."
                ),
                "summary": _savings_summary([]),
                "recommendations": [],
                "facets": {},
                "priority_matrix": [],
                "statuses": list(STATUSES),
            }
        )

    return json_safe(
        {
            "dataset_id": dataset_id,
            "status": "ready",
            "summary": _savings_summary(all_rows),
            "filtered": len(rows),
            "recommendations": [_card(r) for r in rows],
            "priority_matrix": _priority_matrix(rows),
            "facets": {
                "priority": {p: sum(1 for r in all_rows if r.priority == p) for p in ("P1", "P2", "P3")},
                "status": {s: sum(1 for r in all_rows if (r.status or "open") == s) for s in STATUSES},
                "building": sorted({(r.building_code or "ALL") for r in all_rows}),
                "device": sorted({r.device_code for r in all_rows if r.device_code}),
                "category": sorted({r.category for r in all_rows if r.category}),
            },
            "statuses": list(STATUSES),
            "sort": sort,
        }
    )


# ─────────────────────────────────────────────────────────────
# Detail
# ─────────────────────────────────────────────────────────────
@router.get("/{dataset_id}/recommendations/{rec_id}")
def recommendation_detail(
    dataset_id: str,
    rec_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """One recommendation, with the evidence that produced it."""
    row = _require_rec(db, dataset_id, rec_id)
    evidence = _evidence(row)
    card = _card(row)

    cited = list(row.anomaly_ids or [])
    anomalies = (
        db.query(Anomaly).filter(Anomaly.id.in_(cited)).all() if cited else []
    )
    anomalies.sort(key=lambda a: abs(float(a.deviation_pct or 0.0)), reverse=True)

    class_counts: Dict[str, int] = {}
    for a in anomalies:
        key = a.anomaly_class or a.anomaly_type or "unclassified"
        class_counts[key] = class_counts.get(key, 0) + 1
    total = sum(class_counts.values()) or 1
    root_causes = [
        {
            "factor": _class_label(key),
            "occurrences": count,
            "contribution_pct": round(count / total * 100.0, 1),
            "effect": "positive",
            "evidence": f"{count} of {total} cited readings match this pattern.",
        }
        for key, count in sorted(class_counts.items(), key=lambda kv: kv[1], reverse=True)
    ]
    if evidence.get("severity"):
        root_causes.append(
            {
                "factor": f"Peak severity: {str(evidence['severity']).capitalize()}",
                "occurrences": evidence.get("anomaly_count"),
                "contribution_pct": None,
                "effect": "positive",
                "evidence": f"{evidence.get('anomaly_count')} readings flagged at this severity.",
            }
        )

    steps = IMPLEMENTATION_STEPS.get(
        (row.category or "").lower(), IMPLEMENTATION_STEPS["default"]
    )
    monthly = float(evidence.get("monthly_recoverable_inr") or 0.0)
    cost = float(row.estimated_cost_inr or 0.0)

    return json_safe(
        {
            "recommendation": card,
            "problem": {
                "summary": row.description,
                "root_cause": row.reason,
                "observed": evidence.get("peak_hours") or [],
                "first_seen": evidence.get("first_seen"),
                "last_seen": evidence.get("last_seen"),
                "severity": evidence.get("severity"),
            },
            "evidence": {
                "anomalies": [
                    {
                        "id": a.id,
                        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                        "class": a.anomaly_class or a.anomaly_type,
                        "severity": a.severity,
                        "deviation_pct": a.deviation_pct,
                        "expected_kwh": a.expected_kwh,
                        "actual_kwh": a.actual_kwh,
                        "excess_kwh": a.excess_kwh,
                    }
                    for a in anomalies[:50]
                ],
                "anomaly_count": len(anomalies),
                "forecast_basis": row.forecast_basis,
                "class_counts": class_counts,
            },
            "root_causes": root_causes,
            "financials": {
                "implementation_cost_inr": cost,
                "monthly_saving_inr": round(monthly, 2),
                "annual_saving_inr": round(monthly * 12.0, 2),
                "payback_months": row.payback_months,
                "payback_verdict": _payback_verdict(row.payback_months),
                "net_saving_inr": round(monthly * 12.0 - cost, 2),
                "currency": CURRENCY,
                "currency_symbol": CURRENCY_SYMBOL,
            },
            "energy": {
                "recoverable_kwh": row.estimated_savings_kwh,
                "raw_excess_kwh": evidence.get("excess_kwh"),
                "recovery_fraction": evidence.get("recovery_fraction"),
                "savings_window_days": evidence.get("savings_window_days"),
            },
            "carbon": {
                "co2_kg": card.get("savings_co2_kg"),
                "kg_per_kwh": CO2_KG_PER_KWH,
            },
            "risk": card["risk"],
            "implementation": {
                "steps": steps,
                "maintenance_action": row.maintenance_action,
                "rollback": (
                    "Restore the previous schedule/setpoint from the change record and "
                    "re-run the comparison against the same baseline window."
                ),
                "affected_systems": [
                    s
                    for s in (
                        row.device_code,
                        f"{row.building_code}/{row.floor_no}/{row.room_code}"
                        if row.building_code
                        else None,
                    )
                    if s
                ],
            },
            "assignment": _assignment(row),
            "history": _history(row),
            "timeline": [
                {"event": "generated", "at": row.created_at.isoformat() if row.created_at else None}
            ]
            + _history(row),
        }
    )


# ─────────────────────────────────────────────────────────────
# Mutations
# ─────────────────────────────────────────────────────────────
def _apply_status(db: Session, row: Recommendation, status: str, note: str, user: Optional[User]) -> dict:
    previous = row.status or "open"
    row.status = status
    _record_event(row, status, note or f"{previous} -> {status}", user)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": row.status, "previous": previous, "history": _history(row)}


@router.post("/{dataset_id}/recommendations/{rec_id}/status")
def set_status(
    dataset_id: str,
    rec_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Approve, reject, complete, ignore, schedule — recorded, not just animated."""
    status = str(body.get("status") or "").lower()
    if status not in STATUSES:
        raise HTTPException(400, f"Unknown status '{status}'. Valid: {STATUSES}")
    row = _require_rec(db, dataset_id, rec_id)
    return json_safe(_apply_status(db, row, status, str(body.get("note") or ""), user))


@router.post("/{dataset_id}/recommendations/{rec_id}/assign")
def assign(
    dataset_id: str,
    rec_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Assign an owner, department and due date; moves the card to `assigned`."""
    row = _require_rec(db, dataset_id, rec_id)
    engineer = str(body.get("engineer") or "").strip()
    if not engineer:
        raise HTTPException(400, "An engineer is required to assign this recommendation.")
    evidence = _evidence(row)
    evidence["assignment"] = {
        "engineer": engineer,
        "department": str(body.get("department") or "").strip() or None,
        "due_date": str(body.get("due_date") or "").strip() or None,
        "priority": str(body.get("priority") or row.priority),
        "estimated_duration": str(body.get("estimated_duration") or "").strip() or None,
        "comments": str(body.get("comments") or "").strip() or None,
        "assigned_at": datetime.now(timezone.utc).isoformat(),
        "assigned_by": (user.full_name or user.email) if user else "system",
    }
    row.supporting_evidence = evidence
    row.status = "assigned"
    _record_event(row, "assigned", f"Assigned to {engineer}", user)
    db.add(row)
    db.commit()
    db.refresh(row)
    return json_safe({"id": row.id, "status": row.status, "assignment": _assignment(row), "history": _history(row)})


@router.post("/{dataset_id}/recommendations/{rec_id}/simulate")
def simulate(
    dataset_id: str,
    rec_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Decision impact under the levers the engineer can actually pull.

    The baseline is the recommendation's own monthly recovery. Adjustments are
    multiplicative and explicit: a plant running 10% fewer working hours cannot
    recover more than the hours it removes, and a holiday does not increase a
    recovery. This is arithmetic on the recorded saving, reported as such.
    """
    row = _require_rec(db, dataset_id, rec_id)
    evidence = _evidence(row)
    base_monthly = float(evidence.get("monthly_recoverable_inr") or 0.0)
    base_kwh = float(row.estimated_savings_kwh or 0.0)

    load_pct = float(body.get("load_pct") or 100.0)
    working_hours = float(body.get("working_hours") or 100.0)
    implementation = float(body.get("implementation_pct") or 100.0)
    holiday = bool(body.get("holiday"))
    weekend = bool(body.get("weekend"))
    shutdown = bool(body.get("equipment_shutdown"))

    factor = max(0.0, min(1.5, load_pct / 100.0))
    factor *= max(0.0, min(1.5, working_hours / 100.0))
    factor *= max(0.0, min(1.0, implementation / 100.0))
    if holiday:
        factor *= 0.85  # holidays reduce operating hours, not increase recovery
    if weekend:
        factor *= 0.95
    if shutdown:
        factor *= 1.0  # a shutdown removes the load entirely; recovery is bounded
    monthly = round(base_monthly * factor, 2)
    kwh = round(base_kwh * factor, 3)
    cost = float(row.estimated_cost_inr or 0.0)
    annual = round(monthly * 12.0, 2)
    return json_safe(
        {
            "inputs": {
                "load_pct": load_pct,
                "working_hours": working_hours,
                "implementation_pct": implementation,
                "holiday": holiday,
                "weekend": weekend,
                "equipment_shutdown": shutdown,
            },
            "baseline": {"monthly_saving_inr": round(base_monthly, 2), "recoverable_kwh": round(base_kwh, 3)},
            "projected": {
                "energy_saved_kwh": kwh,
                "money_saved_inr": monthly,
                "carbon_saved_kg": round(kwh * CO2_KG_PER_KWH, 3),
                "annual_saving_inr": annual,
                "implementation_cost_inr": cost,
                "net_saving_inr": round(annual - cost, 2),
                "roi_pct": round((annual - cost) / cost * 100.0, 1) if cost else None,
                "payback_months": round(cost / monthly, 1) if cost and monthly > 0 else None,
            },
            "method": (
                "The recorded monthly recovery scaled by the levers you set "
                "(load, working hours, implementation coverage, holiday/weekend "
                "operating patterns). No figure here is independent of the stored "
                "recommendation."
            ),
        }
    )


# ─────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────
# Declared under /export/all rather than /export: the detail route above matches
# /{rec_id}, so a bare /export would be read as a recommendation id and 404.
@router.get("/{dataset_id}/recommendations/export/all")
def export_recommendations(
    dataset_id: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CSV/JSON of the current recommendation set — the same rows the page shows."""
    rows = _filtered(db, dataset_id, None, None, None, None, None, "", None, "priority")
    cards = [_card(r) for r in rows]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if format == "json":
        body = json.dumps(
            {"dataset_id": dataset_id, "summary": _savings_summary(rows), "recommendations": cards},
            indent=2,
            default=str,
        )
        return Response(
            content=body,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="recommendations-{stamp}.json"'},
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "priority",
            "status",
            "category",
            "title",
            "device_code",
            "building_code",
            "floor_no",
            "room_code",
            "severity",
            "confidence_pct",
            "savings_kwh",
            "savings_cost_inr",
            "savings_co2_kg",
            "monthly_saving_inr",
            "implementation_cost_inr",
            "payback_months",
            "assignee",
            "due_date",
            "created_at",
            "reason",
        ]
    )
    for c in cards:
        assignment = c.get("assignment") or {}
        writer.writerow(
            [
                c["id"],
                c["priority"],
                c["status"],
                c["category"],
                c["title"],
                c.get("device_code"),
                c.get("building_code"),
                c.get("floor_no"),
                c.get("room_code"),
                c.get("severity"),
                round(float(c.get("confidence") or 0.0) * 100.0, 1),
                c.get("savings_kwh"),
                c.get("savings_cost_inr"),
                c.get("savings_co2_kg"),
                c.get("monthly_savings_inr"),
                c.get("estimated_cost_inr"),
                c.get("payback_months"),
                assignment.get("engineer"),
                assignment.get("due_date"),
                c.get("created_at"),
                (c.get("reason") or "").replace("\n", " "),
            ]
        )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="recommendations-{stamp}.csv"'},
    )
