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


def _sections(facts: dict) -> list[dict]:
    f = facts
    s: list[dict] = []
    ds = f["dataset"]
    s.append({"title": "Dataset & Provenance",
              "content": (f"Name: {ds.name} ({ds.source_type})\n"
                          f"Rows: {ds.row_count}, Columns: {ds.column_count}\n"
                          f"Provenance: {json.dumps(ds.provenance or {}, indent=1)}")})
    if f["dq"]:
        d = f["dq"]
        s.append({"title": "Data Quality Assessment",
                  "content": (f"Overall score: {d.score:.1f}/100 ({d.severity})\n"
                              f"Dimension: {d.dimension} | {d.details}" if d.details else f"Overall score: {d.score:.1f}/100")})
    if f["model"]:
        m = f["model"]
        s.append({"title": "Model Performance",
                  "content": (f"Algorithm: {m.algorithm}\n"
                              f"R2: {m.metrics.get('r2')}, RMSE: {m.metrics.get('rmse')}, MAE: {m.metrics.get('mae')}, MAPE: {m.metrics.get('mape')}")})
    if f["gate"]:
        g = f["gate"]
        s.append({"title": "AI Confidence Gate",
                  "content": (f"Trust score: {g.trust_score:.1f}/100 | Verdict: {g.verdict}\n"
                              f"Prediction conf {g.prediction_confidence:.1f}, DQ {g.dq_score:.1f}, "
                              f"Model relevance {g.model_relevance:.1f}, SHAP stability {g.shap_stability:.1f}")})
    s.append({"title": "Anomalies",
              "content": (f"Total flagged: {len(f['anomalies'])} | By type: {json.dumps(f['anomaly_counts'])}\n" +
                          "\n".join(f"- {a.timestamp} [{a.severity}] {a.anomaly_type} score={a.score:.2f}" for a in f["anomalies"]))})
    s.append({"title": "Recommendations",
              "content": "\n".join(f"- [{r.priority}] {r.title} (save ~{r.estimated_savings_kwh:.0f} kWh)" for r in f["recs"]) or "None generated"})
    if f["shap"]:
        s.append({"title": "Explainability",
                  "content": f"SHAP stability: {f['shap'].global_importance.get('__stability_index', 0.0):.1f} | Top drivers: "
                             + ", ".join(list(f["shap"].global_importance)[:5])})
    if f["benchmark"]:
        s.append({"title": "Benchmarks",
                  "content": f"Winner: {f['benchmark'].winner} | Methodology: {f['benchmark'].methodology}"})
    run = f["run"]
    s.append({"title": "Pipeline Execution",
              "content": f"Run status: {run.status if run else 'n/a'} | stages completed: {len(run.stages_completed or []) if run else 0}/17"})
    return s


def _render_pdf(title: str, sections: list[dict], path) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    from reportlab.lib import colors

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#0B1020"), spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#3B82F6"), spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13)

    doc = SimpleDocTemplate(str(path), pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm)
    story = [Paragraph(title, h1),
             Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", body), Spacer(1, 8)]
    for sec in sections:
        story.append(Paragraph(sec["title"], h2))
        story.append(Paragraph(sec["content"].replace("\n", "<br/>"), body))
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
</style></head><body><h1>{{title}}</h1><div class='meta'>Generated {{ts}}</div>
{% for s in sections %}<div class='panel'><h2>{{s.title}}</h2><code><pre>{{s.content}}</pre></code></div>{% endfor %}
</body></html>""")
    return tpl.render(title=title, ts=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), sections=sections)


def _write_csv(path, sections: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        for sec in sections:
            w.writerow([sec["title"]])
            for line in sec["content"].split("\n"):
                w.writerow([line])
            w.writerow([])


def generate(db: Session, dataset_id: str, title: str | None, report_type: str,
             fmt: str, sections: list[dict] | None, actor_id: str | None) -> Report:
    if fmt not in ("pdf", "html", "csv"):
        raise ValueError("format must be pdf | html | csv")
    facts = _facts(db, dataset_id)
    ds = facts["dataset"]
    secs = sections or _sections(facts)
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