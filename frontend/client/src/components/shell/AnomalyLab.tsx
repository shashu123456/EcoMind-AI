import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  Brush,
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
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  Flame,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import "./anomaly-lab.css";
import type { LiveAnomaly, LiveAnomalyMeta, LiveAnomalyPoint, LiveWindowOption } from "@/lib/workspace";

/* ────────────────────────────────────────────────────────────────────────────
 * Anomaly investigation workspace.
 *
 * Every figure comes from the anomaly stage's recorded points and aggregates.
 * Ranked causes, distributions and contribution bars are computed from those
 * records and labelled as derived; nothing here re-runs detection.
 * ──────────────────────────────────────────────────────────────────────────── */

type Props = {
  window: string;
  setWindow: (value: string) => void;
  windowOptions: LiveWindowOption[];
  points: LiveAnomalyPoint[];
  anomalies: LiveAnomaly[];
  meta: LiveAnomalyMeta | null;
  pinned: LiveAnomalyPoint | null;
  onInspectPoint: (point: LiveAnomalyPoint) => void;
  onClearPoint: () => void;
  onInspect: (anomaly: LiveAnomaly) => void;
  datasetName: string;
  datasetId: string;
  domainLabel: string;
  baselineName: string;
  unit: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "#f07f6e",
  high: "#f5a56d",
  medium: "#e6ca78",
  low: "#79d6c4",
};
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_ORDER = ["critical", "high", "medium", "low"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const num = (n: number | null | undefined, d = 1): string =>
  n == null || !isFinite(n) ? "—" : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(d);

const clockOf = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const dayOf = (iso: string): number => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : (d.getDay() + 6) % 7;
};
const hourOf = (iso: string): number => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getHours();
};

function useCounter(value: number, duration = 760): number {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (!isFinite(value)) return;
    const from = fromRef.current;
    if (from === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    let settled = false;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        settled = true;
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      fromRef.current = value;
      setShown(value);
    }, duration + 160);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value, duration]);
  return shown;
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`al-tag al-tag--${tone}`}>{children}</span>;
}

function Kpi({ label, value, hint, explain }: { label: string; value: string; hint?: string; explain: string }) {
  return (
    <div className="al-kpi" tabIndex={0}>
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
      <div className="al-kpi__pop">{explain}</div>
    </div>
  );
}

function PointTip({ point, unit }: { point: LiveAnomalyPoint; unit: string }) {
  return (
    <div className="al-tip">
      <strong>{clockOf(point.timestamp)}</strong>
      <div className="al-tip__grid">
        <span><small>OBSERVED</small>{num(point.observed_energy_kwh)} {unit}</span>
        <span><small>BASELINE</small>{num(point.baseline_energy_kwh)} {unit}</span>
        <span><small>DEVIATION</small>{num(point.deviation_percent)}%</span>
        <span><small>SEVERITY</small>{point.severity || "normal"}</span>
        <span><small>TYPE</small>{point.anomaly_type || "—"}</span>
        <span><small>CONFIDENCE</small>{point.confidence != null ? point.confidence.toFixed(2) : "—"}</span>
        <span><small>DEVICE</small>{point.device_name || point.device_code || "—"}</span>
        <span><small>LOCATION</small>{point.building_code || point.zone || "—"}</span>
        <span><small>WEEKDAY</small>{WEEKDAYS[dayOf(point.timestamp)]} {String(hourOf(point.timestamp)).padStart(2, "0")}:00</span>
        <span><small>PREDICTED</small>{point.predicted_energy_kwh != null ? num(point.predicted_energy_kwh) : "—"}</span>
        <span><small>BASELINE VER.</small>{point.baseline_version != null ? `v${point.baseline_version}` : "—"}</span>
        <span><small>MODEL</small>{point.model_name || "—"}</span>
      </div>
    </div>
  );
}

export function AnomalyLab({
  window,
  setWindow,
  windowOptions,
  points,
  anomalies,
  meta,
  pinned,
  onInspectPoint,
  onClearPoint,
  onInspect,
  datasetName,
  datasetId,
  domainLabel,
  baselineName,
  unit,
}: Props) {
  const [hover, setHover] = useState<LiveAnomalyPoint | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [sevFilter, setSevFilter] = useState<string[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<string[]>([]);
  const [weekdayFilter, setWeekdayFilter] = useState<number | null>(null);
  const [hourFilter, setHourFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"severity" | "time" | "deviation">("severity");
  const [page, setPage] = useState(0);
  const [showCols, setShowCols] = useState({ type: true, cost: true, confidence: true });
  const [compare, setCompare] = useState({ observed: true, baseline: true, predicted: false });
  const [rowOpen, setRowOpen] = useState<string | null>(null);
  const chartWrap = useRef<HTMLDivElement | null>(null);

  const activeWindow = windowOptions.find(o => o.id === window) ?? windowOptions[windowOptions.length - 1] ?? null;
  const series = useMemo(
    () => (activeWindow ? points.slice(-activeWindow.points) : points),
    [points, activeWindow]
  );

  const anomalyTotal = meta?.total ?? anomalies.length;
  const criticalHigh = (meta?.severity?.critical ?? 0) + (meta?.severity?.high ?? 0);
  const flagged = useMemo(() => series.filter(p => p.severity), [series]);

  const energyLoss = useMemo(
    () => flagged.reduce((n, p) => n + Math.max(0, p.observed_energy_kwh - p.baseline_energy_kwh), 0),
    [flagged]
  );
  const maxDeviation = flagged.length ? Math.max(...flagged.map(p => Math.abs(p.deviation_percent))) : null;
  const avgDeviation = flagged.length ? flagged.reduce((n, p) => n + Math.abs(p.deviation_percent), 0) / flagged.length : null;
  const topSeverity = SEV_ORDER.find(s => (meta?.severity?.[s] ?? 0) > 0) ?? "—";

  const deviceCounts = useMemo(() => {
    const map = new Map<string, { device: string; count: number; loss: number; cost: number; maxSev: number; devSum: number }>();
    flagged.forEach(p => {
      const key = p.device_name || p.device_code || "unknown";
      const row = map.get(key) ?? { device: key, count: 0, loss: 0, cost: 0, maxSev: 0, devSum: 0 };
      row.count += 1;
      row.loss += Math.max(0, p.observed_energy_kwh - p.baseline_energy_kwh);
      row.maxSev = Math.max(row.maxSev, SEV_RANK[p.severity] ?? 0);
      row.devSum += Math.abs(p.deviation_percent);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [flagged]);

  const weekdayCounts = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => 0);
    flagged.forEach(p => { counts[dayOf(p.timestamp)] += 1; });
    return counts;
  }, [flagged]);

  const mostAffectedDevice = deviceCounts[0]?.device ?? "—";
  const mostAffectedDay = weekdayCounts.some(v => v > 0)
    ? WEEKDAYS[weekdayCounts.indexOf(Math.max(...weekdayCounts))]
    : "—";
  const timeRange = useMemo(() => {
    if (!series.length) return "—";
    const first = series[0]?.timestamp;
    const last = series[series.length - 1]?.timestamp;
    if (!first || !last) return "—";
    const d = new Date(last).getTime() - new Date(first).getTime();
    const hours = Math.round(d / 3_600_000);
    return `${clockOf(first)} → ${clockOf(last)} · ${hours}h`;
  }, [series]);

  const animTotal = useCounter(anomalyTotal);
  const animRate = useCounter(meta?.ratePct ?? 0);
  const animLoss = useCounter(energyLoss);
  const animCost = useCounter(meta?.excessCost ?? 0);

  /* Filters applied to the chart and the table. */
  const filtered = useMemo(
    () =>
      series.filter(p => {
        if (sevFilter.length && !sevFilter.includes(p.severity)) return false;
        if (deviceFilter.length && !deviceFilter.includes(p.device_name || p.device_code || "unknown")) return false;
        if (weekdayFilter != null && dayOf(p.timestamp) !== weekdayFilter) return false;
        if (hourFilter != null && hourOf(p.timestamp) !== hourFilter) return false;
        return true;
      }),
    [series, sevFilter, deviceFilter, weekdayFilter, hourFilter]
  );

  const chartData = useMemo(
    () =>
      filtered.map(p => ({
        ...p,
        critical: p.severity === "critical" ? p.observed_energy_kwh : null,
        high: p.severity === "high" ? p.observed_energy_kwh : null,
        medium: p.severity === "medium" ? p.observed_energy_kwh : null,
        low: p.severity === "low" ? p.observed_energy_kwh : null,
        predicted: compare.predicted ? p.predicted_energy_kwh : null,
      })),
    [filtered, compare.predicted]
  );

  const view = range ? chartData.slice(range[0], range[1] + 1) : chartData;

  // Wheel-zoom is bound natively: React attaches wheel listeners as passive, so
  // calling preventDefault from an onWheel prop is ignored and the page scrolls
  // while the chart zooms.
  useEffect(() => {
    const el = chartWrap.current;
    if (!el || !chartData.length) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [s, en] = range ?? [0, chartData.length - 1];
      const span = Math.max(6, en - s);
      const delta = e.deltaY > 0 ? Math.round(span * 0.15) : -Math.round(span * 0.15);
      const next: [number, number] = [Math.max(0, Math.min(chartData.length - 6, s + delta)), Math.min(chartData.length - 1, Math.max(s + 6, en - delta))];
      setRange(next[0] === 0 && next[1] === chartData.length - 1 ? null : next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [chartData.length, range]);

  const selectedPoint = pinned ?? hover ?? [...view].filter(p => p.severity).sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0] ?? view[0] ?? null;
  const selectedIndex = selectedPoint ? view.findIndex(p => p.timestamp === selectedPoint.timestamp) : -1;

  const jump = (delta: number) => {
    if (selectedIndex < 0) return;
    const next = view[selectedIndex + delta];
    if (next) onInspectPoint(next);
  };

  const exportIncident = () => {
    if (!selectedPoint) return;
    const blob = new Blob([JSON.stringify(selectedPoint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-${selectedPoint.timestamp.replace(/[^0-9]/g, "").slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Root causes derived from what was actually recorded. */
  const causes = useMemo(() => {
    if (!flagged.length) return [];
    const weekend = flagged.filter(p => dayOf(p.timestamp) >= 5).length;
    const evening = flagged.filter(p => hourOf(p.timestamp) >= 18 || hourOf(p.timestamp) < 6).length;
    const positive = flagged.filter(p => p.deviation_percent > 0).length;
    const types = new Map<string, number>();
    flagged.forEach(p => types.set(p.anomaly_type || "unclassified", (types.get(p.anomaly_type || "unclassified") ?? 0) + 1));
    const topType = [...types.entries()].sort((a, b) => b[1] - a[1])[0];
    const list = [
      { label: "Weekend operation mismatch", count: weekend, note: "anomalies falling on Sat/Sun" },
      { label: "Out-of-hours operation", count: evening, note: "outside 06:00–18:00" },
      { label: "Consumption above baseline", count: positive, note: "positive deviation readings" },
      { label: topType ? `Detected class · ${topType[0]}` : "Detected class", count: topType?.[1] ?? 0, note: "most frequent recorded class" },
      { label: mostAffectedDevice !== "—" ? `Device concentration · ${mostAffectedDevice}` : "Device concentration", count: deviceCounts[0]?.count ?? 0, note: "readings on the busiest device" },
    ].filter(c => c.count > 0);
    const max = Math.max(1, ...list.map(c => c.count));
    return list.map(c => ({ ...c, pct: (c.count / max) * 100, share: (c.count / flagged.length) * 100 }));
  }, [flagged, deviceCounts, mostAffectedDevice]);

  const insight = useMemo(() => {
    if (!flagged.length) return "No anomalies are recorded for this window, so there is nothing to summarise.";
    const domHour = Array.from({ length: 24 }, (_, h) => ({ h, n: flagged.filter(p => hourOf(p.timestamp) === h).length })).sort((a, b) => b.n - a.n)[0];
    const avgSigned = flagged.reduce((n, p) => n + p.deviation_percent, 0) / flagged.length;
    return `Most anomalies occurred on ${mostAffectedDay}s around ${String(domHour.h).padStart(2, "0")}:00, concentrated on ${mostAffectedDevice}. Average deviation was ${avgSigned >= 0 ? "+" : ""}${avgSigned.toFixed(1)}%, ${avgSigned > 0 ? "indicating recurring excess consumption" : "indicating recurring shortfall against the baseline"}.`;
  }, [flagged, mostAffectedDay, mostAffectedDevice]);

  /* Historical comparison: the previous window of equal length, from the same series. */
  const compareData = useMemo(() => {
    const half = Math.floor(series.length / 2);
    const prev = series.slice(0, half);
    const curr = series.slice(half);
    return curr.slice(0, 120).map((p, i) => ({
      time: clockOf(p.timestamp),
      observed: p.observed_energy_kwh,
      previous: prev[i]?.observed_energy_kwh ?? null,
      baseline: p.baseline_energy_kwh,
    }));
  }, [series]);

  /* Table rows: the anomaly queue plus any flagged point. */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = flagged.filter(p => (q ? `${p.device_name} ${p.device_code} ${p.anomaly_type} ${p.severity} ${p.timestamp}`.toLowerCase().includes(q) : true));
    const sorted = [...base];
    if (sortKey === "severity") sorted.sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0));
    else if (sortKey === "deviation") sorted.sort((a, b) => Math.abs(b.deviation_percent) - Math.abs(a.deviation_percent));
    else sorted.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return sorted;
  }, [flagged, search, sortKey]);

  const PAGE = 8;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE, currentPage * PAGE + PAGE);

  const exportCsv = () => {
    const head = "timestamp,severity,type,device,building,observed,baseline,deviation_pct,confidence\n";
    const body = rows.map(p => [p.timestamp, p.severity, p.anomaly_type, p.device_name || p.device_code, p.building_code, p.observed_energy_kwh, p.baseline_energy_kwh, p.deviation_percent, p.confidence ?? ""].join(",")).join("\n");
    const blob = new Blob([head + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anomaly-queue.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ dataset: datasetName, window: activeWindow?.label ?? window, total: anomalyTotal, rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anomaly-queue.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setSevFilter([]);
    setDeviceFilter([]);
    setWeekdayFilter(null);
    setHourFilter(null);
    setSearch("");
    setRange(null);
  };

  const activeFilters = sevFilter.length + deviceFilter.length + (weekdayFilter != null ? 1 : 0) + (hourFilter != null ? 1 : 0);

  return (
    <div className="view-content al-page">
      {/* Header ------------------------------------------------------- */}
      <div className="al-header">
        <div>
          <div className="al-live">
            <span className={`al-live__dot ${anomalyTotal ? "al-live__dot--on" : ""}`} />
            <span>{anomalyTotal ? "DETECTION RECORDED" : "AWAITING STAGE 07"}</span>
            <span className="al-live__sep" />
            <span className="mono-note">{datasetName} · {domainLabel}</span>
          </div>
          <h2>{anomalyTotal ? `${anomalyTotal} event${anomalyTotal === 1 ? "" : "s"} broke the pattern.` : "No anomalies recorded."}</h2>
          <p>Deviation from the adaptive baseline, with the evidence behind every flag.</p>
        </div>
        {windowOptions.length ? (
          <div className="segmented-control">
            {windowOptions.map(o => (
              <button type="button" key={o.id} className={activeWindow?.id === o.id ? "active" : ""} title={o.detail} onClick={() => setWindow(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* KPIs --------------------------------------------------------- */}
      <div className="al-kpis">
        <Kpi label="TOTAL ANOMALIES" value={String(Math.round(animTotal))} hint={`${criticalHigh} critical / high`} explain="Count recorded by the anomaly stage for this dataset, across all detected readings." />
        <Kpi label="DETECTION RATE" value={meta ? `${animRate.toFixed(2)}%` : "—"} hint={meta ? `${meta.scanned.toLocaleString("en-IN")} scanned` : "no run"} explain="Anomalies ÷ readings scanned, both recorded by the stage." />
        <Kpi label="ENERGY LOSS" value={`${num(Math.round(animLoss), 0)} ${unit}`} hint="in this window" explain="Sum of (observed − baseline) for positive deviations in the visible window." />
        <Kpi label="HIGHEST DEVIATION" value={maxDeviation == null ? "—" : `${num(maxDeviation)}%`} hint="abs. vs baseline" explain="Largest absolute deviation among flagged readings in the window." />
        <Kpi label="MOST AFFECTED DEVICE" value={mostAffectedDevice} hint={`${deviceCounts[0]?.count ?? 0} events`} explain="Device with the most flagged readings in the window." />
      </div>

      {/* Filters ------------------------------------------------------ */}
      <div className="al-filters">
        <span className="section-eyebrow"><SlidersHorizontal size={12} /> FILTERS</span>
        {SEV_ORDER.map(s => (
          <button
            type="button"
            key={s}
            className={`al-chip al-chip--${s} ${sevFilter.includes(s) ? "al-chip--on" : ""}`}
            onClick={() => setSevFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
          >
            <i style={{ background: SEV_COLOR[s] }} /> {s}
          </button>
        ))}
        {deviceCounts.slice(0, 4).map(d => (
          <button
            type="button"
            key={d.device}
            className={`al-chip ${deviceFilter.includes(d.device) ? "al-chip--on" : ""}`}
            onClick={() => setDeviceFilter(prev => prev.includes(d.device) ? prev.filter(x => x !== d.device) : [...prev, d.device])}
          >
            {d.device}
          </button>
        ))}
        {weekdayFilter != null ? <button type="button" className="al-chip al-chip--on" onClick={() => setWeekdayFilter(null)}>{WEEKDAYS[weekdayFilter]} <X size={10} /></button> : null}
        {hourFilter != null ? <button type="button" className="al-chip al-chip--on" onClick={() => setHourFilter(null)}>{String(hourFilter).padStart(2, "0")}:00 <X size={10} /></button> : null}
        <span className="al-filters__spacer" />
        <span className="mono-note">{activeFilters} active · {filtered.length} readings</span>
        <button type="button" className="al-btn al-btn--small" onClick={clearAll}>Clear all</button>
      </div>

      {/* Chart + detail ----------------------------------------------- */}
      <section className="panel al-chart-panel">
        <div className="al-chart-head">
          <div>
            <div className="section-eyebrow">DEVIATION FROM BASELINE / {(activeWindow?.label ?? window).toUpperCase()}</div>
            <h2>Observed load against the learned baseline</h2>
          </div>
          <div className="al-chart-tools">
            <button type="button" className={`al-mini ${compare.observed ? "al-mini--on" : ""}`} onClick={() => setCompare(c => ({ ...c, observed: !c.observed }))}>observed</button>
            <button type="button" className={`al-mini ${compare.baseline ? "al-mini--on" : ""}`} onClick={() => setCompare(c => ({ ...c, baseline: !c.baseline }))}>baseline</button>
            <button type="button" className={`al-mini ${compare.predicted ? "al-mini--on" : ""}`} onClick={() => setCompare(c => ({ ...c, predicted: !c.predicted }))}>predicted</button>
            <button type="button" className="al-mini" onClick={() => setRange(null)} disabled={!range}>reset zoom</button>
          </div>
        </div>

        <div className="al-chart" ref={chartWrap}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={view}
              margin={{ top: 14, right: 26, left: 2, bottom: 8 }}
              onMouseMove={(state: any) => {
                const idx = state?.activeTooltipIndex;
                if (typeof idx === "number" && view[idx]) setHover(view[idx]);
              }}
              onClick={(state: any) => {
                const idx = state?.activeTooltipIndex;
                if (typeof idx === "number" && view[idx]) onInspectPoint(view[idx]);
              }}
            >
              <CartesianGrid stroke="#24342d" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="timestamp" stroke="#61776a" tickLine={false} axisLine={false} tick={{ fill: "#768e7f", fontSize: 9 }} minTickGap={40} tickFormatter={(v: string) => clockOf(v)} />
              <YAxis stroke="#61776a" tickLine={false} axisLine={false} width={48} tick={{ fill: "#768e7f", fontSize: 9 }} />
              <RechartsTooltip content={(props: any) => (props?.payload?.[0]?.payload ? <PointTip point={props.payload[0].payload} unit={unit} /> : null)} cursor={{ stroke: "#3b5948", strokeDasharray: "3 3" }} />
              <Area type="monotone" dataKey="observed_energy_kwh" stroke="none" fill="#b6f36b" fillOpacity={0.06} isAnimationActive={false} />
              {compare.baseline ? <Line type="monotone" dataKey="baseline_energy_kwh" stroke="#718b7b" strokeDasharray="4 4" strokeWidth={1.4} dot={false} isAnimationActive={false} /> : null}
              {compare.observed ? <Line type="monotone" dataKey="observed_energy_kwh" stroke="#b6f36b" strokeWidth={2} dot={false} isAnimationActive={false} /> : null}
              {compare.predicted ? <Line type="monotone" dataKey="predicted" stroke="#6aa8ff" strokeDasharray="2 3" strokeWidth={1.4} dot={false} isAnimationActive={false} /> : null}
              {SEV_ORDER.map(s => (
                <Line key={s} type="monotone" dataKey={s} stroke={SEV_COLOR[s]} strokeWidth={1.4} strokeOpacity={0.5} dot={{ fill: SEV_COLOR[s], r: s === "critical" ? 5 : 3.6, stroke: "#101c15", strokeWidth: 1.4 }} activeDot={false} connectNulls={false} isAnimationActive={false} />
              ))}
              {pinned ? <ReferenceLine x={pinned.timestamp} stroke="#b6f36b" strokeDasharray="2 3" strokeOpacity={0.8} /> : null}
              <Brush dataKey="timestamp" height={18} travellerWidth={7} stroke="#3f7a5e" fill="#0d1a14" onChange={(r: any) => {
                if (r?.startIndex != null && r?.endIndex != null && r.endIndex - r.startIndex > 2) setRange([r.startIndex, r.endIndex]);
              }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="al-chart-foot">
            <span className="mono-note">{view.length} of {chartData.length} readings{range ? ` · zoomed ${range[0]}–${range[1]}` : " · wheel to zoom, drag the navigator to pan"}</span>
            <span className="mono-note">lowest flagged reading {flagged.length ? num(Math.min(...flagged.map(p => p.observed_energy_kwh))) : "—"} {unit}</span>
          </div>
        </div>

        {selectedPoint ? (
          <div className="al-detail">
            <div className="al-detail__head">
              <div>
                <span className="section-eyebrow">FOCUSED READING{selectedIndex >= 0 ? ` · ${selectedIndex + 1} OF ${view.length}` : ""}</span>
                <div className="al-detail__title">
                  <span className={`al-sev al-sev--${selectedPoint.severity || "none"}`}>{selectedPoint.severity || "normal"}</span>
                  <strong>{clockOf(selectedPoint.timestamp)}</strong>
                </div>
              </div>
              <div className="al-detail__nav">
                <button type="button" className="al-mini" onClick={() => jump(-1)} disabled={selectedIndex <= 0}><ChevronLeft size={12} /> prev</button>
                <button type="button" className="al-mini" onClick={() => jump(1)} disabled={selectedIndex < 0 || selectedIndex >= view.length - 1}>next <ChevronRight size={12} /></button>
                <button type="button" className="al-mini" onClick={exportIncident}><Download size={11} /> incident</button>
                {pinned ? <button type="button" className="al-mini" onClick={onClearPoint}><X size={11} /> unpin</button> : null}
              </div>
            </div>

            <div className="al-detail__grid">
              <span><small>OBSERVED</small>{num(selectedPoint.observed_energy_kwh)} {unit}</span>
              <span><small>EXPECTED</small>{num(selectedPoint.baseline_energy_kwh)} {unit}</span>
              <span><small>DIFFERENCE</small>{num(selectedPoint.deviation_percent)}% · {num(Math.max(0, selectedPoint.observed_energy_kwh - selectedPoint.baseline_energy_kwh))} {unit}</span>
              <span><small>CONFIDENCE</small>{selectedPoint.confidence != null ? selectedPoint.confidence.toFixed(2) : "—"}</span>
              <span><small>DEVICE</small>{selectedPoint.device_name || selectedPoint.device_code || "—"}</span>
              <span><small>LOCATION</small>{selectedPoint.building_name || selectedPoint.building_code || "—"} · floor {selectedPoint.floor_no || "—"} · {selectedPoint.room_code || "—"}</span>
              <span><small>ANOMALY TYPE</small>{selectedPoint.anomaly_type || "—"}</span>
              <span><small>READING</small>{clockOf(selectedPoint.timestamp)}</span>
            </div>

          </div>
        ) : null}
      </section>


      {/* Evidence table ------------------------------------------------ */}
      <section className="panel al-table-panel">
        <div className="al-head">
          <div><span className="section-eyebrow">ANOMALY QUEUE</span><h2>Evidence, not just alerts.</h2></div>
          <div className="al-table-tools">
            <label className="al-search">
              <Search size={12} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search queue" aria-label="Search anomaly queue" />
            </label>
            <button type="button" className="al-btn al-btn--small" onClick={() => setSortKey(sortKey === "severity" ? "time" : sortKey === "time" ? "deviation" : "severity")}>
              <ArrowDownUp size={12} /> {sortKey}
            </button>
            <button type="button" className="al-btn al-btn--small" onClick={exportCsv}><Download size={12} /> CSV</button>
            <button type="button" className="al-btn al-btn--small" onClick={exportJson}><FileJson size={12} /> JSON</button>
          </div>
        </div>
        <div className="al-table">
          <div className="al-table__head">
            <span>SEVERITY</span><span>TIMESTAMP</span><span>DEVICE</span><span>OBSERVED</span><span>EXPECTED</span><span>DEV %</span>
            {showCols.type ? <span>TYPE</span> : null}
            {showCols.confidence ? <span>CONF.</span> : null}
          </div>
          {pageRows.map(p => (
            <div className={`al-table__group ${rowOpen === p.timestamp ? "al-table__group--open" : ""}`} key={p.timestamp}>
              <button type="button" className="al-table__row" onClick={() => { onInspectPoint(p); setRowOpen(rowOpen === p.timestamp ? null : p.timestamp); }}>
                <span><Tag tone={p.severity === "critical" ? "coral" : p.severity === "high" ? "orange" : p.severity === "medium" ? "yellow" : "blue"}>{p.severity}</Tag></span>
                <span className="mono-note">{clockOf(p.timestamp)}</span>
                <span>{p.device_name || p.device_code || "—"}</span>
                <span className="mono">{num(p.observed_energy_kwh)}</span>
                <span className="mono">{num(p.baseline_energy_kwh)}</span>
                <span className={p.deviation_percent > 0 ? "al-pos" : "al-neg"}>{num(p.deviation_percent)}%</span>
                {showCols.type ? <span>{p.anomaly_type || "—"}</span> : null}
                {showCols.confidence ? <span>{p.confidence != null ? p.confidence.toFixed(2) : "—"}</span> : null}
              </button>
              {rowOpen === p.timestamp ? (
                <div className="al-table__detail">
                  <span><small>BUILDING</small>{p.building_name || p.building_code || "—"}</span>
                  <span><small>FLOOR / ROOM</small>{p.floor_no || "—"} / {p.room_code || "—"}</span>
                  <span><small>MODEL</small>{p.model_name || "—"}</span>
                  <span><small>BASELINE VER.</small>{p.baseline_version != null ? `v${p.baseline_version}` : "—"}</span>
                  <button type="button" className="al-btn al-btn--small" onClick={() => onInspect({ id: p.timestamp, severity: p.severity, type: p.anomaly_type, timestamp: p.timestamp, feature: p.device_name || p.device_code, reason: `Deviation ${num(p.deviation_percent)}% against baseline`, color: SEV_COLOR[p.severity] ?? "#79d6c4", deviationPct: p.deviation_percent, score: p.confidence ?? undefined })}>
                    Open in inspector
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {!pageRows.length ? <p className="mono-note">No reading matches these filters.</p> : null}
        </div>
        <div className="al-pager">
          <span className="mono-note">{rows.length} flagged readings · page {currentPage + 1} / {pageCount}</span>
          <div>
            <button type="button" className="al-btn al-btn--small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="al-btn al-btn--small" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
            <button type="button" className="al-btn al-btn--small" onClick={() => setShowCols(c => ({ ...c, type: !c.type }))}>type</button>
            <button type="button" className="al-btn al-btn--small" onClick={() => setShowCols(c => ({ ...c, confidence: !c.confidence }))}>confidence</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AnomalyLab;
