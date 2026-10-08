/**
 * Loads the recorded FastAPI backend output and maps it onto the shapes the
 * AppShell views already render (the original mock arrays). Anything that has
 * not run yet simply stays undefined so the caller keeps its mock fallback.
 */
import { roleForColumn } from "./schema";
import {
  Briefcase,
  Building2,
  Droplets,
  Factory,
  GraduationCap,
  HeartPulse,
  Plane,
  RadioTower,
  Server,
  ShoppingBag,
  Warehouse,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { displayUnit, unitForColumn } from "@/lib/units";
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
  domain: BackendDomain;
  type: string;
  detail: string;
  rows: string;
  freshness: string;
  health: string;
  accent: string;
  icon: LucideIcon;
  location: string;
  unitSystem: "metric-india" | "metric-eu";
  fieldCount?: number;
  rowCount?: number;
  columnCount?: number;
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
export type LiveModel = {
  name: string;
  short: string;
  mae: number;
  rmse: number;
  r2: number;
  color: string;
  rank?: number;
  selected?: boolean;
  score?: number;
  rationale?: string;
  family?: string;
  /** Recorded training duration for this candidate, in seconds. */
  trainSeconds?: number;
  /** Recorded composite selection score (higher is better). */
  composite?: number;
  /** Recorded per-metric normalised scores, 0–1. */
  normalised?: { r2: number; rmse: number; speed: number };
  /**
   * Recorded backtest MAPE, or null when the recorded value is not meaningful
   * (a near-zero denominator produces values in the billions — never shown).
   */
  mape?: number | null;
};

/**
 * One selectable time scale. Options are derived from what the active dataset
 * actually recorded, so a dataset with no index column receives no options and
 * the control disappears instead of offering a scale the data cannot express.
 */
export type LiveWindowOption = {
  id: string;
  label: string;
  detail: string;
  /** How many trailing recorded buckets this option shows. */
  points: number;
};

const WINDOW_LADDER: { maxSpanDays: number; options: { id: string; label: string; points: number }[] }[] = [
  { maxSpanDays: 1, options: [{ id: "6h", label: "6 h", points: 6 }, { id: "12h", label: "12 h", points: 12 }, { id: "24h", label: "24 h", points: 24 }] },
  { maxSpanDays: 3, options: [{ id: "24h", label: "24 h", points: 24 }, { id: "2d", label: "2 d", points: 48 }, { id: "3d", label: "3 d", points: 72 }] },
  { maxSpanDays: 14, options: [{ id: "3d", label: "3 d", points: 72 }, { id: "7d", label: "7 d", points: 168 }, { id: "14d", label: "14 d", points: 336 }] },
  { maxSpanDays: 60, options: [{ id: "7d", label: "7 d", points: 168 }, { id: "30d", label: "30 d", points: 720 }, { id: "60d", label: "60 d", points: 1440 }] },
  { maxSpanDays: 200, options: [{ id: "30d", label: "30 d", points: 720 }, { id: "90d", label: "90 d", points: 2160 }, { id: "180d", label: "180 d", points: 4320 }] },
  { maxSpanDays: Infinity, options: [{ id: "90d", label: "90 d", points: 2160 }, { id: "1y", label: "1 y", points: 8760 }, { id: "all", label: "All", points: 100000 }] },
];

const daysBetween = (start?: string | null, end?: string | null): number => {
  if (!start || !end) return 0;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!isFinite(a) || !isFinite(b) || b <= a) return 0;
  return (b - a) / 86_400_000;
};

/**
 * Derive the time-scale control from recorded facts only: the presence of an
 * index (time) column, the baseline's recorded date range, and how many buckets
 * the recorded series actually contains.
 */
export const deriveWindowOptions = (
  schema: LiveSchemaField[] | null,
  baseline: LiveBaseline | undefined,
  seriesLength: number
): LiveWindowOption[] => {
  if (!seriesLength) return [];
  // `field.role` carries the backend's raw semantic type (e.g. "energy
  // timestamp"), so the canonical role has to be derived from the column name
  // exactly as the schema view does — comparing the raw string to "index"
  // would never match.
  const hasTimeAxis = (schema ?? []).some(field => roleForColumn(field.name, field.role) === "index");
  if (!hasTimeAxis) return [];
  const span = daysBetween(baseline?.rangeStart, baseline?.rangeEnd);
  const rung = WINDOW_LADDER.find(entry => span <= entry.maxSpanDays) ?? WINDOW_LADDER[WINDOW_LADDER.length - 1];
  const seen = new Set<number>();
  const options: LiveWindowOption[] = [];
  for (const option of rung.options) {
    const points = Math.min(option.points, seriesLength);
    if (seen.has(points)) continue;
    seen.add(points);
    options.push({
      id: option.id,
      label: option.label,
      points,
      detail: `${points} recorded ${points === 1 ? "bucket" : "buckets"}${span ? ` · dataset spans ${Math.round(span)} d` : ""}`,
    });
  }
  if (options.length < 2) {
    // The recorded series is coarser than the ladder ever offers. Show the two
    // windows it can genuinely express instead of two identical buttons.
    const half = Math.max(1, Math.round(seriesLength / 2));
    options.length = 0;
    options.push({ id: "half", label: "Half", points: half, detail: `${half} of ${seriesLength} recorded buckets` });
    options.push({ id: "all", label: "All", points: seriesLength, detail: `all ${seriesLength} recorded buckets` });
  }
  return options;
};
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
  deviationPct?: number;
  excessCost?: number;
  excessCo2?: number;
  score?: number;
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

export type LiveStage = {
  id: string;
  label: string;
  number: number;
  status: "completed" | "failed" | "pending";
  durationMs: number;
  decision: string;
  ranAt?: string;
};

export type LiveCompetition = {
  winner: string;
  rationale: string;
  nearTie: boolean;
  margin: number;
  target: string;
  trainRows: number;
  testRows: number;
  features: number;
  weights: { label: string; weight: number }[];
  criteria: string[];
  lostCriteria: string[];
};

export type LiveQualityMeta = { score: number; passed: number; failed: number };

export type LiveAnomalyMeta = {
  total: number;
  severity: Record<string, number>;
  byClass: { label: string; count: number }[];
  devices: number;
  ratePct: number;
  threshold: number;
  excessCost: number;
  excessCo2: number;
  scanned: number;
};

export type LiveForecastMeta = {
  algorithm: string;
  mape: number;
  origin: string;
  mapeLabel: string;
  baselineVersion?: number;
};

export type LiveRecMeta = {
  total: number;
  p1: number;
  savingsInr: number;
  savingsKwh: number;
  savingsCo2: number;
};

export type LiveRun = {
  id: string;
  datasetId: string;
  datasetName: string;
  status: string;
  started: string;
  completed: string | null;
  stagesDone: number;
  total: number;
};

export type LiveSchemaField = {
  name: string;
  dtype: string;
  nullable: boolean;
  nullPct: string;
  unique?: string;
  sample: string;
  role: string;
};

export type LiveBaselineVersion = {
  version: number;
  rowCount: number;
  created: string | null;
};

/** One recorded transformation step (label, purpose and before → after evidence). */
export type LiveTransformField = {
  column: string;
  before: string;
  after: string;
  changed: boolean;
  unitBefore: string;
  unitAfter: string;
};

export type LiveTransformStep = {
  key: string;
  order: number;
  label: string;
  purpose: string;
  status: string;
  rowsChanged: number;
  columns: string[];
  fields: LiveTransformField[];
  note: string | null;
  appliedAt: string | null;
};

export type LiveTransform = {
  steps: LiveTransformStep[];
  decision: string;
};

/** One learned hour-of-week cell of the adaptive baseline. */
export type LiveBaselineCell = {
  /** 0 = Monday … 6 = Sunday (pandas dayofweek on the backend). */
  day: number;
  hour: number;
  median: number;
  mean: number;
  count: number;
};

/** The adaptive baseline record the backend computed for this dataset. */
export type LiveBaseline = {
  target: string;
  unit: string;
  deviceColumn: string;
  rowCount: number;
  generatedAt: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  stats: { mean: number; median: number; std: number; min: number; max: number; p25: number; p75: number; p95: number };
  hourOfWeek: LiveBaselineCell[];
};

export type LiveWorkspace = {
  datasets: LiveDataset[];
  /** The dataset every other field on this object was recorded for. */
  activeDatasetId?: string;
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
  targetColumn?: string;
  targetUnit?: string;
  runId?: string | null;
  stages?: LiveStage[];
  competition?: LiveCompetition;
  qualityMeta?: LiveQualityMeta;
  anomalyMeta?: LiveAnomalyMeta;
  forecastMeta?: LiveForecastMeta;
  recMeta?: LiveRecMeta;
  runs?: LiveRun[];
  schema?: LiveSchemaField[];
  baselineVersions?: LiveBaselineVersion[];
  transform?: LiveTransform;
  baseline?: LiveBaseline;
  lastStage?: string;
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
// Accent cycles per library index. Tokens map to the semantic colour system in
// DESIGN_DECISIONS.md §2; each has a matching `.accent--<name>` rule in CSS.
const ACCENTS = ["lime", "blue", "violet", "orange", "yellow", "coral"];
export type BackendDomain =
  | "building"
  | "industry"
  | "logistics"
  | "hospital"
  | "campus"
  | "mall"
  | "office"
  | "datacentre"
  | "plant"
  | "transport"
  | "telecom"
  | "water";

const DOMAIN_LABELS: Record<BackendDomain, string> = {
  building: "Commercial building",
  industry: "Industrial plant",
  logistics: "Distribution center",
  hospital: "Hospital",
  campus: "University campus",
  mall: "Shopping mall",
  office: "Office complex",
  datacentre: "Data centre",
  plant: "Generation plant",
  transport: "Transport hub",
  telecom: "Telecom site",
  water: "Water utility",
};
const DOMAIN_ICONS: Record<BackendDomain, LucideIcon> = {
  building: Building2,
  industry: Factory,
  logistics: Warehouse,
  hospital: HeartPulse,
  campus: GraduationCap,
  mall: ShoppingBag,
  office: Briefcase,
  datacentre: Server,
  plant: Zap,
  transport: Plane,
  telecom: RadioTower,
  water: Droplets,
};

/**
 * Domain heuristic. Only the dataset's recorded name, description and
 * granularity are consulted — the backend owns classification, this is a
 * display-time label. Most specific match wins; unclaimed text is a building.
 */
const DOMAIN_RULES: { domain: BackendDomain; pattern: RegExp }[] = [
  // Specific energy fields first: a "solar plant" or a "water treatment plant"
  // must not be swallowed by the generic industry /plant/ rule below.
  { domain: "water", pattern: /water treat|wastewater|waste water|desalinat|sewage|aeration|pumping station|reservoir/ },
  { domain: "telecom", pattern: /telecom|cell site|base station|radio tower|\btower\b|antenna|\b5g\b|\blte\b|fibre|fiber/ },
  { domain: "plant", pattern: /solar|photovolt|\bwind\b|wind farm|turbine|inverter|district heating|heat pump|geothermal|\bhydro\b|generation plant|power plant|substation|\bpv\b/ },
  { domain: "transport", pattern: /airport|railway|\bmetro\b|\btram\b|bus depot|\bev\b|charging hub|car park|parking|harbou?r|seaport|\bport\b|\bterminal\b/ },
  { domain: "hospital", pattern: /hospital|clinic|medical|healthcare|patient|ward|diagnos|pharma|surgic/ },
  { domain: "datacentre", pattern: /data ?cent|datacent|colocat|server farm|compute hall|hyperscale|cabinet|ups \+|crac/ },
  { domain: "campus", pattern: /campus|universit|college|school|academy|dormitor|hostel|faculty|lecture/ },
  { domain: "mall", pattern: /\bmall\b|retail|shopping cent|hypermarket|showroom|anchor store|footfall|food court/ },
  { domain: "logistics", pattern: /warehous|logistic|distribut|cold chain|cold storage|coldstore|cold-room|coldroom|freezer|transit|freight|depot|pallet/ },
  { domain: "industry", pattern: /plant|factory|industri|manufact|production line|machin|motor|compressor|kiln|furnace|mining|\bmine\b|crusher|smelter|quarry|haulage/ },
  { domain: "office", pattern: /office|headquarter|\bhq\b|cowork|business park|corporate campus|desk/ },
];

const domainOf = (d: BackendDataset): BackendDomain => {
  const declared = String(d.domain ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const known = Object.keys(DOMAIN_LABELS) as BackendDomain[];
  const declaredHit = known.find(key => key.replace(/[\s_-]/g, "") === declared);
  if (declaredHit) return declaredHit;
  const s = `${d.name ?? ""} ${d.description ?? ""} ${d.granularity ?? ""}`.toLowerCase();
  return DOMAIN_RULES.find(rule => rule.pattern.test(s))?.domain ?? "building";
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
    fieldCount: typeof d.column_count === "number" ? d.column_count : undefined,
    rowCount: typeof d.row_count === "number" ? d.row_count : undefined,
    columnCount: typeof d.column_count === "number" ? d.column_count : undefined,
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
      const rationale = c.selection_rationale;
      const score = typeof c.composite_score === "number" ? c.composite_score : undefined;
      const norm = (c.normalised ?? {}) as Record<string, number>;
      const mapeRaw = Number(metrics.mape);
      return {
        name: (c.display_name as string) ?? (c.algorithm as string) ?? `Model ${i + 1}`,
        short: shortModelName(c.algorithm as string | undefined),
        mae: num(metrics.mae, 2),
        rmse: num(metrics.rmse, 2),
        r2: num(metrics.r2, 3),
        color: MODEL_COLORS[i % MODEL_COLORS.length],
        rank: Number(c.selection_rank ?? i + 1),
        selected: Boolean(c.is_selected),
        score: score != null ? Number(score.toFixed(3)) : undefined,
        rationale: typeof rationale === "string" && rationale ? rationale : undefined,
        family: typeof c.family === "string" ? c.family : undefined,
        trainSeconds: typeof metrics.training_seconds === "number" ? Number(metrics.training_seconds.toFixed(3)) : undefined,
        composite: score != null ? Number(score.toFixed(3)) : undefined,
        normalised: {
          r2: Number(norm.r2 ?? 0),
          rmse: Number(norm.rmse ?? 0),
          speed: Number(norm.speed ?? 0),
        },
        // A near-zero denominator produces MAPE in the billions. That is a real
        // recorded number and a meaningless one, so it is reported as absent.
        mape: isFinite(mapeRaw) && mapeRaw > 0 && mapeRaw < 1000 ? Number(mapeRaw.toFixed(2)) : null,
      };
    });
};

const toStrList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(x => x != null).map(String) : [];

const mapCompetition = (out: StageOutput): LiveCompetition | undefined => {
  const algo = out.selected_algorithm;
  if (typeof algo !== "string" || !algo) return undefined;
  const weightsRaw = (out.weights ?? {}) as Record<string, unknown>;
  return {
    winner: algo,
    rationale: typeof out.rationale === "string" ? out.rationale : "",
    nearTie: Boolean(out.near_tie),
    margin: Number(out.margin_over_second ?? 0),
    target: typeof out.target_column === "string" ? out.target_column : "—",
    trainRows: Number(out.train_rows ?? 0),
    testRows: Number(out.test_rows ?? 0),
    features: Number(out.feature_count ?? 0),
    weights: Object.entries(weightsRaw)
      .map(([label, weight]) => ({ label: label.replace(/_/g, " "), weight: Number(weight) || 0 }))
      .filter(w => w.weight > 0),
    criteria: toStrList(out.winning_criteria),
    lostCriteria: toStrList(out.lost_criteria),
  };
};

const mapQualityMeta = (out: StageOutput): LiveQualityMeta => ({
  score: Math.round(Number(out.overall_score ?? 0)),
  passed: Number(out.passed_count ?? 0),
  failed: Number(out.failed_count ?? 0),
});

const mapAnomalyMeta = (
  out: StageOutput | null,
  listRaw: Record<string, unknown> | undefined,
): LiveAnomalyMeta => {
  const sev = (listRaw?.severity_counts ?? out?.by_severity ?? {}) as Record<string, number>;
  const classes = (listRaw?.class_counts ?? out?.by_class ?? {}) as Record<string, number>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  return {
    total: num(listRaw?.total) || num(out?.total),
    severity: Object.fromEntries(Object.entries(sev).map(([k, v]) => [k, num(v)])),
    byClass: Object.entries(classes)
      .map(([label, count]) => ({ label, count: num(count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    devices: num(out?.devices_affected),
    ratePct: num(out?.detection_rate_pct),
    threshold: num(out?.threshold),
    excessCost: num(out?.excess_cost),
    excessCo2: num(out?.excess_co2_kg),
    scanned: num(out?.readings_scanned),
  };
};

const mapForecastMeta = (out: StageOutput | null, chart: Record<string, unknown> | undefined): LiveForecastMeta | undefined => {
  if (!out) return undefined;
  const origin = typeof out.origin_timestamp === "string" ? out.origin_timestamp : "";
  return {
    algorithm: typeof out.selected_algorithm === "string" ? out.selected_algorithm : "—",
    mape: Number(out.mape_backtest ?? 0),
    origin: origin ? fmtTimestamp(origin) : "—",
    mapeLabel: Number(out.mape_backtest ?? 0) ? `${Number(out.mape_backtest).toFixed(1)}% MAPE backtest` : "backtest pending",
    ...(chart && chart.baseline_version != null ? { baselineVersion: Number(chart.baseline_version) } : {}),
  };
};

const mapRecMeta = (out: StageOutput, recs: LiveRec[]): LiveRecMeta => {
  const raw = Array.isArray(out.recommendations) ? (out.recommendations as Record<string, unknown>[]) : [];
  const sum = (key: string) => raw.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
  const p1 = raw.filter(r => String(r.priority ?? "").toUpperCase() === "P1").length;
  return {
    total: Number(out.total ?? raw.length) || recs.length,
    p1,
    savingsInr: sum("savings_cost_inr"),
    savingsKwh: sum("savings_kwh"),
    savingsCo2: sum("savings_co2_kg"),
  };
};

const STAGE_LABELS: Record<string, string> = {
  library: "Library",
  import: "Import",
  schema: "Schema",
  quality: "Quality",
  transformation: "Transform",
  model_selection: "Models",
  anomaly: "Anomalies",
  forecast: "Prediction",
  recommendation: "Recommendations",
  report: "Reports",
};

const mapStages = (traces: Record<string, unknown>[]): LiveStage[] =>
  traces
    .map(t => ({
      id: String(t.stage_key ?? ""),
      label: STAGE_LABELS[String(t.stage_key ?? "")] ?? String(t.stage_name ?? t.stage_key ?? "Stage"),
      number: Number(t.stage_number ?? 0),
      status:
        t.status === "completed" ? ("completed" as const)
        : t.status === "failed" ? ("failed" as const)
        : ("pending" as const),
      durationMs: Number(t.duration_ms ?? 0),
      decision: typeof t.decision === "string" ? t.decision : "",
      ranAt: typeof t.completed_at === "string" ? t.completed_at : undefined,
    }))
    .sort((a, b) => a.number - b.number);

const mapRuns = (runs: Record<string, unknown>[], nameById: Map<string, string>): LiveRun[] =>
  [...runs]
    .sort((a, b) => Date.parse(String(b.started_at ?? "")) - Date.parse(String(a.started_at ?? "")))
    .map(r => ({
      id: String(r.id ?? ""),
      datasetId: String(r.dataset_id ?? ""),
      datasetName: nameById.get(String(r.dataset_id ?? "")) ?? "Dataset",
      status: String(r.status ?? "unknown"),
      started: typeof r.started_at === "string" ? r.started_at : "",
      completed: typeof r.completed_at === "string" ? r.completed_at : null,
      stagesDone: Array.isArray(r.stages_completed) ? r.stages_completed.length : Number(r.stages_completed ?? 0) || 0,
      total: Number(r.total_stages ?? 10),
    }));

const mapSchema = (res: Record<string, unknown> | undefined): LiveSchemaField[] => {
  const cols = res && Array.isArray(res.columns) ? (res.columns as Record<string, unknown>[]) : [];
  return cols.map(c => {
    const samples = Array.isArray(c.sample_values) ? (c.sample_values as unknown[]) : [];
    const nullCount = Number(c.null_count ?? 0);
    const stat = (c.statistics ?? {}) as Record<string, unknown>;
    const rowCount = Number(stat.row_count ?? stat.total_rows ?? 0);
    const nullPct = rowCount > 0 ? `${((nullCount / rowCount) * 100).toFixed(1)}%` : "0%";
    const unique = c.unique_count;
    return {
      name: String(c.name ?? "—"),
      dtype: String(c.data_type ?? "—"),
      nullable: Boolean(c.nullable),
      nullPct,
      unique: typeof unique === "number" && isFinite(unique) ? fmtInt(unique) : undefined,
      sample: samples.length ? String(samples[0]) : "—",
      role: typeof c.semantic_type === "string" && c.semantic_type ? c.semantic_type.replace(/_/g, " ") : "field",
    };
  });
};

/** Map the recorded transformation stage: the steps it actually ran, with evidence. */
const mapTransform = (out: StageOutput | null, decision: string): LiveTransform | undefined => {
  if (!out) return undefined;
  const raw = Array.isArray(out.steps) ? (out.steps as Record<string, unknown>[]) : [];
  if (!raw.length) return undefined;
  const steps: LiveTransformStep[] = [...raw]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map(s => ({
      key: String(s.step_key ?? "step"),
      order: Number(s.order ?? 0),
      label: String(s.label ?? String(s.step_key ?? "step").replace(/_/g, " ")),
      purpose: String(s.purpose ?? ""),
      status: String(s.status ?? ""),
      rowsChanged: Number(s.rows_changed ?? 0),
      columns: Array.isArray(s.affected_columns) ? (s.affected_columns as unknown[]).map(String) : [],
      fields: Array.isArray(s.fields)
        ? (s.fields as Record<string, unknown>[]).map(f => ({
            column: String(f.column_name ?? "—"),
            before: String(f.before_value ?? "—"),
            after: String(f.after_value ?? "—"),
            changed: Boolean(f.changed),
            unitBefore: typeof f.unit_before === "string" ? f.unit_before : "",
            unitAfter: typeof f.unit_after === "string" ? f.unit_after : "",
          }))
        : [],
      note: typeof s.note === "string" && s.note ? s.note : null,
      appliedAt: typeof s.applied_at === "string" ? s.applied_at : null,
    }));
  return { steps, decision };
};

/** Map the adaptive baseline record: learned profile, statistics and identity. */
const mapBaseline = (res: Record<string, unknown> | null | undefined): LiveBaseline | undefined => {
  if (!res || typeof res !== "object") return undefined;
  const stats = (res.statistics ?? {}) as Record<string, number>;
  const how = (res.hour_of_week ?? {}) as Record<string, Record<string, number>>;
  const hourOfWeek: LiveBaselineCell[] = Object.entries(how)
    .map(([key, value]) => {
      const [day, hour] = key.split("-").map(Number);
      if (!isFinite(day) || !isFinite(hour)) return null;
      return { day, hour, median: Number(value?.median ?? 0), mean: Number(value?.mean ?? 0), count: Number(value?.count ?? 0) };
    })
    .filter((cell): cell is LiveBaselineCell => cell !== null)
    .sort((a, b) => a.day - b.day || a.hour - b.hour);
  const range = (res.date_range ?? {}) as Record<string, string>;
  return {
    target: String(res.target_column ?? ""),
    unit: String(res.unit ?? ""),
    deviceColumn: String(res.device_column ?? ""),
    rowCount: Number(res.row_count ?? 0),
    generatedAt: typeof res.generated_at === "string" ? res.generated_at : null,
    rangeStart: typeof range.start === "string" ? range.start : null,
    rangeEnd: typeof range.end === "string" ? range.end : null,
    stats: {
      mean: Number(stats.mean ?? 0),
      median: Number(stats.median ?? 0),
      std: Number(stats.std ?? 0),
      min: Number(stats.min ?? 0),
      max: Number(stats.max ?? 0),
      p25: Number(stats.p25 ?? 0),
      p75: Number(stats.p75 ?? 0),
      p95: Number(stats.p95 ?? 0),
    },
    hourOfWeek,
  };
};

const mapBaselineVersions = (res: { versions?: Record<string, unknown>[] } | undefined): LiveBaselineVersion[] => {
  const list = res?.versions ?? [];
  return list.map(v => ({
    version: Number(v.version ?? 0),
    rowCount: Number(v.row_count ?? 0),
    created: (typeof v.created_at === "string" && v.created_at) ||
      (typeof v.computed_at === "string" && v.computed_at) || null,
  }));
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
      deviationPct: deviation,
      excessCost: Number(a.excess_cost) || undefined,
      excessCo2: Number(a.excess_co2_kg) || undefined,
      score: Number(a.score) || undefined,
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
  // Keep the recorded resolution. Capping at a dozen points made every
  // time-window option collapse to the same slice, so the control could not
  // express anything the dataset actually contained.
  const sample = downsample(series, 2000);
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
      ? `Save ~${displayUnit("INR")}${fmtInt(cost)} / mo`
      : co2 > 0
        ? `Avoid ${fmtInt(co2)} ${displayUnit("kgCO2")} / mo`
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
  // Strictly this dataset's runs. Falling back to "any run" silently showed a
  // different dataset's stages, model and anomalies under the active dataset's
  // name, which is exactly the kind of borrowed number the product forbids.
  const relevant = runs.filter(r => r.dataset_id === datasetId);
  if (!relevant.length) return null;
  return (
    [...relevant].sort((a, b) => {
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
export async function loadWorkspace(preferredDatasetId?: string): Promise<{
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

    const nameById = new Map(dsList.map(d => [d.id, d.name]));
    const runsRes = await workflow.list().catch(() => ({ runs: [] as unknown as RunPayload[] }));
    const runList = ((runsRes.runs ?? []) as unknown as Record<string, unknown>[]);
    if (runList.length) ws.runs = mapRuns(runList, nameById);

    // The active dataset must own the run whose outputs this object carries.
    // Prefer the caller's selection, else the dataset of the most recent
    // completed run (so the app opens on recorded work rather than a blank
    // page), else the newest dataset.
    const completedRuns = (runList as unknown as RunPayload[])
      .filter(r => r.status === "completed" && r.dataset_id && nameById.has(r.dataset_id))
      .sort((a, b) => Date.parse(String(b.started_at ?? "")) - Date.parse(String(a.started_at ?? "")));
    const fallbackId = completedRuns[0]?.dataset_id ?? dsList[0].id;
    const activeId =
      preferredDatasetId && nameById.has(preferredDatasetId) ? preferredDatasetId : fallbackId;
    ws.activeDatasetId = activeId;
    const run = pickRun(runList as unknown as RunPayload[], activeId);

    const [schemaRes, baseVersions, baseRes] = await Promise.all([
      domain.schema(activeId).catch(() => null),
      domain.baselineVersions(activeId).catch(() => null),
      domain.baseline(activeId).catch(() => null),
    ]);
    const mappedBaseline = mapBaseline(baseRes as Record<string, unknown> | null);
    if (mappedBaseline) {
      ws.baseline = mappedBaseline;
      // The stage traces do not always carry a baseline version, but the
      // baseline endpoint always records how much data it learned from. Use
      // that instead of claiming a version that was never written.
      if (!ws.baselineLabel && mappedBaseline.rowCount) {
        ws.baselineLabel = `Adaptive baseline / ${fmtRows(mappedBaseline.rowCount)} rows`;
      }
    }
    if (schemaRes) {
      const fields = mapSchema(schemaRes as Record<string, unknown>);
      if (fields.length) ws.schema = fields;
    }
    if (baseVersions) {
      const versions = mapBaselineVersions(baseVersions as { versions?: Record<string, unknown>[] });
      if (versions.length) ws.baselineVersions = versions;
    }

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

      if (traces.length) {
        ws.stages = mapStages(traces);
        const last = ws.stages.filter(s => s.status === "completed").pop();
        if (last) ws.lastStage = last.label;
      }

      const qualityOut = outOf("quality");
      if (qualityOut) {
        ws.quality = mapQuality(qualityOut);
        ws.qualityMeta = mapQualityMeta(qualityOut);
      }

      const transformTrace = traces.find(x => x.stage_key === "transformation" && x.status === "completed");
      const mappedTransform = mapTransform(
        (transformTrace?.output_snapshot as StageOutput | undefined) ?? null,
        typeof transformTrace?.decision === "string" ? transformTrace.decision : ""
      );
      if (mappedTransform) ws.transform = mappedTransform;

      const modelOut = outOf("model_selection");
      if (modelOut) {
        ws.models = mapModels(modelOut);
        ws.competition = mapCompetition(modelOut);
        const algo = modelOut.selected_algorithm;
        if (typeof algo === "string" && algo) ws.modelName = algo;
        const target = modelOut.target_column;
        if (typeof target === "string" && target) {
          ws.targetColumn = target;
          ws.targetUnit = unitForColumn(target);
        }
      }

      const fcOut = outOf("forecast");
      const baselineVersion =
        (fcOut?.baseline_version as number | undefined) ??
        (outOf("anomaly")?.baseline_version as number | undefined);
      if (baselineVersion != null) ws.baselineLabel = `Baseline v${baselineVersion}`;

      ws.anomalies = mapAnomalies(anList as Record<string, unknown> | undefined);
      ws.anomalyMeta = mapAnomalyMeta(outOf("anomaly"), anList as Record<string, unknown> | undefined);
      const windows = anomalyWindows(anList as Record<string, unknown> | undefined);
      const chartMap = mapAnomalyChart(anChart as Record<string, unknown> | undefined, windows);
      if (chartMap) {
        ws.anomalyPoints = chartMap.points;
        ws.energy = chartMap.energy;
      }
      const forecast = mapForecast(fcChart as Record<string, unknown> | undefined);
      if (forecast) ws.forecast = forecast;
      ws.forecastMeta = mapForecastMeta(fcOut, fcChart as Record<string, unknown> | undefined);

      if (!ws.targetUnit) {
        const fcTarget = fcOut?.target_column;
        if (typeof fcTarget === "string" && fcTarget) {
          ws.targetColumn = fcTarget;
          ws.targetUnit = unitForColumn(fcTarget);
        }
      }

      const recOut = outOf("recommendation");
      if (recOut) {
        ws.recs = mapRecs(recOut);
        ws.recMeta = mapRecMeta(recOut, ws.recs);
      }
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
