/**
 * Forecast lab — the prediction page, driven entirely by /datasets/{id}/forecast.
 *
 * What was broken: the stage trace said "completed" while `forecast_service`
 * only read forecasts, nothing generated them, and the reader skipped the one
 * series that existed (monthly rows keyed by `month`, not `timestamp`). The page
 * therefore showed "No forecast recorded yet" on a dataset that had a model, a
 * backtest and 5,400 readings.
 *
 * This view talks to the endpoints that now generate and serve real forecasts:
 *   GET  /datasets/{id}/forecast?horizon=   -> chart, KPIs, model, quality, versions
 *   POST /datasets/{id}/forecast            -> generate one horizon on demand
 *   GET  /datasets/{id}/forecast/history    -> version ledger
 *   POST /datasets/{id}/forecast/restore    -> make an earlier version current
 *
 * Every number below is read from that payload. The only client-side arithmetic
 * is formatting, chart shaping and the CSV/JSON export of the points on screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Download,
  Gauge,
  History,
  Layers3,
  Play,
  RefreshCw,
  Sparkles,
  Table2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { forecastApi, type ForecastDetail, type ForecastPoint } from "@/lib/api";
import "./forecast-lab.css";

type Props = {
  datasetId: string;
  datasetName: string;
  baselineName: string;
  modelName: string;
  onViewData?: () => void;
};

const HORIZONS = [
  { key: "1h", label: "Next hour" },
  { key: "6h", label: "6 h" },
  { key: "12h", label: "12 h" },
  { key: "24h", label: "24 h" },
  { key: "2d", label: "2 d" },
  { key: "7d", label: "7 d" },
  { key: "30d", label: "30 d" },
];

const num = (v: number | string | null | undefined, digits = 0) => {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: digits });
};

const clock = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const shortClock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function ForecastLab({ datasetId, datasetName, baselineName, modelName, onViewData }: Props) {
  const [horizon, setHorizon] = useState("30d");
  const [data, setData] = useState<ForecastDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<ForecastPoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await forecastApi.detail(datasetId, horizon);
      setData(res);
      setPage(0);
      setFocus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the forecast.");
    } finally {
      setLoading(false);
    }
  }, [datasetId, horizon]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await forecastApi.generate(datasetId, horizon);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forecast generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const restore = async (id: string) => {
    setGenerating(true);
    try {
      await forecastApi.restore(datasetId, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version.");
    } finally {
      setGenerating(false);
    }
  };

  const forecast = data?.forecast;
  const points = forecast?.points ?? [];
  const history = forecast?.history ?? [];
  const kpis = data?.kpis;

  const series = useMemo(() => {
    type Row = {
      t: string;
      observed?: number;
      forecast?: number;
      lower?: number;
      upper?: number;
      band?: number;
    };
    const rows: Row[] = [];
    for (const h of history.slice(-72)) {
      rows.push({ t: h.timestamp, observed: h.observed_kwh });
    }
    for (const p of points) {
      rows.push({
        t: p.timestamp,
        forecast: p.energy_kwh,
        lower: p.lower_kwh ?? undefined,
        upper: p.upper_kwh ?? undefined,
        band:
          p.lower_kwh != null && p.upper_kwh != null
            ? Math.max(0, p.upper_kwh - p.lower_kwh)
            : undefined,
      });
    }
    return rows;
  }, [history, points]);

  const nowMark = points[0]?.timestamp;

  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(points.length / pageSize));
  const pageRows = points.slice(page * pageSize, page * pageSize + pageSize);

  const exportPoints = (format: "csv" | "json") => {
    if (!points.length) return;
    const rows = points.map(p => ({
      timestamp: p.timestamp,
      prediction_kwh: p.energy_kwh,
      lower_kwh: p.lower_kwh,
      upper_kwh: p.upper_kwh,
      cost_inr: p.cost_inr,
      co2_kg: p.co2_kg,
      confidence_pct: p.confidence,
      tariff_band: p.tariff_band,
      temperature_c: p.temperature_c,
    }));
    const body =
      format === "json"
        ? JSON.stringify({ dataset: datasetName, horizon, model: data?.model, rows }, null, 2)
        : [
            "timestamp,prediction_kwh,lower_kwh,upper_kwh,cost_inr,co2_kg,confidence_pct,tariff_band,temperature_c",
            ...rows.map(r =>
              [r.timestamp, r.prediction_kwh, r.lower_kwh, r.upper_kwh, r.cost_inr, r.co2_kg, r.confidence_pct, r.tariff_band, r.temperature_c].join(","),
            ),
          ].join("\n");
    const url = URL.createObjectURL(
      new Blob([body], { type: format === "json" ? "application/json" : "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast-${horizon}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quality = data?.quality ?? {};

  return (
    <div className="view-content fl">
      <header className="fl-head">
        <div>
          <span className="section-eyebrow">FORECAST / {data?.horizon_label ?? horizon}</span>
          <h2>{forecast ? `${num(kpis?.energy_kwh)} kWh projected` : "No forecast recorded yet"}</h2>
          <p>
            {datasetName} · {data?.model?.algorithm ?? modelName} · {baselineName}
            {forecast?.method ? ` · ${forecast.method}` : ""}
          </p>
        </div>
        <div className="fl-head__actions">
          <div className="fl-horizons" role="group" aria-label="Forecast horizon">
            {HORIZONS.map(h => (
              <button
                type="button"
                key={h.key}
                className={horizon === h.key ? "is-on" : ""}
                aria-pressed={horizon === h.key}
                onClick={() => setHorizon(h.key)}
              >
                {h.label}
              </button>
            ))}
          </div>
          <button type="button" className="fl-primary" onClick={() => void generate()} disabled={generating}>
            {generating ? <RefreshCw size={14} className="fl-spin" /> : <Play size={14} />}
            {generating ? "Generating…" : forecast ? "Regenerate" : "Generate forecast"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="fl-error" role="alert">
          <AlertTriangle size={15} /> {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="panel fl-state"><RefreshCw size={15} className="fl-spin" /> Loading forecast…</div>
      ) : null}

      {!loading && data?.status === "missing" ? (
        <div className="panel fl-empty">
          <Layers3 size={20} />
          <div>
            <strong>{data.message}</strong>
            <p>
              The forecast needs a model selected by the previous stage. Generating one reads the
              fitted artifact (or retrains it from the same feature matrix), walks the horizon hour
              by hour and stores a new version — no placeholder is shown while that happens.
            </p>
            <button type="button" className="fl-primary" onClick={() => void generate()} disabled={generating}>
              {generating ? <RefreshCw size={14} className="fl-spin" /> : <Play size={14} />}
              {generating ? "Generating…" : "Generate forecast"}
            </button>
          </div>
        </div>
      ) : null}

      {forecast ? (
        <>
          <section className="fl-kpis" aria-label="Forecast KPIs">
            {[
              { label: "FORECAST ENERGY", value: `${num(kpis?.energy_kwh)} kWh`, tip: "Sum of the projected readings in this horizon." },
              { label: "FORECAST COST", value: `₹${num(kpis?.cost_inr)}`, tip: "Each hour priced at the tariff band it falls in." },
              { label: "FORECAST CARBON", value: `${num(kpis?.carbon_kg)} kg`, tip: "Projected kWh × the configured grid factor." },
              { label: "PEAK LOAD", value: `${num(kpis?.peak_kw, 1)} kW`, tip: `Highest hourly projection, at ${clock(kpis?.peak_at)}.` },
              { label: "AVERAGE LOAD", value: `${num(kpis?.avg_kw, 1)} kW`, tip: "Projected energy ÷ hours in the horizon." },
              { label: "WINDOW", value: kpis?.horizon_label ?? "—", tip: `${clock(kpis?.window_start)} → ${clock(kpis?.window_end)}` },
              { label: "CONFIDENCE", value: kpis?.confidence_pct != null ? `${kpis.confidence_pct}%` : "—", tip: "100 − the measured backtest MAPE." },
              { label: "MODEL", value: kpis?.model_version ?? "—", tip: "The selected model that produced this forecast." },
              { label: "GENERATED", value: clock(kpis?.generated_at), tip: `Version ${kpis?.version ?? "—"} of this horizon.` },
            ].map(k => (
              <div className="fl-kpi" key={k.label} title={k.tip}>
                <span>{k.label}</span>
                <strong>{k.value}</strong>
              </div>
            ))}
          </section>

          <section className="panel fl-chart-panel">
            <div className="fl-panel-head">
              <div>
                <h3>Observed history and projected load</h3>
                <p>
                  Green is recorded history, violet is the projection, the band is the residual range
                  from the held-out backtest. {forecast.devices?.length ?? 0} devices ·{" "}
                  {forecast.exogenous_assumption ?? "exogenous drivers held at their trailing mean"}.
                </p>
              </div>
              <div className="fl-chart-actions">
                <button type="button" className="fl-ghost" onClick={() => exportPoints("csv")}><Download size={13} /> CSV</button>
                <button type="button" className="fl-ghost" onClick={() => exportPoints("json")}><Download size={13} /> JSON</button>
              </div>
            </div>
            <div className="fl-chart">
              {series.length ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={series} margin={{ top: 16, right: 20, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="flBand" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8d86ff" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#8d86ff" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="t" tickFormatter={shortClock} minTickGap={44} tick={{ fontSize: 10, fill: "#7f9488" }} />
                    <YAxis width={64} tick={{ fontSize: 10, fill: "#7f9488" }} tickFormatter={v => num(Number(v))} />
                    <RechartsTooltip
                      contentStyle={{ background: "#0c1510", border: "1px solid rgba(255,255,255,0.12)", fontSize: 11 }}
                      labelFormatter={v => shortClock(String(v))}
                      formatter={(value: number | string, name: string) => [num(Number(value), 1), name]}
                    />
                    {nowMark ? <ReferenceLine x={nowMark} stroke="#5d7765" strokeDasharray="4 4" label={{ value: "now", fill: "#8fa79a", fontSize: 10 }} /> : null}
                    <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
                    <Area dataKey="band" stackId="band" stroke="none" fill="url(#flBand)" isAnimationActive={false} />
                    <Line dataKey="observed" dot={false} stroke="#b6f36b" strokeWidth={2} isAnimationActive={false} />
                    <Line dataKey="forecast" dot={false} stroke="#8d86ff" strokeWidth={2.2} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="mono-note">No points in this horizon.</p>
              )}
            </div>
            <div className="fl-legend">
              <span><i style={{ background: "#b6f36b" }} /> observed</span>
              <span><i style={{ background: "#8d86ff" }} /> forecast</span>
              <span><i style={{ background: "rgba(141,134,255,0.3)" }} /> confidence band</span>
              <span className="mono-note">Residual band ±{num(kpis?.band_width_pct, 1)}%</span>
            </div>
          </section>

          <div className="fl-grid2">
            <section className="panel">
              <div className="fl-panel-head"><h3>What moves the number</h3></div>
              <p className="fl-note">Feature importance from the fitted model; direction is the sign of the feature's correlation with the target in the recorded history.</p>
              <div className="fl-features">
                {(data.features ?? []).slice(0, 9).map(f => (
                  <div className="fl-feature" key={f.feature}>
                    <span className="fl-feature__name">{f.label}</span>
                    <div className="fl-feature__bar">
                      <i
                        className={f.direction === "negative" ? "is-neg" : ""}
                        style={{ width: `${Math.min(100, f.importance_pct ?? 0)}%` }}
                      />
                    </div>
                    <strong>{f.importance_pct != null ? `${f.importance_pct}%` : "—"}</strong>
                    <span className={`fl-dir fl-dir--${f.direction ?? "none"}`}>
                      {f.direction === "negative" ? <TrendingDown size={11} /> : f.direction === "positive" ? <TrendingUp size={11} /> : null}
                      {f.direction ?? "—"}
                    </span>
                  </div>
                ))}
                {!(data.features ?? []).length ? <p className="fl-note">No feature importance was recorded for this model.</p> : null}
              </div>
            </section>

            <section className="panel">
              <div className="fl-panel-head"><h3>Model and quality</h3></div>
              <div className="fl-kv">
                <span>Algorithm<strong>{data.model?.algorithm ?? "—"}</strong></span>
                <span>Version<strong>{data.model?.version ?? "—"}</strong></span>
                <span>Trained<strong>{clock(data.model?.trained_at)}</strong></span>
                <span>Training rows<strong>{num(data.model?.training_rows)}</strong></span>
                <span>Features<strong>{num(data.model?.feature_count)}</strong></span>
                <span>Artifact<strong>{data.model?.artifact_source ?? "—"}</strong></span>
                <span>Generation<strong>{data.generated_ms != null ? `${num(data.generated_ms)} ms` : "—"}</strong></span>
                <span>Prediction rows<strong>{num(points.length)}</strong></span>
              </div>
              <div className="fl-gauges">
                {[
                  ["MAPE", quality.mape != null ? `${num(quality.mape, 2)}%` : "—"],
                  ["RMSE", num(quality.rmse as number, 2)],
                  ["MAE", num(quality.mae as number, 2)],
                  ["R²", num(quality.r2 as number, 3)],
                  ["Trend acc.", quality.trend_accuracy != null ? `${num(quality.trend_accuracy as number, 1)}%` : "—"],
                  ["Bias", num(quality.bias as number, 2)],
                ].map(([label, value]) => (
                  <div className="fl-gauge" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="fl-note">Measured on the held-out tail of the history, not on the training rows.</p>
            </section>
          </div>

          <div className="fl-grid2">
            <section className="panel">
              <div className="fl-panel-head"><h3>Peaks in this horizon</h3></div>
              <div className="fl-kv">
                <span>Peak hour<strong>{clock(forecast.peaks.peak_hour as string)}</strong></span>
                <span>Peak load<strong>{num(forecast.peaks.peak_kwh as number, 1)} kWh</strong></span>
                <span>Lowest hour<strong>{clock(forecast.peaks.lowest_hour as string)}</strong></span>
                <span>Lowest load<strong>{num(forecast.peaks.lowest_kwh as number, 1)} kWh</strong></span>
                <span>Peak day<strong>{String(forecast.peaks.peak_day ?? "—")}</strong></span>
                <span>Mean<strong>{num(forecast.peaks.mean_kwh as number, 1)} kWh</strong></span>
              </div>
            </section>

            <section className="panel">
              <div className="fl-panel-head"><h3>Version history</h3></div>
              <div className="fl-history">
                {(data.history ?? []).slice(0, 6).map(v => (
                  <div className={`fl-history__row ${v.status === "current" ? "is-current" : ""}`} key={v.id}>
                    <span>v{v.version}</span>
                    <span>{clock(v.generated_at)}</span>
                    <span>{v.method}</span>
                    <span>{num(v.total_kwh)} kWh</span>
                    {v.status === "current" ? (
                      <strong><Check size={11} /> current</strong>
                    ) : (
                      <button type="button" className="fl-ghost" onClick={() => void restore(v.id)} disabled={generating}>
                        <History size={11} /> Restore
                      </button>
                    )}
                  </div>
                ))}
                {!(data.history ?? []).length ? <p className="fl-note">No versions recorded yet.</p> : null}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="fl-panel-head">
              <div>
                <h3>The horizon, hour by hour</h3>
                <p>Prediction, interval, cost and carbon for every projected reading.</p>
              </div>
              <div className="fl-chart-actions">
                <button type="button" className="fl-ghost" onClick={onViewData}><Table2 size={13} /> View processed data</button>
              </div>
            </div>
            <div className="fl-table">
              <div className="fl-table__head">
                <span>Timestamp</span><span>Prediction</span><span>Lower</span><span>Upper</span>
                <span>Cost</span><span>Carbon</span><span>Conf.</span><span>Band</span>
              </div>
              {pageRows.map(p => (
                <button
                  type="button"
                  className={`fl-table__row ${focus?.timestamp === p.timestamp ? "is-focus" : ""}`}
                  key={p.timestamp}
                  onClick={() => setFocus(p)}
                >
                  <span>{clock(p.timestamp)}</span>
                  <strong>{num(p.energy_kwh, 1)}</strong>
                  <span>{num(p.lower_kwh, 1)}</span>
                  <span>{num(p.upper_kwh, 1)}</span>
                  <span>₹{num(p.cost_inr)}</span>
                  <span>{num(p.co2_kg, 1)} kg</span>
                  <span>{p.confidence != null ? `${num(p.confidence, 0)}%` : "—"}</span>
                  <span>{p.tariff_band}</span>
                </button>
              ))}
            </div>
            <div className="fl-pager">
              <span>{points.length} projected readings · page {page + 1} / {pageCount}</span>
              <button type="button" className="fl-ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
              <button type="button" className="fl-ghost" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
            </div>
            {focus ? (
              <div className="fl-focus" aria-live="polite">
                <Sparkles size={13} />
                <span>
                  {clock(focus.timestamp)} · {num(focus.energy_kwh, 1)} kWh ({num(focus.lower_kwh, 1)}–{num(focus.upper_kwh, 1)})
                  · ₹{num(focus.cost_inr)} · {num(focus.co2_kg, 1)} kgCO₂ · confidence {num(focus.confidence, 0)}%
                  {focus.temperature_c != null ? ` · ${num(focus.temperature_c, 1)}°C` : ""} · {focus.tariff_band}
                </span>
              </div>
            ) : null}
          </section>

          <div className="fl-foot">
            <span><Gauge size={13} /> {num(kpis?.version)} version · {clock(kpis?.generated_at)}</span>
            <span className="mono-note"><ArrowUpRight size={12} /> {datasetName}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
