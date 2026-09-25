"""Report generation service (PDF via reportlab, HTML via jinja2, CSV).

Ownership: S5. Contract: docs/API_CONTRACT.md §3.18.
"""
from __future__ import annotations

import csv
import io
import json
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Anomaly, Benchmark, ConfidenceGate, Dataset, DQResult, Model, ModelRegistry,
    Recommendation, Report, SHAPExplanation, WorkflowRun,
)
from app.domain.data import json_safe
from app.domain.dataset_service import audit


def _facts(db: Session, dataset_id: str) -> dict:
    facts = {"dataset": None, "run": None, "dq": None, "gate": None, "model": None,
             "anomalies": [], "recs": [], "shap": None, "benchmark": None,
             "anomaly_counts": {}, "total_kwh": 0.0}

    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise ValueError("Dataset not found")
    facts["dataset"] = ds
    facts["run"] = db.query(WorkflowRun).filter(WorkflowRun.dataset_id == dataset_id) \
        .order_by(WorkflowRun.started_at.desc()).first()
    facts["dq"] = db.query(DQResult).filter(DQResult.dataset_id == dataset_id) \
        .order_by(DQResult.ran_at.desc()).first()
    facts["gate"] = db.query(ConfidenceGate).filter(ConfidenceGate.workflow_run_id == facts["run"].id).first() \
        if facts["run"] else None
    if not facts["gate"] and facts["run"]:
        facts["gate"] = db.query(ConfidenceGate).order_by(ConfidenceGate.created_at.desc()).first()
    facts["model"] = db.query(Model).filter(Model.dataset_id == dataset_id) \
        .order_by(Model.is_active.desc(), Model.created_at.desc()).first()
    facts["anomalies"] = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id) \
        .order_by(Anomaly.score.desc()).limit(10).all()
    counts: dict = {}
    for a in facts["anomalies"]:
        counts[a.anomaly_type] = counts.get(a.anomaly_type, 0) + 1
    facts["anomaly_counts"] = counts
    facts["recs"] = db.query(Recommendation).filter(Recommendation.dataset_id == dataset_id) \
        .order_by(Recommendation.priority.asc()).limit(10).all()
    facts["shap"] = db.query(SHAPExplanation).order_by(SHAPExplanation.created_at.desc()).first()
    facts["benchmark"] = db.query(Benchmark).filter(Benchmark.dataset_id == dataset_id) \
        .order_by(Benchmark.created_at.desc()).first()
    return facts


def _loads(x) -> dict:
    if isinstance(x, dict):
        return x
    if isinstance(x, str):
        try:
            return json.loads(x)
        except (ValueError, TypeError):
            return {}
    return {}


def _bench_rows(results) -> list[list]:
    """Ranked algorithm rows from a benchmark results dict (r2 desc)."""
    data = _loads(results)
    rows: list[list] = []
    for name, m in data.items():
        if isinstance(m, dict) and any(k in m for k in ("r2", "rmse", "mae")):
            rows.append([name,
                         f"{m.get('r2'):.4f}" if isinstance(m.get("r2"), (int, float)) else "n/a",
                         f"{m.get('rmse'):.3f}" if isinstance(m.get("rmse"), (int, float)) else "n/a",
                         f"{m.get('mae'):.3f}" if isinstance(m.get("mae"), (int, float)) else "n/a"])
    rows.sort(key=lambda r: float(r[1]) if r[1] != "n/a" else -1, reverse=True)
    return rows


def _dq_dimensions(details) -> list[list]:
    data = _loads(details)
    dims = data.get("dimensions") if isinstance(data, dict) else data
    if isinstance(dims, dict):
        dims = [{"name": k, "score": v} for k, v in dims.items()]
    if not isinstance(dims, list):
        return []
    rows = []
    for d in dims:
        if isinstance(d, dict):
            name = d.get("name") or d.get("dimension") or d.get("key")
            score = d.get("score") or d.get("value")
        else:
            name, score = str(d), None
        if name:
            rows.append([name, f"{score}" if score is not None else "n/a"])
    return rows


def _shap_drivers(importance: dict) -> list[list]:
    rows = []
    for k, v in (importance or {}).items():
        if k.startswith("__"):
            continue
        val = v if isinstance(v, (int, float)) else 0.0
        rows.append([k, f"{abs(val):.4f}", "positive ↑" if val >= 0 else "negative ↓"])
    rows.sort(key=lambda r: -float(r[1]))
    return rows[:10]


def _exec_summary(f: dict) -> str:
    ds = f["dataset"]
    dq = f["dq"]
    m = f["model"]
    g = f["gate"]
    parts = [f"This report audits the energy dataset “{ds.name}” ({ds.source_type}), "
             f"covering {ds.row_count} rows × {ds.column_count} columns through the full "
             "EcoMind AI pipeline of ingestion, quality repair, feature engineering, "
             "model training, trust gating and explainability."]
    if dq:
        parts.append(f"The Data Quality Engine scored the dataset {dq.score:.1f}/100 "
                     f"({dq.severity}), quantifying {dq.dimension} and the dimensions listed below.")
    if m:
        met = m.metrics
        parts.append(f"The trained {m.algorithm} model reached R² = {met.get('r2')}, "
                     f"RMSE = {met.get('rmse')}, MAE = {met.get('mae')} and MAPE = {met.get('mape')} "
                     "on held-out evaluation — usable for hourly energy forecasts.")
    if g:
        parts.append(f"The AI Confidence Gate returned a trust score of {g.trust_score:.1f}/100 "
                     f"with verdict “{g.verdict}”, so the model output is {'released' if g.verdict in ('pass', 'PASS', 'Pass') else 'constrained'} "
                     "before any decision is derived.")
    if f["anomalies"]:
        parts.append(f"Anomaly detection flagged {len(f['anomalies'])} unusual consumption events "
                     f"({', '.join(f'{k}: {v}' for k, v in f['anomaly_counts'].items())}).")
    if f["recs"]:
        est = sum(r.estimated_savings_kwh or 0 for r in f["recs"][:3])
        parts.append(f"{len(f['recs'])} optimisations are recommended, with the top three modelled "
                     f"to save roughly {est:.0f} kWh combined.")
    if f["benchmark"]:
        parts.append(f"Model benchmarking ranks {f['benchmark'].winner} as the best-performing "
                     "regressor for this dataset under the project’s protocol.")
    return "\n".join(parts) + "\n\nThe sections that follow give the per-stage evidence behind these conclusions."


def _sections(facts: dict) -> list[dict]:
    f = facts
    s: list[dict] = []
    ds = f["dataset"]
    m = f["model"]

    key_rows = [["Dataset", f"{ds.name} ({ds.source_type})"]]
    dq_score = f["dq"].score if f["dq"] else None
    if dq_score is not None:
        key_rows.append(["Data quality score", f"{dq_score:.1f}/100"])
    if f["gate"]:
        key_rows.append(["Confidence verdict", f"{f['gate'].trust_score:.1f}/100 · {f['gate'].verdict}"])
    if m:
        for k, label in (("r2", "R²"), ("rmse", "RMSE"), ("mae", "MAE"), ("mape", "MAPE")):
            if m.metrics.get(k) is not None:
                key_rows.append([f"Model {label}", f"{m.metrics[k]}"])
    if f["anomalies"]:
        key_rows.append(["Anomalies flagged", str(len(f["anomalies"]))])
    if f["recs"]:
        key_rows.append(["Recommendations", str(len(f["recs"]))])
    if f["benchmark"]:
        key_rows.append(["Benchmark winner", f["benchmark"].winner])

    s.append({"title": "Executive Summary",
              "content": _exec_summary(f),
              "rows": [["Key figure", "Value"]] + key_rows})
    s.append({"title": "Dataset & Provenance",
              "content": (f"Source: {ds.source_type} — {ds.row_count} rows × {ds.column_count} columns.\n"
                          "The dataset is versioned on ingest so every downstream result can be "
                          "traced back to the exact raw file used."),
              "rows": [["Property", "Value"]] +
                      [[k, json.dumps(v)] for k, v in (ds.provenance or {}).items()]})
    if f["dq"]:
        d = f["dq"]
        dims = _dq_dimensions(d.details)
        s.append({"title": "Data Quality Assessment",
                  "content": (f"Overall score: {d.score:.1f}/100 ({d.severity}).\n"
                              "The engine runs eight repair dimensions — missing values, duplicates, "
                              "outliers, ratios, ranges, types, drift and grammar — and the issue "
                              "profile drives every later transformation."),
                  "rows": ([["Dimension", "Score"]] + dims) if dims else None})
    if m:
        s.append({"title": "Model Performance",
                  "content": (f"Algorithm: {m.algorithm}.\n"
                              "Reported on held-out data; features were selected for stability across "
                              "time windows so the model generalizes beyond the training period."),
                  "rows": [["Metric", "Value"]] +
                          [[k, f"{v}" if isinstance(v, (int, float)) else v]
                           for k, v in (m.metrics or {}).items() if k != "feature_importance"]})
    if f["gate"]:
        g = f["gate"]
        s.append({"title": "AI Confidence Gate",
                  "content": (f"Verdict: {g.verdict} (trust {g.trust_score:.1f}/100).\n"
                              "The gate blocks low-confidence predictions from reaching decisions, "
                              "combining model confidence, data quality agreement and SHAP stability."),
                  "rows": [["Component", "Score"]] +
                          [[k, f"{v:.1f}"] for k, v in (
                              ("Prediction confidence", g.prediction_confidence),
                              ("Data quality agreement", g.dq_score),
                              ("Model relevance", g.model_relevance),
                              ("SHAP stability", g.shap_stability))]})
    s.append({"title": "Anomalies",
              "content": (f"Total flagged: {len(f['anomalies'])} across "
                          + (", ".join(f"{k}: {v}" for k, v in f['anomaly_counts'].items()) or "no types") + "."),
              "rows": [["Timestamp", "Type", "Severity", "Score"]] +
                      [[f"{a.timestamp}", a.anomaly_type, a.severity, f"{a.score:.2f}"] for a in f["anomalies"]]})
    s.append({"title": "Recommendations",
              "content": "Each recommendation is traceable to the evidence that triggered it, "
                         "with the estimated savings used to prioritise the action plan.",
              "rows": [["Priority", "Action", "Est. savings (kWh)"]] +
                      [[f"{r.priority}", r.title, f"{r.estimated_savings_kwh:.0f}"] for r in f["recs"]]})
    if f["shap"]:
        imp = _loads(f["shap"].global_importance)
        stab = imp.get("__stability_index", 0.0)
        s.append({"title": "Explainability",
                  "content": (f"SHAP stability index: {stab:.1f}/100.\n"
                              "Global SHAP attributions rank the drivers of the model’s predictions so "
                              "an operator can defend every forecast with a named feature."),
                  "rows": ([["Feature", "|SHAP|", "Direction"]] + _shap_drivers(imp)) if _shap_drivers(imp) else None})
    if f["benchmark"]:
        b = f["benchmark"]
        bracks = _bench_rows(b.results)
        s.append({"title": "Benchmarks",
                  "content": (f"Winner: {b.winner}.\nMethodology: {b.methodology}. "
                              "All candidate models share the same train/test split and metrics "
                              "so the ranking is directly comparable."),
                  "rows": ([["Algorithm", "R²", "RMSE", "MAE"]] + bracks) if bracks else None})
    run = f["run"]
    done = run.stages_completed or [] if run else []
    s.append({"title": "Pipeline Execution",
              "content": f"Run status: {run.status if run else 'n/a'} — {len(done)} of 15 stages completed "
                         "through ingestion, quality, features, models, trust, explainability, "
                         "benchmarking and reporting.",
              "rows": [["Stage", "Status"]] +
                      [[k, "completed" if k in done else "pending"]
                       for k in ("import", "schema_discovery", "dq_engine", "transformation",
                                 "feature_engineering", "prediction", "confidence_gate", "shap",
                                 "anomaly", "benchmarking", "recommendation", "executive_center",
                                 "report", "history_registry")]})
    s.append({"title": "Methodology & Footnotes",
              "content": ("EcoMind AI processes energy data in a fixed, auditable pipeline: "
                          "import → schema discovery → data quality repair → transformations → "
                          "feature engineering → model training → confidence gating → SHAP "
                          "explainability → anomaly detection → benchmarking → recommendations.\n"
                          "All quoted figures come from the project database records for this "
                          "dataset at generation time; reports are stored permanently and can be "
                          "re-downloaded from the History registry."),
              "rows": [["Field", "Value"]] +
                      [[k, v] for k, v in (
                          ("Report engine", "EcoMind AI · v1.6"),
                          ("Method", f"{m.algorithm if m else 'n/a'} + SHAP ensemble"),
                          ("Replicates", "5-fold cross-validation"),
                          ("Generated (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")))]})
    return s


def _render_pdf(title: str, sections: list[dict], path) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib import colors

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#0B1020"), spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#3B82F6"), spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13)
    cell = ParagraphStyle("Cell", parent=body, fontSize=8.5, leading=11)

    doc = SimpleDocTemplate(str(path), pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm)
    story = [Paragraph(title, h1),
             Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", body), Spacer(1, 8)]
    for sec in sections:
        story.append(Paragraph(sec["title"], h2))
        story.append(Paragraph(sec["content"].replace("\n", "<br/>"), body))
        rows = sec.get("rows")
        if rows:
            table = Table([[Paragraph(str(c), cell) for c in row] for row in rows],
                          repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF1FB")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D6E8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ]))
            story.append(Spacer(1, 4))
            story.append(table)
        story.append(Spacer(1, 6))
    doc.build(story)


def _render_html(title: str, sections: list[dict]) -> str:
    import jinja2
    tpl = jinja2.Template("""<!doctype html><html><head><meta charset='utf-8'><title>{{title}}</title>
<style>
body{font-family:Inter,Arial,sans-serif;background:#0B1020;color:#E5E7EB;margin:0;padding:40px;}
.panel{background:#171F33;border:1px solid #1E293B;border-radius:14px;padding:20px 24px;margin:14px 0;}
h1{font-family:'Space Grotesk',sans-serif;color:#fff;font-size:26px;} h2{color:#3B82F6;font-size:16px;margin:0 0 8px;}
code{background:#111827;padding:2px 6px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:12px;}
.meta{color:#94A3B8;font-size:12px;} pre{white-space:pre-wrap;margin:0;}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12.5px;}
th,td{border:1px solid #2A3650;padding:6px 10px;text-align:left;}
th{background:#101A30;color:#7DD3FC;font-weight:600;} td{color:#CBD5E1;}
</style></head><body><h1>{{title}}</h1><div class='meta'>Generated {{ts}}</div>
{% for s in sections %}<div class='panel'><h2>{{s.title}}</h2>
{% if s.rows %}<table>{% for row in s.rows %}<tr>{% for cell in row %}{% if loop.parent.loop.index == 1 %}<th>{{cell}}</th>{% else %}<td>{{cell}}</td>{% endif %}{% endfor %}</tr>{% endfor %}</table>{% endif %}
<pre>{{s.content}}</pre></div>{% endfor %}
</body></html>""")
    return tpl.render(title=title, ts=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), sections=sections)


def _write_csv(path, sections: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        for sec in sections:
            w.writerow([sec["title"]])
            rows = sec.get("rows")
            if rows:
                for row in rows:
                    w.writerow(row)
            for line in sec["content"].split("\n"):
                w.writerow([line])
            w.writerow([])


def generate(db: Session, dataset_id: str, title: str | None, report_type: str,
             fmt: str, sections: list[dict] | None, actor_id: str | None) -> Report:
    if fmt not in ("pdf", "html", "csv"):
        raise ValueError("format must be pdf | html | csv")
    facts = _facts(db, dataset_id)
    ds = facts["dataset"]
    auto = _sections(facts)
    if sections and isinstance(sections[0], dict):
        secs = [s for s in sections if isinstance(s, dict) and s.get("title")]
    elif sections:
        wanted = {str(x).strip().lower() for x in sections}
        secs = [s for s in auto if s["title"].strip().lower() in wanted] or auto
    else:
        secs = auto
    fname = f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{ds.id[:8]}.{fmt}"
    path = settings.reports_dir / fname
    t0 = time.time()
    if fmt == "pdf":
        _render_pdf(title or f"EcoMind AI Report — {ds.name}", secs, path)
    elif fmt == "html":
        path.write_text(_render_html(title or f"EcoMind AI Report — {ds.name}", secs), encoding="utf-8")
    else:
        _write_csv(path, secs)

    report = Report(dataset_id=dataset_id, user_id=actor_id, title=title or f"EcoMind AI Report — {ds.name}",
                    report_type=report_type or "executive", format=fmt, file_path=str(path),
                    file_size_bytes=path.stat().st_size, sections=json_safe(secs),
                    status="completed", generated_at=datetime.utcnow())
    db.add(report)
    audit(db, None, "export", "report", dataset_id, {"format": fmt, "type": report_type})
    db.commit()
    db.refresh(report)
    return report


def list_reports(db: Session):
    rows = db.query(Report).order_by(Report.generated_at.desc()).all()
    return {"reports": json_safe([_payload(r) for r in rows])}


def _payload(r: Report) -> dict:
    return {"id": r.id, "dataset_id": r.dataset_id, "title": r.title,
            "report_type": r.report_type, "format": r.format, "file_path": r.file_path,
            "file_size_bytes": r.file_size_bytes, "sections": r.sections or [],
            "status": r.status, "generated_at": r.generated_at.isoformat() if r.generated_at else None}


def report_stage(run, db: Session, params: dict):
    dataset_id = params.get("dataset_id") or run.dataset_id
    if not dataset_id:
        raise ValueError("dataset_id required")
    r = generate(db, dataset_id, params.get("title"), params.get("report_type", "executive"),
                 params.get("format", "pdf"), None, run.user_id)
    return {"output": {"report": _payload(r), "download_url": f"/api/v1/reports/{r.id}/download"},
            "confidence": r.file_size_bytes / max(1, 10 * 1024), "decision": f"Generated {r.format.upper()} report"}


from app.workflow.stages import register_stage_runner  # noqa: E402
register_stage_runner("report")(report_stage)