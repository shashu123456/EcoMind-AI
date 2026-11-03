/**
 * ReportStudio — the Reports module.
 *
 * Replaces the PDF iframe with a document preview built from the stored report
 * sections, adds real generation status, history actions, comparison and the six
 * exports. Layout, typography and the dark palette follow the existing shell.
 */

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitCompare,
  Layers,
  Loader2,
  Maximize2,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  downloadReport,
  REPORT_FORMATS,
  reportsApi,
  type ReportComparison,
  type ReportDocument,
  type ReportFormat,
  type ReportListItem,
  type ReportSection,
} from "../../lib/reports";
import "./report-studio.css";

/** The upstream modules a report draws from, in pipeline order. */
const STAGES = [
  { key: "data_quality", label: "Data Quality" },
  { key: "transformation", label: "Transformation" },
  { key: "model", label: "Model" },
  { key: "baseline", label: "Baseline" },
  { key: "anomaly", label: "Anomaly Detection" },
  { key: "prediction", label: "Prediction" },
  { key: "recommendations", label: "Recommendations" },
];

/** Which section satisfies each stage, matched against real section titles. */
const STAGE_MATCH: Record<string, string[]> = {
  data_quality: ["data quality", "quality"],
  transformation: ["transformation", "feature"],
  model: ["model"],
  baseline: ["baseline"],
  anomaly: ["anomal"],
  prediction: ["prediction", "forecast", "consumption"],
  recommendations: ["recommend"],
};

/** Sections that are charts in the other modules; the preview jumps back there. */
const SECTION_ROUTE: Array<{ match: string; route: string; label: string }> = [
  { match: "baseline", route: "baseline", label: "Open Baseline" },
  { match: "anomal", route: "anomalies", label: "Open Anomalies" },
  { match: "prediction", route: "prediction", label: "Open Prediction" },
  { match: "recommend", route: "recommendations", label: "Open Recommendations" },
  { match: "quality", route: "transform", label: "Open Data" },
];

type StageState = "idle" | "active" | "done" | "missing";

function formatBytes(value: number | null): string {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  if (Array.isArray(value)) return `${value.length} points`;
  if (typeof value === "object") return "—";
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && String(value).trim() !== "") return formatNumber(numeric);
  return String(value);
}

function routeForSection(section: ReportSection) {
  const haystack = `${section.key} ${section.title}`.toLowerCase();
  return SECTION_ROUTE.find(item => haystack.includes(item.match)) ?? null;
}

export function ReportStudio({
  datasetId,
  datasetName,
  onNavigate,
}: {
  datasetId: string;
  datasetName: string;
  onNavigate?: (route: string) => void;
}) {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [document, setDocument] = useState<ReportDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageState, setStageState] = useState<Record<string, StageState>>({});
  const [phase, setPhase] = useState<"idle" | "collecting" | "rendering" | "ready">("idle");
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [lightPaper, setLightPaper] = useState(false);
  const [query, setQuery] = useState("");
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const [exporting, setExporting] = useState<ReportFormat | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const payload = await reportsApi.list(datasetId);
      setReports(payload.reports);
      return payload.reports;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load report history");
      return [];
    }
  }, [datasetId]);

  useEffect(() => {
    void (async () => {
      const rows = await loadList();
      if (rows.length && !document) {
        try {
          const payload = await reportsApi.detail(datasetId, rows[0].id);
          setDocument(payload.document);
          setActivePage(0);
        } catch {
          /* the empty state covers this */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const pages = document?.sections ?? [];
  const totalPages = pages.length + 1; // cover + sections

  const stageStatus = useMemo(() => {
    if (phase !== "ready" || !document) return stageState;
    const haystack = pages.map(p => `${p.key} ${p.title}`).join(" ").toLowerCase();
    const resolved: Record<string, StageState> = {};
    for (const stage of STAGES) {
      const hit = (STAGE_MATCH[stage.key] ?? [stage.key]).some(token => haystack.includes(token));
      resolved[stage.key] = hit ? "done" : "missing";
    }
    return resolved;
  }, [phase, document, pages, stageState]);

  const generate = async () => {
    setBusy("generate");
    setError(null);
    setPhase("collecting");
    setStageState(Object.fromEntries(STAGES.map(s => [s.key, "idle"])));
    let cursor = 0;
    const ticker = window.setInterval(() => {
      setStageState(previous => {
        const next = { ...previous };
        const current = STAGES[cursor];
        if (current) {
          if (cursor > 0) next[STAGES[cursor - 1].key] = "done";
          next[current.key] = "active";
        }
        return next;
      });
      cursor += 1;
      if (cursor >= STAGES.length) {
        window.clearInterval(ticker);
        setPhase("rendering");
      }
    }, 550);
    try {
      const payload = await reportsApi.generate(datasetId, {});
      window.clearInterval(ticker);
      setDocument(payload.document);
      setActivePage(0);
      setComparison(null);
      setCompareSelection([]);
      setPhase("ready");
      await loadList();
    } catch (err) {
      window.clearInterval(ticker);
      setError(err instanceof Error ? err.message : "Generation failed");
      setPhase("idle");
    } finally {
      setBusy(null);
    }
  };

  const openReport = async (id: string) => {
    setBusy(`open:${id}`);
    setError(null);
    try {
      const payload = await reportsApi.detail(datasetId, id);
      setDocument(payload.document);
      setActivePage(0);
      setPhase("ready");
      setComparison(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that report");
    } finally {
      setBusy(null);
    }
  };

  const renameReport = async (row: ReportListItem) => {
    const next = window.prompt("Report name", row.title);
    if (!next || next.trim() === row.title) return;
    setBusy(`rename:${row.id}`);
    try {
      await reportsApi.rename(datasetId, row.id, next.trim());
      await loadList();
      if (document?.id === row.id) setDocument({ ...document, title: next.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(null);
    }
  };

  const duplicateReport = async (row: ReportListItem) => {
    setBusy(`dup:${row.id}`);
    try {
      await reportsApi.duplicate(datasetId, row.id);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusy(null);
    }
  };

  const deleteReport = async (row: ReportListItem) => {
    if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setBusy(`del:${row.id}`);
    try {
      await reportsApi.remove(datasetId, row.id);
      const rows = await loadList();
      if (document?.id === row.id) {
        if (rows.length) {
          const payload = await reportsApi.detail(datasetId, rows[0].id);
          setDocument(payload.document);
        } else {
          setDocument(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareSelection(previous => {
      if (previous.includes(id)) return previous.filter(x => x !== id);
      if (previous.length >= 2) return [previous[1], id];
      return [...previous, id];
    });
  };

  const runCompare = async () => {
    if (compareSelection.length !== 2 || !document) return;
    setBusy("compare");
    try {
      const payload = await reportsApi.compare(datasetId, compareSelection[0], compareSelection[1]);
      setComparison(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async (format: ReportFormat) => {
    if (!document) return;
    setExporting(format);
    setError(null);
    try {
      await downloadReport(datasetId, document.id, format, document.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const filteredPages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pages.map((page, index) => {
      const text = `${page.title} ${page.body}`.toLowerCase();
      const match = needle ? text.includes(needle) : false;
      return { page, index, match };
    });
  }, [pages, query]);

  const jumpToPage = (index: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, index));
    setActivePage(clamped);
    const element = document?.sections?.[clamped - 1];
    const target = element ? pageRef.current?.querySelector(`[data-page="${clamped}"]`) : null;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const printDocument = () => window.print();

  const toggleFullscreen = () => {
    const node = previewRef.current;
    if (!node) return;
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
    else void node.requestFullscreen?.();
  };

  const summary = document?.summary;
  const health = summary?.overall_health ?? {};
  const spend = summary?.spend ?? {};
  const opportunity = summary?.opportunity ?? {};

  return (
    <div className="view-content report-studio">
      <div className="report-layout">
        <section className={`report-cover${lightPaper ? " is-paper" : ""}`}>
          <div className="report-cover__grid" />
          <div className="report-cover__top">
            <span className="brand-mini">
              <FileText size={18} />
              <strong>EcoMind</strong>
            </span>
            <span className="mono-note">
              REPORT / {document?.generated_at ? new Date(document.generated_at).toLocaleString("en-IN") : "NOT GENERATED"}
            </span>
          </div>
          <div className="report-cover__content">
            <span className="section-eyebrow">
              {datasetName} / {document?.organization ?? "Organisation"}
            </span>
            <h2>
              Energy intelligence
              <br />
              <em>briefing</em>
            </h2>
            <p>
              {document
                ? `${document.title} — ${document.sections.length} sections drawn from the current pipeline.`
                : "Generate a report to assemble every module's recorded output into one document."}
            </p>
            <div className="report-cover__rule" />
            <div className="report-cover__meta">
              <span>
                <small>SECTIONS</small>
                <strong>{document ? document.sections.length : "—"}</strong>
              </span>
              <span>
                <small>GENERATED</small>
                <strong>{document?.generated_at ? new Date(document.generated_at).toLocaleDateString("en-IN") : "—"}</strong>
              </span>
              <span>
                <small>MODEL</small>
                <strong>{reports[0]?.model_version ?? "—"}</strong>
              </span>
              <span>
                <small>BASELINE</small>
                <strong>{reports[0]?.baseline_version != null ? `v${reports[0].baseline_version}` : "—"}</strong>
              </span>
            </div>
          </div>
          <div className="report-cover__footer">
            <span>
              <span className="status-dot status-dot--lime" />
              {document ? "Stored and reproducible" : "Awaiting generation"}
            </span>
            <span>Page 01 / {String(totalPages).padStart(2, "0")}</span>
          </div>
        </section>

        <section className="panel report-export-panel">
          <div className="report-export-panel__head">
            <div>
              <div className="section-eyebrow">REPORT GENERATION</div>
              <h2>{document ? "Regenerate from the current pipeline." : "Assemble the report."}</h2>
              <p>
                Every section is read from the outputs the pipeline stored — nothing is retyped or estimated on this page.
              </p>
            </div>
            <button
              type="button"
              className="report-preview-button"
              onClick={() => void generate()}
              disabled={busy === "generate"}
            >
              {busy === "generate" ? <Loader2 size={14} className="rs-spin" /> : <RefreshCw size={14} />} Generate report
            </button>
          </div>

          <div className="report-sections">
            {STAGES.map(stage => {
              const state = stageStatus[stage.key] ?? "idle";
              return (
                <div className={`report-section-row rs-stage rs-stage--${state}`} key={stage.key}>
                  <span className="report-section-row__icon">
                    {state === "done" ? <Check size={16} /> : state === "missing" ? <X size={16} /> : <Layers size={16} />}
                  </span>
                  <div>
                    <strong>
                      {phase === "collecting" && state === "active" ? "Collecting results" : stage.label}
                    </strong>
                    <span>
                      {state === "done"
                        ? "Collected"
                        : state === "missing"
                          ? "Not recorded by the pipeline"
                          : state === "active"
                            ? "Reading stored outputs…"
                            : "Queued"}
                    </span>
                  </div>
                  {state === "done" && <Check size={15} className="report-section-row__check" />}
                </div>
              );
            })}
          </div>

          <div className="report-export-panel__footer">
            <div>
              <span className="mono-note">
                {document ? `${document.sections.length} SECTIONS / REPORT ${document.id.slice(0, 8)}` : "NO REPORT YET"}
              </span>
              <span>
                {phase === "collecting"
                  ? "Collecting results…"
                  : phase === "rendering"
                    ? "Generating PDF…"
                    : phase === "ready"
                      ? "Report ready"
                      : document
                        ? `Last generated ${document.generated_at ? new Date(document.generated_at).toLocaleString("en-IN") : "—"}`
                        : "Last generated: never"}
              </span>
            </div>
            <div className="rs-exports">
              {REPORT_FORMATS.map(format => (
                <button
                  key={format}
                  type="button"
                  className="rs-export-button"
                  disabled={!document || exporting !== null}
                  onClick={() => void handleExport(format)}
                >
                  {exporting === format ? <Loader2 size={12} className="rs-spin" /> : <Download size={12} />}
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {error && (
        <div className="rs-error" role="alert">
          <X size={14} /> {error}
        </div>
      )}

      <section className="panel report-pdf-panel" ref={previewRef}>
        <div className="report-pdf-panel__head">
          <div>
            <div className="section-eyebrow">DOCUMENT PREVIEW</div>
            <h2>{document?.title ?? "No document yet"}</h2>
            <p>
              Rendered from the stored sections — pages, zoom, search and print work without downloading the PDF.
            </p>
          </div>
          <div className="rs-toolbar">
            <button type="button" className="rs-icon-button" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
              <ZoomOut size={14} />
            </button>
            <span className="mono-note">{Math.round(zoom * 100)}%</span>
            <button type="button" className="rs-icon-button" onClick={() => setZoom(z => Math.min(1.8, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
              <ZoomIn size={14} />
            </button>
            <button type="button" className="rs-icon-button" onClick={() => setLightPaper(v => !v)} aria-label="Toggle paper mode" title="Paper mode">
              <Layers size={14} />
            </button>
            <button type="button" className="rs-icon-button" onClick={printDocument} aria-label="Print" disabled={!document}>
              <Printer size={14} />
            </button>
            <button type="button" className="rs-icon-button" onClick={toggleFullscreen} aria-label="Fullscreen">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        <div className="rs-preview-toolbar">
          <div className="rs-search">
            <Search size={14} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search the document"
              aria-label="Search the document"
            />
            {query && (
              <button type="button" className="rs-icon-button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="rs-pager">
            <button type="button" className="rs-icon-button" onClick={() => jumpToPage(activePage - 1)} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <span className="mono-note">
              PAGE {String(activePage + 1).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
            </span>
            <button type="button" className="rs-icon-button" onClick={() => jumpToPage(activePage + 1)} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {!document ? (
          <div className="report-pdf-empty">
            <FileText size={18} />
            <span>Generate a report to preview every section here.</span>
          </div>
        ) : (
          <div className="rs-document" ref={pageRef}>
            <aside className="rs-thumbs">
              {[{ title: "Cover", key: "cover" } as { title: string; key: string }, ...pages].map((page, index) => (
                <button
                  key={page.key + index}
                  type="button"
                  className={`rs-thumb${activePage === index ? " is-active" : ""}${
                    filteredPages.find(p => p.index === index - 1)?.match ? " is-hit" : ""
                  }`}
                  onClick={() => jumpToPage(index)}
                >
                  <span className="rs-thumb__no">{index + 1}</span>
                  <span className="rs-thumb__title">{index === 0 ? "Cover" : page.title}</span>
                </button>
              ))}
            </aside>

            <div className="rs-pages" style={{ zoom }}>
              {activePage === 0 ? (
                <article className="rs-page rs-page--cover" data-page={0}>
                  <span className="section-eyebrow">{document.organization ?? "EcoMind"}</span>
                  <h1>{document.title}</h1>
                  <p className="rs-lead">
                    {datasetName} — {document.sections.length} sections assembled from the analytical pipeline.
                  </p>
                  <div className="rs-kpis">
                    <div className="rs-kpi">
                      <small>DATA QUALITY</small>
                      <strong>{formatNumber(health.data_quality_score)}</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>PEAK DEMAND</small>
                      <strong>{formatNumber(health.peak_demand_kw)} kW</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>ANOMALY READINGS</small>
                      <strong>{formatNumber(health.anomaly_readings)}</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>RECOVERABLE / YR</small>
                      <strong>{formatNumber(opportunity.annual_recoverable_inr)}</strong>
                    </div>
                  </div>
                  <div className="rs-kpis">
                    <div className="rs-kpi">
                      <small>30-DAY ENERGY</small>
                      <strong>{formatNumber(spend.projected_30d_kwh)} kWh</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>30-DAY COST</small>
                      <strong>{formatNumber(spend.projected_30d_inr)}</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>CO₂</small>
                      <strong>{formatNumber(spend.co2_tonnes)} t</strong>
                    </div>
                    <div className="rs-kpi">
                      <small>PAYBACK</small>
                      <strong>{formatNumber(opportunity.payback_months)} mo</strong>
                    </div>
                  </div>
                  <p className="rs-footnote">
                    Generated {document.generated_at ? new Date(document.generated_at).toLocaleString("en-IN") : "—"} · report{" "}
                    {document.id.slice(0, 8)}
                  </p>
                </article>
              ) : (
                pages
                  .filter((_, index) => index === activePage - 1)
                  .map((page, index) => {
                    const route = routeForSection(page);
                    return (
                      <article className="rs-page" key={page.key + index} data-page={activePage}>
                        <div className="rs-page__head">
                          <span className="mono-note">SECTION {String(page.order ?? activePage).padStart(2, "0")}</span>
                          {route && onNavigate && (
                            <button type="button" className="rs-link" onClick={() => onNavigate(route.route)}>
                              {route.label} <ChevronRight size={12} />
                            </button>
                          )}
                        </div>
                        <h2>{page.title}</h2>
                        {page.body.split("\n\n").map((paragraph, i) => (
                          <p key={i} className={query && paragraph.toLowerCase().includes(query.toLowerCase()) ? "is-hit" : ""}>
                            {paragraph}
                          </p>
                        ))}
                        {Object.keys(page.figures).length > 0 && (
                          <div className="rs-figures">
                            {Object.entries(page.figures).map(([key, value]) => (
                              <div className="rs-figure" key={key}>
                                <small>{key.replace(/_/g, " ").toUpperCase()}</small>
                                <strong>{formatNumber(value)}</strong>
                                {Array.isArray(value) && value.length > 0 && typeof value[0] === "number" && (
                                  <svg viewBox={`0 0 ${value.length} 24`} preserveAspectRatio="none" className="rs-spark">
                                    {(() => {
                                      const max = Math.max(...(value as number[])) || 1;
                                      const min = Math.min(...(value as number[]));
                                      const span = max - min || 1;
                                      return (
                                        <polyline
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="1"
                                          points={(value as number[])
                                            .map((v, i) => `${i},${24 - ((v - min) / span) * 22}`)
                                            .join(" ")}
                                        />
                                      );
                                    })()}
                                  </svg>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel rs-history">
        <div className="report-pdf-panel__head">
          <div>
            <div className="section-eyebrow">REPORT HISTORY</div>
            <h2>{reports.length} stored {reports.length === 1 ? "report" : "reports"}</h2>
            <p>Each row is a full snapshot — open, rename, duplicate, compare or download it.</p>
          </div>
          <button
            type="button"
            className="report-preview-button"
            disabled={compareSelection.length !== 2 || busy === "compare"}
            onClick={() => void runCompare()}
          >
            <GitCompare size={14} /> Compare {compareSelection.length}/2
          </button>
        </div>
        {reports.length === 0 ? (
          <div className="report-pdf-empty">
            <FileText size={18} />
            <span>Nothing generated yet.</span>
          </div>
        ) : (
          <div className="rs-table">
            <div className="rs-table__head">
              <span />
              <span>REPORT</span>
              <span>MODEL</span>
              <span>ACCURACY</span>
              <span>VERSIONS</span>
              <span>SIZE</span>
              <span>GENERATED BY</span>
              <span />
            </div>
            {reports.map(row => (
              <div className={`rs-table__row${document?.id === row.id ? " is-open" : ""}`} key={row.id}>
                <span>
                  <input
                    type="checkbox"
                    checked={compareSelection.includes(row.id)}
                    onChange={() => toggleCompare(row.id)}
                    aria-label={`Select ${row.title} for comparison`}
                  />
                </span>
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.generated_at ? new Date(row.generated_at).toLocaleString("en-IN") : "not generated"}</small>
                </span>
                <span>{row.model_version ?? "—"}</span>
                <span>
                  {row.accuracy_r2 != null ? `R² ${row.accuracy_r2.toFixed(3)}` : "—"}
                  {row.accuracy_mape != null && <small>MAPE {row.accuracy_mape.toFixed(2)}%</small>}
                </span>
                <span>
                  baseline {row.baseline_version ?? "—"}
                  <small>forecast {row.prediction_version ?? "—"}</small>
                </span>
                <span>{formatBytes(row.file_size_bytes)}</span>
                <span>{row.generated_by}</span>
                <span className="rs-row-actions">
                  <button type="button" className="rs-icon-button" onClick={() => void openReport(row.id)} aria-label="Open" disabled={busy === `open:${row.id}`}>
                    <FileText size={13} />
                  </button>
                  <button type="button" className="rs-icon-button" onClick={() => void renameReport(row)} aria-label="Rename">
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="rs-icon-button" onClick={() => void duplicateReport(row)} aria-label="Duplicate">
                    <Copy size={13} />
                  </button>
                  <button type="button" className="rs-icon-button" onClick={() => void downloadReport(datasetId, row.id, "pdf", row.title).catch(e => setError(String(e.message)))} aria-label="Download">
                    <Download size={13} />
                  </button>
                  <button type="button" className="rs-icon-button rs-danger" onClick={() => void deleteReport(row)} aria-label="Delete">
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {comparison && (
        <section className="panel rs-compare">
          <div className="report-pdf-panel__head">
            <div>
              <div className="section-eyebrow">REPORT COMPARISON</div>
              <h2>
                {comparison.left.title.slice(0, 28)} → {comparison.right.title.slice(0, 28)}
              </h2>
              <p>{comparison.figures.length} figures compared; {comparison.changes.length} provenance changes.</p>
            </div>
            <button type="button" className="rs-icon-button" onClick={() => setComparison(null)} aria-label="Close comparison">
              <X size={14} />
            </button>
          </div>
          {comparison.changes.length > 0 && (
            <div className="rs-changes">
              {comparison.changes.map(change => (
                <span key={change.field} className="rs-change">
                  {change.field.replace(/_/g, " ")}: {String(change.left ?? "—")} → {String(change.right ?? "—")}
                </span>
              ))}
            </div>
          )}
          <div className="rs-table">
            <div className="rs-table__head rs-table__head--compare">
              <span>METRIC</span>
              <span>LEFT</span>
              <span>RIGHT</span>
              <span>DELTA</span>
            </div>
            {comparison.figures.map(row => (
              <div className="rs-table__row rs-table__row--compare" key={row.metric}>
                <span>{row.metric.replace(/_/g, " ")}</span>
                <span>{formatNumber(row.left)}</span>
                <span>{formatNumber(row.right)}</span>
                <span className={`rs-delta rs-delta--${row.direction}`}>
                  {row.delta == null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
