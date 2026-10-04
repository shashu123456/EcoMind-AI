"""
Render the organisation report to a real PDF.

This module exists because `reportlab` has been in `requirements.txt` since the
project began and has never been imported, while the report row has always
advertised `format="pdf"` and carried `file_path` / `file_size_bytes` columns
that stayed null. The UI therefore promised a file the backend never produced.

Two constraints shaped this:

  - **No invented numbers.** Every figure rendered comes from `row.sections`,
    which the report stage already computed. Nothing is recalculated here, so
    the PDF cannot disagree with the page it was downloaded from.
  - **A failed render must not fail the report.** The stage output and the
    snapshot are the product's real deliverable; the PDF is an extra. If
    rendering raises, the report still completes and records why the file is
    missing, rather than taking a finished analysis down with it.

The document is deliberately plain. It is an artefact for circulation to people
who will not have the application open, so it carries the same argument as the
screen -- headline figures first, then the evidence, then the actions.
"""

from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Matches the application's ink so the PDF reads as the same product.
INK = colors.HexColor("#0f1720")
INK_MID = colors.HexColor("#414c5a")
INK_LOW = colors.HexColor("#667486")
LINE = colors.HexColor("#e3e7ee")
ACCENT = colors.HexColor("#3b5bdb")

PAGE_MARGIN = 18 * mm


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=19,
            leading=23, textColor=INK, alignment=TA_LEFT, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Helvetica", fontSize=9.5,
            leading=13, textColor=INK_LOW, spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5,
            leading=16, textColor=INK, spaceBefore=14, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica", fontSize=9.5,
            leading=14, textColor=INK_MID, spaceAfter=7,
        ),
        "eyebrow": ParagraphStyle(
            "eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7,
            leading=9, textColor=INK_LOW, spaceAfter=2,
        ),
        "metric": ParagraphStyle(
            "metric", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=17,
            leading=20, textColor=INK,
        ),
        "cell": ParagraphStyle(
            "cell", parent=base["Normal"], fontName="Helvetica", fontSize=8.5,
            leading=11, textColor=INK_MID,
        ),
    }


def _escape(value: Any) -> str:
    """reportlab's mini-HTML treats bare `<`/`&` as markup, which crashes."""
    text = "" if value is None else str(value)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _metric_row(summary: dict[str, Any], st: dict[str, ParagraphStyle]) -> Table:
    """The headline block: the four numbers an executive reads first."""
    health = summary.get("overall_health") or {}
    spend = summary.get("spend") or {}
    opportunity = summary.get("opportunity") or {}

    cells = [
        (
            "DATA QUALITY",
            f"{health.get('data_quality_score', 0)}",
            "score / 100",
        ),
        (
            "PEAK DEMAND",
            f"{health.get('peak_demand_kw', 0):,.2f}",
            "kW",
        ),
        (
            "30-DAY SPEND",
            f"INR {spend.get('projected_30d_inr', 0):,.0f}",
            f"{spend.get('projected_30d_kwh', 0):,.0f} kWh",
        ),
        (
            "ANNUAL RECOVERABLE",
            f"INR {opportunity.get('annual_recoverable_inr', 0):,.0f}",
            f"payback {opportunity.get('payback_months', 0)} months",
        ),
    ]

    rendered = []
    for label, value, note in cells:
        rendered.append(
            Paragraph(
                f'<font size="7" color="#667486"><b>{_escape(label)}</b></font><br/>'
                f'<font size="17" color="#0f1720"><b>{_escape(value)}</b></font><br/>'
                f'<font size="7.5" color="#667486">{_escape(note)}</font>',
                st["metric"],
            )
        )

    table = Table([rendered], colWidths=[(A4[0] - 2 * PAGE_MARGIN) / 4] * 4)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafbfc")),
            ]
        )
    )
    return table


def _figures_table(figures: dict[str, Any], st: dict[str, ParagraphStyle]) -> Table | None:
    """Render a section's computed figures as a two-column evidence table."""
    rows = [
        [
            Paragraph("<b>FIGURE</b>", st["cell"]),
            Paragraph("<b>VALUE</b>", st["cell"]),
        ]
    ]
    for key, value in (figures or {}).items():
        rows.append(
            [
                Paragraph(_escape(key).replace("_", " "), st["cell"]),
                Paragraph(_escape(value), st["cell"]),
            ]
        )
    if len(rows) == 1:
        return None

    table = Table(rows, colWidths=[(A4[0] - 2 * PAGE_MARGIN) * 0.55, (A4[0] - 2 * PAGE_MARGIN) * 0.45])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f3f6")),
            ]
        )
    )
    return table


def _footer(canvas, doc) -> None:
    """Page furniture. Page numbers matter once a document is circulated."""
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(INK_LOW)
    canvas.drawString(PAGE_MARGIN, 10 * mm, "EcoMind AI — generated report")
    canvas.drawRightString(A4[0] - PAGE_MARGIN, 10 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.line(PAGE_MARGIN, 13 * mm, A4[0] - PAGE_MARGIN, 13 * mm)
    canvas.restoreState()


def build_pdf(*, title: str, organization: str, sections: Iterable[dict], summary: dict,
              generated_at: datetime | None = None) -> bytes:
    """Render the report to PDF bytes. Returns the bytes; does not touch disk."""
    st = _styles()
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN + 4 * mm,
        title=title,
        author=organization or "EcoMind AI",
    )

    stamp = generated_at.strftime("%d %b %Y") if generated_at else "—"
    story: list = [
        Paragraph(_escape(title), st["title"]),
        Paragraph(
            f"{_escape(organization or 'Organisation')} &nbsp;·&nbsp; generated {stamp}",
            st["subtitle"],
        ),
    ]

    if summary:
        story.append(_metric_row(summary, st))
        story.append(Spacer(1, 10))

    section_list = list(sections or [])
    for index, section in enumerate(section_list):
        heading = _escape(section.get("title") or section.get("key") or "")
        body = _escape(section.get("body") or "")
        figures = section.get("figures") or {}

        block: list = [Paragraph(heading, st["h2"])]
        if body:
            block.append(Paragraph(body, st["body"]))
        table = _figures_table(figures, st)
        if table is not None:
            block.append(Spacer(1, 3))
            block.append(table)

        # Keep a section whole where it can fit, so a heading never ends up
        # stranded at the foot of a page. The final section is allowed to
        # split, because forcing it whole can overflow the last page.
        story.extend(block if index == len(section_list) - 1 else [KeepTogether(block)])

    if not section_list:
        story.append(
            Paragraph("This report contains no sections.", st["body"])
        )

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def render_to_path(*, path: str, **kwargs) -> int:
    """Render and write atomically, returning the byte size.

    Writes to a sibling temp file and renames, so a reader can never observe a
    half-written PDF — which is exactly what happens if the process dies during
    a direct write.
    """
    data = build_pdf(**kwargs)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temp = f"{path}.tmp"
    with open(temp, "wb") as handle:
        handle.write(data)
    os.replace(temp, path)
    return len(data)