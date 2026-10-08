/**
 * Loads the recorded FastAPI backend output and maps it onto the shapes the
 * AppShell views already render (the original mock arrays). Anything that has
 * not run yet simply stays undefined so the caller keeps its mock fallback.
 */
import { Building2, Factory, Warehouse, type LucideIcon } from "lucide-react";
import {
  activity as activityApi,
  datasets as datasetsApi,
  domain,
  workflow,
  type ActivityEvent,
  type BackendDataset,
} from "@/lib/api";

/* ── View shapes (mirrors the AppShell mock arrays) ─────────────────── */
export type LiveDataset = {
  id: string;
  name: string;
  domain: "building" | "industry" | "logistics";
  type: string;
  detail: string;
  rows: string;
  freshness: string;
  health: string;
  accent: string;
  icon: LucideIcon;
  location: string;
  unitSystem: "metric-india" | "metric-eu";
};
export type LiveIssue = {
  id: string;
  type: string;
  field: string;
  row: string;
  raw: string;
  context: string;
  fixed: string;
  confidence: string;
};
export type LiveModel = { name: string; short: string; mae: number; rmse: number; r2: number; color: string };
export type LivePoint = { time: string; energy: number; baseline: number };
export type LiveAnomalyPoint = { time: string; actual: number; baseline: number; anomaly: number | null };
export type LiveAnomaly = {
  id: string;
  severity: string;
  type: string;
  timestamp: string;
  feature: string;
  reason: string;
  color: string;
};
export type LiveForecastPoint = { day: string; actual: number | null; forecast: number; low: number; high: number };
export type LiveRec = {
  priority: string;
  title: string;
  body: string;
  impact: string;
  confidence: string;
  color: string;
};
export type LiveActivity = {
  time: string;
  status: string;
  service: string;
  operation: string;
  duration: string;
  result: string;
  severity: string;
};

export type LiveWorkspace = {
  datasets: LiveDataset[];
  energy?: LivePoint[];
  forecast?: LiveForecastPoint[];
  quality?: LiveIssue[];
  models?: LiveModel[];
  anomalyPoints?: LiveAnomalyPoint[];
  anomalies?: LiveAnomaly[];
  recs?: LiveRec[];
  activity?: LiveActivity[];
  baselineLabel?: string;
  modelName?: string;
  runId?: string | null;
};

/* ── Formatters ─────────────────────────────────────────────────────── */
const fmtRows = (n?: number): string => {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
};

const fmtFreshness = (iso?: string): string => {
  if (!iso) return "—";
  const mins = (Date.now() - Date.parse(iso)) / 60000;
  if (!isFinite(mins) || mins < 0) return "—";
  if (mins < 1) return "Just now";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)} hr ago`;
  if (hours < 48) return "Yesterday";
  return `${Math.round(hours / 24)} days ago`;
};

const fmtHealth = (defectRate?: number): string => {
  if (defectRate == null || !isFinite(defectRate)) return "—";
  const pct = defectRate <= 1 ? defectRate * 100 : defectRate;
  return `${Math.max(0, 100 - pct).toFixed(1)}%`;
};

const fmtInt = (n?: number): string =>
  n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-IN");

const capitalize = (s?: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const fmtTimestamp = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtClock = (iso?: string, seconds = true): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${base}:${pad(d.getSeconds())}` : base;
};

/* ── Dataset mapping ────────────────────────────────────────────────── */
const ACCENTS = ["lime", "orange", "violet"];
const DOMAIN_LABELS: Record<string, string> = {
  building: "Commercial building",
  industry: "Industrial plant",
  logistics: "Distribution center",
};
const DOMAIN_ICONS: Record<string, LucideIcon> = { building: Building2, industry: Factory, logistics: Warehouse };

const domainOf = (d: BackendDataset): "building" | "industry" | "logistics" => {
  const s = `${d.name ?? ""} ${d.description ?? ""} ${d.granularity ?? ""}`.toLowerCase();
  if (/warehous|logistic|distribut|cold|chain|transit|freight/.test(s)) return "logistics";
  if (/plant|factory|industri|manufact|production|machin/.test(s)) return "industry";
  return "building";
};

const mapDataset = (d: BackendDataset, index: number): LiveDataset => {
  const dom = domainOf(d);
  const detail = typeof d.description === "string" && d.description ? d.description : "Energy telemetry";
  return {
    id: d.id,
    name: d.name ?? "Untitled dataset",
    domain: dom,
    type: DOMAIN_LABELS[dom],
    detail: detail.length > 64 ? `${detail.slice(0, 61)}…` : detail,
    rows: fmtRows(d.row_count),
    freshness: fmtFreshness(d.updated_at ?? d.created_at),
    health: fmtHealth(d.defect_rate as number | undefined),
    accent: ACCENTS[index % ACCENTS.length],
    icon: DOMAIN_ICONS[dom],
    location: "Local · IN",
    unitSystem: "metric-india",
  };
};

/* ── Stage output mappers ───────────────────────────────────────────── */
type StageOutput = Record<string, unknown>;

const issueTypeOf = (r: Record<string, unknown>): string => {
  const s = `${r.rule_name ?? ""} ${r.rule_category ?? ""}`.toLowerCase();
  if (/dup/.test(s)) return "Duplicate";
  if (/timestamp|cadence|interval|sequence/.test(s)) return "Missing timestamp";
  if (/dtype|datatype|type|cast|schema/.test(s)) return "Datatype mismatch";
  if (/invalid|range|negative|outlier|enum|bound/.test(s)) return "Invalid value";
  return "Null value";
};

const mapQuality = (out: StageOutput): LiveIssue[] => {
  const results = Array.isArray(out.results) ? (out.results as Record<string, unknown>[]) : [];
  return results.map((r, i) => {
    const details = (r.details ?? {}) as Record<string, unknown>;
    const gaps = Array.isArray(details.columns_with_gaps) ? (details.columns_with_gaps as string[]) : [];
    const perCol = details.per_column && typeof details.per_column === "object"
      ? Object.keys(details.per_column as Record<string, unknown>)
      : [];
    const nullRate = typeof details.global_null_rate === "number" ? details.global_null_rate : null;
    const context = gaps.length
      ? `Columns with gaps: ${gaps.slice(0, 3).join(", ")}${gaps.length > 3 ? ` +${gaps.length - 3}` : ""}`
      : nullRate != null
        ? `Global null rate ${(nullRate * 100).toFixed(2)}% across ${fmtRows(details.total_cells as number | undefined)} cells`
        : `${r.rule_name ?? "structural check"} · ${r.severity ?? "info"}`;
    return {
      id: `Q-${1024 + i}`,
      type: issueTypeOf(r),
      field: gaps[0] ?? perCol[0] ?? "—",
      row: typeof details.null_cells === "number" && details.null_cells ? fmtInt(details.null_cells) : "—",
      raw: "—",
      context,
      fixed: r.passed ? "Passed" : `Repair pending (${r.severity ?? "warn"})`,
      confidence: `${Math.round(Number(r.score ?? 0))}%`,
    };
  });
};

const shortModelName = (algorithm?: string): string => {
  if (!algorithm) return "AI";
  const words = algorithm.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
};

const MODEL_COLORS = ["#b6f36b", "#79d6c4", "#8d86ff", "#f5a56d", "#f56d9f"];

const mapModels = (out: StageOutput): LiveModel[] => {
  const candidates = Array.isArray(out.candidates) ? (out.candidates as Record<string, unknown>[]) : [];
  return [...candidates]
    .sort((a, b) => Number(a.selection_rank ?? 99) - Number(b.selection_rank ?? 99))
    .map((c, i) => {
      const metrics = (c.metrics ?? {}) as Record<string, number>;
      const num = (v: number | undefined, digits: number) =>
        typeof v === "number" && isFinite(v) ? Number(v.toFixed(digits)) : 0;
      return {
        name: (c.display_name as string) ?? (c.algorithm as string) ?? `Model ${i + 1}`,
        short: shortModelName(c.algorithm as string | undefined),
        mae: num(metrics.mae, 2),
        rmse: num(metrics.rmse, 2),
        r2: num(metrics.r2, 3),
        color: MODEL_COLORS[i % MODEL_COLORS.length],
      };
    });
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "coral",
  high: "orange",
  medium: "yellow",
  low: "blue",
};

const mapAnomalies = (raw: Record<string, unknown> | undefined): LiveAnomaly[] => {
  const list = raw && Array.isArray(raw.anomalies) ? (raw.anomalies as Record<string, unknown>[]) : [];
  return list.slice(0, 24).map((a, i) => {
    const deviation = Number(a.deviation_pct ?? 0);
    return {
      id: `AN-${2048 - i}`,
      severity: capitalize(a.severity as string | undefined),
      type: (a.class_label as string) ?? (a.anomaly_class as string) ?? "Anomaly",
      timestamp: fmtTimestamp(((a.window_start as string) ?? (a.detected_at as string)) || undefined),
      feature: (a.device_code as string) ?? "—",
      reason: `${deviation >= 0 ? "+" : ""}${deviation.toFixed(0)}% vs baseline · score ${Number(a.score ?? 0).toFixed(2)}`,
      color: SEVERITY_COLORS[String(a.severity ?? "").toLowerCase()] ?? "yellow",
    };
  });
};

const downsample = <T>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
};

const anomalyWindows = (raw: Record<string, unknown> | undefined): { start: number; end: number }[] => {
  const list = raw && Array.isArray(raw.anomalies) ? (raw.anomalies as Record<string, unknown>[]) : [];
  return list
    .map(a => {
      const start = Date.parse(String(a.window_start ?? ""));
      const end = Date.parse(String(a.window_end ?? ""));
      return { start, end: isNaN(end) ? start + 3600_000 : end };
    })
    .filter(w => !isNaN(w.start));
};

const mapAnomalyChart = (
  chart: Record<string, unknown> | undefined,
  windows: { start: number; end: number }[],
): { points: LiveAnomalyPoint[]; energy: LivePoint[] } | undefined => {
  const series = chart && Array.isArray(chart.series) ? (chart.series as Record<string, unknown>[]) : [];
  if (!series.length) return undefined;
  const sample = downsample(series, 14);
  const points: LiveAnomalyPoint[] = sample.map(p => {
    const ts = Date.parse(String(p.timestamp ?? ""));
    const observed = Number(p.observed ?? 0);
    const baseline = Number(p.baseline ?? 0);
    const inWindow = windows.some(w => ts >= w.start && ts <= w.end);
    const deviates = baseline > 0 && Math.abs(observed - baseline) / baseline > 0.4;
    return {
      time: fmtClock(String(p.timestamp ?? ""), false),
      actual: Number(observed.toFixed(1)),
      baseline: Number(baseline.toFixed(1)),
      anomaly: inWindow || deviates ? Number(observed.toFixed(1)) : null,
    };
  });
  const energy: LivePoint[] = points.map(p => ({ time: p.time, energy: p.actual, baseline: p.baseline }));
  return { points, energy };
};

const mapForecast = (chart: Record<string, unknown> | undefined): LiveForecastPoint[] | undefined => {
  const hourly = chart && Array.isArray(chart.hourly) ? (chart.hourly as Record<string, unknown>[]) : [];
  if (!hourly.length) return undefined;
  const originRaw = chart!.origin_timestamp;
  const origin = typeof originRaw === "string" ? Date.parse(originRaw) : NaN;
  const byDay = new Map<string, { past: number; future: number; low: number; high: number }>();
  for (const h of hourly) {
    const ts = Date.parse(String(h.timestamp ?? ""));
    if (isNaN(ts)) continue;
    const d = new Date(ts);
    const key = `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
    const bucket = byDay.get(key) ?? { past: 0, future: 0, low: 0, high: 0 };
    const energy = Number(h.energy_kwh ?? 0);
    const lower = Number(h.lower_kwh ?? energy);
    const upper = Number(h.upper_kwh ?? energy);
    const isPast = !isNaN(origin) && ts < origin;
    if (isPast) bucket.past += energy;
    else bucket.future += energy;
    bucket.low += lower;
    bucket.high += upper;
    byDay.set(key, bucket);
  }
  return [...byDay.entries()].slice(0, 7).map(([day, b]) => {
    const forecast = b.future > 0 ? b.future : b.past;
    return {
      day,
      actual: b.past > 0 ? Number(b.past.toFixed(1)) : null,
      forecast: Number(forecast.toFixed(1)),
      low: Number((b.low || forecast * 0.93).toFixed(1)),
      high: Number((b.high || forecast * 1.07).toFixed(1)),
    };
  });
};

const mapRecs = (out: StageOutput): LiveRec[] => {
  const recs = Array.isArray(out.recommendations) ? (out.recommendations as Record<string, unknown>[]) : [];
  const colors = ["lime", "orange", "violet", "lime"];
  return recs.slice(0, 4).map((r, i) => {
    const conf = Number(r.confidence ?? 0);
    const confidence = conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
    const cost = Number(r.savings_cost_inr ?? 0);
    const co2 = Number(r.savings_co2_kg ?? 0);
    const impact = cost > 0
      ? `Save ~₹${fmtInt(cost)} / mo`
      : co2 > 0
        ? `Avoid ${fmtInt(co2)} kgCO₂ / mo`
        : "Impact pending";
    return {
      priority: String(i + 1).padStart(2, "0"),
      title: String(r.title ?? `Action ${i + 1}`),
      body: String(r.action ?? r.reason ?? ""),
      impact,
      confidence: `${confidence}%`,
      color: colors[i % colors.length],
    };
  });
};

/* ── Activity mapping ───────────────────────────────────────────────── */
const activityStatus = (action: string): { status: string; severity: string } => {
  const a = action.toLowerCase();
  if (/fail|error|abort/.test(a)) return { status: "WARN", severity: "warning" };
  if (/exec|generat|compute|detect|forecast/.test(a)) return { status: "DONE", severity: "success" };
  if (/create|upload|start|register|login/.test(a)) return { status: "STREAM", severity: "info" };
  return { status: "DONE", severity: "info" };
};

const briefDetails = (details: Record<string, unknown>): string => {
  const keys = ["summary", "total", "count", "score", "message", "selected_algorithm", "model"];
  for (const k of keys) {
    const v = details[k];
    if (v != null && typeof v !== "object") return `${k.replace(/_/g, " ")} ${String(v)}`;
  }
  const first = Object.entries(details).find(([, v]) => v != null && typeof v !== "object");
  return first ? `${first[0].replace(/_/g, " ")} ${String(first[1])}` : "recorded";
};

const mapActivity = (events: ActivityEvent[]): LiveActivity[] =>
  events.map(e => {
    const action = e.action ?? "event";
    const { status, severity } = activityStatus(action);
    const details = (e.details ?? {}) as Record<string, unknown>;
    const ms = typeof details.elapsed_ms === "number" ? details.elapsed_ms : null;
    return {
      time: fmtClock(e.created_at ?? undefined),
      status,
      service: e.resource_type ?? "system",
      operation: action.replace(/_/g, " "),
      duration: ms != null ? (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`) : "—",
      result: briefDetails(details),
      severity,
    };
  });

/* ── Loader ─────────────────────────────────────────────────────────── */
export const STAGE_KEYS = [
  "library", "import", "schema", "quality", "transformation",
  "model_selection", "anomaly", "forecast", "recommendation", "report",
];

type RunPayload = {
  id: string;
  dataset_id: string;
  status: string;
  stages_completed?: string[];
  started_at?: string | null;
  completed_at?: string | null;
};

const pickRun = (runs: RunPayload[], datasetId: string): RunPayload | null => {
  const relevant = runs.filter(r => r.dataset_id === datasetId);
  const pool = relevant.length ? relevant : runs;
  if (!pool.length) return null;
  return (
    [...pool].sort((a, b) => {
      const aDone = a.status === "completed" ? 1 : 0;
      const bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return bDone - aDone;
      return Date.parse(String(b.started_at ?? "")) - Date.parse(String(a.started_at ?? ""));
    })[0] ?? null
  );
};

/**
 * Fetch everything the shell can show. Returns `pendingRun` when the active
 * dataset has no completed pipeline yet so the caller can kick one off.
 */
export async function loadWorkspace(): Promise<{
  workspace: LiveWorkspace;
  pendingRun: string | null;
} | null> {
  try {
    const dsRes = await datasetsApi.list();
    const backendDatasets = dsRes?.datasets ?? [];
    const dsList = backendDatasets.map(mapDataset);

    const ws: LiveWorkspace = { datasets: dsList };

    const activityRes = await activityApi.list({ limit: 40 }).catch(() => null);
    if (activityRes?.events?.length) ws.activity = mapActivity(activityRes.events);

    if (!dsList.length) return { workspace: ws, pendingRun: null };

    const activeId = dsList[0].id;
    const runsRes = await workflow.list().catch(() => ({ runs: [] as unknown as RunPayload[] }));
    const run = pickRun((runsRes.runs ?? []) as unknown as RunPayload[], activeId);

    const needsRun =
      !run || run.status !== "completed" || !(run.stages_completed ?? []).includes("recommendation");

    if (run) {
      const [detail, anList, anChart, fcChart] = await Promise.all([
        workflow.get(run.id).catch(() => null),
        domain.anomalies(activeId).catch(() => null),
        domain.anomalyChart(activeId).catch(() => null),
        domain.forecastChart(activeId).catch(() => null),
      ]);
      ws.runId = run.id;

      const traces = (detail as { traces?: Record<string, unknown>[] } | null)?.traces ?? [];
      const outOf = (key: string): StageOutput | null => {
        const t = traces.find(x => x.stage_key === key && x.status === "completed");
        return (t?.output_snapshot as StageOutput | undefined) ?? null;
      };

      const qualityOut = outOf("quality");
      if (qualityOut) ws.quality = mapQuality(qualityOut);

      const modelOut = outOf("model_selection");
      if (modelOut) {
        ws.models = mapModels(modelOut);
        const algo = modelOut.selected_algorithm;
        if (typeof algo === "string" && algo) ws.modelName = algo;
      }

      const fcOut = outOf("forecast");
      const baselineVersion =
        (fcOut?.baseline_version as number | undefined) ??
        (outOf("anomaly")?.baseline_version as number | undefined);
      if (baselineVersion != null) ws.baselineLabel = `Baseline v${baselineVersion}`;

      ws.anomalies = mapAnomalies(anList as Record<string, unknown> | undefined);
      const windows = anomalyWindows(anList as Record<string, unknown> | undefined);
      const chartMap = mapAnomalyChart(anChart as Record<string, unknown> | undefined, windows);
      if (chartMap) {
        ws.anomalyPoints = chartMap.points;
        ws.energy = chartMap.energy;
      }
      const forecast = mapForecast(fcChart as Record<string, unknown> | undefined);
      if (forecast) ws.forecast = forecast;

      const recOut = outOf("recommendation");
      if (recOut) ws.recs = mapRecs(recOut);
    }

    return { workspace: ws, pendingRun: needsRun ? activeId : null };
  } catch {
    return null;
  }
}

/** Execute the ten-stage pipeline sequentially (used when no run exists). */
export async function runPipeline(datasetId: string, onStage?: (key: string) => void): Promise<string | null> {
  const started = (await workflow.start(datasetId)) as unknown as {
    run?: { id?: string };
    run_id?: string;
    id?: string;
  };
  const runId = started?.run?.id ?? started?.run_id ?? started?.id ?? null;
  if (!runId) return null;
  for (const key of STAGE_KEYS) {
    await workflow.execStage(runId, key);
    onStage?.(key);
  }
  return runId;
}
