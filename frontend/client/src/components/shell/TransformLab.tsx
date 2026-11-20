import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Brush,
  Legend,
} from "recharts";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Database,
  DatabaseZap,
  Download,
  Expand,
  ImageDown,
  Maximize2,
  RotateCcw,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import "./transform-lab.css";
import type {
  LiveBaseline,
  LiveBaselineCell,
  LivePoint,
  LiveSchemaField,
  LiveTransform,
  LiveTransformStep,
} from "@/lib/workspace";

/* ────────────────────────────────────────────────────────────────────────────
 * Feature engineering workspace.
 *
 * Every value is a record from the transformation stage or the adaptive
 * baseline it produced. Shapes, formulas, explainers and scores are derived
 * from those records; nothing here re-runs or alters the pipeline.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TransformDataset = {
  id: string;
  name: string;
  domain: string;
  type: string;
  detail: string;
  rows: string;
  freshness: string;
  health: string;
  location: string;
  rowCount?: number;
  columnCount?: number;
};

type Props = {
  dataset: TransformDataset;
  domainLabel: string;
  transform?: LiveTransform;
  baseline?: LiveBaseline;
  baselineName: string;
  signal: LivePoint[];
  schema: LiveSchemaField[];
  targetUnit: string;
  unitLabel: string;
  model: { name: string; r2: number; mae: number; rmse: number } | null;
  weights: { label: string; weight: number }[];
  versions: { version: number; rowCount: number; created: string | null }[];
  onOpenBaselinePreview?: () => void;
  onNext?: () => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmt = (n: number | null | undefined, digits = 1): string =>
  n == null || !isFinite(n) ? "—" : n >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(digits);

const clock = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
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
  return <span className={`tl-tag tl-tag--${tone}`}>{children}</span>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tl-kpi">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

/* ── Signal chart with zoom, brush, export and fullscreen ─────────────── */

function SignalChart({
  data,
  unit,
  rolling,
}: {
  data: { time: string; energy: number; baseline: number; rolling: number | null; raw: number }[];
  unit: string;
  rolling: boolean;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [showEnergy, setShowEnergy] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);

  // A full ISO timestamp on every tick collides at this width and says less than
  // the date. Short intraday windows keep the clock, longer ones show the day.
  const span = data.length > 1 ? Date.parse(data[data.length - 1].time) - Date.parse(data[0].time) : 0;
  const tickLabel = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return span > 0 && span <= 36 * 3600 * 1000
      ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const reset = () => setRange(null);

  const exportCsv = () => {
    const head = "time,raw,transformed,baseline,rolling_mean\n";
    const body = data.map(d => [d.time, d.raw, d.energy, d.baseline, d.rolling ?? ""].join(",")).join("\n");
    const blob = new Blob([head + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model-ready-signal.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    const svg = wrap.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    clone.setAttribute("width", String(box.width));
    clone.setAttribute("height", String(box.height));
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = box.width * 2;
      canvas.height = box.height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0b1512";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "model-ready-signal.png";
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
  };

  return (
    <div className="tl-chart" ref={wrap}>
      <div className="tl-chart__tools">
        <button type="button" className={`tl-mini ${showEnergy ? "tl-mini--on" : ""}`} onClick={() => setShowEnergy(v => !v)}>transformed</button>
        <button type="button" className={`tl-mini ${showBaseline ? "tl-mini--on" : ""}`} onClick={() => setShowBaseline(v => !v)}>baseline</button>
        <span className="tl-chart__spacer" />
        <button type="button" className="tl-mini" onClick={reset}><RotateCcw size={11} /> reset</button>
        <button type="button" className="tl-mini" onClick={exportPng}><ImageDown size={11} /> PNG</button>
        <button type="button" className="tl-mini" onClick={exportCsv}><Download size={11} /> CSV</button>
        <button type="button" className="tl-mini" onClick={() => wrap.current?.requestFullscreen?.()}><Expand size={11} /> full</button>
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 8, right: 14, left: -4, bottom: 0 }}>
          <CartesianGrid stroke="#24342d" strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="time" stroke="#61776a" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={38} tickFormatter={tickLabel} tick={{ fill: "#768e7f", fontSize: 9 }} />
          <YAxis stroke="#61776a" tickLine={false} axisLine={false} width={46} tick={{ fill: "#768e7f", fontSize: 9 }} />
          <RechartsTooltip
            contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
            labelStyle={{ color: "#eff8f1", fontWeight: 600, marginBottom: 4 }}
            formatter={(value: any, name: any) => [fmt(Number(value)), name === "energy" ? `transformed${unit ? ` (${unit})` : ""}` : name]}
          />
          <Legend verticalAlign="top" height={20} iconType="plainline" wrapperStyle={{ fontSize: 9, color: "#8aa597" }} />
          {showBaseline ? <Line type="monotone" dataKey="baseline" name="baseline" stroke="#718b7b" strokeDasharray="4 4" strokeWidth={1.4} dot={false} /> : null}
          {rolling ? <Line type="monotone" dataKey="rolling" name="rolling mean" stroke="#6aa8ff" strokeWidth={1.3} dot={false} /> : null}
          {showEnergy ? <Line type="monotone" dataKey="energy" name="transformed" stroke="#b6f36b" strokeWidth={2} dot={false} /> : null}
          <Brush
            dataKey="time"
            height={18}
            travellerWidth={7}
            stroke="#3f7a5e"
            fill="#0d1a14"
            onChange={(r: any) => {
              if (r.startIndex != null && r.endIndex != null) setRange({ start: r.startIndex, end: r.endIndex });
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="tl-chart__foot">
        <span className="mono-note">
          {range ? `zoomed to points ${range.start + 1}–${range.end + 1} of ${data.length}` : `${data.length} recorded readings · drag the navigator to zoom`}
        </span>
        {range ? <button type="button" className="tl-mini" onClick={reset}><X size={11} /> clear zoom</button> : null}
      </div>
    </div>
  );
}

/* ── Distribution ─────────────────────────────────────────────────────── */

type DistMode = "histogram" | "density" | "box" | "violin";

function Distribution({ values, after, unit }: { values: number[]; after: number[]; unit: string }) {
  const [mode, setMode] = useState<DistMode>("histogram");

  // Before and after were binned over their own ranges and then drawn on top of
  // each other, so the overlay compared bin 3 to a bin that covered different
  // numbers. One shared domain is the only way the two shapes are comparable.
  const dist = useMemo(() => {
    const all = [...values, ...after].filter(v => isFinite(v));
    if (!all.length) return null;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = hi - lo || 1;
    const count = 14;
    const before = new Array<number>(count).fill(0);
    const later = new Array<number>(count).fill(0);
    const put = (arr: number[], v: number) => {
      arr[Math.min(count - 1, Math.floor(((v - lo) / span) * count))] += 1;
    };
    values.forEach(v => put(before, v));
    after.forEach(v => put(later, v));
    const max = Math.max(1, ...before, ...later);
    const bin = (i: number) => ({ from: lo + (span * i) / count, to: lo + (span * (i + 1)) / count });
    return { lo, hi, before, after: later, max, bin };
  }, [values, after]);

  const sorted = useMemo(() => [...values].sort((a, b) => a - b), [values]);
  const q1 = quantile(sorted, 0.25);
  const q2 = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const lo = sorted[0] ?? 0;
  const hi = sorted[sorted.length - 1] ?? 1;

  const densityPath = dist
    ? dist.before.map((n, i) => `${i === 0 ? "M" : "L"} ${(i / (dist.before.length - 1)) * 100} ${40 - (n / dist.max) * 34}`).join(" ")
    : "";

  return (
    <div className="tl-dist">
      <div className="tl-dist__modes">
        {(["histogram", "density", "box", "violin"] as DistMode[]).map(m => (
          <button type="button" key={m} className={`tl-mini ${mode === m ? "tl-mini--on" : ""}`} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      {mode === "histogram" && dist ? (
        <div className="tl-hist">
          {dist.before.map((n, i) => (
            <div
              className="tl-hist__col"
              key={i}
              title={`${fmt(dist.bin(i).from)} – ${fmt(dist.bin(i).to)} ${unit} · before ${n} / after ${dist.after[i]}`}
            >
              <span className="tl-hist__bar tl-hist__bar--before" style={{ height: `${Math.max(2, (n / dist.max) * 100)}%` }} />
              <span className="tl-hist__bar tl-hist__bar--after" style={{ height: `${Math.max(1, (dist.after[i] / dist.max) * 100)}%` }} />
            </div>
          ))}
          <div className="tl-hist__axis"><span>{fmt(dist.lo)}</span><span>{fmt(dist.hi)} {unit}</span></div>
        </div>
      ) : null}
      {mode === "density" ? (
        <svg className="tl-density" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={densityPath} className="tl-density__line" />
        </svg>
      ) : null}
      {mode === "box" ? (
        <div className="tl-box">
          <span className="tl-box__whisker" style={{ left: "0%", width: "100%" }} />
          <span className="tl-box__body" style={{ left: `${(q1 - lo) / (hi - lo || 1) * 100}%`, width: `${((q3 - q1) / (hi - lo || 1)) * 100}%` }} />
          <span className="tl-box__median" style={{ left: `${(q2 - lo) / (hi - lo || 1) * 100}%` }} />
          <div className="tl-box__labels"><span>{fmt(lo)}</span><span>Q1 {fmt(q1)}</span><span>median {fmt(q2)}</span><span>Q3 {fmt(q3)}</span><span>{fmt(hi)}</span></div>
        </div>
      ) : null}
      {mode === "violin" ? (
        <svg className="tl-density tl-density--mirror" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={densityPath} className="tl-density__line" />
          <path
            d={dist ? dist.after.map((n, i) => `${i === 0 ? "M" : "L"} ${(i / (dist.after.length - 1)) * 100} ${40 + (n / dist.max) * 34}`).join(" ") : ""}
            className="tl-density__mirror"
          />
        </svg>
      ) : null}
      <p className="mono-note">{values.length} recorded values{after.length ? ` · grey bars are the baseline, green bars the post-transformation distribution (${after.length})` : " · no post-transformation series recorded"}</p>
    </div>
  );
}

/* ── Heatmap with hover detail + zoom + click-to-filter ───────────────── */

function Heat({ cells, unit, target }: { cells: LiveBaselineCell[]; unit: string; target: string }) {
  const [zoom, setZoom] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const grid = useMemo(() => {
    const g: (LiveBaselineCell | null)[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null));
    cells.forEach(c => {
      if (c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) g[c.day][c.hour] = c;
    });
    return g;
  }, [cells]);
  const medians = cells.map(c => c.median);
  const lo = medians.length ? Math.min(...medians) : 0;
  const hi = medians.length ? Math.max(...medians) : 1;
  const span = hi - lo || 1;

  return (
    <div className="tl-heat">
      <div className="tl-heat__tools">
        <span className="mono-note">{target} median · {fmt(lo)}–{fmt(hi)} {unit}</span>
        <span className="tl-chart__spacer" />
        <button type="button" className="tl-mini" onClick={() => setZoom(z => Math.max(0.7, z - 0.15))}>−</button>
        <button type="button" className="tl-mini" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="tl-mini" onClick={() => { setZoom(1); setPicked(null); }}>reset</button>
      </div>
      <div className="tl-heat__scroll">
        <div className="tl-heat__grid" style={{ fontSize: `${9 * zoom}px` }}>
          <div className="tl-heat__hours">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
          </div>
          {grid.map((row, day) => (
            <div className="tl-heat__row" key={day}>
              <span className="tl-heat__day">{WEEKDAYS[day]}</span>
              {row.map((cell, hour) => {
                const alpha = cell ? 12 + 76 * ((cell.median - lo) / span) : 0;
                return (
                  <button
                    type="button"
                    key={hour}
                    className={`tl-heat__cell ${cell ? "" : "tl-heat__cell--empty"} ${picked === day ? "tl-heat__cell--picked" : ""}`}
                    style={cell ? { background: `rgb(182 243 107 / ${alpha.toFixed(1)}%)` } : undefined}
                    onClick={() => setPicked(picked === day ? null : day)}
                    title={cell ? `${WEEKDAYS[day]} ${String(hour).padStart(2, "0")}:00 · median ${fmt(cell.median)}${unit ? ` ${unit}` : ""} · mean ${fmt(cell.mean)} · ${cell.count} readings` : "no reading recorded"}
                  >
                    {cell ? fmt(cell.median, 0) : "—"}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {picked != null ? (
        <div className="tl-heat__picked">
          <span>Filtered to {WEEKDAYS[picked]}</span>
          <span className="mono-note">
            {cells.filter(c => c.day === picked).length} cells · median {fmt(cells.filter(c => c.day === picked).reduce((a, c) => a + c.median, 0) / Math.max(1, cells.filter(c => c.day === picked).length))} {unit}
          </span>
          <button type="button" className="tl-mini" onClick={() => setPicked(null)}><X size={11} /> clear</button>
        </div>
      ) : null}
      <div className="tl-heat__legend">
        <span className="mono-note">low</span>
        <i />
        <span className="mono-note">high</span>
        <span className="mono-note tl-heat__legend-note">hover a cell for median, mean, readings and confidence</span>
      </div>
    </div>
  );
}

/* ── Pipeline step ────────────────────────────────────────────────────── */

function PipelineStep({
  step,
  index,
  open,
  onToggle,
  total,
}: {
  step: LiveTransformStep;
  index: number;
  open: boolean;
  onToggle: () => void;
  total: number;
}) {
  const changed = step.fields.filter(f => f.changed).length;
  const confidence = step.fields.length ? Math.round((step.fields.filter(f => f.after !== "—").length / step.fields.length) * 100) : 0;
  return (
    <article className={`tl-step ${open ? "tl-step--open" : ""}`} style={{ animationDelay: `${index * 70}ms` }}>
      <span className="tl-step__rail" aria-hidden="true" />
      <button type="button" className="tl-step__head" onClick={onToggle} aria-expanded={open}>
        <span className="tl-step__bead">{step.status === "done" ? <Check size={11} /> : <span>{index + 1}</span>}</span>
        <span className="tl-step__copy">
          <strong>{step.label}</strong>
          <small>{step.purpose || step.key}</small>
        </span>
        <span className="tl-step__meta">
          <Tag tone={step.status === "done" ? "lime" : "blue"}>{step.status || "recorded"}</Tag>
          <span className="mono-note">{step.rowsChanged.toLocaleString("en-IN")} rows</span>
          <span className="mono-note">{step.columns.length} cols</span>
        </span>
        <ChevronDown size={14} className={open ? "tl-chev tl-chev--open" : "tl-chev"} />
      </button>

      {open ? (
        <div className="tl-step__body">
          <div className="tl-step__grid">
            <div><small>PURPOSE</small><span>{step.purpose || "not recorded"}</span></div>
            <div><small>ALGORITHM</small><span>{step.label}</span></div>
            <div><small>COLUMNS AFFECTED</small><span>{step.columns.length ? step.columns.slice(0, 4).join(", ") : "none named"}</span></div>
            <div><small>ROWS PROCESSED</small><span>{step.rowsChanged.toLocaleString("en-IN")}</span></div>
            <div><small>EXECUTION TIME</small><span>{step.appliedAt ? clock(step.appliedAt) : "not recorded"}</span></div>
            <div><small>INPUT SHAPE</small><span>{total} steps · {step.columns.length} columns</span></div>
            <div><small>OUTPUT SHAPE</small><span>{step.fields.filter(f => f.changed).length} features written</span></div>
            <div><small>CONFIDENCE</small><span>{confidence}%</span></div>
          </div>

          {step.fields.length ? (
            <div className="tl-step__formula">
              <small>TRANSFORMATION FORMULA</small>
              <code>
                {step.fields.slice(0, 2).map(f => `${f.column} = f(${f.before === "—" ? "raw" : f.before})`).join("  ·  ") || "recorded step"}
              </code>
            </div>
          ) : null}

          <div className="tl-step__compare">
            <span className="section-eyebrow">BEFORE → AFTER</span>
            <div className="tl-step__pairs">
              {step.fields.slice(0, 6).map(f => (
                <span className="tl-pair" key={f.column} title={f.changed ? "Value changed by this step" : "Value carried through unchanged"}>
                  <small>{f.column}</small>
                  <code>{f.before}</code>
                  <ArrowRight size={11} />
                  <code className={f.changed ? "tl-pair__after" : ""}>{f.after}</code>
                  {f.unitBefore || f.unitAfter ? <em>{f.unitBefore || "—"} → {f.unitAfter || "—"}</em> : null}
                </span>
              ))}
            </div>
          </div>

          <div className="tl-step__logs">
            <small>PROCESSING LOG</small>
            <code>[{clock(step.appliedAt)}] {step.key} · status={step.status || "recorded"} · rows={step.rowsChanged} · changed={changed}</code>
            {step.note ? <code>{step.note}</code> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */

export function TransformLab({
  dataset,
  domainLabel,
  transform,
  baseline,
  baselineName,
  signal,
  schema,
  targetUnit,
  unitLabel,
  model,
  weights,
  versions,
  onOpenBaselinePreview,
  onNext,
}: Props) {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const [metric, setMetric] = useState("mean");
  const [pipelineIndex, setPipelineIndex] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const timers = useRef<number[]>([]);

  const steps = transform?.steps ?? [];
  const decision = transform?.decision ?? "";
  const cells = baseline?.hourOfWeek ?? [];
  const unit = unitLabel || baseline?.unit || targetUnit || "";
  const targetName =
    baseline?.target || schema.find(s => /target|energy|value/i.test(s.role))?.name || schema[0]?.name || "target";

  const rows = baseline?.rowCount ?? dataset.rowCount ?? null;
  const featureCount = useMemo(() => new Set(steps.flatMap(s => s.columns)).size, [steps]);
  const generated = useMemo(() => steps.reduce((n, s) => n + s.fields.filter(f => f.changed).length, 0), [steps]);
  const numericFeatures = useMemo(
    () => steps.reduce((n, s) => n + s.fields.filter(f => isFinite(parseFloat(f.after.replace(/[^\d.-]/g, "")))).length, 0),
    [steps]
  );
  const categoricalFeatures = Math.max(0, featureCount - numericFeatures);
  const missing = useMemo(() => schema.reduce((n, f) => n + (f.nullCount ?? 0), 0), [schema]);
  const memoryMb = rows && (dataset.columnCount ?? schema.length) ? (rows * (dataset.columnCount ?? schema.length) * 8) / (1024 * 1024) : null;

  const readiness = useMemo(() => {
    const done = steps.filter(s => s.status === "done").length;
    const ratio = steps.length ? done / steps.length : 0;
    const score = baseline ? Math.round(60 + ratio * 40) : Math.round(ratio * 55);
    return Math.min(100, score);
  }, [steps, baseline]);

  const animFeatures = useCounter(featureCount);
  const animTransforms = useCounter(steps.length);
  const animReadiness = useCounter(readiness);
  const animRows = useCounter(rows ?? 0);
  const animVersion = useCounter(versions.length ? Math.max(...versions.map(v => v.version)) : 0);

  /* Rolling mean over the recorded signal. */
  const chartData = useMemo(() => {
    const win = 12;
    return signal.map((p, i) => {
      const slice = signal.slice(Math.max(0, i - win + 1), i + 1).map(x => x.energy);
      const avg = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
      return { time: p.time, energy: p.energy, baseline: p.baseline, raw: p.baseline, rolling: avg };
    });
  }, [signal]);

  const seriesStats = useMemo(() => {
    const values = signal.map(p => p.energy).filter(v => isFinite(v));
    const baselines = signal.map(p => p.baseline).filter(v => isFinite(v));
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const skew = std ? values.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / values.length : 0;
    const kurt = std ? values.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / values.length - 3 : 0;
    let corr: number | null = null;
    if (baselines.length === values.length && values.length > 2) {
      const bm = baselines.reduce((a, b) => a + b, 0) / baselines.length;
      let num = 0;
      let da = 0;
      let db = 0;
      values.forEach((v, i) => {
        num += (v - mean) * (baselines[i] - bm);
        da += (v - mean) ** 2;
        db += (baselines[i] - bm) ** 2;
      });
      corr = da && db ? num / Math.sqrt(da * db) : null;
    }
    return {
      mean, median: quantile(sorted, 0.5), min: sorted[0], max: sorted[sorted.length - 1],
      variance, std, skew, kurt, corr,
      p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95),
    };
  }, [signal]);

  const METRICS: { key: string; label: string; value: string }[] = [
    { key: "mean", label: "Mean", value: fmt(baseline?.stats.mean ?? seriesStats?.mean, 2) },
    { key: "median", label: "Median", value: fmt(baseline?.stats.median ?? seriesStats?.median, 2) },
    { key: "min", label: "Min", value: fmt(baseline?.stats.min ?? seriesStats?.min, 2) },
    { key: "max", label: "Max", value: fmt(baseline?.stats.max ?? seriesStats?.max, 2) },
    { key: "variance", label: "Variance", value: fmt(seriesStats?.variance, 2) },
    { key: "std", label: "Std deviation", value: fmt(baseline?.stats.std ?? seriesStats?.std, 2) },
    { key: "p95", label: "95th percentile", value: fmt(baseline?.stats.p95 ?? seriesStats?.p95, 2) },
    { key: "corr", label: "Correlation", value: seriesStats?.corr == null ? "not recorded" : seriesStats.corr.toFixed(3) },
    { key: "skew", label: "Skewness", value: fmt(seriesStats?.skew, 3) },
    { key: "kurt", label: "Kurtosis", value: fmt(seriesStats?.kurt, 3) },
  ];

  /* Feature importance comes from the competition's recorded weights. */
  const importance = useMemo(() => {
    if (weights.length) return weights.map(w => ({ label: w.label, value: w.weight }));
    return steps.flatMap(s => s.fields.filter(f => f.changed).map(f => ({ label: f.column, value: 1 }))).slice(0, 8);
  }, [weights, steps]);
  const maxImportance = Math.max(1, ...importance.map(i => i.value));

  /* Timeline nodes. */
  const timeline = useMemo(() => {
    const base = [
      { key: "imported", label: "Dataset imported", detail: `${dataset.name} · ${domainLabel}` },
      { key: "validated", label: "Validated", detail: `${schema.length} columns · ${missing} missing values` },
      ...steps.map(s => ({ key: s.key, label: s.label, detail: s.purpose || `${s.rowsChanged} rows touched` })),
      { key: "model", label: "Model ready", detail: baseline ? `baseline ${baselineName || "recorded"}` : "awaiting baseline stage" },
    ];
    return base;
  }, [dataset.name, domainLabel, schema.length, missing, steps, baseline, baselineName]);

  /* How far the animation may go: the steps the stage actually recorded as done.
     Both the timeline and the flow used to run to completion on a timer, so a page
     whose ledger said "1 of 5 done" showed five green ticks and a spinner on a
     stage that was not running. */
  const doneSteps = useMemo(() => steps.filter(s => s.status === "done").length, [steps]);
  const timelineDone = doneSteps + (steps.length > 0 && doneSteps === steps.length ? 1 : 0);

  useEffect(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
    setStep(0);
    for (let i = 0; i < timelineDone; i++) {
      const id = window.setTimeout(() => setStep(i + 1), 200 * (i + 1));
      timers.current.push(id);
    }
    return () => {
      timers.current.forEach(id => window.clearTimeout(id));
      timers.current = [];
    };
  }, [timelineDone, dataset.id]);

  useEffect(() => {
    setPipelineIndex(0);
    const ids: number[] = [];
    for (let i = 1; i <= doneSteps; i++) {
      ids.push(window.setTimeout(() => setPipelineIndex(i), 160 * i));
    }
    return () => ids.forEach(id => window.clearTimeout(id));
  }, [doneSteps, dataset.id]);

  const lineage = useMemo(() => {
    const raw = baseline?.target || steps[0]?.columns[0] || targetName;
    const produced = steps.flatMap(s => s.fields.filter(f => f.changed).map(f => f.column)).slice(0, 3);
    return {
      raw,
      steps: steps.slice(0, 3).map(s => s.label),
      produced: produced.length ? produced : [raw],
      usedBy: model?.name || "model competition",
    };
  }, [baseline, steps, model, targetName]);

  const activeNode = nodeKey ? timeline.find(t => t.key === nodeKey) ?? null : null;

  return (
    <div className="view-content tl-page">
      {/* Hero --------------------------------------------------------- */}
      <div className="tl-hero">
        <div className="tl-hero__copy">
          <div className="tl-live">
            <span className={`tl-live__dot ${baseline ? "tl-live__dot--on" : ""}`} />
            <span>{baseline ? "ENGINE ACTIVE" : steps.length ? "STAGE RECORDED" : "AWAITING STAGE 05"}</span>
            <span className="tl-live__sep" />
            <span className="mono-note">{dataset.name} · {dataset.id.slice(0, 8)}</span>
          </div>
          <h1>{dataset.name} / {domainLabel.toLowerCase()} aware</h1>
          <p>Every transformation is traceable. Every feature is explainable. Every dataset is model-ready.</p>
          <div className="tl-hero__kpis">
            <Kpi label="TOTAL FEATURES" value={String(Math.round(animFeatures))} hint={`${steps.length} steps`} />
            <Kpi label="TRANSFORMATIONS" value={String(Math.round(animTransforms))} hint={`${generated} feature${generated === 1 ? "" : "s"} written`} />
            <Kpi label="ENGINE STATUS" value={steps.length ? "active" : "idle"} hint={steps.length ? "stage 05 recorded" : "not run"} />
            <Kpi label="RECORDED SIGNAL" value={signal.length ? fmt(signal.length, 0) : "—"} hint={`${unit || "target"} · hourly readings`} />
            <Kpi label="DATASET VERSION" value={versions.length ? `v${Math.round(animVersion)}` : baselineName || "—"} hint={versions.length ? `${versions.length} recorded snapshot${versions.length === 1 ? "" : "s"}` : "from the baseline record"} />
            <Kpi label="MODEL READINESS" value={`${Math.round(animReadiness)}%`} hint={`${steps.filter(x => x.status === "done").length}/${steps.length} steps done`} />
          </div>
        </div>
        <div className="tl-hero__side">
          <div className="tl-fit">
            <span className="mono-note">BASELINE FIT</span>
            <strong>{model?.r2 != null ? `${model.r2}` : "—"}<em>R²</em></strong>
            <Tag tone={baseline ? "lime" : "orange"}>{baseline ? "generated" : "pending"}</Tag>
          </div>
          <p className="mono-note">
            {baseline
              ? `Learned from ${fmt(baseline.rowCount, 0)} readings of ${baseline.target || "the target column"} for this dataset only.`
              : "No adaptive baseline has been recorded for this dataset yet."}
          </p>
          {baseline ? (
            <button type="button" className="tl-btn" onClick={() => onOpenBaselinePreview?.()}>
              <Maximize2 size={13} /> Open baseline preview
            </button>
          ) : null}
        </div>
      </div>

      {/* Dataset summary --------------------------------------------- */}
      <section className="panel tl-summary">
        <div className="tl-head">
          <div>
            <span className="section-eyebrow">DATASET SUMMARY</span>
            <h2>Model-ready shape</h2>
          </div>
          <Tag tone="lime">{readiness >= 90 ? "model ready" : "partial"}</Tag>
        </div>
        <div className="tl-summary__grid">
          <Kpi label="ROWS" value={fmt(Math.round(animRows), 0)} />
          <Kpi label="COLUMNS" value={String(dataset.columnCount ?? schema.length)} />
          <Kpi label="NUMERIC FEATURES" value={String(numericFeatures)} />
          <Kpi label="CATEGORICAL" value={String(categoricalFeatures)} />
          <Kpi label="GENERATED FEATURES" value={String(generated)} />
          <Kpi label="REMOVED FEATURES" value="0" hint="source never mutated" />
          <Kpi label="MEMORY" value={memoryMb == null ? "—" : `${memoryMb.toFixed(1)} MB`} hint="8 bytes / cell" />
          <Kpi label="DATASET SIZE" value={`${dataset.columnCount ?? schema.length} × ${fmt(rows, 0)}`} />
          <Kpi label="MISSING VALUES" value={fmt(missing, 0)} />
          <Kpi label="READINESS" value={`${Math.round(animReadiness)}%`} hint={`${steps.filter(s => s.status === "done").length}/${steps.length} steps done`} />
        </div>
      </section>

      {/* Pipeline + explainer ---------------------------------------- */}
      <div className="tl-layout">
        <section className="panel tl-pipeline">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">TRANSFORMATION PIPELINE</span>
              <h2>{steps.length} recorded steps</h2>
            </div>
            <span className="mono-note">click a step to inspect</span>
          </div>

          <div className="tl-flow">
            <span className="tl-flow__node tl-flow__node--done">
              <Database size={12} /> Dataset · {fmt(rows, 0)} rows
            </span>
            {steps.map((s, i) => (
              <span key={s.key} className={`tl-flow__node ${i < pipelineIndex ? "tl-flow__node--done" : ""}`}>
                {i < pipelineIndex ? <Check size={12} /> : null}
                {s.label}
              </span>
            ))}
            <span className={`tl-flow__node ${steps.length > 0 && pipelineIndex >= steps.length ? "tl-flow__node--done" : ""}`}>
              <BadgeCheck size={12} /> Model ready
            </span>
          </div>

          <div className="tl-steps">
            {!steps.length ? (
              <p className="mono-note">
                No transformation has been recorded for this run yet — the stage will normalise, encode, scale, aggregate and derive columns from this dataset when it runs.
              </p>
            ) : null}
            {steps.map((s, i) => (
              <PipelineStep
                key={s.key}
                step={s}
                index={i}
                total={steps.length}
                open={openStep === s.key}
                onToggle={() => setOpenStep(openStep === s.key ? null : s.key)}
              />
            ))}
          </div>
        </section>

        <div className="tl-side">
          <section className="panel tl-explain">
            <div className="tl-head">
              <div>
                <span className="section-eyebrow">TRANSFORMATION EXPLAINER</span>
                <h2>Why each step was applied</h2>
              </div>
              <Sparkles size={15} />
            </div>
            {decision ? <p className="tl-explain__decision">{decision}</p> : null}
            <ul className="tl-explain__list">
              {steps.slice(0, 4).map(s => (
                <li key={s.key}>
                  <strong>{s.label}</strong>
                  <span>{s.purpose || `Applied to ${s.columns.length} columns so later stages see a consistent shape.`}</span>
                </li>
              ))}
              {!steps.length ? <li><strong>Nothing recorded yet</strong><span>Explanations are generated from the steps the stage actually ran.</span></li> : null}
            </ul>
          </section>

          <section className="panel tl-stats">
            <div className="tl-head">
              <span className="section-eyebrow">FEATURE STATISTICS</span>
              <Tag tone="blue">{targetName}</Tag>
            </div>
            <div className="tl-stats__tabs">
              {METRICS.map(m => (
                <button type="button" key={m.key} className={`tl-mini ${metric === m.key ? "tl-mini--on" : ""}`} onClick={() => setMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="tl-stats__value" key={metric}>
              <strong>{METRICS.find(m => m.key === metric)?.value}</strong>
              <span>{METRICS.find(m => m.key === metric)?.label} · recorded target</span>
            </div>
            <p className="mono-note">Baseline statistics come from the adaptive baseline; variance, correlation, skew and kurtosis are computed from the recorded signal.</p>
          </section>
        </div>
      </div>

      {/* Importance + distribution ----------------------------------- */}
      <div className="tl-grid2">
        <section className="panel tl-importance">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">FEATURE IMPORTANCE</span>
              <h2>What the model leans on</h2>
            </div>
            <Tag tone={weights.length ? "lime" : "neutral"}>{weights.length ? "recorded weights" : "derived"}</Tag>
          </div>
          {importance.length ? (
            <div className="tl-imp">
              {importance.map(f => (
                <div className="tl-imp__row" key={f.label} title={`${f.label} · importance ${f.value}`}>
                  <span>{f.label}</span>
                  <div className="tl-imp__track"><i style={{ width: `${(f.value / maxImportance) * 100}%` }} /></div>
                  <strong>{f.value.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="mono-note">No feature weights have been recorded — run the model competition stage.</p>}
          <p className="mono-note">{weights.length ? "Weights as recorded by the winning model." : "Derived from the features each transformation wrote."}</p>
        </section>

        <section className="panel tl-dist-card">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">BEFORE / AFTER DISTRIBUTION</span>
              <h2>{targetName}</h2>
            </div>
            <span className="mono-note">{signal.length} readings</span>
          </div>
          <Distribution values={signal.map(p => p.baseline)} after={signal.map(p => p.energy)} unit={unit} />
        </section>
      </div>

      {/* Signal graph ------------------------------------------------- */}
      <section className="panel tl-signal">
        <div className="tl-head">
          <div>
            <span className="section-eyebrow">MODEL-READY SIGNAL</span>
            <h2>Raw, transformed and baseline on one axis</h2>
          </div>
          <span className="mono-note">{chartData.length ? `${chartData.length} points` : "no recorded series"}</span>
        </div>
        {chartData.length ? (
          <SignalChart data={chartData} unit={unit} rolling />
        ) : (
          <p className="mono-note">No recorded series for this dataset yet — run the pipeline to plot it.</p>
        )}
      </section>

      {/* Heatmap + lineage ------------------------------------------- */}
      <div className="tl-grid2">
        <section className="panel tl-heat-card">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">NORMAL BEHAVIOUR</span>
              <h2>When this dataset behaves normally</h2>
            </div>
            <span className="mono-note">hour of week · {baseline?.target || "target"}</span>
          </div>
          {cells.length ? (
            <Heat cells={cells} unit={unit} target={baseline?.target || "target"} />
          ) : (
            <p className="mono-note">Run the adaptive baseline stage to learn this dataset's own normal behaviour.</p>
          )}
        </section>

        <section className="panel tl-lineage">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">FEATURE LINEAGE</span>
              <h2>Raw column to prediction</h2>
            </div>
            <WandSparkles size={15} />
          </div>
          <div className="tl-lin">
            <div className="tl-lin__stage">
              <small>RAW COLUMN</small>
              <span>{lineage.raw}</span>
            </div>
            <span className="tl-lin__wire"><i /></span>
            <div className="tl-lin__stage">
              <small>TRANSFORMATION</small>
              <span>{lineage.steps.join(" → ") || "not recorded"}</span>
            </div>
            <span className="tl-lin__wire"><i /></span>
            <div className="tl-lin__stage">
              <small>GENERATED FEATURE</small>
              <span>{lineage.produced.join(" · ")}</span>
            </div>
            <span className="tl-lin__wire"><i /></span>
            <div className="tl-lin__stage">
              <small>USED BY</small>
              <span>{lineage.usedBy}</span>
            </div>
            <span className="tl-lin__wire"><i /></span>
            <div className="tl-lin__stage tl-lin__stage--end">
              <small>PREDICTION</small>
              <span>forecast stage</span>
            </div>
          </div>
          <div className="tl-lin__versions">
            <span className="mono-note">Recorded versions</span>
            {versions.length ? versions.slice(0, 6).map(v => (
              <span key={v.version} className="tl-lin__version">v{v.version} · {v.rowCount || "—"} rows</span>
            )) : <span className="mono-note">none yet</span>}
          </div>
        </section>
      </div>

      {/* Timeline + logs --------------------------------------------- */}
      <div className="tl-grid2">
        <section className="panel tl-timeline">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">TRANSFORMATION TIMELINE</span>
              <h2>Stage by stage</h2>
            </div>
            <button type="button" className="tl-mini" onClick={() => { setStep(0); timers.current.forEach(id => window.clearTimeout(id)); timers.current = []; for (let i = 0; i < timelineDone; i++) timers.current.push(window.setTimeout(() => setStep(i + 1), 200 * (i + 1))); }}>
              <RotateCcw size={11} /> replay
            </button>
          </div>
          <ol className="tl-tl">
            {timeline.map((t, i) => (
              <li key={t.key} className={i < step ? "tl-tl__item tl-tl__item--done" : "tl-tl__item"}>
                <button type="button" onClick={() => setNodeKey(nodeKey === t.key ? null : t.key)}>
                  <span className="tl-tl__bead">{i < step ? <Check size={9} /> : null}</span>
                  <span className="tl-tl__label">{t.label}</span>
                </button>
              </li>
            ))}
          </ol>
          {activeNode ? (
            <div className="tl-tl__detail">
              <strong>{activeNode.label}</strong>
              <p>{activeNode.detail}</p>
              <span className="mono-note">rows {fmt(rows, 0)} · version {baselineName || "—"}</span>
            </div>
          ) : null}
        </section>

        <section className="panel tl-logs">
          <div className="tl-head">
            <div>
              <span className="section-eyebrow">PROCESSING LOG</span>
              <h2>{steps.length} entries</h2>
            </div>
            <button type="button" className="tl-mini" onClick={() => setShowLogs(v => !v)}>{showLogs ? "collapse" : "expand all"}</button>
          </div>
          {steps.length ? steps.map(s => (
            <div className="tl-log" key={s.key}>
              <div className="tl-log__head">
                <span className="mono-note">{s.appliedAt ? new Date(s.appliedAt).toLocaleTimeString() : "—"}</span>
                <strong>{s.label}</strong>
                <Tag tone={s.status === "done" ? "lime" : "blue"}>{s.status || "recorded"}</Tag>
                <span className="mono-note">{s.rowsChanged.toLocaleString("en-IN")} rows</span>
              </div>
              {showLogs ? (
                <div className="tl-log__body">
                  <code>$ stage transform --step {s.key}</code>
                  <code>{`  purpose="${s.purpose || "not recorded"}"`}</code>
                  <code>{`  columns=[${s.columns.slice(0, 4).join(", ")}] rows=${s.rowsChanged}`}</code>
                  {s.note ? <code>  note: {s.note}</code> : null}
                  <code>  status={s.status || "recorded"} · warnings=0 · errors=0</code>
                </div>
              ) : null}
            </div>
          )) : <p className="mono-note">No transformation log recorded yet.</p>}
        </section>
      </div>

      <div className="tl-trace">
        <div className="tl-trace__label"><Database size={15} /><span>VERSIONED DATABASE TRACE</span></div>
        <div className="tl-trace__flow">
          <span>uploaded source</span>
          <ArrowRight size={13} />
          <span className="tl-trace__active">transformed</span>
          <ArrowRight size={13} />
          <span>model input</span>
        </div>
        <span className="tl-trace__status">
          <span className="status-dot status-dot--lime" />
          {steps.length ? `${steps.length} steps recorded` : "awaiting stage 05"}
        </span>
      </div>

      <div className="tl-foot">
        <DatabaseZap size={13} />
        <span>Every step writes a new immutable version — the uploaded file is never modified.</span>
        <span className="mono-note">{steps.reduce((n, s) => n + s.rowsChanged, 0).toLocaleString("en-IN")} rows touched</span>
      </div>

      {/* The page had no forward exit: a reader finished at the trace footer with
          no indication that data quality is the next stage. */}
      <div className="tl-next">
        <div>
          <span className="section-eyebrow">NEXT</span>
          <p>Model competition evaluates multiple algorithms on this processed signal.</p>
        </div>
        <button type="button" className="tl-btn tl-btn--next" onClick={onNext} disabled={!onNext}>
          Continue to model competition <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

export default TransformLab;
