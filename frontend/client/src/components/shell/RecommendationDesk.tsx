/**
 * Recommendation decision desk.
 *
 * The page used to render cards from the workspace snapshot and its buttons only
 * played a sound: an approval was never recorded, a filter never reached the
 * server, and a re-run reset every card. This view is driven by the decision API
 * (`/datasets/{id}/recommendations`), so every figure, action and export below is
 * a recorded backend fact:
 *
 *   list + KPI summary   -> the stored Recommendation rows for this dataset
 *   Approve/Reject/...   -> POST .../status, appended to the row's audit trail
 *   Assign               -> POST .../assign (owner, department, due date, notes)
 *   Simulator            -> POST .../simulate, arithmetic on the stored saving
 *   Export               -> GET .../export/all as CSV or JSON
 *
 * Nothing is computed here that the backend did not measure: the component only
 * formats, filters (server-side) and lays out.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Gauge,
  Lightbulb,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  UserRound,
  X,
} from "lucide-react";
import {
  recommendationsApi,
  type RecCard,
  type RecDetail,
  type RecListResponse,
} from "@/lib/api";
import "./recommendation-desk.css";

type Props = {
  datasetId: string;
  datasetName: string;
  baselineName: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "New",
  approved: "Approved",
  rejected: "Rejected",
  assigned: "Assigned",
  scheduled: "Scheduled",
  completed: "Implemented",
  ignored: "Ignored",
};

const ACTION_FOR_STATUS: Record<string, string> = {
  approved: "Approve",
  rejected: "Reject",
  completed: "Mark implemented",
  ignored: "Ignore",
};

const money = (symbol: string, value: number | null | undefined) =>
  value == null ? "—" : `${symbol}${Math.round(value).toLocaleString("en-IN")}`;

const num = (value: number | null | undefined, digits = 0) =>
  value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });

const clock = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export function RecommendationDesk({ datasetId, datasetName, baselineName }: Props) {
  const [data, setData] = useState<RecListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("priority");

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const [sim, setSim] = useState({ load: 100, hours: 100, implementation: 100, holiday: false, weekend: false });
  const [simResult, setSimResult] = useState<Record<string, number | null> | null>(null);

  const [assign, setAssign] = useState({ engineer: "", department: "", due_date: "", comments: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await recommendationsApi.list(datasetId, { priority, status, search, sort });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load recommendations.");
    } finally {
      setLoading(false);
    }
  }, [datasetId, priority, status, search, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const rows = data?.recommendations ?? [];
  const symbol = summary?.currency_symbol ?? "₹";

  const open = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setSimResult(null);
    setDetailBusy(true);
    try {
      const res = await recommendationsApi.detail(datasetId, id);
      setDetail(res);
      setSim({ load: 100, hours: 100, implementation: 100, holiday: false, weekend: false });
      setAssign({
        engineer: String(res.assignment?.engineer ?? ""),
        department: String(res.assignment?.department ?? ""),
        due_date: String(res.assignment?.due_date ?? ""),
        comments: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this recommendation.");
    } finally {
      setDetailBusy(false);
    }
  };

  const applyStatus = async (id: string, next: string) => {
    setBusy(id);
    try {
      await recommendationsApi.setStatus(datasetId, id, next);
      await load();
      if (openId === id) await open(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this recommendation.");
    } finally {
      setBusy(null);
    }
  };

  const submitAssignment = async () => {
    if (!openId || !assign.engineer.trim()) return;
    setBusy(openId);
    try {
      await recommendationsApi.assign(datasetId, openId, {
        engineer: assign.engineer,
        department: assign.department,
        due_date: assign.due_date,
        comments: assign.comments,
      });
      await load();
      await open(openId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this recommendation.");
    } finally {
      setBusy(null);
    }
  };

  const runSimulation = async () => {
    if (!openId) return;
    setBusy(openId);
    try {
      const res = await recommendationsApi.simulate(datasetId, openId, {
        load_pct: sim.load,
        working_hours: sim.hours,
        implementation_pct: sim.implementation,
        holiday: sim.holiday,
        weekend: sim.weekend,
      });
      setSimResult(res.projected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setBusy(null);
    }
  };

  const matrix = useMemo(() => {
    const points = data?.priority_matrix ?? [];
    const maxImpact = Math.max(1, ...points.map(p => p.impact_inr ?? 0));
    const maxEffort = Math.max(1, ...points.map(p => p.effort_inr ?? 0));
    return points.map(p => ({
      ...p,
      x: Math.min(96, ((p.effort_inr ?? 0) / maxEffort) * 92 + 4),
      y: Math.min(92, 100 - ((p.impact_inr ?? 0) / maxImpact) * 88),
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="view-content">
        <div className="panel desk-state">
          <RefreshCw size={16} className="desk-spin" />
          <span>Loading recorded recommendations for {datasetName}…</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="view-content">
        <div className="panel desk-state desk-state--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }

  if (data?.status === "empty") {
    return (
      <div className="view-content">
        <div className="panel desk-state">
          <Lightbulb size={18} />
          <div>
            <strong>No recommendations recorded for this dataset.</strong>
            <p>{data.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-content desk">
      <header className="desk-head">
        <div>
          <span className="section-eyebrow">DECISION SUPPORT</span>
          <h2>{summary?.active ?? 0} actions are worth your attention.</h2>
          <p>
            Generated from recorded anomalies, the {baselineName} baseline and this dataset&apos;s forecast —
            {" "}{summary?.total ?? 0} recommendations across {summary?.devices_affected ?? 0} meters.
          </p>
        </div>
        <div className="desk-head__impact">
          <span>EXPECTED MONTHLY RECOVERY</span>
          <strong>{money(symbol, summary?.savings_cost_inr)}</strong>
          <span>{num(summary?.savings_co2_kg)} kgCO₂ · {num(summary?.savings_kwh)} kWh</span>
        </div>
      </header>

      <section className="desk-kpis" aria-label="Recommendation KPIs">
        {[
          { label: "ACTIVE", value: num(summary?.active), note: `${summary?.closed ?? 0} closed`, tip: "Recommendations not yet rejected, completed or ignored." },
          { label: "CRITICAL", value: num(summary?.critical), note: "P1 band", tip: "Top-ranked recoverable value in this dataset." },
          { label: "ENERGY", value: `${num(summary?.savings_kwh)} kWh`, note: "recoverable", tip: "Recoverable excess energy across active actions." },
          { label: "COST", value: money(symbol, summary?.savings_cost_inr), note: "over detected window", tip: "Recoverable rupees at the tariff recorded for those hours." },
          { label: "CARBON", value: `${num(summary?.savings_co2_kg)} kg`, note: "kgCO₂", tip: "Recoverable kWh × the configured grid factor." },
          { label: "CONFIDENCE", value: summary?.avg_confidence_pct != null ? `${summary.avg_confidence_pct}%` : "—", note: "average", tip: "Mean of the recorded per-recommendation confidence." },
          { label: "ROI", value: summary?.avg_roi_pct != null ? `${summary.avg_roi_pct}%` : "—", note: "cost vs recovery", tip: "(Recoverable value − implementation cost) ÷ implementation cost." },
          { label: "PAYBACK", value: summary?.avg_payback_months != null ? `${summary.avg_payback_months} mo` : "—", note: "average", tip: "Implementation cost ÷ window-normalised monthly recovery." },
        ].map(kpi => (
          <div className="desk-kpi" key={kpi.label} title={kpi.tip}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.note}</small>
          </div>
        ))}
      </section>

      <div className="desk-toolbar">
        <label className="desk-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search title, device, category"
            value={search}
            aria-label="Search recommendations"
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <label className="desk-field">
          <SlidersHorizontal size={13} />
          <select aria-label="Filter by priority" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="">All priorities</option>
            {(Object.keys(data?.facets?.priority ?? { P1: 0, P2: 0, P3: 0 })).map(p => (
              <option key={p} value={p}>{p} ({data?.facets?.priority?.[p] ?? 0})</option>
            ))}
          </select>
        </label>
        <label className="desk-field">
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(data?.statuses ?? []).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
            ))}
          </select>
        </label>
        <label className="desk-field">
          <select aria-label="Sort recommendations" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="priority">Priority</option>
            <option value="savings">Savings</option>
            <option value="confidence">Confidence</option>
            <option value="payback">Payback</option>
            <option value="recent">Recently changed</option>
          </select>
        </label>
        <button type="button" className="desk-ghost" onClick={() => { setSearch(""); setPriority(""); setStatus(""); setSort("priority"); }}>
          Clear
        </button>
        <span className="desk-count">{data?.filtered ?? 0} of {summary?.total ?? 0}</span>
        <a className="desk-export" href={recommendationsApi.exportUrl(datasetId, "csv")} download>
          <Download size={13} /> CSV
        </a>
        <a className="desk-export" href={recommendationsApi.exportUrl(datasetId, "json")} download>
          <Download size={13} /> JSON
        </a>
      </div>

      {error ? <div className="desk-inline-error" role="alert">{error}</div> : null}

      <div className="desk-layout">
        <div className="desk-list">
          {!rows.length ? (
            <div className="panel desk-state">
              <Lightbulb size={16} />
              <span>No recommendation matches these filters.</span>
            </div>
          ) : null}

          {rows.map(rec => (
            <article className={`desk-card desk-card--${rec.priority.toLowerCase()}`} key={rec.id}>
              <div className="desk-card__top">
                <span className={`desk-pill desk-pill--${rec.priority.toLowerCase()}`}>{rec.priority}</span>
                <span className={`desk-status desk-status--${rec.status}`}>{STATUS_LABEL[rec.status] ?? rec.status}</span>
                {rec.severity ? <span className="desk-sev">severity · {rec.severity}</span> : null}
                <span className="desk-conf">confidence {Math.round((rec.confidence ?? 0) * 100)}%</span>
              </div>

              <h3>{rec.title}</h3>
              <p className="desk-reason">{rec.reason}</p>

              <div className="desk-metrics">
                <span><small>ENERGY</small><strong>{num(rec.savings_kwh)} kWh</strong></span>
                <span><small>COST</small><strong>{money(symbol, rec.savings_cost_inr)}</strong></span>
                <span><small>CARBON</small><strong>{num(rec.savings_co2_kg)} kg</strong></span>
                <span><small>MONTHLY</small><strong>{money(symbol, rec.monthly_savings_inr)}</strong></span>
                <span><small>PAYBACK</small><strong>{rec.payback_months != null ? `${rec.payback_months} mo` : "—"}</strong></span>
                <span><small>DEVICE</small><strong>{rec.device_code}</strong></span>
                <span><small>LOCATION</small><strong>{[rec.building_code, rec.floor_no, rec.room_code].filter(Boolean).join(" / ") || "—"}</strong></span>
                <span><small>EVIDENCE</small><strong>{rec.anomaly_count ?? 0} readings</strong></span>
              </div>

              <div className="desk-card__actions">
                <button type="button" className="desk-primary" onClick={() => void open(rec.id)}>
                  <Sparkles size={13} /> View details
                </button>
                {(["approved", "completed", "ignored"] as const).map(next => (
                  <button
                    type="button"
                    key={next}
                    className="desk-action"
                    disabled={busy === rec.id || rec.status === next}
                    onClick={() => void applyStatus(rec.id, next)}
                  >
                    <Check size={13} /> {ACTION_FOR_STATUS[next]}
                  </button>
                ))}
                <button
                  type="button"
                  className="desk-action desk-action--danger"
                  disabled={busy === rec.id || rec.status === "rejected"}
                  onClick={() => void applyStatus(rec.id, "rejected")}
                >
                  <X size={13} /> Reject
                </button>
              </div>
              {rec.assignment?.engineer ? (
                <div className="desk-assigned">
                  <UserRound size={12} /> {rec.assignment.engineer}
                  {rec.assignment.due_date ? ` · due ${rec.assignment.due_date}` : ""}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <aside className="desk-aside">
          <section className="panel">
            <div className="desk-aside__head">
              <Gauge size={15} />
              <strong>Priority matrix</strong>
            </div>
            <p className="desk-aside__note">Impact vs implementation cost, from the recorded rows.</p>
            <div className="desk-matrix" role="img" aria-label="Recommendations plotted by impact and effort">
              {matrix.map(point => (
                <button
                  type="button"
                  key={point.id}
                  className={`desk-dot desk-dot--${point.priority.toLowerCase()}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title={`${point.title} · ${money(symbol, point.impact_inr)} impact · ${point.effort_inr == null ? "no cost estimate" : money(symbol, point.effort_inr)} effort`}
                  aria-label={`${point.title}, impact ${money(symbol, point.impact_inr)}`}
                  onClick={() => void open(point.id)}
                />
              ))}
              <span className="desk-axis desk-axis--x">effort →</span>
              <span className="desk-axis desk-axis--y">impact →</span>
            </div>
          </section>

          <section className="panel">
            <div className="desk-aside__head">
              <ShieldAlert size={15} />
              <strong>Human in the loop</strong>
            </div>
            <p className="desk-aside__note">
              Approvals, assignments and completions are written to this recommendation&apos;s own
              audit trail. Re-running the pipeline carries the latest decision forward instead of
              resetting the card.
            </p>
            <div className="desk-aside__meta">
              <span>Dataset</span>
              <strong>{datasetName}</strong>
            </div>
            <div className="desk-aside__meta">
              <span>Baseline</span>
              <strong>{baselineName}</strong>
            </div>
          </section>
        </aside>
      </div>

      {openId ? (
        <div className="desk-drawer" role="dialog" aria-modal="true" aria-label="Recommendation details">
          <div className="desk-drawer__backdrop" onClick={() => setOpenId(null)} />
          <div className="desk-drawer__panel">
            <div className="desk-drawer__head">
              <div>
                <span className="section-eyebrow">RECOMMENDATION {openId.slice(0, 8)}</span>
                <h3>{detail?.recommendation.title ?? "Loading…"}</h3>
              </div>
              <button type="button" className="desk-ghost" onClick={() => setOpenId(null)} aria-label="Close details">
                <X size={16} />
              </button>
            </div>

            {detailBusy && !detail ? <p className="desk-aside__note">Loading recorded evidence…</p> : null}

            {detail ? (
              <div className="desk-drawer__body">
                <section>
                  <h4>Problem</h4>
                  <p>{String(detail.problem.summary ?? "")}</p>
                  <p className="desk-aside__note">{String(detail.problem.root_cause ?? "")}</p>
                </section>

                <section>
                  <h4>Root causes</h4>
                  {detail.root_causes.length ? (
                    detail.root_causes.map(cause => (
                      <div className="desk-cause" key={cause.factor}>
                        <span>{cause.factor}</span>
                        <div className="desk-cause__bar">
                          <i style={{ width: `${cause.contribution_pct ?? 0}%` }} />
                        </div>
                        <strong>{cause.contribution_pct != null ? `${cause.contribution_pct}%` : "—"}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="desk-aside__note">No classified causes were recorded for these readings.</p>
                  )}
                </section>

                <section>
                  <h4>Evidence · {detail.evidence.anomaly_count} cited readings</h4>
                  <div className="desk-anoms">
                    {detail.evidence.anomalies.slice(0, 6).map(a => (
                      <div key={a.id}>
                        <span>{clock(a.timestamp)}</span>
                        <span>{a.class}</span>
                        <span>{a.severity}</span>
                        <span>{a.deviation_pct != null ? `${a.deviation_pct.toFixed(1)}%` : "—"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="desk-aside__note">{detail.evidence.forecast_basis}</p>
                </section>

                <section>
                  <h4>Financials</h4>
                  <div className="desk-grid2">
                    <span>Implementation cost<strong>{money(String(detail.financials.currency_symbol ?? symbol), Number(detail.financials.implementation_cost_inr ?? 0))}</strong></span>
                    <span>Monthly saving<strong>{money(symbol, Number(detail.financials.monthly_saving_inr ?? 0))}</strong></span>
                    <span>Annual saving<strong>{money(symbol, Number(detail.financials.annual_saving_inr ?? 0))}</strong></span>
                    <span>Net (year 1)<strong>{money(symbol, Number(detail.financials.net_saving_inr ?? 0))}</strong></span>
                    <span>Payback<strong>{detail.financials.payback_months != null ? `${detail.financials.payback_months} mo` : "—"}</strong></span>
                    <span>Verdict<strong>{String(detail.financials.payback_verdict ?? "—")}</strong></span>
                  </div>
                </section>

                <section>
                  <h4>Implementation</h4>
                  <ol className="desk-steps">
                    {detail.implementation.steps.map(step => <li key={step}>{step}</li>)}
                  </ol>
                  <p className="desk-aside__note">Rollback: {detail.implementation.rollback}</p>
                </section>

                <section>
                  <h4>Simulate impact</h4>
                  <div className="desk-sim">
                    {([
                      ["load", "Load %"],
                      ["hours", "Working hours %"],
                      ["implementation", "Implementation %"],
                    ] as const).map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <input
                          type="range"
                          min={0}
                          max={150}
                          value={sim[key]}
                          aria-label={label}
                          onChange={e => setSim(s => ({ ...s, [key]: Number(e.target.value) }))}
                        />
                        <strong>{sim[key]}%</strong>
                      </label>
                    ))}
                    <label className="desk-check">
                      <input type="checkbox" checked={sim.holiday} onChange={e => setSim(s => ({ ...s, holiday: e.target.checked }))} />
                      Holiday week
                    </label>
                    <label className="desk-check">
                      <input type="checkbox" checked={sim.weekend} onChange={e => setSim(s => ({ ...s, weekend: e.target.checked }))} />
                      Weekend operation
                    </label>
                  </div>
                  <button type="button" className="desk-primary" onClick={() => void runSimulation()} disabled={busy === openId}>
                    <TrendingDown size={13} /> Recalculate
                  </button>
                  {simResult ? (
                    <div className="desk-grid2">
                      <span>Energy saved<strong>{num(simResult.energy_saved_kwh, 1)} kWh</strong></span>
                      <span>Money saved<strong>{money(symbol, simResult.money_saved_inr)}</strong></span>
                      <span>Carbon saved<strong>{num(simResult.carbon_saved_kg, 1)} kg</strong></span>
                      <span>Annual<strong>{money(symbol, simResult.annual_saving_inr)}</strong></span>
                      <span>ROI<strong>{simResult.roi_pct != null ? `${simResult.roi_pct}%` : "—"}</strong></span>
                      <span>Payback<strong>{simResult.payback_months != null ? `${simResult.payback_months} mo` : "—"}</strong></span>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h4>Assign</h4>
                  <div className="desk-assign">
                    <input placeholder="Engineer" value={assign.engineer} onChange={e => setAssign(a => ({ ...a, engineer: e.target.value }))} aria-label="Engineer" />
                    <input placeholder="Department" value={assign.department} onChange={e => setAssign(a => ({ ...a, department: e.target.value }))} aria-label="Department" />
                    <input type="date" value={assign.due_date} onChange={e => setAssign(a => ({ ...a, due_date: e.target.value }))} aria-label="Due date" />
                    <input placeholder="Comments" value={assign.comments} onChange={e => setAssign(a => ({ ...a, comments: e.target.value }))} aria-label="Comments" />
                    <button type="button" className="desk-primary" onClick={() => void submitAssignment()} disabled={!assign.engineer.trim() || busy === openId}>
                      <UserRound size={13} /> Assign
                    </button>
                  </div>
                  <p className="desk-aside__note">
                    Risk: {detail.risk.level} — {detail.risk.note}
                  </p>
                </section>

                <section>
                  <h4>Timeline</h4>
                  <ul className="desk-timeline">
                    {detail.timeline.map((event, i) => (
                      <li key={`${event.event}-${i}`}>
                        <strong>{event.event}</strong>
                        <span>{event.detail ?? ""}</span>
                        <small>{clock(event.at)}{event.by ? ` · ${event.by}` : ""}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="desk-foot">
        <span><Check size={13} /> Every action above is written to the backend audit trail.</span>
        <span className="mono-note">
          <ChevronDown size={12} /> {data?.filtered ?? 0} shown · dataset {datasetId.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
