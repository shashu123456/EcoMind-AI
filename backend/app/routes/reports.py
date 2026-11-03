"""Report endpoints: generate, preview, history, compare and export.

Ownership: S7. Contract: §3.9.

What already existed
--------------------
`report_service` builds twelve sections from the snapshots every earlier stage
wrote (quality, transformation, model selection, baseline, anomalies, forecast,
recommendations) and renders a PDF. That part is real and is reused unchanged.

What did not exist
------------------
There was one route, `GET /workflows/{run_id}/report.pdf`. No way to list past
reports, read the sections as a document, rename, duplicate, delete, compare two
runs, or export anything except PDF. The page compensated by showing an iframe
of the PDF and a client-side markdown draft — so the "report history" strip had
nothing behind it and every export button led to the same file.

This router serves the stored sections as data, so the page can render a real
document preview (pages, search, thumbnails) instead of embedding a PDF, and
exports the same stored sections to the formats the office actually asks for.

Every figure in every export is the figure stored on the report row. Nothing is
recomputed here, so an export can never disagree with the preview it came from.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.security import get_current_user
from app.db.base import get_db
from app.db.models import Dataset, Model, ModelSelection, Report, User
from app.domain import snapshots
from app.domain.data import json_safe
from app.domain.report_service import generate as generate_report
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

router = APIRouter()

EXPORT_FORMATS = ("pdf", "csv", "json", "docx", "xlsx", "pptx")


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _require(db: Session, dataset_id: str, report_id: str) -> Report:
    row = db.query(Report).filter(Report.id == report_id).first()
    if not row or row.dataset_id != dataset_id:
        raise HTTPException(404, "Report not found for this dataset")
    return row


def _sections(row: Report) -> List[dict]:
    return [s for s in (row.sections or []) if isinstance(s, dict)]


def _figures(row: Report) -> Dict[str, Any]:
    """Every figure on the report, flattened, for KPIs and comparison."""
    out: Dict[str, Any] = {}
    for section in _sections(row):
        for key, value in (section.get("figures") or {}).items():
            out.setdefault(key, value)
    return out


def _context(db: Session, dataset_id: str) -> dict:
    """The provenance a history row needs: model, baseline, prediction version."""
    ms = (
        db.query(ModelSelection)
        .filter(ModelSelection.dataset_id == dataset_id)
        .order_by(ModelSelection.selected_at.desc())
        .first()
    )
    model = db.query(Model).filter(Model.id == ms.selected_model_id).first() if ms and ms.selected_model_id else None
    # Forecast writes one snapshot per horizon, so the unscoped read can return a
    # single-horizon payload with no `horizons` list. Read the default slot.
    forecast_snap = (
        snapshots.latest_snapshot(db, "forecast", dataset_id, scope=snapshots.DEFAULT_SCOPE) or {}
    )
    baseline_snap = (
        snapshots.latest_snapshot(db, "baseline", dataset_id, scope=snapshots.DEFAULT_SCOPE) or {}
    )
    horizons = forecast_snap.get("horizons") or []
    lead = next((h for h in horizons if h.get("tier") == "short"), None) or (horizons[0] if horizons else None)
    metrics = (model.metrics or {}) if model else {}
    return {
        "model": model.algorithm if model else None,
        "model_version": f"{model.algorithm} v{model.version}" if model else None,
        "accuracy_r2": metrics.get("r2"),
        "accuracy_mape": metrics.get("mape"),
        "baseline_version": (baseline_snap.get("version") or baseline_snap.get("baseline_version")),
        "prediction_version": lead.get("horizon") if lead else None,
        "prediction_generated_at": forecast_snap.get("generated_at"),
    }


def _list_item(db: Session, row: Report, ctx: Optional[dict] = None) -> dict:
    ctx = ctx or _context(db, row.dataset_id)
    user = db.query(User).filter(User.id == row.user_id).first() if row.user_id else None
    return {
        "id": row.id,
        "dataset_id": row.dataset_id,
        "run_id": row.run_id,
        "title": row.title,
        "organization": row.organization_name,
        "status": row.status,
        "format": row.format,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "file_size_bytes": row.file_size_bytes,
        "sections": len(row.sections or []),
        "error": row.error,
        "generated_by": (user.full_name or user.email) if user else "system",
        **ctx,
    }


def _document(row: Report, dataset: Optional[Dataset]) -> dict:
    """The document the preview renders: pages, sections, figures, summary."""
    sections = _sections(row)
    pages = []
    for section in sections:
        pages.append(
            {
                "key": section.get("key"),
                "order": section.get("order"),
                "title": section.get("title"),
                "body": section.get("body") or "",
                "figures": section.get("figures") or {},
            }
        )
    return {
        "id": row.id,
        "title": row.title,
        "organization": row.organization_name,
        "dataset_id": row.dataset_id,
        "dataset_name": dataset.name if dataset else row.dataset_id,
        "status": row.status,
        "generated_at": row.generated_at.isoformat() if row.generated_at else None,
        "summary": row.summary or {},
        "sections": pages,
        "figures": _figures(row),
        "error": row.error,
    }


# ─────────────────────────────────────────────────────────────
# Generate + history
# ─────────────────────────────────────────────────────────────
@router.post("/{dataset_id}/reports")
def create_report(
    dataset_id: str,
    body: dict | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Build a report from the recorded stage outputs and store it."""
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    payload = dict(body or {})
    try:
        result = generate_report(
            db,
            dataset_id,
            {
                "run_id": payload.get("run_id"),
                "report_type": payload.get("report_type") or "organization",
            },
        )
    except Exception as exc:  # surfaced to the UI with the real reason
        raise HTTPException(400, f"Report generation failed: {exc}") from exc
    db.commit()
    row = db.query(Report).filter(Report.id == result["id"]).first()
    return json_safe({"report": _list_item(db, row), "document": _document(row, ds)})


@router.get("/{dataset_id}/reports")
def list_reports(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Report)
        .filter(Report.dataset_id == dataset_id)
        .order_by(Report.created_at.desc())
        .limit(100)
        .all()
    )
    ctx = _context(db, dataset_id)
    return json_safe(
        {
            "dataset_id": dataset_id,
            "reports": [_list_item(db, r, ctx) for r in rows],
            "total": len(rows),
            "formats": list(EXPORT_FORMATS),
        }
    )


@router.get("/{dataset_id}/reports/compare")
def compare_reports(
    dataset_id: str,
    left: str = Query(...),
    right: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """What changed between two recorded reports, figure by figure."""
    a = _require(db, dataset_id, left)
    b = _require(db, dataset_id, right)
    fa, fb = _figures(a), _figures(b)
    keys = sorted(set(fa) | set(fb))
    rows = []
    for key in keys:
        va, vb = fa.get(key), fb.get(key)
        delta = None
        try:
            delta = round(float(vb) - float(va), 4)
        except (TypeError, ValueError):
            delta = None
        rows.append(
            {
                "metric": key,
                "left": va,
                "right": vb,
                "delta": delta,
                "direction": "up" if delta and delta > 0 else "down" if delta and delta < 0 else "same",
            }
        )
    ctx_a, ctx_b = _context(db, dataset_id), _context(db, dataset_id)
    changes = [
        {"field": field, "left": ctx_a.get(field), "right": ctx_b.get(field)}
        for field in ("model_version", "baseline_version", "prediction_version", "accuracy_r2", "accuracy_mape")
        if ctx_a.get(field) != ctx_b.get(field)
    ]
    return json_safe(
        {
            "left": _list_item(db, a, ctx_a),
            "right": _list_item(db, b, ctx_b),
            "figures": rows,
            "changes": changes,
        }
    )


@router.get("/{dataset_id}/reports/{report_id}")
def get_report(
    dataset_id: str,
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = _require(db, dataset_id, report_id)
    ds = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    return json_safe(
        {"report": _list_item(db, row), "document": _document(row, ds), "context": _context(db, dataset_id)}
    )


@router.post("/{dataset_id}/reports/{report_id}/rename")
def rename_report(
    dataset_id: str,
    report_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    title = str(body.get("title") or body.get("name") or "").strip()
    if not title:
        raise HTTPException(400, "A title is required")
    row = _require(db, dataset_id, report_id)
    row.title = title[:255]
    db.add(row)
    db.commit()
    return json_safe(_list_item(db, row))


@router.post("/{dataset_id}/reports/{report_id}/duplicate")
def duplicate_report(
    dataset_id: str,
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    src = _require(db, dataset_id, report_id)
    copy = Report(
        dataset_id=src.dataset_id,
        run_id=src.run_id,
        user_id=user.id if user else None,
        title=f"{src.title} (copy)"[:255],
        organization_name=src.organization_name,
        report_type=src.report_type,
        format=src.format,
        sections=src.sections,
        summary=src.summary,
        status="ready",
        generated_at=datetime.now(timezone.utc),
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return json_safe(_list_item(db, copy))


@router.delete("/{dataset_id}/reports/{report_id}")
def delete_report(
    dataset_id: str,
    report_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = _require(db, dataset_id, report_id)
    if row.file_path:
        try:
            (settings.reports_dir / row.file_path).unlink()
        except OSError:
            pass
    db.delete(row)
    db.commit()
    return {"deleted": report_id}


# ─────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────
def _csv(row: Report) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["order", "section", "key", "figures", "body"])
    for section in _sections(row):
        writer.writerow(
            [
                section.get("order"),
                section.get("title"),
                section.get("key"),
                json.dumps(section.get("figures") or {}, default=str),
                (section.get("body") or "").replace("\n", " "),
            ]
        )
    return buffer.getvalue()


def _xlsx(row: Report) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    summary.append(["Report", row.title])
    summary.append(["Generated", row.generated_at.isoformat() if row.generated_at else ""])
    summary.append([])
    summary.append(["Metric", "Value"])
    for key, value in _figures(row).items():
        summary.append([key, value if isinstance(value, (int, float, str)) else json.dumps(value, default=str)])

    sheet = wb.create_sheet("Sections")
    sheet.append(["Order", "Section", "Key", "Figures", "Body"])
    for section in _sections(row):
        sheet.append(
            [
                section.get("order"),
                section.get("title"),
                section.get("key"),
                json.dumps(section.get("figures") or {}, default=str),
                section.get("body") or "",
            ]
        )
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _docx(row: Report) -> bytes:
    from docx import Document

    doc = Document()
    doc.add_heading(row.title, level=0)
    if row.generated_at:
        doc.add_paragraph(f"Generated {row.generated_at.isoformat()}")
    for section in _sections(row):
        doc.add_heading(str(section.get("title") or ""), level=1)
        for paragraph in str(section.get("body") or "").split("\n\n"):
            if paragraph.strip():
                doc.add_paragraph(paragraph.strip())
        figures = section.get("figures") or {}
        if figures:
            table = doc.add_table(rows=1, cols=2)
            table.rows[0].cells[0].text = "Metric"
            table.rows[0].cells[1].text = "Value"
            for key, value in figures.items():
                cells = table.add_row().cells
                cells[0].text = str(key)
                cells[1].text = str(value)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def _pptx(row: Report) -> bytes:
    from pptx import Presentation

    prs = Presentation()
    title_slide = prs.slides.add_slide(prs.slide_layouts[0])
    title_slide.shapes.title.text = row.title
    if len(title_slide.placeholders) > 1:
        title_slide.placeholders[1].text = row.organization_name or "EcoMind"
    for section in _sections(row):
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = str(section.get("title") or "")
        body = slide.placeholders[1].text_frame
        body.text = ""
        lines = [line for line in str(section.get("body") or "").split("\n") if line.strip()][:6]
        for index, line in enumerate(lines):
            paragraph = body.paragraphs[0] if index == 0 else body.add_paragraph()
            paragraph.text = line.strip()[:180]
            paragraph.level = 0
    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


@router.get("/{dataset_id}/reports/{report_id}/export")
def export_report(
    dataset_id: str,
    report_id: str,
    format: str = Query("pdf", pattern="^(pdf|csv|json|docx|xlsx|pptx)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export the stored report. Every format reads the same nine sections."""
    row = _require(db, dataset_id, report_id)
    stamp = (row.generated_at or datetime.now(timezone.utc)).strftime("%Y%m%d")
    base = f"ecomind-report-{stamp}"

    if format == "pdf":
        if row.file_path:
            path = settings.reports_dir / row.file_path
            if path.exists():
                return FileResponse(
                    str(path), media_type="application/pdf", filename=f"{base}.pdf"
                )
        from app.domain.report_pdf import build_pdf

        try:
            blob = build_pdf(
                title=row.title,
                organization=row.organization_name or "",
                sections=_sections(row),
                summary=row.summary or {},
                generated_at=row.generated_at,
            )
        except Exception as exc:
            raise HTTPException(500, f"PDF rendering failed: {exc}") from exc
        return Response(
            content=blob,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{base}.pdf"'},
        )

    if format == "csv":
        return Response(
            content=_csv(row),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base}.csv"'},
        )

    if format == "json":
        body = json.dumps(
            {
                "report": _list_item(db, row),
                "summary": row.summary or {},
                "sections": _sections(row),
            },
            indent=2,
            default=str,
        )
        return Response(
            content=body,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base}.json"'},
        )

    if format == "xlsx":
        content = _xlsx(row)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif format == "docx":
        content = _docx(row)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        content = _pptx(row)
        media = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{base}.{format}"'},
    )
