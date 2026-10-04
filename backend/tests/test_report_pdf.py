"""
Tests for PDF rendering.

`reportlab` has been in requirements since the project began and was never
imported, while the report row advertised `format="pdf"` and left
`file_path` null. These tests exist so the promise and the artefact cannot
diverge again.

The important properties are not cosmetic: a PDF that crashes on real report
text — which contains `&`, `<` and en-IN digit grouping — is the failure mode
that would only show up for one organisation's data.
"""

from datetime import datetime, timezone

from app.domain.report_pdf import build_pdf, render_to_path

SUMMARY = {
    "overall_health": {"data_quality_score": 99.6, "peak_demand_kw": 7088.05},
    "spend": {"projected_30d_inr": 661925.67, "projected_30d_kwh": 3202723.11},
    "opportunity": {"annual_recoverable_inr": 61564.56, "payback_months": 1.8},
}

SECTIONS = [
    {
        "key": "organization_summary",
        "title": "Organisation Summary",
        "body": "Two buildings, 102 devices, 220,466 readings.",
        "figures": {"readings": 220466, "buildings": 2, "projected_30d_inr": 661925.67},
    },
    {
        "key": "overall_health",
        "title": "Overall Energy Health",
        "body": "Peak demand and load factor across the estate.",
        "figures": {"peak_demand_kw": 7088.05, "load_factor_pct": 62.76},
    },
]


def render(sections=None, summary=None):
    return build_pdf(
        title="Energy Analytics Report — Test",
        organization="Acme",
        sections=SECTIONS if sections is None else sections,
        summary=SUMMARY if summary is None else summary,
        generated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


def test_produces_a_pdf_document():
    data = render(sections=SECTIONS)
    assert data.startswith(b"%PDF")
    assert len(data) > 1000


def test_survives_report_text_containing_markup():
    """Real section prose contains & and <, which reportlab reads as markup."""
    hostile = [
        {
            "key": "appendix",
            "title": "Appendix & Notes <draft>",
            "body": "AT&T site <100 kW; temperature > 30C & rising.",
            "figures": {"rule": "a < b && c > d"},
        }
    ]
    data = render(sections=hostile)
    assert data.startswith(b"%PDF")


def test_renders_with_no_sections():
    data = render(sections=[])
    assert data.startswith(b"%PDF")


def test_renders_with_no_summary():
    data = render(sections=SECTIONS, summary={})
    assert data.startswith(b"%PDF")


def test_handles_a_very_long_document():
    sections = [
        {"key": f"s{i}", "title": f"Section {i}", "body": "Body " * 200,
         "figures": {"a": i, "b": i * 2}}
        for i in range(60)
    ]
    data = render(sections=sections)
    assert data.startswith(b"%PDF")
    assert b"/Count" in data or len(data) > 5000


def test_writes_atomically_and_reports_size(tmp_path):
    target = tmp_path / "nested" / "report.pdf"
    size = render_to_path(
        path=str(target),
        title="Energy Analytics Report — Test",
        organization="Acme",
        sections=SECTIONS,
        summary=SUMMARY,
        generated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    assert target.exists()
    assert size == target.stat().st_size
    assert target.read_bytes().startswith(b"%PDF")
    # No temp file left behind, or a reader could pick it up.
    assert not (tmp_path / "nested" / "report.pdf.tmp").exists()


def test_missing_figures_key_is_tolerated():
    sections = [{"key": "x", "title": "X", "body": "Body", "figures": None}]
    assert render(sections=sections).startswith(b"%PDF")