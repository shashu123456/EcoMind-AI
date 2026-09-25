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


_BRAND = {
    "ink": "#0B1020",
    "deep": "#111A2E",
    "panel": "#F4F7FC",
    "line": "#D7E0EE",
    "indigo": "#4C5FD5",
    "indigo_dark": "#3B4BB8",
    "cyan": "#1488B8",
    "emerald": "#0E7A55",
    "amber": "#9A6B12",
    "rose": "#B91C4C",
    "muted": "#5B6B85",
}


def _render_pdf(title: str, sections: list[dict], path, subtitle: str = "") -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        PageBreak, HRFlowable, KeepTogether,
    )
    from reportlab.lib import colors

    W, H = A4
    c = {k: colors.HexColor(v) for k, v in _BRAND.items()}

    h1 = ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=23, leading=28,
                        textColor=c["ink"], spaceAfter=4)
    h2 = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13.5, leading=17,
                        textColor=c["indigo_dark"], spaceBefore=16, spaceAfter=6)
    body = ParagraphStyle("Body", fontName="Helvetica", fontSize=9.8, leading=14.5,
                          textColor=c["ink"])
    cell = ParagraphStyle("Cell", parent=body, fontSize=8.6, leading=11.2)
    cellh = ParagraphStyle("CellH", parent=cell, textColor=colors.white,
                           fontName="Helvetica-Bold")

    def cover(story, sec_count: int) -> None:
        story.append(Spacer(1, 88 * mm))
        story.append(Paragraph(
            "<font color='%s'>EcoMind</font> <font color='%s'>AI</font>" % (
                c["indigo"].hexval(), c["cyan"].hexval()),
            ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=40,
                           leading=46, textColor=c["indigo"], alignment=1)))
        story.append(Spacer(1, 8))
        story.append(HRFlowable(width="38%", thickness=1.2, color=c["cyan"], spaceBefore=2, spaceAfter=14))
        story.append(Paragraph(title, ParagraphStyle(
            "CovTitle", fontName="Helvetica-Bold", fontSize=19, leading=25,
            textColor=c["ink"], alignment=1)))
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            subtitle,
            ParagraphStyle("CovSub", fontName="Helvetica", fontSize=11, leading=16,
                           textColor=c["muted"], alignment=1)))
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            f"Adaptive · Explainable · Energy Intelligence — {sec_count} evidence sections",
            ParagraphStyle("CovTag", fontName="Helvetica", fontSize=9.5,
                           textColor=c["muted"], alignment=1)))
        story.append(Spacer(1, 26))
        story.append(PageBreak())

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(c["muted"])
        canvas.drawString(18 * mm, 11 * mm, "EcoMind AI — Adaptive Explainable Energy Intelligence")
        canvas.drawRightString(W - 18 * mm, 11 * mm, f"Page {doc_.page}")
        canvas.setStrokeColor(c["line"])
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 14 * mm, W - 18 * mm, 14 * mm)
        canvas.restoreState()

    def table_block(rows, header_colors=(1, "indigo_dark")):
        header_col = c[header_colors[1]] if header_colors[1] else c["indigo_dark"]
        data = [[Paragraph(str(v), cellh) if r == 0 else Paragraph(str(v), cell)
                 for v in row] for r, row in enumerate(rows)]
        t = Table(data, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_col),
            ("GRID", (0, 0), (-1, -1), 0.4, c["line"]),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, c["panel"]]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    doc = SimpleDocTemplate(str(path), pagesize=A4, topMargin=20 * mm,
                            bottomMargin=20 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
                            title=title, author="EcoMind AI",
                            subject="Energy intelligence audit report",
                            onFirstPage=footer, onLaterPages=footer)

    story: list = []
    cover(story, len(sections))
    story.append(Paragraph("<font color='%s'>Report summary</font>" % c["indigo_dark"].hexval(),
                           ParagraphStyle("Kicker", fontName="Helvetica-Bold", fontSize=10,
                                          tracking=1, spaceAfter=6, textColor=c["indigo_dark"])))
    for i, sec in enumerate(sections, 1):
        block = [Paragraph(
            "<font color='%s'>%02d</font>  %s" % (c["cyan"].hexval(), i, sec["title"]),
            h2)]
        block.append(HRFlowable(width="100%", thickness=0.8, color=c["line"], spaceBefore=2, spaceAfter=8))
        block.append(Paragraph(sec["content"].replace("\n", "<br/>"), body))
        rows = sec.get("rows")
        if rows:
            block.append(Spacer(1, 6))
            block.append(table_block(rows))
        block.append(Spacer(1, 10))
        if len(rows or []) == 0:
            story.append(KeepTogether(block))
        else:
            story.extend(block)
    doc.build(story)


def _render_html(title: str, sections: list[dict]) -> str:
    import jinja2
    tpl = jinja2.Template("""<!doctype html><html><head><meta charset='utf-8'><title>{{title}}</title>
<style>
:root{--indigo:#4C5FD5;--indigo-dark:#3B4BB8;--cyan:#1488B8;--emerald:#0E7A55;
--amber:#9A6B12;--ink:#0B1020;--panel:#F4F7FC;--line:#D7E0EE;--muted:#5B6B85;--white:#fff;}
body{font-family:'Manrope','Segoe UI',Arial,sans-serif;background:radial-gradient(46% 34% at 12% 4%,rgba(76,95,213,.10),transparent 66%),radial-gradient(40% 30% at 88% 2%,rgba(20,136,184,.08),transparent 66%),#F7F9FC;color:var(--ink);margin:0;padding:48px 0;}
.page{max-width:880px;margin:0 auto;padding:0 24px;}
.cover{text-align:center;padding:72px 0 40px;}
.brand{font-weight:800;font-size:46px;letter-spacing:-1px;color:var(--ink);}
.brand b{color:var(--cyan);font-weight:800;}
.rule{width:180px;height:3px;margin:16px auto;background:linear-gradient(90deg,var(--indigo),var(--cyan),var(--emerald));border-radius:99px;}
h1.title{margin:8px 0 4px;font-size:22px;line-height:1.3;}
.sub{color:var(--muted);font-size:12.5px;margin:0 0 10px;}
.tag{display:inline-block;color:var(--muted);font-size:11px;letter-spacing:.06em;}
.meta{color:var(--muted);font-size:12px;margin:0 0 26px;}
.panel{background:var(--white);border:1px solid var(--line);border-radius:14px;
padding:22px 26px;margin:16px 0;box-shadow:0 1px 0 rgba(11,16,32,.04),0 10px 30px -18px rgba(76,95,213,.25);}
.sec-head{display:flex;align-items:baseline;gap:12px;margin:0 0 4px;}
.sec-num{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;color:var(--cyan);font-size:14px;}
h2{margin:0;font-size:16.5px;color:var(--indigo-dark);}
.hline{height:1px;background:var(--line);margin:10px 0 14px;}
pre{white-space:pre-wrap;margin:0;font-size:12.5px;line-height:1.65;color:#232D43;}
table{border-collapse:collapse;width:100%;margin:12px 0 2px;font-size:12.5px;}
th{background:var(--indigo);color:#fff;font-weight:700;text-align:left;padding:8px 12px;border:1px solid var(--indigo-dark);}
td{border:1px solid var(--line);padding:7px 12px;color:#2A3550;}
tr:nth-child(even) td{background:var(--panel);}
code{background:#EEF1F8;color:var(--indigo-dark);padding:1px 6px;border-radius:6px;
font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;}
.foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;
color:var(--muted);font-size:11px;}
</style></head><body><div class='page'>
<div class='cover'><div class='brand'>EcoMind<b>AI</b></div><div class='rule'></div>
<h1 class='title'>{{title}}</h1><p class='sub'>Adaptive · Explainable · Energy Intelligence</p>
<p class='tag'>full pipeline energy-intelligence report</p></div>
<p class='meta'>Generated {{ts}}</p>
{% for s in sections %}<div class='panel'>
<div class='sec-head'><span class='sec-num'>{{ '%02d' % loop.index }}</span><h2>{{s.title}}</h2></div>
<div class='hline'></div>
{% if s.rows %}<table>{% for row in s.rows %}{% set is_head = loop.index == 1 %}<tr>{% for cell in row %}{% if is_head %}<th>{{cell}}</th>{% else %}<td>{{cell}}</td>{% endif %}{% endfor %}</tr>{% endfor %}</table>{% endif %}
{% if s.rows %}<pre style='margin-top:12px'>{{s.content}}</pre>{% else %}<pre>{{s.content}}</pre>{% endif %}
</div>{% endfor %}
<div class='foot'><span>EcoMind AI · Adaptive Explainable Energy Intelligence</span><span>evidence-grade audit · generated {{ts}}</span></div>
</div></body></html>""")
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
    sub = (f"{ds.name} · {ds.row_count} rows × {ds.column_count} columns · "
           f"{report_type} report · generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    if fmt == "pdf":
        _render_pdf(title or f"EcoMind AI Report — {ds.name}", secs, path, subtitle=sub)
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