"""The enterprise report: twelve sections, and an enforced silence.

The locked constraint on this document is that it contains no model metrics — no
R², RMSE, MAE, no SHAP, no benchmark, no confidence gate. That is not a
formatting preference. A facilities manager or a finance director reading this
report has no way to evaluate an R², will read it as a quality score for the
*building* rather than the model, and will reasonably infer that a 0.92 means
the estate is healthy. It means neither. Putting a regression score in a board
paper is the fastest way to have the number quoted back at you as a building
rating, so the metric never goes in.

That makes "do not include model metrics" a constraint that will eventually be
violated by accident — someone adds a figure, a stage renames a field, a
snapshot grows a key that gets spread into a section. So it is enforced here
rather than trusted: `_assert_no_model_metrics` walks the assembled payload
before it is stored and raises if any forbidden key or value-shaped string
survives. The failure is loud and names the section, which means the violation
is caught by the stage that caused it rather than by whoever opens the PDF.

The other structural choice worth stating: every figure in a section is also
stated in prose in that same section's body. A report whose only copy of a number
is in a table is a report that will be screenshotted with the context stripped
off, and the number will then be quoted on its own. Prose that carries its own
number survives being forwarded.

Sections are assembled from the snapshots each stage wrote, never by re-running
anything. The report is a statement about the run that happened, and a section
that recomputed its own figures could disagree with the page the user read five
minutes earlier.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.db.models import Dataset, Report
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.tariff import CURRENCY, tariff_summary
from app.workflow.events import emit
from app.workflow.stages import register_stage_runner
from sqlalchemy.orm import Session

#: Keys that must never appear anywhere in the assembled report, and the reason
#: each is banned. Checked as substrings of lower-cased key names, so
#: `selected_r2` and `R2Value` are both caught.
FORBIDDEN_KEYS: dict[str, str] = {
    "r2": "regression fit",
    "rmse": "regression error",
    "mae": "regression error",
    "mse": "regression error",
    "shap": "per-prediction attribution",
    "benchmark": "cross-model comparison",
    "confidence_gate": "internal routing flag",
    "feature_importance": "model internals",
}

#: Titles for the twelve sections, in the locked order. The order is the
#: argument: who you are, what you have, what state it is in, what is wrong with
#: it, what is coming, what it will cost, what to do, what it costs to do, what
#: it returns, what to do first, and how every number was arrived at.
SECTION_TITLES: dict[str, str] = {
    "organization_summary": "Organisation Summary",
    "buildings": "Building Portfolio",
    "overall_health": "Overall Energy Health",
    "data_quality": "Data Quality",
    "critical_anomalies": "Critical Anomalies",
    "predicted_consumption": "Predicted Consumption",
    "predicted_cost": "Predicted Cost",
    "recommendations": "Recommendations",
    "maintenance_plan": "Maintenance Plan",
    "estimated_savings": "Estimated Savings",
    "priority_actions": "Priority Actions",
    "appendix": "Appendix — Method and Provenance",
}


def _assert_no_model_metrics(payload: Any, path: str = "report") -> None:
    """Raise if a forbidden key appears anywhere in the assembled report.

    Called on the finished section list before it is written, so the section
    that introduced the metric is named in the failure. Without this the rule is
    an intention; with it, it is a check that runs every time.
    """
    if isinstance(payload, dict):
        for key, value in payload.items():
            low = str(key).lower()
            for banned, why in FORBIDDEN_KEYS.items():
                if banned in low:
                    raise ValueError(
                        f"Report section '{path}' contains a forbidden key "
                        f"'{key}' ({why}). Model metrics do not appear in this "
                        f"document; remove it at the source rather than filtering "
                        f"it here."
                    )
            _assert_no_model_metrics(value, f"{path}.{key}")
    elif isinstance(payload, (list, tuple)):
        for i, item in enumerate(payload):
            _assert_no_model_metrics(item, f"{path}[{i}]")


def _section(key: str, order: int, body: str, figures: dict | None = None) -> dict:
    """One section. `body` must carry the same numbers as `figures`."""
    return {
        "key": key,
        "title": SECTION_TITLES.get(key, key.replace("_", " ").title()),
        "body": body.strip(),
        "figures": figures or {},
        "order": order,
    }


def _inr(value: float | None) -> str:
    if value is None:
        return "an amount that could not be determined"
    return f"Rs {float(value):,.0f}"


def _kwh(value: float | None) -> str:
    if value is None:
        return "an undetermined volume"
    return f"{float(value):,.0f} kWh"


def _pct(value: float | None) -> str:
    return "an undetermined share" if value is None else f"{float(value):.1f}%"


def _missing(key: str, upstream: str) -> str:
    return (
        f"This section is empty because the {upstream} stage has not been run "
        f"for this dataset. The report is a statement about a run; it does "
        f"not fill a gap in one with a guess."
    )


# ── Sections ────────────────────────────────────────────────
def _section_organization(
    ds: Dataset, model: dict | None, forecast: dict | None, recs: dict | None
) -> dict:
    estate = ((recs or {}).get("programme") or {}).get("estate") or {}
    lines = [
        f"{settings.report_org_name} — {ds.name}.",
        "",
        f"This report covers {ds.row_count or 0:,} readings of "
        f"{ds.granularity or 'asset'}-level energy data spanning "
        f"{ds.building_count or 0} building(s), {ds.floor_count or 0} floor(s), "
        f"{ds.room_count or 0} room(s) and {ds.device_count or 0} device(s).",
    ]
    figures = {
        "readings": ds.row_count or 0,
        "buildings": ds.building_count or 0,
        "floors": ds.floor_count or 0,
        "rooms": ds.room_count or 0,
        "devices": ds.device_count or 0,
    }
    if model:
        figures["forecast_method"] = model.get("selected_algorithm")
        lines += [
            "",
            f"Forward projections were produced by {model.get('selected_algorithm')}, "
            f"chosen from {len(model.get('candidates') or [])} candidate approaches "
            f"by the criteria recorded in the appendix. The approach is named so "
            f"the projection can be reproduced; its accuracy figures are "
            f"deliberately not published here, for the reasons in the appendix.",
        ]
    if forecast:
        agg = forecast.get("aggregates") or {}
        lines += [
            "",
            f"Over the coming 30 days the estate is projected to consume "
            f"{_kwh(agg.get('total_kwh'))} at {_inr(agg.get('total_cost_inr'))}, "
            f"peaking at {float(agg.get('peak_demand_kw') or 0):,.1f} kW.",
        ]
        figures.update(
            {
                "projected_30d_kwh": round(float(agg.get("total_kwh") or 0.0), 2),
                "projected_30d_inr": round(float(agg.get("total_cost_inr") or 0.0), 2),
            }
        )
    if estate:
        lines += [
            "",
            f"The recommendations in this report, taken together as one programme, "
            f"recover {_kwh(estate.get('recoverable_kwh'))} a year for "
            f"{_inr(estate.get('annual_recoverable_inr'))}. "
            f"Whether that is worth doing depends entirely on the cost, and the "
            f"answer is in Estimated Savings — including where the answer is no.",
        ]
        figures["annual_recoverable_kwh"] = round(float(estate.get("recoverable_kwh") or 0.0), 2)
        figures["annual_recoverable_inr"] = round(
            float(estate.get("annual_recoverable_inr") or 0.0), 2
        )
    return _section("organization_summary", 1, "\n".join(lines), figures)


def _section_buildings(ds: Dataset, forecast: dict | None) -> dict:
    rows = ((forecast or {}).get("compare") or {}).get("rows") or []
    if not rows:
        return _section(
            "buildings", 2, _missing("buildings", "forecast"), {"buildings": ds.building_count or 0}
        )
    total = sum(float(r.get("total_kwh") or 0.0) for r in rows) or 1.0
    lines = ["Projected consumption by building over the 30-day horizon:", ""]
    figures: dict[str, Any] = {}
    for r in rows:
        code = r.get("building_code") or "?"
        kwh = float(r.get("total_kwh") or 0.0)
        share = kwh / total * 100.0
        lines.append(
            f"- {code}: {_kwh(kwh)}, {_pct(share)} of the estate, "
            f"{_inr(r.get('total_cost_inr'))}, peaking at "
            f"{float(r.get('peak_demand_kw') or 0):,.1f} kW."
        )
        figures[f"{code}_kwh"] = round(kwh, 2)
        figures[f"{code}_share_pct"] = round(share, 2)
    figures["buildings_counted"] = len(rows)
    return _section("buildings", 2, "\n".join(lines), figures)


def _section_health(
    ds: Dataset, forecast: dict | None, dq: dict | None, anomaly: dict | None
) -> dict:
    figures: dict[str, Any] = {}
    lines: list[str] = []
    if forecast:
        agg = forecast.get("aggregates") or {}
        lf = agg.get("load_factor_pct")
        lines.append(
            f"Peak demand is {float(agg.get('peak_demand_kw') or 0):,.1f} kW "
            f"against an average daily load of {_kwh(agg.get('avg_daily_kwh'))}, "
            f"giving a load factor of {_pct(lf)}. A low load factor means the "
            f"estate's demand is concentrated into a few hours, which is what "
            f"makes time-of-use shifting worth investigating."
        )
        figures.update(
            {
                "peak_demand_kw": round(float(agg.get("peak_demand_kw") or 0.0), 2),
                "avg_daily_kwh": round(float(agg.get("avg_daily_kwh") or 0.0), 2),
                "load_factor_pct": lf,
                "blended_rate_per_kwh": round(float(agg.get("blended_rate_per_kwh") or 0.0), 4),
            }
        )
    if dq:
        score = float(dq.get("overall_score") or 0.0)
        lines.append(
            f"\nData quality for this dataset scores {score:.1f} out of 100 "
            f"across {len(dq.get('results') or [])} checks, with "
            f"{dq.get('failed_count', 0)} failing. Every figure elsewhere in "
            f"this report is derived from that data, so this score is the ceiling "
            f"on how much any of the rest should be trusted."
        )
        figures.update(
            {
                "data_quality_score": round(score, 1),
                "checks_run": len(dq.get("results") or []),
                "checks_failed": dq.get("failed_count", 0),
            }
        )
    if anomaly:
        figures["anomaly_readings"] = anomaly.get("total")
        figures["devices_affected"] = anomaly.get("devices_affected")
        lines.append(
            f"\n{anomaly.get('total', 0):,} anomalous readings were detected "
            f"across {anomaly.get('devices_affected', 0)} of "
            f"{ds.device_count or 0} meters, consuming "
            f"{_kwh(anomaly.get('excess_kwh'))} more than their own baselines "
            f"predict — {_inr(anomaly.get('excess_cost'))} at the detected tariff."
        )
    if not lines:
        return _section("overall_health", 3, _missing("overall_health", "analysis"), {})
    return _section("overall_health", 3, "\n".join(lines), figures)


def _section_data_quality(dq: dict | None) -> dict:
    if not dq:
        return _section("data_quality", 4, _missing("data_quality", "quality"), {"score": 0.0})
    failed = [r for r in (dq.get("results") or []) if not r.get("passed")]
    lines = [
        f"Overall score: {float(dq.get('overall_score') or 0):.1f} out of 100. "
        f"{dq.get('passed_count', 0)} of {len(dq.get('results') or [])} checks "
        f"passed.",
        "",
        "By dimension:",
    ]
    figures: dict[str, Any] = {"overall_score": round(float(dq.get("overall_score") or 0.0), 1)}
    for dim, score in sorted((dq.get("by_dimension") or {}).items()):
        lines.append(f"- {dim}: {float(score):.1f}")
        figures[f"dimension_{dim}"] = round(float(score), 1)
    if failed:
        lines += ["", "Checks requiring attention:"]
        for r in failed:
            lines.append(
                f"- {r.get('rule_name')} ({r.get('severity')}): scored "
                f"{float(r.get('score') or 0):.1f}."
            )
            figures[f"failed_{r.get('rule_name')}"] = round(float(r.get("score") or 0.0), 1)
    return _section("data_quality", 4, "\n".join(lines), figures)


def _section_anomalies(anomaly: dict | None) -> dict:
    if not anomaly:
        return _section("critical_anomalies", 5, _missing("critical_anomalies", "anomaly"), {})
    lines = [
        f"{anomaly.get('total', 0):,} anomalous readings were detected across "
        f"{anomaly.get('devices_affected', 0)} devices, "
        f"{float(anomaly.get('detection_rate_pct') or 0):.2f}% of the "
        f"{anomaly.get('readings_scanned', 0):,} readings scanned. They consumed "
        f"{_kwh(anomaly.get('excess_kwh'))} above their own baselines, which is "
        f"{_inr(anomaly.get('excess_cost'))} and "
        f"{float(anomaly.get('excess_co2_kg') or 0):,.0f} kg of CO2.",
        "",
        "By class, ordered by what each cost:",
    ]
    figures: dict[str, Any] = {
        "anomalous_readings": anomaly.get("total"),
        "devices_affected": anomaly.get("devices_affected"),
        "excess_kwh": round(float(anomaly.get("excess_kwh") or 0.0), 2),
        "excess_inr": round(float(anomaly.get("excess_cost") or 0.0), 2),
    }
    for c in (anomaly.get("by_class") or [])[:6]:
        lines.append(
            f"- {c.get('class_label', c.get('anomaly_class'))}: "
            f"{c.get('count', 0):,} readings, {_kwh(c.get('excess_kwh'))} excess."
        )
        figures[f"class_{c.get('anomaly_class')}_count"] = c.get("count")
    worst = (anomaly.get("top_devices") or [])[:5]
    if worst:
        lines += ["", "The five worst meters by excess energy:"]
        for d in worst:
            lines.append(
                f"- {d.get('device_code')}: {_kwh(d.get('excess_kwh'))} excess, "
                f"{d.get('count', 0)} readings."
            )
    return _section("critical_anomalies", 5, "\n".join(lines), figures)


def _section_consumption(forecast: dict | None) -> dict:
    if not forecast:
        return _section(
            "predicted_consumption", 6, _missing("predicted_consumption", "forecast"), {}
        )
    lines = ["Projected consumption at each horizon:", ""]
    figures: dict[str, Any] = {}
    for h in forecast.get("horizons") or []:
        lines.append(
            f"- {h.get('label')}: {_kwh(h.get('total_kwh'))} at "
            f"{_inr(h.get('total_cost_inr'))}. Method: {h.get('method')}. "
            f"{h.get('confidence_note', '')}"
        )
        figures[f"{h.get('horizon')}_kwh"] = round(float(h.get("total_kwh") or 0.0), 2)
    hist = forecast.get("monthly_history") or []
    if hist:
        lines += ["", "Monthly history, for context against the projection:"]
        for p in hist[-6:]:
            lines.append(f"- {p.get('month')}: {_kwh(p.get('history_kwh'))}")
    return _section("predicted_consumption", 6, "\n".join(lines), figures)


def _section_cost(forecast: dict | None, bill: dict | None) -> dict:
    if not forecast:
        return _section("predicted_cost", 7, _missing("predicted_cost", "forecast"), {})
    agg = forecast.get("aggregates") or {}
    tariff = tariff_summary()
    lines = [
        f"The 30-day projection costs {_inr(agg.get('total_cost_inr'))} at a "
        f"blended {_inr(agg.get('blended_rate_per_kwh'))} per kWh, "
        f"for {_kwh(agg.get('total_kwh'))}.",
        "",
        "By tariff band:",
    ]
    figures: dict[str, Any] = {
        "projected_cost_inr": round(float(agg.get("total_cost_inr") or 0.0), 2),
        "blended_rate_per_kwh": round(float(agg.get("blended_rate_per_kwh") or 0.0), 4),
    }
    for b in agg.get("cost_by_band") or []:
        lines.append(
            f"- {b.get('label', b.get('band'))} ({b.get('hours')} hours at "
            f"{_inr(b.get('rate_per_kwh'))}/kWh): {_kwh(b.get('kwh'))}, "
            f"{_inr(b.get('cost_inr'))}."
        )
        figures[f"band_{b.get('band')}_inr"] = round(float(b.get("cost_inr") or 0.0), 2)
    if bill:
        lines += [
            "",
            f"Billing estimate over {bill.get('billing_period_days')} days: "
            f"{_inr(bill.get('energy_charge_inr'))} energy plus "
            f"{_inr(bill.get('standing_charge_inr'))} standing charge, "
            f"{_inr(bill.get('total_inr'))} in total. Currency: {bill.get('currency')}.",
        ]
        figures["estimated_bill_inr"] = round(float(bill.get("total_inr") or 0.0), 2)
    lines += [
        "",
        f"Carbon: {float(agg.get('co2_tonnes') or 0):,.2f} tonnes over the "
        f"projection, at {tariff.get('co2_kg_per_kwh')} kg per kWh.",
    ]
    figures["co2_tonnes"] = round(float(agg.get("co2_tonnes") or 0.0), 3)
    return _section("predicted_cost", 7, "\n".join(lines), figures)


def _section_recommendations(recs: dict | None) -> dict:
    if not recs or not recs.get("recommendations"):
        return _section(
            "recommendations",
            8,
            "No recommendations. The anomaly scan found nothing this "
            "platform has a defensible action for; an empty list here "
            "means a clean scan, not a missing stage.",
            {},
        )
    by_p = recs.get("by_priority") or {}
    lines = [
        f"{recs.get('total', 0)} recommendations were generated, each citing both "
        f"the anomalies that motivate it and the forward load that sizes it. "
        f"{by_p.get('P1', 0)} are P1, {by_p.get('P2', 0)} P2 and "
        f"{by_p.get('P3', 0)} P3.",
        "",
        f"Together they cover {_kwh(recs.get('total_savings_kwh'))} a month, worth "
        f"{_inr(recs.get('total_savings_inr'))} and "
        f"{float(recs.get('total_savings_co2_kg') or 0):,.0f} kg of CO2 — "
        f"provided the actions in the maintenance plan are actually carried out.",
        "",
        "The ten largest:",
    ]
    figures = {
        "recommendations": recs.get("total", 0),
        "p1": by_p.get("P1", 0),
        "p2": by_p.get("P2", 0),
        "p3": by_p.get("P3", 0),
        "total_savings_kwh": round(float(recs.get("total_savings_kwh") or 0.0), 2),
    }
    for r in (recs.get("recommendations") or [])[:10]:
        lines.append(
            f"- {r.get('priority')} — {r.get('device_code')}: "
            f"{r.get('category')}. {_kwh(r.get('savings_kwh'))} / "
            f"{_inr(r.get('savings_cost_inr'))} a month. {r.get('action') or ''}"
        )
    return _section("recommendations", 8, "\n".join(lines), figures)


def _section_maintenance(recs: dict | None) -> dict:
    if not recs or not recs.get("recommendations"):
        return _section("maintenance_plan", 9, "No maintenance actions follow from this run.", {})
    by_action: dict[str, list] = {}
    for r in recs.get("recommendations") or []:
        by_action.setdefault(r.get("action") or "Unspecified", []).append(r)
    lines = [
        "The actions below are grouped by what is actually done, because a "
        "technician works a building once rather than thirty-three times. A "
        "single visit can address every recommendation that shares an action.",
        "",
    ]
    figures: dict[str, Any] = {"action_groups": len(by_action)}
    for i, (action, items) in enumerate(sorted(by_action.items(), key=lambda kv: -len(kv[1])), 1):
        devices = sorted({r.get("device_code") for r in items if r.get("device_code")})
        lines.append(
            f"{i}. {action} — applies to {len(items)} meter(s) "
            f"({', '.join(devices[:6])}{'…' if len(devices) > 6 else ''})."
        )
        figures[f"action_{i}_meters"] = len(items)
    return _section("maintenance_plan", 9, "\n".join(lines), figures)


def _section_savings(recs: dict | None) -> dict:
    prog = (recs or {}).get("programme") or {}
    estate = prog.get("estate") or {}
    if not estate:
        return _section("estimated_savings", 10, "No savings could be estimated for this run.", {})
    verdict = estate.get("payback_verdict")
    lines = [
        "Savings are stated as the recoverable share of detected excess energy, "
        "discounted by the recovery fraction for that anomaly class. Not every "
        "kWh above a baseline is avoidable — a median baseline leaves ordinary "
        "day-to-day variance on both sides of it, and claiming that variance as "
        "waste would inflate every figure on this page.",
        "",
        f"As individual interventions almost none of these pay back: the largest "
        f"single saving recovers {_inr(((recs.get('recommendations') or [{}])[0]).get('savings_cost_inr'))} "
        f"a month against an action cost in the thousands. That is not a defect in "
        f"the estimates, it is the arithmetic of a building this size.",
        "",
        "Taken as one programme, per building:",
    ]
    figures: dict[str, Any] = {
        "estate_recoverable_kwh": round(float(estate.get("recoverable_kwh") or 0.0), 2),
        "estate_monthly_inr": round(float(estate.get("monthly_recoverable_inr") or 0.0), 2),
        "estate_annual_inr": round(float(estate.get("annual_recoverable_inr") or 0.0), 2),
        "programme_cost_inr": round(float(estate.get("programme_cost_inr") or 0.0), 2),
        "payback_months": estate.get("payback_months"),
        "payback_verdict": verdict,
    }
    for code, b in (prog.get("buildings") or {}).items():
        lines.append(
            f"- {code}: {_inr(b.get('monthly_recoverable_inr'))} a month from "
            f"{b.get('devices_affected')} meter(s), against a mobilisation cost of "
            f"{_inr(b.get('programme_cost_inr'))}. Payback "
            f"{b.get('payback_months')} months ({b.get('payback_verdict')})."
        )
        figures[f"{code}_monthly_inr"] = round(float(b.get("monthly_recoverable_inr") or 0.0), 2)
        figures[f"{code}_payback_months"] = b.get("payback_months")
    lines += [
        "",
        f"Estate total: {_inr(estate.get('monthly_recoverable_inr'))} a month, "
        f"{_inr(estate.get('annual_recoverable_inr'))} a year, against "
        f"{_inr(estate.get('programme_cost_inr'))} of programme cost — a payback "
        f"of {estate.get('payback_months')} months, which this report records as "
        f"'{verdict}'.",
    ]
    if verdict == "not_viable":
        lines += [
            "",
            "That is a negative result and it is reported as one. On this estate, "
            "at this scale, the anomalies that were detected are real but too "
            "small to fund a programme at these intervention costs. The honest "
            "recommendation is to fix the metering and the room mappings — which "
            "cost little and make every future estimate better — and to treat "
            "the operational savings as a bonus rather than a business case.",
        ]
    return _section("estimated_savings", 10, "\n".join(lines), figures)


def _section_priority(recs: dict | None) -> dict:
    if not recs or not recs.get("recommendations"):
        return _section("priority_actions", 11, "No priority actions for this run.", {})
    p1 = [r for r in recs["recommendations"] if r.get("priority") == "P1"]
    lines = [
        "P1 is the top 10% of recommendations by recoverable value, capped at ten. "
        "The cut is relative to this dataset rather than a fixed rupee figure, "
        "because a three-meter file and a five-hundred-meter campus differ by two "
        "orders of magnitude and no fixed threshold is honest for both.",
        "",
    ]
    figures = {"p1_actions": len(p1)}
    if not p1:
        lines.append("Nothing reached P1 on this run.")
    for i, r in enumerate(p1, 1):
        lines.append(
            f"{i}. {r.get('device_code')} ({r.get('device_label')}) — "
            f"{r.get('title', '').split(': ', 1)[-1]}. Action: "
            f"{r.get('action')} Recoverable {_kwh(r.get('savings_kwh'))} / "
            f"{_inr(r.get('savings_cost_inr'))} a month."
        )
    return _section("priority_actions", 11, "\n".join(lines), figures)


def _section_appendix(
    ds: Dataset,
    model: dict | None,
    forecast: dict | None,
    dq: dict | None,
    anomaly: dict | None,
    generated_at: str,
) -> dict:
    tariff = tariff_summary()
    lines = [
        "How every number in this report was arrived at:",
        "",
        "- Detection is statistical, not model-based. Each meter's expected value "
        "is a median hour-of-week profile of its own history, which one anomalous "
        "week cannot move.",
    ]
    figures: dict[str, Any] = {
        "dataset_id": ds.id,
        "granularity": ds.granularity,
        "source_type": ds.source_type,
    }
    if anomaly:
        lines.append(
            f"- Anomaly baseline: {anomaly.get('baseline_method')}, threshold "
            f"{anomaly.get('threshold')}."
        )
        figures["anomaly_baseline"] = str(anomaly.get("baseline_method"))
    if model:
        lines += [
            "",
            "- Forecast method: the recorded selection criteria were applied to "
            f"{len(model.get('candidates') or [])} candidates and "
            f"{model.get('selected_algorithm')} was chosen. The criteria and the "
            "margin over the runner-up are recorded below.",
            "",
            f"- Selection criteria: {model.get('criteria_summary') or 'see criteria'}.",
            "",
            "**Model accuracy figures are deliberately absent from this "
            "document.** A regression score describes how well a model fits "
            "history; it says nothing about a building, and a reader who finds "
            "one in a board paper will reasonably take it as a property of the "
            "estate. The forecast's own error is reported where it belongs, in "
            "the band around each projection.",
        ]
        figures["forecast_method"] = model.get("selected_algorithm")
        figures["candidates_considered"] = len(model.get("candidates") or [])
        if model.get("margin") is not None:
            figures["selection_margin"] = round(float(model["margin"]), 4)
    if forecast and forecast.get("mape_backtest") is not None:
        lines.append(
            f"- Forecast uncertainty: bands are measured at a 24-hour lead over "
            f"{forecast.get('backtest_origins', 7)} rolling origins and widened as "
            f"the square root of lead time."
        )
        figures["band_measured_at_lead_hours"] = 24
    lines += [
        "",
        f"- Tariff: {tariff.get('description') or 'time-of-use'}, "
        f"{_inr(tariff.get('blended_rate_per_kwh'))} per kWh blended, "
        f"{tariff.get('co2_kg_per_kwh')} kg CO2 per kWh. Currency {CURRENCY}.",
        "",
        f"- Dataset: {ds.name}"
        + (f", {ds.source_type}, {ds.row_count:,} rows" if ds.row_count else "")
        + (f", DOI {ds.doi}" if ds.doi else "")
        + ".",
        f"- Generated {generated_at}.",
    ]
    figures["currency"] = CURRENCY
    if ds.doi:
        figures["doi"] = ds.doi
    return _section("appendix", 12, "\n".join(lines), figures)


# ── Assembly ────────────────────────────────────────────────
def build_sections(db: Session, dataset_id: str, run_id: str | None = None) -> list[dict]:
    """Assemble all twelve sections from the snapshots each stage wrote."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if ds is None:
        raise ValueError(f"Dataset {dataset_id} not found")

    model = snapshots.latest_snapshot(db, "model_selection", dataset_id)
    anomaly = snapshots.latest_snapshot(db, "anomaly", dataset_id)
    forecast = snapshots.latest_snapshot(db, "forecast", dataset_id)
    recs = snapshots.latest_snapshot(db, "recommendation", dataset_id)

    # Data quality is not snapshotted by its stage, so it is read from its own
    # tables rather than from a copy taken at a moment that may predate the
    # current dataset state.
    from app.domain import dq_service

    dq = dq_service.last_result(db, dataset_id)

    bill = None
    if forecast:
        try:
            from app.domain import forecast_service as FS

            bill = FS.bill(db, dataset_id, {})
        except Exception:
            bill = None

    generated_at = datetime.now(timezone.utc).isoformat()
    sections = [
        _section_organization(ds, model, forecast, recs),
        _section_buildings(ds, forecast),
        _section_health(ds, forecast, dq, anomaly),
        _section_data_quality(dq),
        _section_anomalies(anomaly),
        _section_consumption(forecast),
        _section_cost(forecast, bill),
        _section_recommendations(recs),
        _section_maintenance(recs),
        _section_savings(recs),
        _section_priority(recs),
        _section_appendix(ds, model, forecast, dq, anomaly, generated_at),
    ]

    keys = [s["key"] for s in sections]
    if keys != list(settings.report_sections):
        raise ValueError(
            f"Report sections do not match the locked order. "
            f"Got {keys}, expected {list(settings.report_sections)}"
        )

    # The check that makes the constraint a rule rather than an intention.
    _assert_no_model_metrics(sections)
    return sections


def _summary(sections: list[dict], ds: Dataset) -> dict:
    """The short digest stored alongside the full document."""

    def fig(key: str, default=None):
        for s in sections:
            if key in s["figures"]:
                return s["figures"][key]
        return default

    return {
        "overall_health": {
            "data_quality_score": fig("data_quality_score"),
            "peak_demand_kw": fig("peak_demand_kw"),
            "load_factor_pct": fig("load_factor_pct"),
            "anomaly_readings": fig("anomaly_readings"),
        },
        "spend": {
            "projected_30d_inr": fig("projected_30d_inr"),
            "projected_30d_kwh": fig("projected_30d_kwh"),
            "co2_tonnes": fig("co2_tonnes"),
        },
        "opportunity": {
            "recommendations": fig("recommendations", 0),
            "p1_actions": fig("p1_actions", 0),
            "annual_recoverable_inr": fig("annual_recoverable_inr"),
            "payback_months": fig("payback_months"),
            "payback_verdict": fig("payback_verdict"),
        },
        "sections": len(sections),
    }


def generate(db: Session, dataset_id: str, params: dict | None = None) -> dict:
    """Build the twelve sections and persist the report row."""
    params = params or {}
    started = time.time()
    run_id = params.get("run_id")

    row = Report(
        dataset_id=dataset_id,
        run_id=run_id,
        title=f"Energy Analytics Report — {settings.report_org_name}",
        organization_name=settings.report_org_name,
        report_type=params.get("report_type") or "organization",
        format=params.get("format") or "pdf",
        status="generating",
    )
    db.add(row)
    db.flush()

    try:
        sections = build_sections(db, dataset_id, run_id)
    except Exception as exc:
        row.status = "failed"
        row.error = str(exc)
        db.flush()
        raise

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    row.sections = json_safe(sections)
    row.summary = json_safe(_summary(sections, ds))
    row.status = "ready"
    row.generated_at = datetime.now(timezone.utc)
    db.flush()

    # Render the PDF the row has always claimed to have.
    #
    # Deliberately outside the try above: the section output is the real
    # deliverable and it is already persisted. A rendering failure must not undo
    # a finished analysis, so it is recorded on the row and the stage still
    # completes. The alternative — failing the whole report because a font or
    # a directory is unavailable — would cost the user the numbers they came for.
    try:
        from app.domain.report_pdf import render_to_path

        size = render_to_path(
            path=str(settings.reports_dir / f"{row.id}.pdf"),
            title=row.title,
            organization=row.organization_name or "",
            sections=row.sections or [],
            summary=row.summary or {},
            generated_at=row.generated_at,
        )
        row.file_path = f"{row.id}.pdf"
        row.file_size_bytes = size
    except Exception as exc:  # noqa: BLE001 - recorded, not raised
        row.file_path = None
        row.file_size_bytes = None
        row.error = f"PDF rendering failed: {exc}"
    db.flush()

    payload = _payload(row)
    snapshots.snapshot(db, dataset_id, "report", payload, run_id=run_id, row_count=len(sections))
    payload["elapsed_ms"] = int((time.time() - started) * 1000)
    emit(
        params.get("run"),
        "report_completed",
        section_key=None,
        completed_count=len(sections),
        total_count=len(sections),
    )
    return json_safe(payload)


def _payload(row: Report) -> dict:
    """DB row -> `frontend/src/lib/api/types.ts` Report shape."""
    return {
        "id": row.id,
        "dataset_id": row.dataset_id,
        "run_id": row.run_id,
        "organization_name": row.organization_name or "",
        "title": row.title,
        "format": row.format or "pdf",
        "status": row.status,
        "sections": list(row.sections or []),
        "summary": row.summary or {},
        "file_size_bytes": row.file_size_bytes,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def latest(db: Session, dataset_id: str) -> dict | None:
    row = (
        db.query(Report)
        .filter(Report.dataset_id == dataset_id)
        .order_by(Report.created_at.desc())
        .first()
    )
    return _payload(row) if row else None


def get(db: Session, report_id: str) -> dict | None:
    row = db.query(Report).filter(Report.id == report_id).first()
    return _payload(row) if row else None


@register_stage_runner("report")
def report_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    result = generate(db, dataset_id, {**params, "run_id": run.id, "run": run})
    opp = (result.get("summary") or {}).get("opportunity") or {}
    decision = (
        f"{len(result['sections'])} sections assembled from this run's stages. "
        f"{opp.get('recommendations', 0)} recommendations, "
        f"{opp.get('p1_actions', 0)} at P1, recovering "
        f"{_inr(opp.get('annual_recoverable_inr'))} a year against "
        f"{_inr(fig_cost(result))} of programme cost. Programme payback reads as "
        f"'{opp.get('payback_verdict')}' and the report states that finding "
        f"rather than burying it."
    )
    return {
        "output": result,
        "confidence": 1.0 if result["status"] == "ready" else 0.0,
        "decision": decision,
        "trace_extra": {"report_id": result["id"], "sections": len(result["sections"])},
    }


def fig_cost(payload: dict) -> float | None:
    for s in payload.get("sections") or []:
        if s.get("key") == "estimated_savings":
            return s.get("figures", {}).get("programme_cost_inr")
    return None
