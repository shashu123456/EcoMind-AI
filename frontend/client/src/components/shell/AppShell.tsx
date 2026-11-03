import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Star,
  Activity, AlertTriangle,  ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Building2,
  CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDot, Clock3, CloudUpload,
  Briefcase, Cpu, Database, DatabaseZap, Download, Eye, Factory, FileCheck2, FileClock, FileText, Filter,
  Gauge, GraduationCap, HardDrive, HeartPulse, History, IndianRupee, Info, Layers3, Leaf, Lightbulb, ListFilter, LockKeyhole, Mail, Moon, MousePointer2, Network,
  PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck,
  ShoppingBag, SlidersHorizontal, Sparkles, Sun, SunMedium, Table2, TrendingDown, TrendingUp, UploadCloud, UserRound,
  WandSparkles, Warehouse, X, Zap, Boxes, Plane, RadioTower, Droplets
} from "lucide-react";
import { EcoMindMark } from "@/components/icons/EcoMindMark";
import { useTheme } from "@/contexts/ThemeContext";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip as RechartsTooltip, TooltipProps, XAxis, YAxis } from "recharts";
import "./AppShell.css";
import { useSound, playCompletionChime, playStartTone, unlockAudio } from "@/lib/useSound";
import { auth, datasets as datasetsApi, domain, getToken, setToken, workflow, type AuthUser } from "@/lib/api";
import { displayUnit, unitForColumn } from "@/lib/units";
import { FAMILY_LABEL, ROLE_LABEL, ROLE_NOTE, ROLE_ORDER, familyForColumn, roleForColumn, type FieldFamily, type FieldRole } from "@/lib/schema";
import {
  loadWorkspace, runPipeline, STAGE_KEYS, normaliseSeverity,
  type LiveWorkspace, type LiveDataset, type LiveIssue, type LiveModel, type LivePoint,
  type LiveAnomalyPoint, type LiveAnomaly, type LiveForecastPoint, type LiveRec, type LiveActivity,
  type LiveStage, type LiveCompetition, type LiveQualityMeta, type LiveAnomalyMeta,
  type LiveTransform, type LiveBaseline, type LiveBaselineCell, type BackendDomain,
  type LiveWindowOption, deriveWindowOptions, deriveForecastWindowOptions,
  type LiveForecastMeta, type LiveRecMeta, type LiveRun, type LiveSchemaField, type LiveBaselineVersion,
} from "@/lib/workspace";
import { Snowflake, Thermometer, Waves, ArrowUpDown, Cog, LogOut } from "lucide-react";
import { TransformStep } from "./TransformStep";
import { SchemaDiscovery } from "./SchemaDiscovery";
import { QualityLab } from "./QualityLab";
import { TransformLab } from "./TransformLab";
import { ModelLab } from "./ModelLab";
import { AnomalyLab } from "./AnomalyLab";
import { RecommendationDesk } from "./RecommendationDesk";
import { ForecastLab } from "./ForecastLab";
import { ReportStudio } from "./ReportStudio";
import { LivingHero } from "./LivingHero";
import { CommandPalette } from "./CommandPalette";
import { ImportStudio } from "./ImportStudio";

type NavId = "overview" | "library" | "import" | "schema" | "quality" | "transform" | "models" | "anomalies" | "prediction" | "recommendations" | "reports" | "history" | "notifications" | "settings";
type DatasetDomain = BackendDomain;
type Dataset = { id: string; name: string; domain: DatasetDomain; type: string; detail: string; rows: string; freshness: string; health: string; accent: string; icon: LucideIcon; location: string; unitSystem: "metric-india" | "metric-eu"; fieldCount?: number; rowCount?: number; columnCount?: number };

// Explicit empty state used before any dataset is loaded. It is NOT sample
// data: nothing renders as a metric until the backend returns a real dataset.
const EMPTY_DATASET: Dataset = {
  id: "—",
  name: "No dataset loaded",
  domain: "building",
  type: "Not classified",
  detail: "Import a dataset to begin the ten-stage pipeline.",
  rows: "—",
  freshness: "—",
  health: "—",
  accent: "lime",
  icon: Building2,
  location: "—",
  unitSystem: "metric-india",
};
let datasets: Dataset[] = [];

/**
 * Per-domain identity. `scene` and `anchor` describe what the domain's telemetry
 * actually contains; they never assert a measurement the dataset does not have.
 */
const domainMeta: Record<DatasetDomain, { label: string; sub: string; matchStrength: string; scene: string; icon: LucideIcon; accent: string; cadence: string; anchor: string }> = {
  building: { label: "Commercial building", sub: "Energy + occupancy telemetry", matchStrength: "heuristic match", scene: "Meter rooms, tenant zones, BMS feeds", icon: Building2, accent: "lime", cadence: "10-minute", anchor: "floor level" },
  industry: { label: "Industrial plant", sub: "Production line + utility loads", matchStrength: "heuristic match", scene: "Motors, chillers, compressors, shift cadence", icon: Factory, accent: "orange", cadence: "5-minute", anchor: "machine group" },
  logistics: { label: "Distribution center", sub: "HVAC + cold-chain meters", matchStrength: "heuristic match", scene: "Dock doors, cold rooms, conveyor banks", icon: Warehouse, accent: "violet", cadence: "15-minute", anchor: "door / zone" },
  hospital: { label: "Hospital", sub: "Ward, theatre and equipment load", matchStrength: "heuristic match", scene: "Wards, operating theatres, imaging suites, HVAC", icon: HeartPulse, accent: "coral", cadence: "15-minute", anchor: "ward / department" },
  campus: { label: "University campus", sub: "Academic + residential estates", matchStrength: "heuristic match", scene: "Lecture halls, labs, hostels, central plant", icon: GraduationCap, accent: "blue", cadence: "30-minute", anchor: "building" },
  mall: { label: "Shopping mall", sub: "Retail zones + common areas", matchStrength: "heuristic match", scene: "Anchor stores, food court, common area HVAC", icon: ShoppingBag, accent: "yellow", cadence: "15-minute", anchor: "tenancy" },
  office: { label: "Office complex", sub: "Tenant floor + base building", matchStrength: "heuristic match", scene: "Floor distributions, AHUs, tenant sub-meters", icon: Briefcase, accent: "lime", cadence: "15-minute", anchor: "floor" },
  datacentre: { label: "Data centre", sub: "IT load + facility cooling", matchStrength: "heuristic match", scene: "Rack rows, PDUs, CRAC/CRAH, UPS", icon: Server, accent: "violet", cadence: "1-minute", anchor: "rack row" },
  plant: { label: "Generation plant", sub: "Generation + conversion assets", matchStrength: "heuristic match", scene: "Inverters, turbines, heat exchangers, substations", icon: Zap, accent: "orange", cadence: "15-minute", anchor: "array / unit" },
  transport: { label: "Transport hub", sub: "Terminal + mobility load", matchStrength: "heuristic match", scene: "Concourses, platforms, chargers, baggage systems", icon: Plane, accent: "blue", cadence: "5-minute", anchor: "concourse / bay" },
  telecom: { label: "Telecom site", sub: "Radio + backup power", matchStrength: "heuristic match", scene: "Radio units, battery banks, site HVAC", icon: RadioTower, accent: "violet", cadence: "15-minute", anchor: "site" },
  water: { label: "Water utility", sub: "Pumping + treatment load", matchStrength: "heuristic match", scene: "Intake pumps, blowers, filtration, distribution", icon: Droplets, accent: "blue", cadence: "15-minute", anchor: "process stage" },
};

const navSections: { label: string; items: { id: NavId; label: string; icon: LucideIcon; status?: string }[] }[] = [
  { label: "Workspace", items: [{ id: "overview", label: "Mission control", icon: Gauge }, { id: "library", label: "Dataset library", icon: Layers3 }, { id: "import", label: "Import dataset", icon: UploadCloud }] },
  { label: "Understand", items: [{ id: "schema", label: "Schema discovery", icon: Network }, { id: "quality", label: "Data quality", icon: ShieldCheck }, { id: "transform", label: "Transformation", icon: WandSparkles }] },
  { label: "Analyze", items: [{ id: "models", label: "Model competition", icon: Cpu }, { id: "anomalies", label: "Anomaly detection", icon: AlertTriangle }, { id: "prediction", label: "Prediction", icon: TrendingUp }, { id: "recommendations", label: "Recommendations", icon: Lightbulb }, { id: "reports", label: "Reports", icon: FileText }] },
  { label: "System", items: [{ id: "history", label: "Run history", icon: History }, { id: "notifications", label: "Notifications", icon: Bell }, { id: "settings", label: "Workspace settings", icon: Settings2 }] },
];

const pipelineStages: { id: NavId; label: string; short: string; icon: LucideIcon }[] = [
  { id: "library", label: "Library", short: "01", icon: Layers3 },
  { id: "import", label: "Import", short: "02", icon: UploadCloud },
  { id: "schema", label: "Schema", short: "03", icon: Network },
  { id: "quality", label: "Quality", short: "04", icon: ShieldCheck },
  { id: "transform", label: "Transform", short: "05", icon: WandSparkles },
  { id: "models", label: "Models", short: "06", icon: Cpu },
  { id: "anomalies", label: "Anomalies", short: "07", icon: AlertTriangle },
  { id: "prediction", label: "Prediction", short: "08", icon: TrendingUp },
  { id: "recommendations", label: "Actions", short: "09", icon: Lightbulb },
  { id: "reports", label: "Reports", short: "10", icon: FileText },
];

let energyData: LivePoint[] = [];

let forecastData: LiveForecastPoint[] = [];

let qualityIssues: LiveIssue[] = [];

let modelData: LiveModel[] = [];

let anomalyData: LiveAnomalyPoint[] = [];

let anomalies: LiveAnomaly[] = [];

let recommendations: LiveRec[] = [];

let liveStages: LiveStage[] = [];
let liveCompetition: LiveCompetition | null = null;
let liveQualityMeta: LiveQualityMeta | null = null;
let liveAnomalyMeta: LiveAnomalyMeta | null = null;
let liveForecastMeta: LiveForecastMeta | null = null;
let liveRecMeta: LiveRecMeta | null = null;
let liveRuns: LiveRun[] = [];
let liveSchema: LiveSchemaField[] | null = null;
let liveBaselineVersions: LiveBaselineVersion[] = [];
let liveRunId: string | null = null;
let liveTargetUnit = "";
let liveTargetColumn = "";

const viewMeta: Record<NavId, { kicker: string; title: string; description: string }> = {
  overview: { kicker: "Mission control / 07 OCT 2026", title: "From raw signal to resilient operations.", description: "EcoMind orchestrates the full energy intelligence pipeline with every AI decision kept inspectable." },
  library: { kicker: "Workspace / Dataset library", title: "Know every signal before you model it.", description: "Previously analyzed datasets, automatically classified and ready to move through the pipeline." },
  import: { kicker: "Workspace / Import dataset", title: "Bring a new signal into focus.", description: "Upload once. EcoMind classifies the domain, detects metadata, and prepares a traceable version." },
  schema: { kicker: "Understand / Schema discovery", title: "The shape of the system, understood.", description: "AI infers fields, relationships, types, and storage operations before analysis begins." },
  quality: { kicker: "Understand / Data quality", title: "Repair the signal. Preserve the source.", description: "Resolve only the issues that can be explained: nulls, timestamps, duplicates, types, and invalid values." },
  transform: { kicker: "Understand / Transformation", title: "Make the baseline operational.", description: "Dataset-specific transformations turn raw telemetry into model-ready signal without hiding the work." },
  models: { kicker: "Analyze / Model competition", title: "Let the data choose the model.", description: "Every contender sees the same processed dataset. Metrics decide the winner, not intuition." },
  anomalies: { kicker: "Analyze / Anomaly detection", title: "See the moments that break pattern.", description: "Inspect severity, cause, and affected features against the learned baseline." },
  prediction: { kicker: "Analyze / Prediction", title: "Forecast what the next window will cost.", description: "Use the selected baseline and processed data to project energy, spend, and carbon." },
  recommendations: { kicker: "Analyze / Recommendations", title: "Turn insight into an operating decision.", description: "Practical actions ranked by expected impact, evidence, and confidence." },
  reports: { kicker: "Analyze / Reports", title: "A clear record of what the AI found.", description: "Export project-scoped summaries, analytics, anomalies, predictions, and recommendations." },
  history: { kicker: "System / Run history", title: "Every run, versioned.", description: "Traceable pipeline operations for every dataset." },
  notifications: { kicker: "System / Notifications", title: "Signals that need your attention.", description: "High-value events from the active project, without the noise." },
  settings: { kicker: "System / Workspace settings", title: "Shape the intelligence layer.", description: "Manage defaults, retention, permissions, and project preferences." },
};

type SoundKind = "ui" | "scan" | "done" | "alert";

function AppIcon({ icon: Icon, size = 16 }: { icon: LucideIcon; size?: number }) {
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function TinyTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`tiny-tag tiny-tag--${tone}`}>{children}</span>;
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <button
      className={`action-button action-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {Icon ? <AppIcon icon={Icon} size={15} /> : null}
      <span>{children}</span>
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <div className="section-eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {action ? <div className="section-heading__action">{action}</div> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  direction = "up",
  accent = "lime",
}: {
  label: string;
  value: string;
  delta: string;
  direction?: string;
  accent?: string;
}) {
  return (
    <div className="metric-block">
      <span className="metric-block__label">{label}</span>
      <strong className={`metric-block__value metric-block__value--${accent}`}>{value}</strong>
      <span className={`metric-block__delta metric-block__delta--${direction}`}>
        <AppIcon icon={direction === "up" ? ArrowUpRight : ArrowDownRight} size={13} /> {delta}
      </span>
    </div>
  );
}

function EmptySystemView({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="empty-system-view">
      <div className="empty-system-view__icon">
        <AppIcon icon={Icon} size={26} />
      </div>
      <div>
        <div className="section-eyebrow">SYSTEM MODULE</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="mono-note">READY FOR INPUT</span>
    </div>
  );
}

const RUN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtRunClock = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${RUN_MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtCount = (n?: number): string =>
  n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-IN");

const fmtRunDuration = (started: string | null, completed: string | null): string => {
  if (!started || !completed) return "—";
  const ms = Date.parse(completed) - Date.parse(started);
  if (!isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

const STAGE_LABEL_TEXT: Record<string, string> = {
  schema: "Schema",
  quality: "Quality",
  transformation: "Transform",
  model_selection: "Model",
};

// Inverse of STAGE_KEY_BY_VIEW: which page shows the output of each stage.
// The Auto run walks these in pipeline order so a demonstration follows the
// product the same way the data does.
const VIEW_BY_STAGE_KEY: Record<string, NavId> = {
  library: "library",
  import: "import",
  schema: "schema",
  quality: "quality",
  transformation: "transform",
  model_selection: "models",
  anomaly: "anomalies",
  forecast: "prediction",
  recommendation: "recommendations",
  report: "reports",
};

const STAGE_KEY_BY_VIEW: Record<string, string> = {
  transform: "transformation",
  models: "model_selection",
  anomalies: "anomaly",
  prediction: "forecast",
  recommendations: "recommendation",
  reports: "report",
};

/** Append the modelled unit only when the backend actually recorded one. */
const withUnit = (value: string, unit = liveTargetUnit): string =>
  unit ? `${value} ${displayUnit(unit)}` : value;

const fmtLiveDuration = (ls: LiveStage | undefined): string => {
  if (!ls) return "";
  if (ls.durationMs == null) return ls.status;
  if (ls.durationMs < 1000) return `${Math.round(ls.durationMs)}ms`;
  if (ls.durationMs < 60_000) return `${(ls.durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(ls.durationMs / 60_000)}m ${Math.round((ls.durationMs % 60_000) / 1000)}s`;
};

function HistoryView({ runs, onReplay }: { runs: LiveRun[]; onReplay: (datasetId: string) => void }) {
  if (!runs.length) {
    return (
      <EmptySystemView
        icon={FileClock}
        title="No pipeline runs yet."
        description="Runs appear here the moment a dataset enters the ten-stage pipeline — with status, stage coverage, and timing."
      />
    );
  }
  const done = runs.filter(r => r.status === "completed").length;
  return (
    <div className="view-content">
      <div className="quality-kpis">
        <Metric label="TOTAL RUNS" value={String(runs.length)} delta="recorded" accent="blue" />
        <Metric label="COMPLETED" value={String(done)} delta={`${runs.length - done} other`} accent="lime" />
        <Metric label="STAGES PER RUN" value="10" delta="fixed pipeline" direction="down" accent="violet" />
      </div>
      <section className="panel table-panel">
        <SectionHeading
          eyebrow="SYSTEM / RUN HISTORY"
          title="Every run, versioned."
          detail="Status, stage coverage, and wall-clock timing straight from the backend traces."
        />
        <div className="data-table">
          <div className="data-table__head">
            <span>STATUS</span>
            <span>DATASET</span>
            <span>STAGES</span>
            <span>STARTED</span>
            <span>DURATION</span>
            <span>RUN ID</span>
            <span />
          </div>
          {runs.map(r => (
            <div className="data-table__row" key={r.id}>
              <span>
                <TinyTag tone={r.status === "completed" ? "lime" : r.status === "failed" ? "coral" : "orange"}>
                  {r.status}
                </TinyTag>
              </span>
              <strong>{r.datasetName}</strong>
              <span className="mono-note">
                {r.stagesDone} / {r.total}
              </span>
              <span className="mono-note">{fmtRunClock(r.started || undefined)}</span>
              <span className="mono-note">{fmtRunDuration(r.started || null, r.completed)}</span>
              <code>{r.id.slice(0, 8)}</code>
              <button
                type="button"
                aria-label={`Replay pipeline for ${r.datasetName}`}
                title="Replay the ten-stage pipeline for this dataset"
                onClick={() => onReplay(r.datasetId)}
              >
                <Play size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotificationsView() {
  const alerts = activityEvents
    .filter(e => e.severity === "warning" || e.status === "WARN" || /generat|promot|complet|upload|detect/i.test(e.operation))
    .slice(0, 24);
  const criticals = (liveAnomalyMeta?.severity?.critical ?? 0) + (liveAnomalyMeta?.severity?.high ?? 0);
  if (!alerts.length && !criticals) {
    return (
      <EmptySystemView
        icon={Bell}
        title="No high-value events yet."
        description="Stage completions, model promotions, and critical anomalies surface here as soon as the pipeline records them."
      />
    );
  }
  return (
    <div className="view-content">
      <div className="quality-kpis">
        <Metric label="EVENTS" value={String(alerts.length)} delta="from audit log" accent="blue" />
        <Metric label="CRITICAL/HIGH" value={String(criticals)} delta="anomalies" accent={criticals ? "coral" : "lime"} />
        <Metric label="PIPELINE" value={`${liveStages.filter(s => s.status === "completed").length} / 10`} delta="stages complete" direction="down" accent="violet" />
      </div>
      <section className="panel table-panel">
        <SectionHeading
          eyebrow="SYSTEM / ACTIVITY"
          title="Evidence, as it happens."
          detail="Mapped from the backend audit log — action, source, and recorded detail."
        />
        <div className="data-table">
          <div className="data-table__head">
            <span>STATUS</span>
            <span>TIME</span>
            <span>SOURCE</span>
            <span>EVENT</span>
            <span>DETAIL</span>
            <span />
          </div>
          {alerts.map((e, i) => (
            <div className="data-table__row" key={`${e.time}-${i}`}>
              <span>
                <TinyTag tone={e.status === "WARN" ? "coral" : e.status === "DONE" ? "lime" : "blue"}>{e.status}</TinyTag>
              </span>
              <span className="mono-note">{e.time}</span>
              <code>{e.service}</code>
              <strong>{e.operation}</strong>
              <span>{e.result}</span>
              <span className="mono-note">{e.duration}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsView({
  workspace,
  baselineName,
  modelName,
}: {
  workspace: LiveWorkspace | null;
  baselineName: string;
  modelName: string;
}) {
  const [me, setMe] = useState<{ email?: string; full_name?: string; role?: string } | null>(null);
  const [health, setHealth] = useState<string>("checking…");
  useEffect(() => {
    let cancelled = false;
    auth.me().then(u => { if (!cancelled) setMe(u as { email?: string; full_name?: string; role?: string }); }).catch(() => {});
    fetch("/api/v1/health")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => { if (!cancelled) setHealth("connected"); })
      .catch(() => { if (!cancelled) setHealth("unreachable"); });
    return () => { cancelled = true; };
  }, []);
  const comp = liveCompetition;
  return (
    <div className="view-content">
      <div className="dashboard-grid dashboard-grid--overview">
        <section className="panel">
          <SectionHeading eyebrow="SYSTEM / SESSION" title="Signed-in workspace." detail="Auth comes from the FastAPI JWT layer." />
          <div className="operation-list">
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--lime"><UserRound size={15} /></span>
              <div><strong>{me?.full_name || me?.email || "Analyst"}</strong><span className="mono-note">{me?.role ?? "user"} · bearer token {getToken() ? "active" : "missing"}</span></div>
            </div>
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--blue"><Network size={15} /></span>
              <div><strong>Backend /api/v1</strong><span className="mono-note">health: {health}</span></div>
            </div>
          </div>
        </section>
        <section className="panel">
          <SectionHeading eyebrow="SYSTEM / PIPELINE" title="Active configuration." detail="What the loaded run is currently using." />
          <div className="operation-list">
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--orange"><Cpu size={15} /></span>
              <div><strong>{modelName}</strong><span className="mono-note">{comp ? `${comp.features} features · target ${comp.target}` : "model competition"}</span></div>
            </div>
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--violet"><ShieldCheck size={15} /></span>
              <div><strong>{baselineName}</strong><span className="mono-note">{liveBaselineVersions.length} ledger version{liveBaselineVersions.length === 1 ? "" : "s"} · {workspace?.runId ? `run ${workspace.runId.slice(0, 8)}` : "no run"}</span></div>
            </div>
          </div>
        </section>
        <section className="panel">
          <SectionHeading eyebrow="SYSTEM / BASELINE LEDGER" title="Versioned artifacts." detail="Immutable snapshots recorded by the backend." />
          {liveBaselineVersions.length ? (
            <div className="data-table">
              <div className="data-table__head">
                <span>VERSION</span><span>ROWS</span><span>RECORDED</span><span />
              </div>
              {liveBaselineVersions.slice(0, 8).map(v => (
                <div className="data-table__row" key={v.version}>
                  <strong>v{v.version}</strong>
                  <span className="mono-note">{fmtCount(v.rowCount)}</span>
                  <span className="mono-note">{fmtRunClock(v.created ?? undefined)}</span>
                  <span />
                </div>
              ))}
            </div>
          ) : (
            <p className="mono-note">No baseline versions recorded yet — they appear after the first pipeline run.</p>
          )}
        </section>
      </div>
    </div>
  );
}

type SoundPlayerProps = {
  kind: SoundKind;
  onPlay?: () => void;
  when?: boolean;
};

function SoundPlayer({ kind, onPlay, when = true }: SoundPlayerProps) {
  const sound = useSound({ onPlay });
  useEffect(() => {
    if (!when) return;
    // Raised volumes from the earlier "barely audible" settings so a step,
    // a stage completion and a run completion read as clear feedback rather than a whisper.
    if (kind === "scan") sound.play({ volume: 0.22, rate: 1.0 });
    else if (kind === "done") sound.play({ volume: 0.24, rate: 1.05 });
    else if (kind === "alert") sound.play({ volume: 0.26, rate: 1.2 });
    else sound.play({ volume: 0.18, rate: 0.95 });
  }, [kind, when, sound]);
  return null;
}

function SignInView({ onEnter }: { onEnter: () => void }) {
  // Prefilled with the seeded workspace account so a demonstration never starts
  // with an unknown credential set. See docs/STATUS.md for the seed.
  const [email, setEmail] = useState("admin@ecomind.ai");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const signinSound = useSound({ onPlay: () => {} });
  /** Register a brand-new workspace account (the backend has no SSO flow). */
  const createAccount = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const pass = password || "Passw0rd!";
    try {
      await auth.register(email, pass, email.split("@")[0] || "Analyst");
      playCompletionChime();
      onEnter();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed. Check the API is running.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (busy) return;
    if (!password) {
      setError("Enter your password to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.login(email, password);
      playCompletionChime();
      onEnter();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 401 || status === 400
          ? "Those credentials were not accepted. Check the email and password, or create a new workspace account."
          : err instanceof Error
            ? err.message
            : "Sign in failed. Check the API is running."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="signin-screen">
      <div className="signin-visual">
        <div className="signin-grid" />
        <div className="signin-visual__top">
          <span className="brand-mini">
            <EcoMindMark size={28} />
            <strong>EcoMind</strong>
          </span>
          <span className="signin-secure">
            <span className="status-dot status-dot--lime" />
            SECURE WORKSPACE
          </span>
        </div>
        <div className="signin-visual__content">
          <div className="signin-kicker">
            <span className="hero-kicker__line" />
            ENERGY INTELLIGENCE OS
          </div>
          <h1>
            From raw signal<br />
            to <em>resilient</em><br />
            operations.
          </h1>
          <p>One inspectable AI pipeline for teams turning energy data into confident operating decisions.</p>
          <div className="signin-flow">
            <div className="signin-flow__line" />
            <span className="signin-flow__spark" />
            {[
              { label: "INGEST", icon: UploadCloud },
              { label: "UNDERSTAND", icon: Network },
              { label: "REPAIR", icon: ShieldCheck },
              { label: "PREDICT", icon: TrendingUp },
              { label: "ACT", icon: Lightbulb },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <div className="signin-flow__step" key={step.label}>
                  <span className="signin-flow__node">
                    <Icon size={15} />
                  </span>
                  <span>{step.label}</span>
                  {index < 4 ? <ArrowRight size={12} /> : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="signin-visual__footer">
          <span>
            <span className="status-dot status-dot--lime" />
            AI core online
          </span>
          <span>EcoMind Energy OS / workspace preview</span>
          <span>Build {__BUILD_STAMP__}</span>
          <div className="signin-chips">
            <span className="signin-chip">
              <Network size={12} />
              10-stage pipeline
            </span>
            <span className="signin-chip">
              <DatabaseZap size={12} />
              Raw data immutable
            </span>
            <span className="signin-chip">
              <BarChart3 size={12} />
              Score-ranked models
            </span>
          </div>
        </div>
        <div className="signin-radar">
          <div className="signin-radar__ring signin-radar__ring--one" />
          <div className="signin-radar__ring signin-radar__ring--two" />
          <div className="signin-radar__ring signin-radar__ring--three" />
          <span className="signin-radar__core">
            <Leaf size={22} />
          </span>
        </div>
      </div>
      <div className="signin-card-wrap">
        <div className="signin-card">
          <div className="signin-card__brand">
            <span className="signin-card__mark">
              <EcoMindMark size={31} />
            </span>
            <div>
              <strong>Welcome back</strong>
              <span>Sign in to your intelligence workspace</span>
            </div>
          </div>
          <form
            onSubmit={event => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className={focused === "email" ? "is-focused" : ""}>
              <Mail size={15} />
              <span>
                <small>WORK EMAIL</small>
                <input
                  value={email}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  onChange={event => setEmail(event.target.value)}
                  type="email"
                />
              </span>
            </label>
            <label className={focused === "password" ? "is-focused" : ""}>
              <LockKeyhole size={15} />
              <span>
                <small>PASSWORD</small>
                <input
                  value={password}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  onChange={event => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
              </span>
            </label>
            <div className="signin-options">
              <span className="signin-demo-note">
                <CircleDot size={11} />
                Seeded workspace account — replace before deploying
              </span>
            </div>
            {error ? <p className="signin-error" role="alert">{error}</p> : null}
            <button className="signin-submit" type="submit" disabled={busy}>
              <span>{busy ? "Connecting…" : "Sign in to workspace"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="signin-divider">
            <span>New workspace</span>
          </div>
          <button
            className="sso-button"
            type="button"
            disabled={busy}
            onClick={() => void createAccount()}
          >
            <Plus size={14} />{" "}
            Create an account with this email
          </button>
          <p className="signin-legal">
            Every pipeline run stays scoped to this project.<br />
            Uploaded datasets are never modified — repairs create new versions.
          </p>
        </div>
        <div className="signin-card__meta">
          <span>
            <LockKeyhole size={12} />
            Bearer-token scoped API
          </span>
          <span>
            <ShieldCheck size={12} />
            Raw source is never rewritten
          </span>
        </div>
      </div>
    </div>
  );
}

function fieldIconFor(family: FieldFamily): LucideIcon {
  if (family === "motor") return Cpu;
  if (family === "hvac") return Activity;
  if (family === "lighting") return Lightbulb;
  if (family === "process") return Factory;
  if (family === "compressor") return Cog;
  if (family === "conveyor") return ArrowUpDown;
  if (family === "coldchain") return Snowflake;
  if (family === "chiller") return Thermometer;
  if (family === "thermal") return Thermometer;
  if (family === "humidity") return Waves;
  if (family === "pump") return Waves;
  if (family === "itload") return Server;
  if (family === "dock") return Warehouse;
  if (family === "generation") return SunMedium;
  if (family === "emissions") return Leaf;
  if (family === "cost") return IndianRupee;
  if (family === "occupancy") return UserRound;
  if (family === "production") return Boxes;
  if (family === "voltage") return Zap;
  if (family === "current") return Zap;
  if (family === "powerfactor") return Gauge;
  return Zap;
}

function datasetDomainIcon(domain: DatasetDomain): LucideIcon {
  return (domainMeta[domain] ?? domainMeta.building).icon;
}

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const sound = useSound({ onPlay: () => {} });
  const [signedIn, setSignedIn] = useState(false);
  // Flips true once the stored token has been validated (or found absent).
  // Every workspace loader waits for it, so one stale token produces one 401
  // instead of a failed request from each independent loader.
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState<NavId>("overview");
  const [activeDataset, setActiveDataset] = useState<Dataset>(datasets[0] ?? EMPTY_DATASET);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [scanRunning, setScanRunning] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState("energy-meters-oct.csv");
  const [uploadDomain, setUploadDomain] = useState<DatasetDomain>("building");
  const [qualityFilter, setQualityFilter] = useState("All issues");
  const [qualityRepaired, setQualityRepaired] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [preview, setPreview] = useState<{
    dataset: Dataset;
    rows: Record<string, unknown>[];
    loading: boolean;
    error: string;
  } | null>(null);
  const [anomalyWindow, setAnomalyWindow] = useState("24h");
  const [forecastWindow, setForecastWindow] = useState("all");
  const [reportDraft, setReportDraft] = useState<string | null>(null);
  const [reportExported, setReportExported] = useState(false);
  // The generated PDF, held as a blob URL so it can be read in place. Fetching it
  // goes through the same bearer-authenticated route the download uses, and the
  // URL is revoked whenever a newer one replaces it.
  const [reportPdf, setReportPdf] = useState("");
  const [reportPdfBusy, setReportPdfBusy] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<(typeof anomalies)[number] | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<LiveAnomalyPoint | null>(null);
  // Docked and closed by default. An always-open fixed panel sits on top of the
  // page's own controls (the report and prediction actions live bottom-right),
  // which is how a control ends up visible but unclickable.
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalPaused, setTerminalPaused] = useState(false);
  const [workspace, setWorkspace] = useState<LiveWorkspace | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [stageBusy, setStageBusy] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [awaitingRun, setAwaitingRun] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Set when a fresh upload should become the active dataset on the next load,
  // so a new file is never shadowed by an older dataset's completed run.
  const pendingDatasetId = useRef<string | null>(null);
  const isDark = theme === "dark";
  const filteredQuality = qualityIssues.filter(
    issue => qualityFilter === "All issues" || issue.type === qualityFilter
  );
  const domainInfo = useMemo(() => domainMeta[activeDataset.domain] ?? domainMeta.building, [activeDataset.domain]);
  const baselineName = useMemo(() => workspace?.baselineLabel ?? "", [workspace]);
  const modelName = useMemo(() => workspace?.modelName || "", [workspace]);
  const stagesDone = liveStages.filter(s => s.status === "completed").length;
  const displayName = currentUser?.full_name || currentUser?.email || "Signed-in user";
  const initials = (() => {
    const parts = (currentUser?.full_name?.trim() || currentUser?.email || "")
      .split(/[\s@._-]+/)
      .filter(Boolean);
    if (!parts.length) return "·";
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)).toUpperCase();
  })();
  // Whether a real dataset is selected. The pipeline must never be started on the
  // empty placeholder — that would produce numbers nobody asked for.
  const hasRealDataset = Boolean(activeDataset.id) && activeDataset.id !== "—";
  // Notifications are not only anomalies. A completed run, a failed stage, a
  // quality check that needs attention and a dataset with no run at all belong in
  // the same queue, so the badge can never hide the thing that actually went wrong.
  const systemNotices = (() => {
    const list: {
      id: string;
      tone: "coral" | "orange" | "lime" | "blue";
      title: string;
      detail: string;
    }[] = [];
    for (const stage of liveStages.filter(s => s.status === "failed")) {
      list.push({
        id: `fail-${stage.id}`,
        tone: "coral",
        title: `${stage.label} failed`,
        detail: stage.decision || "The stage recorded a failure; its output is unavailable.",
      });
    }
    const completedStages = liveStages.filter(s => s.status === "completed").length;
    if (liveRunId && completedStages === STAGE_KEYS.length) {
      list.push({
        id: "run-complete",
        tone: "lime",
        title: "Pipeline complete",
        detail: `All 10 stages recorded for ${activeDataset.name}. The executive report is ready.`,
      });
    } else if (liveRunId && completedStages > 0) {
      list.push({
        id: "run-progress",
        tone: "blue",
        title: `Run in progress — ${completedStages} of 10 stages`,
        detail: `Next stage: ${liveStages.find(s => s.status === "pending")?.label ?? "remaining stages"}.`,
      });
    }
    if (!liveRunId && hasRealDataset) {
      list.push({
        id: "no-run",
        tone: "blue",
        title: "No run recorded for this dataset",
        detail: "Start the pipeline to produce this dataset's own baseline, anomalies and forecast.",
      });
    }
    const failedChecks = liveQualityMeta?.failed ?? 0;
    if (failedChecks > 0) {
      list.push({
        id: "dq-attention",
        tone: "orange",
        title: `${failedChecks} data quality check${failedChecks === 1 ? "" : "s"} need attention`,
        detail: "Review the quality stage before trusting the numbers downstream of it.",
      });
    }
    return list;
  })();
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const attentionQueue = [...anomalies]
    .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))
    .slice(0, 3);
  const attentionCount =
    (liveAnomalyMeta?.severity?.critical ?? 0) + (liveAnomalyMeta?.severity?.high ?? 0);
  const noticeCount = systemNotices.length + attentionCount;
  const hasAlerts = noticeCount > 0;
  // Time-scale options the active dataset can actually express. Empty when the
  // recorded schema has no index column, which hides the control entirely.
  const windowOptions = useMemo(
    () =>
      deriveWindowOptions(
        workspace?.schema ?? null,
        workspace?.baseline,
        Math.max(anomalyData.length, forecastData.length, energyData.length)
      ),
    [workspace]
  );
  // The prediction chart is daily buckets, so it gets its own ladder: each rung
  // is a real number of forecast days on screen rather than hourly point counts.
  const forecastWindowOptions = useMemo(
    () => deriveForecastWindowOptions(forecastData.length),
    [forecastData.length]
  );

  const refreshPipeline = async () => {
    setRefreshing(true);
    try {
      const ok = await refreshWorkspace();
      setToast(ok ? "Pipeline state refreshed from the backend." : "Refresh failed — no workspace returned.");
    } finally {
      setRefreshing(false);
    }
  };

  /** Abort the active run. Completed stages keep their recorded output. */
  const stopRun = async () => {
    const runId = workspace?.runId;
    if (!runId) {
      setToast("No active run to stop.");
      return;
    }
    try {
      await workflow.abort(runId);
      setAutoRunning(false);
      setStageBusy("");
      setToast("Run stopped. Everything recorded before the stop is kept.");
      await refreshWorkspace();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not stop the run.");
    }
  };

  /**
   * "Open related chart" in the inspector: close the drawer, go to the anomaly
   * view and widen the window so the selected event is actually on screen.
   */
  const focusAnomalyOnChart = (anomaly: (typeof anomalies)[number]) => {
    setSelectedAnomaly(null);
    goTo("anomalies");
    const widest = windowOptions[windowOptions.length - 1];
    if (widest) setAnomalyWindow(widest.id);
    setToast(`${anomaly.type} at ${anomaly.timestamp} — highlighted on the recorded deviation chart.`);
  };

  /** Start a fresh run for the active dataset, from stage 01. */
  const startFreshRun = async () => {
    setStageBusy("starting");
    try {
      const runId = await ensureRun(true);
      if (!runId) return;
      await refreshWorkspace();
      goTo("overview");
    } finally {
      setStageBusy("");
    }
  };

  /**
   * Start a run for the active dataset when the backend has none yet. Without
   * this, Step / Guided tour / Run all stay disabled forever on a dataset that
   * has never been analysed — which is every newly imported file.
   */
  const ensureRun = async (force = false): Promise<string | null> => {
    if (!force && workspace?.runId) return workspace.runId;
    try {
      const started = (await workflow.start(activeDataset.id)) as unknown as {
        run?: { id?: string };
        run_id?: string;
        id?: string;
      };
      const id = started?.run?.id ?? started?.run_id ?? started?.id ?? null;
      if (!id) {
        setToast("The backend did not return a run for this dataset.");
        return null;
      }
      setToast(`Run started for ${activeDataset.name}.`);
      void playStartTone();
      return id;
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not start a run for this dataset.");
      return null;
    }
  };

  /** Run everything that is left without moving pages, then land on the report. */
  const execAllAndReport = async () => {
    if (!hasRealDataset) {
      setToast("Select or upload a dataset first — the pipeline runs on a real dataset, never on a placeholder.");
      goTo("library");
      return;
    }
    const runId = await ensureRun();
    if (!runId) return;
    void playStartTone();
    const remaining = STAGE_KEYS.filter(key => !liveStages.some(s => s.id === key && s.status === "completed"));
    if (!remaining.length) {
      goTo("reports");
      setToast("All ten stages are already complete — showing the recorded report.");
      return;
    }
    setAutoRunning(true);
    setToast(`Running ${remaining.length} remaining stage${remaining.length === 1 ? "" : "s"} without leaving this page.`);
    try {
      for (const key of remaining) {
        setStageBusy(key);
        await workflow.execStage(runId, key);
        await refreshWorkspace();
      }
      playCompletionChime();
      goTo("reports");
      setToast("Pipeline complete — every recorded output is available. Executive report ready.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Pipeline run failed.");
    } finally {
      setStageBusy("");
      setAutoRunning(false);
    }
  };

  // Boot sequence: one token check, then one identity read. A stored token is
  // taken optimistically so a valid session never flashes the sign-in page,
  // but every workspace loader waits for `authChecked` — a stale token therefore
  // costs a single 401 and lands cleanly on sign-in instead of firing the same
  // doomed request from each loader in turn.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setSignedIn(false);
      setCurrentUser(null);
      setAuthChecked(true);
      return;
    }
    setSignedIn(true);
    auth
      .me()
      .then(user => {
        if (cancelled) return;
        setCurrentUser(user);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setCurrentUser(null);
        setSignedIn(false);
        setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once on mount: the token only changes through an explicit sign-in or
    // sign-out, both of which set state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh sign-in carries a new token, so the identity has to be re-read for
  // it. Guarded by `authChecked` so it can never race the boot probe.
  useEffect(() => {
    if (!authChecked || !signedIn || currentUser) return;
    let cancelled = false;
    auth
      .me()
      .then(user => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authChecked, signedIn, currentUser]);

  const applyWorkspace = (loaded: LiveWorkspace) => {
      if (loaded.datasets.length) datasets = loaded.datasets;
      if (loaded.energy) energyData = loaded.energy;
      if (loaded.forecast) forecastData = loaded.forecast;
      if (loaded.quality) qualityIssues = loaded.quality;
      if (loaded.models) modelData = loaded.models;
      if (loaded.anomalyPoints) anomalyData = loaded.anomalyPoints;
      if (loaded.anomalies) anomalies = loaded.anomalies;
      if (loaded.recs) recommendations = loaded.recs;
      if (loaded.activity?.length) activityEvents = loaded.activity;
      liveStages = loaded.stages ?? [];
      liveCompetition = loaded.competition ?? null;
      liveQualityMeta = loaded.qualityMeta ?? null;
      liveAnomalyMeta = loaded.anomalyMeta ?? liveAnomalyMeta ?? null;
      liveForecastMeta = loaded.forecastMeta ?? null;
      liveRecMeta = loaded.recMeta ?? null;
      liveRuns = loaded.runs ?? [];
      liveSchema = loaded.schema ?? null;
      liveBaselineVersions = loaded.baselineVersions ?? [];
      liveRunId = loaded.runId ?? null;
      liveTargetUnit = loaded.targetUnit ?? "";
      liveTargetColumn = loaded.targetColumn ?? "";
      if (loaded.modelName) setSelectedModel(loaded.modelName);
      navSections.forEach(section =>
        section.items.forEach(item => {
          if (item.id === "library") item.status = String(datasets.length);
          else if (item.id === "quality") item.status = String(qualityIssues.length);
          else if (item.id === "anomalies") item.status = String(anomalies.length);
          else if (item.id === "recommendations") item.status = String(recommendations.length);
        })
      );
    // The workspace names the dataset its recorded outputs belong to, so the
    // heading and the panels can never disagree about which dataset is shown.
    setActiveDataset(
      (loaded.activeDatasetId && datasets.find(d => d.id === loaded.activeDatasetId)) ||
        datasets[0] ||
        EMPTY_DATASET
    );
    setWorkspace(loaded);
  };

  /** Re-read every recorded stage output for the active dataset. */
  const refreshWorkspace = async (): Promise<boolean> => {
    const res = await loadWorkspace(activeDataset.id || undefined);
    if (!res) {
      if (!getToken()) setSignedIn(false);
      return false;
    }
    applyWorkspace(res.workspace);
    return true;
  };

  useEffect(() => {
    if (!signedIn || !authChecked) return;
    let cancelled = false;
    (async () => {
      const preferred = pendingDatasetId.current ?? undefined;
      pendingDatasetId.current = null;
      const res = await loadWorkspace(preferred);
      if (cancelled) return;
      if (!res) {
        if (!getToken()) setSignedIn(false);
        else setWorkspace(null);
        return;
      }
      applyWorkspace(res.workspace);
      if (res.pendingRun) {
        // The pipeline is never started without an explicit choice. Step runs
        // one stage, Auto runs the remainder — both live in the pipeline rail.
        setAwaitingRun(true);
        setToast("Run staged. Choose Step to execute one stage, or Auto to run the remaining stages.");
      } else {
        setAwaitingRun(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, authChecked, reloadKey]);

  useEffect(() => {
    if (!scanRunning) return;
    const timer = window.setInterval(() => {
      setScanStage(current => {
        if (current >= 3) {
          window.clearInterval(timer);
          setScanRunning(false);
          setToast(`${domainMeta[uploadDomain].label} dataset classified.`);
          sound.play({ volume: 0.2, rate: 1.1 });
          return 3;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [scanRunning, sound]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The Import page's domain strip should open on the domain the backend
  // recorded for the active dataset, not on a default. Anything the user then
  // picks is a deliberate override and is marked as one.
  useEffect(() => {
    setUploadDomain(activeDataset.domain);
  }, [activeDataset.domain]);

  // Audio can only start from a gesture. Unlock on the first real interaction
  // so the start tone and completion chime are audible for the rest of the
  // session instead of being silently dropped by the browser autoplay policy.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  if (!signedIn) return <SignInView onEnter={() => setSignedIn(true)} />;

  const goTo = (view: NavId) => {
    setActiveView(view);
    setSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
    // The shell scrolls internally, so the reset has to target the main
    // region — window.scrollTo no longer moves anything.
    document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleScan = (fileName?: string, domain?: DatasetDomain) => {
    if (fileName) setUploadedFileName(fileName);
    if (domain) setUploadDomain(domain);
    setScanStage(0);
    setScanRunning(true);
  };

  const handleUploaded = (datasetId: string) => {
    setToast(`Upload accepted. Running the ten-stage pipeline for ${datasetId.slice(0, 8)}.`);
    playCompletionChime();
    pendingDatasetId.current = datasetId;
    setReloadKey(key => key + 1);
  };

  const execStage = async (stageKey: string) => {
    const runId = await ensureRun();
    if (!runId) return;
    void playStartTone();
    setStageBusy(stageKey);
    try {
      await workflow.execStage(runId, stageKey);
      playCompletionChime();
      await refreshWorkspace();
      setToast(`Stage "${stageKey}" complete.`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Stage execution failed.");
    } finally {
      setStageBusy("");
    }
  };

  const execNextStage = async () => {
    const nextKey = STAGE_KEYS.find(key => !liveStages.some(s => s.id === key && s.status === "completed"));
    if (!nextKey) {
      setToast("All ten stages are already complete for this run.");
      return;
    }
    await execStage(nextKey);
  };

  const execRemainingStages = async () => {
    if (!hasRealDataset) {
      setToast("Select or upload a dataset first — the pipeline runs on a real dataset, never on a placeholder.");
      goTo("library");
      return;
    }
    const runId = await ensureRun();
    if (!runId) return;
    void playStartTone();
    const remaining = STAGE_KEYS.filter(key => !liveStages.some(s => s.id === key && s.status === "completed"));
    if (!remaining.length) {
      setToast("All ten stages are already complete for this run.");
      return;
    }
    setAutoRunning(true);
    try {
      for (const key of remaining) {
        setStageBusy(key);
        const target = VIEW_BY_STAGE_KEY[key];
        const label = pipelineStages.find(stage => stage.id === target)?.label ?? key;
        if (target) goTo(target);
        setToast(`Running ${label} — the page in front of you updates as it completes.`);
        await workflow.execStage(runId, key);
        playCompletionChime();
        await refreshWorkspace();
        setToast(`${label} complete. Moving to the next stage.`);
      }
      setToast("All ten stages complete. Every page now shows its recorded output.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Pipeline run failed.");
    } finally {
      setStageBusy("");
      setAutoRunning(false);
    }
  };

  const handleReplay = async (datasetId: string) => {
    try {
      setToast("Replaying the ten-stage pipeline for the selected dataset.");
      await runPipeline(datasetId, () => playCompletionChime());
      await refreshWorkspace();
      setToast("Replay complete.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Replay failed.");
    }
  };

  /** Read the recorded rows for a dataset and open them in the preview modal. */
  const openPreview = async (dataset: Dataset) => {
    setPreview({ dataset, rows: [], loading: true, error: "" });
    try {
      const res = await domain.preview(dataset.id);
      const rows = Array.isArray(res.rows) ? (res.rows as Record<string, unknown>[]) : [];
      setPreview({
        dataset,
        rows,
        loading: false,
        error: rows.length ? "" : "This dataset recorded no preview rows.",
      });
    } catch (err) {
      setPreview({
        dataset,
        rows: [],
        loading: false,
        error: err instanceof Error ? err.message : "Preview failed.",
      });
    }
  };

  /** Export exactly the rows the preview is showing. No row is transformed. */
  const exportPreviewCsv = () => {
    if (!preview?.rows.length) {
      setToast("Nothing to export — the preview has no rows.");
      return;
    }
    const headers = Object.keys(preview.rows[0]);
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...preview.rows.map(row => headers.map(h => cell(row[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${preview.dataset.name.replace(/[^\w.-]+/g, "-").toLowerCase()}-preview.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${preview.rows.length} recorded rows as CSV.`);
  };

  const exportReportPdf = async () => {
    const runId = workspace?.runId;
    if (!runId) {
      setToast("No pipeline run recorded — the PDF report is not available yet.");
      return;
    }
    try {
      const res = await fetch(domain.reportPdfUrl(runId), {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new Error(`Report PDF unavailable (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ecomind-${activeDataset.id.toLowerCase()}-report.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setReportExported(true);
      setToast("Executive report PDF exported.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Report export failed.");
    }
  };

  /** Load the run's generated PDF and show it inline instead of only downloading it. */
  const loadReportPdf = async () => {
    const runId = workspace?.runId;
    if (!runId) {
      setToast("No pipeline run recorded — the report PDF does not exist yet.");
      return;
    }
    setReportPdfBusy(true);
    try {
      const res = await fetch(domain.reportPdfUrl(runId), {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new Error(`Report PDF unavailable (${res.status})`);
      const blob = await res.blob();
      setReportPdf(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setToast("Report PDF loaded — the preview is the same file the export saves.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not load the report PDF.");
    } finally {
      setReportPdfBusy(false);
    }
  };

  /** Move one stage back in the pipeline without executing anything. */
  const goPreviousStage = () => {
    const idx = pipelineStages.findIndex(stage => stage.id === activeView);
    if (idx > 0) {
      const stage = pipelineStages[idx - 1];
      goTo(stage.id);
      setToast(`Stage ${stage.short} · ${stage.label}.`);
      return;
    }
    setToast(
      idx === 0
        ? "Stage 01 Library is the first stage of the pipeline."
        : "You are on a system page — the pipeline rail lists all ten stages."
    );
  };

  /** Move one stage forward in the pipeline without executing anything. */
  const goNextStage = () => {
    const idx = pipelineStages.findIndex(stage => stage.id === activeView);
    if (idx >= 0 && idx < pipelineStages.length - 1) {
      const stage = pipelineStages[idx + 1];
      goTo(stage.id);
      setToast(`Stage ${stage.short} · ${stage.label}.`);
      return;
    }
    if (idx === pipelineStages.length - 1) {
      setToast("Stage 10 Reports is the last stage of the pipeline.");
      return;
    }
    // From a system page, Next starts the journey at stage 01 rather than doing nothing.
    const first = pipelineStages[0];
    goTo(first.id);
    setToast(`Stage ${first.short} · ${first.label}.`);
  };

  const renderView = () => {
    switch (activeView) {
        case "library":
        return (
          <LibraryView
            activeDataset={activeDataset}
            onSelect={dataset => {
              setActiveDataset(dataset);
              sound.play({ volume: 0.14, rate: 0.9 });
              // Selecting a dataset is step one of a journey, not a dead end:
              // load its recorded outputs and continue to schema discovery so
              // the flow keeps moving instead of stopping on a toast.
              void loadWorkspace(dataset.id).then(res => {
                if (res) applyWorkspace(res.workspace);
              });
              goTo("import");
              setToast(`${dataset.name} selected — showing ingestion with the detected domain.`);
            }}
            onImport={() => goTo("import")}
            onPreview={dataset => void openPreview(dataset)}
          />
        );
      case "import":
        return (
          <ImportStudio
            datasetId={activeDataset.id}
            datasetName={activeDataset.name}
            rows={activeDataset.rows}
            columns={activeDataset.columnCount}
            quality={activeDataset.health}
            sessions={datasets.map(dataset => ({
              id: dataset.id,
              name: dataset.name,
              type: dataset.type,
              rows: dataset.rows,
              health: dataset.health,
            }))}
            onUploaded={handleUploaded}
            onContinue={() => goTo("schema")}
          />
        );
      case "schema":
        return (
          <SchemaDiscovery
            dataset={{
              id: activeDataset.id,
              name: activeDataset.name,
              domain: activeDataset.domain,
              type: activeDataset.type,
              detail: activeDataset.detail,
              rows: activeDataset.rows,
              freshness: activeDataset.freshness,
              health: activeDataset.health,
              location: activeDataset.location,
              rowCount: activeDataset.rowCount,
              columnCount: activeDataset.columnCount,
            }}
            domainLabel={domainMeta[activeDataset.domain]?.label ?? "Dataset"}
            schema={liveSchema ?? []}
            targetColumn={liveTargetColumn}
            quality={liveQualityMeta}
            activity={activityEvents}
            versions={liveBaselineVersions}
            onGoImport={() => goTo("import")}
          />
        );
      case "quality":
        return (
          <QualityView
            onToast={setToast}
            dataset={activeDataset}
            filter={qualityFilter}
            setFilter={setQualityFilter}
            filteredQuality={filteredQuality}
            repaired={qualityRepaired}
            onRepair={() => {
              setQualityRepaired(true);
              const pending = filteredQuality.filter(i => !i.fixed.startsWith("Passed")).length;
              setToast(`${pending || qualityIssues.length} structural checks reviewed. Raw source remains immutable.`);
              sound.play({ volume: 0.18, rate: 1.0 });
            }}
            saved={versionSaved}
            onSave={() => {
              setVersionSaved(true);
              setToast(`Clean snapshot saved. Baseline ledger recorded as ${baselineName}.`);
              sound.play({ volume: 0.2, rate: 1.1 });
            }}
          />
        );
      case "transform":
        return (
          <TransformView
            transform={workspace?.transform}
            baseline={workspace?.baseline}
            dataset={activeDataset}
            baselineName={baselineName}
            onOpenBaselinePreview={() => {
              setPreview({ dataset: activeDataset, rows: [], loading: true, error: "" });
              domain
                .preview(activeDataset.id)
                .then(res => {
                  const rows = Array.isArray(res.rows) ? (res.rows as Record<string, unknown>[]) : [];
                  setPreview({ dataset: activeDataset, rows, loading: false, error: rows.length ? "" : "This dataset recorded no preview rows." });
                })
                .catch(err =>
                  setPreview({ dataset: activeDataset, rows: [], loading: false, error: err instanceof Error ? err.message : "Preview failed." })
                );
            }}
          />
        );
      case "models":
        return (
          <ModelsView
            dataset={activeDataset}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        );
      case "anomalies":
        return (
          <AnomaliesView
            windowOptions={windowOptions}
            window={anomalyWindow}
            setWindow={setAnomalyWindow}
            onInspect={setSelectedAnomaly}
            onInspectPoint={(point) => { setSelectedAnomaly(null); setSelectedPoint(point); }}
            onClearPoint={() => setSelectedPoint(null)}
            selectedPoint={selectedPoint}
            dataset={activeDataset}
            baselineName={baselineName}
          />
        );
      case "prediction":
        return (
          <ForecastLab
            datasetId={activeDataset.id}
            datasetName={activeDataset.name}
            baselineName={baselineName}
            modelName={modelName}
            onViewData={() => goTo("transform")}
          />
        );
      case "recommendations":
        return (
          <RecommendationDesk
            datasetId={activeDataset.id}
            datasetName={activeDataset.name}
            baselineName={baselineName}
          />
        );
      case "reports":
        return <ReportStudio datasetId={activeDataset.id} datasetName={activeDataset.name} onNavigate={route => goTo(route as Parameters<typeof goTo>[0])} />;
      case "history":
        return <HistoryView runs={liveRuns} onReplay={handleReplay} />;
      case "notifications":
        return <NotificationsView />;
      case "settings":
        return <SettingsView workspace={workspace} baselineName={baselineName} modelName={modelName} />;
      default:
        return (
          <OverviewView
            onNavigate={goTo}
            activeDataset={activeDataset}
            domainInfo={domainInfo}
            baselineName={baselineName}
            onStep={() => void execNextStage()}
            onAuto={() => void execRemainingStages()}
            onRunAll={() => void execAllAndReport()}
            onRefresh={() => void refreshPipeline()}
            refreshing={refreshing}
            stageBusy={stageBusy}
            autoRunning={autoRunning}
          />
        );
    }
  };

  return (
    <div
      className={`eco-app ${isDark ? "eco-app--dark" : "eco-app--light"} ${
        sidebarExpanded ? "eco-app--nav-open" : "eco-app--nav-closed"
      } ${terminalOpen ? "eco-app--terminal" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="app-sidebar">
        <div className="brand-lockup">
          <EcoMindMark size={34} />
          <div className="brand-lockup__copy">
            <strong>EcoMind</strong>
            <span>AI energy intelligence</span>
          </div>
          <span className="brand-live-dot" aria-label="AI core online" />
        </div>
        <div className="workspace-select">
          <div className="workspace-select__mark">{activeDataset.id.slice(0, 2)}</div>
          <div>
            <span className="workspace-select__label">Workspace</span>
            {/* The chip is narrow by design, so the full name stays reachable on
                hover rather than being silently truncated. */}
            <strong title={activeDataset.name}>{activeDataset.name}</strong>
          </div>
          <AppIcon icon={ChevronDown} size={14} />
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navSections.map(section => (
            <div className="nav-section" key={section.label}>
              <span className="nav-section__label">{section.label}</span>
              {section.items.map(item => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    className={`nav-item ${active ? "nav-item--active" : ""}`}
                    key={item.id}
                    type="button"
                    onClick={() => {
                      goTo(item.id);
                      sound.play({ volume: 0.08, rate: 0.9 });
                    }}
                    title={!sidebarExpanded ? item.label : undefined}
                  >
                    <span className="nav-item__icon">
                      <Icon size={16} strokeWidth={active ? 2.1 : 1.8} />
                    </span>
                    <span className="nav-item__label">{item.label}</span>
                    {item.status ? (
                      <span className={`nav-item__status ${active ? "nav-item__status--active" : ""}`}>
                        {item.status}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="ai-core-card">
            <div className="ai-core-card__orb">
              <Sparkles size={14} />
            </div>
            <div>
              <strong>AI core online</strong>
              <span>All systems nominal</span>
            </div>
            <span className="ai-core-card__pulse" />
          </div>
          <button
            type="button"
            className="collapse-button"
            onClick={() => setSidebarExpanded(value => !value)}
          >
            <AppIcon icon={sidebarExpanded ? PanelLeftClose : PanelLeftOpen} size={15} />
            <span>{sidebarExpanded ? "Collapse navigation" : "Expand navigation"}</span>
          </button>
        </div>
      </aside>
      <header className="app-topbar">
        <div className="topbar-breadcrumb">
          <span>{activeDataset.name}</span>
          <AppIcon icon={ChevronRight} size={13} />
          <strong>{viewMeta[activeView].title.split(".")[0]}</strong>
        </div>
        <div className="topbar-actions">
          <div className={`global-search ${searchOpen ? "global-search--open" : ""}`}>
            <button
              className="icon-button"
              type="button"
              aria-label="Search workspace"
              onClick={() => {
                setSearchOpen(value => !value);
                sound.play({ volume: 0.08, rate: 0.9 });
              }}
            >
              <AppIcon icon={Search} size={16} />
            </button>
            {searchOpen ? (
              <input autoFocus placeholder="Search datasets, runs, fields..." aria-label="Search datasets, runs, fields" />
            ) : null}
          </div>
          <button
            className="icon-button icon-button--notification"
            type="button"
            aria-label="Open notifications"
            onClick={() => {
              setNotificationsOpen(value => !value);
              sound.play({ volume: 0.1, rate: 1.0 });
            }}
          >
            <AppIcon icon={Bell} size={16} />
            <span />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Toggle theme"
            onClick={() => {
              toggleTheme?.();
              sound.play({ volume: 0.08, rate: 0.85 });
            }}
          >
            <AppIcon icon={isDark ? Sun : Moon} size={16} />
          </button>
          <div className="topbar-divider" />
          <button
            className="profile-button"
            type="button"
            onClick={() => {
              setProfileOpen(value => !value);
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
          >
            <span className="avatar">{initials}</span>
            <span className="profile-button__name">{displayName}</span>
            <AppIcon icon={ChevronDown} size={13} />
          </button>
          {notificationsOpen ? (
            <div className="popover popover--notifications">
              <div className="popover__head">
                <strong>Attention queue</strong>
                <TinyTag tone={hasAlerts ? "coral" : "lime"}>
                  {hasAlerts ? `${noticeCount} need attention` : "nothing needs attention"}
                </TinyTag>
              </div>
              {systemNotices.length ? (
                <div className="popover-notes">
                  {systemNotices.map(note => (
                    <div className="popover-row" key={note.id}>
                      <span className={`status-dot status-dot--${note.tone}`} />
                      <div>
                        <strong>{note.title}</strong>
                        <span>{note.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {attentionQueue.length ? (
                attentionQueue.map(item => (
                  <div className="popover-row" key={item.id}>
                    <span
                      className={`status-dot status-dot--${
                        item.severity === "critical" ? "coral" : item.severity === "high" ? "orange" : "blue"
                      }`}
                    />
                    <div>
                      <strong>{item.reason || item.feature || "Detected anomaly"}</strong>
                      <span>
                        {item.feature ? `${item.feature} · ` : ""}
                        {item.timestamp} · {item.severity}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="mono-note popover-empty">
                  No anomalies recorded yet. Run the pipeline to populate this queue.
                </p>
              )}
              <button
                type="button"
                className="popover__link"
                onClick={() => {
                  goTo("anomalies");
                  sound.play({ volume: 0.12, rate: 1.05 });
                }}
              >
                Open anomaly queue <ArrowRight size={13} />
              </button>
            </div>
          ) : null}
          {profileOpen ? (
            <div className="popover popover--profile">
              <div className="profile-card">
                <span className="avatar avatar--large">{initials}</span>
                <div>
                  <strong>{displayName}</strong>
                  <span>
                    {currentUser?.role ? `${currentUser.role} account` : "workspace account"}
                    {currentUser?.email ? ` · ${currentUser.email}` : ""}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => goTo("settings")}>
                <Settings2 size={14} />{" "}
                Workspace settings
              </button>
              <button
                type="button"
                onClick={() => {
                  // Clearing the token here is the only way out of a stale
                  // session; without it the app can only bounce back to the
                  // sign-in page.
                  auth.logout();
                  setToken(null);
                  setCurrentUser(null);
                  setSignedIn(false);
                  setProfileOpen(false);
                  setToast("Signed out. Every recorded run stays in the workspace.");
                }}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <CommandPalette
        datasets={datasets.map(dataset => ({ id: dataset.id, name: dataset.name }))}
        onNavigate={route => goTo(route as NavId)}
      />
      <main className="app-main" id="main-content">
        <div className="context-strip">
          {/* The metadata scrolls sideways when space runs out; the run controls
              beside it are pinned, so the buttons that drive the pipeline can
              never be pushed off the edge of the screen. */}
          <div className="context-strip__meta">
          <span className="context-strip__item">
            <span className="context-strip__label">DATASET</span>
            <strong>{activeDataset.name}</strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">DOMAIN</span>
            <strong>{domainInfo.label}</strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">BASELINE</span>
            <strong className={baselineName ? "" : "context-strip__value--pending"}>
              {baselineName || "awaiting stage 06"}
            </strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">MODEL</span>
            <strong className={modelName ? "" : "context-strip__value--pending"}>
              {modelName || "awaiting stage 07"}
            </strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">STAGES</span>
            <strong className={stagesDone ? "" : "context-strip__value--pending"}>
              {stagesDone ? `${stagesDone} / 10 complete` : "not started"}
            </strong>
          </span>
          <span className="context-strip__item context-strip__item--status">
            <span className="context-strip__label">SYNC</span>
            <strong>
              <span className="status-dot status-dot--lime" />
              {activeDataset.freshness}
            </strong>
          </span>
          </div>
          {/* Present on every page: a demonstration should never have to hunt
              for the run controls, and they must never be dead. */}
          <div className="pipeline-quick">
            <button
              type="button"
              className="pipeline-quick__button pipeline-quick__nav"
              onClick={goPreviousStage}
              title="Move to the previous pipeline stage without running anything"
            >
              Previous
            </button>
            <button
              type="button"
              className="pipeline-quick__button pipeline-quick__nav"
              onClick={goNextStage}
              title="Move to the next pipeline stage without running anything"
            >
              Next
            </button>
            <button
              type="button"
              className="pipeline-quick__button pipeline-quick__button--primary"
              onClick={() => void execAllAndReport()}
              disabled={!!stageBusy || autoRunning}
              title="Run every remaining stage, then open the executive report"
            >
              <Play size={13} />
              {autoRunning ? "Running…" : "Run"}
            </button>
            <button
              type="button"
              className="pipeline-quick__button"
              onClick={() => void execNextStage()}
              disabled={!!stageBusy || autoRunning}
              title="Execute the next stage only"
            >
              Step
            </button>
            <button
              type="button"
              className="pipeline-quick__button"
              onClick={() => void stopRun()}
              disabled={!liveRunId && !autoRunning}
              title="Stop the active run — completed stages keep their output"
            >
              <Pause size={13} />
              Stop
            </button>
            <button
              type="button"
              className="pipeline-quick__button"
              onClick={() => void startFreshRun()}
              disabled={!!stageBusy || autoRunning}
              title="Start a new run for this dataset from stage 01"
            >
              <RefreshCw size={13} />
              New run
            </button>
          </div>
        </div>
        <div className="view-shell">
          <div className="view-header">
            <div>
              <div className="view-header__kicker">{viewMeta[activeView].kicker}</div>
              <h1>{viewMeta[activeView].title}</h1>
              <p>{viewMeta[activeView].description}</p>
            </div>
            <div className="view-header__meta">
              <span className="system-chip">
                <span className="status-dot status-dot--lime" />
                AI core online
              </span>
              <span className="mono-note">
                {baselineName ? `${baselineName} / ` : ""}{domainInfo.label}
              </span>
            </div>
          </div>
          {renderView()}
        </div>
      </main>
      <ActivityTerminal
        activeView={activeView}
        open={terminalOpen}
        paused={terminalPaused}
        onToggle={() => setTerminalOpen(value => !value)}
        onPause={() => setTerminalPaused(value => !value)}
      />
      <InspectorDrawer
        anomaly={selectedAnomaly}
        point={selectedPoint}
        baselineName={baselineName}
        onClose={() => { setSelectedAnomaly(null); setSelectedPoint(null); }}
        onOpenChart={focusAnomalyOnChart}
      />
      {preview ? (
        <DatasetPreviewModal
          dataset={preview.dataset}
          rows={preview.rows}
          loading={preview.loading}
          error={preview.error}
          onClose={() => setPreview(null)}
          onExport={exportPreviewCsv}
        />
      ) : null}
      {toast ? (
        <div className="toast">
          <span className="toast__icon">
            <Check size={15} />
          </span>
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            type="button"
            onClick={() => {
              setToast("");
              sound.play({ volume: 0.1, rate: 0.85 });
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      <SoundPlayer kind="ui" when={signedIn} />
    </div>
  );
}

let activityEvents: LiveActivity[] = [];

function ActivityTerminal({
  activeView,
  open,
  paused,
  onToggle,
  onPause,
}: {
  activeView: NavId;
  open: boolean;
  paused: boolean;
  onToggle: () => void;
  onPause: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setCursor(value => value + 1), 3800);
    return () => window.clearInterval(timer);
  }, [paused]);
  // The terminal reports what the pipeline actually did. Stage traces are the
  // authoritative record — one row per executed stage with its real duration and
  // recorded decision — and the audit feed is appended for anything outside the
  // stage runner. Nothing here ticks on a timer that pretends to be work.
  const stageRows: LiveActivity[] = [...liveStages]
    .sort((a, b) => b.number - a.number)
    .map(stage => ({
      time: stage.ranAt ? fmtRunClock(stage.ranAt) : "—",
      status: stage.status === "completed" ? "DONE" : stage.status === "failed" ? "FAILED" : "PENDING",
      service: `stage ${String(stage.number).padStart(2, "0")}`,
      operation: stage.label,
      duration: stage.durationMs ? `${Math.round(stage.durationMs)} ms` : "—",
      result: stage.decision || (stage.status === "completed" ? "recorded output stored" : "not run yet"),
      severity: stage.status === "failed" ? "warning" : stage.status === "completed" ? "success" : "info",
    }));
  const feed = [...stageRows, ...activityEvents].slice(0, 6);
  const rowCount = Math.min(feed.length, 4);
  const activeRow = rowCount && !paused ? cursor % rowCount : -1;
  const sound = useSound({ onPlay: () => {} });
  return (
    <section
      className={`activity-terminal ${open ? "activity-terminal--open" : "activity-terminal--closed"}`}
      aria-label="Live backend activity"
    >
      <div className="activity-terminal__bar">
        <div className="activity-terminal__title">
          <span className="terminal-pulse" />
          <span>ACTIVITY TERMINAL</span>
          <TinyTag tone={paused ? "neutral" : feed.length ? "lime" : "blue"}>
            {paused ? "PAUSED" : feed.length ? `${feed.length} RECORDED` : "IDLE"}
          </TinyTag>
        </div>
        <div className="activity-terminal__controls">
          <span className="mono-note">scope / {viewMeta[activeView].kicker.split(" / ").pop()}</span>
          <button
            type="button"
            onClick={() => {
              onPause();
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
            aria-label={paused ? "Resume activity stream" : "Pause activity stream"}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            onClick={() => {
              onToggle();
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
            aria-label={open ? "Collapse activity terminal" : "Expand activity terminal"}
          >
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="activity-terminal__body">
          <div className="activity-terminal__columns">
            <span>TIMESTAMP</span>
            <span>STATUS</span>
            <span>SERVICE</span>
            <span>OPERATION</span>
            <span>DURATION</span>
            <span>RESULT</span>
            <span>SEVERITY</span>
          </div>
          {feed.length ? (
            feed.map((event, index) => (
              <div
                className={`activity-terminal__row ${index === activeRow && !paused ? "activity-terminal__row--live" : ""}`}
                key={`${event.time}-${event.operation}-${index}`}
              >
                <span>{event.time}</span>
                <span>
                  <i className={index === activeRow && !paused ? "terminal-live-dot" : "terminal-done-dot"} />
                  {event.status}
                </span>
                <span>{event.service}</span>
                <strong>{event.operation}</strong>
                <span>{event.duration}</span>
                <span title={event.result}>{event.result}</span>
                <TinyTag
                  tone={event.severity === "warning" ? "orange" : event.severity === "success" ? "lime" : "blue"}
                >
                  {event.severity}
                </TinyTag>
              </div>
            ))
          ) : (
            <div className="activity-terminal__row activity-terminal__empty">
              <span>--:--:--</span>
              <span>IDLE</span>
              <span>system</span>
              <strong>No backend activity recorded yet</strong>
              <span>&mdash;</span>
              <span>Run the pipeline to stream live events</span>
              <TinyTag tone="blue">empty</TinyTag>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function InspectorDrawer({
  anomaly,
  point,
  baselineName,
  onClose,
  onOpenChart,
}: {
  anomaly: (typeof anomalies)[number] | null;
  point: LiveAnomalyPoint | null;
  baselineName: string;
  onClose: () => void;
  onOpenChart: (anomaly: (typeof anomalies)[number]) => void;
}) {
  const sound = useSound({ onPlay: () => {} });
  const open = anomaly != null || point != null;
  return (
    <aside className={`inspector-drawer ${open ? "inspector-drawer--open" : ""}`} aria-label="Inspector panel">
      <div className="inspector-drawer__head">
        <div>
          <span className="section-eyebrow">EVIDENCE INSPECTOR</span>
          <h2>
            {point ? `Point · ${point.timestamp}`
            : anomaly ? anomaly.id
            : "Select an evidence item"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={() => {
            onClose();
            sound.play({ volume: 0.08, rate: 0.85 });
          }}
          aria-label="Close inspector"
        >
          <X size={14} />
        </button>
      </div>
      {point ? (
        <PointInspector point={point} baselineName={baselineName} onClose={onClose} />
      ) : anomaly ? (
        <div className="inspector-drawer__content">
          <div className="inspector-alert">
            <span className="inspector-alert__icon">
              <AlertTriangle size={18} />
            </span>
            <div>
              <TinyTag tone={anomaly.color === "coral" ? "coral" : "orange"}>{anomaly.severity}</TinyTag>
              <h3>{anomaly.type}</h3>
              <span>{anomaly.timestamp}</span>
            </div>
          </div>
          <div className="inspector-explanation">
            <span className="section-eyebrow">BUSINESS EXPLANATION</span>
            <p>
              {anomaly.reason}. This event is outside the selected operating baseline and may affect the next
              cost forecast.
            </p>
          </div>
          <div className="inspector-metrics">
            <div>
              <span>DEVIATION</span>
              <strong>
                {anomaly.deviationPct != null
                  ? `${anomaly.deviationPct >= 0 ? "+" : ""}${anomaly.deviationPct.toFixed(0)}%`
                  : "—"}
              </strong>
              <small>vs learned baseline</small>
            </div>
            <div>
              <span>COST IMPACT</span>
              <strong>{anomaly.excessCost != null ? `${displayUnit("INR")}${fmtCount(anomaly.excessCost)}` : "—"}</strong>
              <small>recorded excess</small>
            </div>
            <div>
              <span>CO₂ IMPACT</span>
              <strong>{anomaly.excessCo2 != null ? `${fmtCount(anomaly.excessCo2)} kg` : "—"}</strong>
              <small>recorded excess</small>
            </div>
            <div>
              <span>DETECTION SCORE</span>
              <strong>{anomaly.score != null ? anomaly.score.toFixed(2) : "—"}</strong>
              <small>evidence score</small>
            </div>
          </div>
          <div className="inspector-evidence">
            <div>
              <span className="section-eyebrow">TECHNICAL EVIDENCE</span>
              <code>feature = {anomaly.feature}</code>
              <code>reason = {anomaly.reason}</code>
              <code>detected_at = {anomaly.timestamp}</code>
              <code>baseline = {baselineName.toLowerCase().replace(/\s+/g, "_")}</code>
            </div>
          </div>
          <div className="inspector-actions">
            <button
              type="button"
              className="action-button action-button--secondary"
              onClick={() => {
                onOpenChart(anomaly);
                sound.play({ volume: 0.1, rate: 0.95 });
              }}
            >
              <Eye size={14} />
              Open related chart
            </button>
            <button
              type="button"
              className="panel-link"
              onClick={() => {
                onClose();
                sound.play({ volume: 0.08, rate: 0.85 });
              }}
            >
              Dismiss insight <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="inspector-empty">
          <div className="inspector-empty__orb">
            <Sparkles size={20} />
          </div>
          <h3>Context appears here.</h3>
          <p>
            Select an anomaly, quality issue, or recommendation to inspect the business meaning, technical
            evidence, confidence, dependencies, and historical context.
          </p>
          <div className="inspector-empty__hint">
            <MousePointer2 size={13} />{" "}
            Try opening an anomaly from the queue
          </div>
        </div>
      )}
    </aside>
  );
}

/** Rich inspection of a single anomaly-chart point, driven entirely by the
 * backend metadata attached to that point. No fabricated fields.
 */
const PointInspector = ({
  point,
  baselineName,
  onClose,
}: {
  point: LiveAnomalyPoint;
  baselineName: string;
  onClose: () => void;
}) => {
  const severityColor: Record<string, string> = {
    critical: "coral",
    high: "orange",
    medium: "yellow",
    low: "blue",
  };
  const tone = severityColor[point.severity] ?? "neutral";
  const locationLabel =
    [point.building_name, point.floor_no, point.room_code, point.device_name]
      .filter(Boolean)
      .join(" / ") ||
    [point.building_code, point.floor_no, point.room_code, point.device_code]
      .filter(Boolean)
      .join(" / ") ||
    "estate not recorded";
  return (
    <div className="inspector-drawer__content">
      <div className="inspector-alert">
        <span className="inspector-alert__icon">
          <AlertTriangle size={18} />
        </span>
        <div>
          <TinyTag tone={tone}>{point.severity || "no anomaly"}</TinyTag>
          <h3>{point.anomaly_type || "Reading"}</h3>
          <span>{point.timestamp}</span>
        </div>
      </div>

      <div className="inspector-section">
        <span className="section-eyebrow">LOCATION</span>
        <div className="inspector-grid">
          <div>
            <strong>Building</strong>
            <span className="mono-note">{point.building_code || point.building_name || "—"}</span>
          </div>
          <div>
            <strong>Floor</strong>
            <span className="mono-note">{point.floor_no || "—"}</span>
          </div>
          <div>
            <strong>Room</strong>
            <span className="mono-note">{point.room_code || "—"}</span>
          </div>
          <div>
            <strong>Device</strong>
            <span className="mono-note">{point.device_code || "—"}</span>
          </div>
          <div>
            <strong>Device name</strong>
            <span>{point.device_name || "—"}</span>
          </div>
          <div>
            <strong>Device type</strong>
            <span>{point.device_type || "—"}</span>
          </div>
        </div>
      </div>

      <div className="inspector-section">
        <span className="section-eyebrow">ENERGY</span>
        <div className="inspector-metrics">
          <div>
            <span>Observed</span>
            <strong>
              {point.observed_energy_kwh != null
                ? `${point.observed_energy_kwh.toFixed(1)} kWh`
                : "—"}
            </strong>
            <small>recorded reading</small>
          </div>
          <div>
            <span>Baseline</span>
            <strong>
              {point.baseline_energy_kwh != null
                ? `${point.baseline_energy_kwh.toFixed(1)} kWh`
                : "—"}
            </strong>
            <small>learned normal</small>
          </div>
          <div>
            <span>Deviation</span>
            <strong>
              {point.deviation_percent != null
                ? `${point.deviation_percent >= 0 ? "+" : ""}${point.deviation_percent.toFixed(1)}%`
                : "—"}
            </strong>
            <small>vs baseline</small>
          </div>
          <div>
            <span>Predicted</span>
            <strong>
              {point.predicted_energy_kwh != null
                ? `${point.predicted_energy_kwh.toFixed(1)} kWh`
                : "not provided"}
            </strong>
            <small>forecast at this point</small>
          </div>
        </div>
      </div>

      <div className="inspector-section">
        <span className="section-eyebrow">AI</span>
        <div className="inspector-metrics">
          <div>
            <span>Severity</span>
            <strong>{point.severity || "—"}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>
              {point.confidence != null ? point.confidence.toFixed(2) : "—"}
            </strong>
            <small>detection confidence</small>
          </div>
          <div>
            <span>Anomaly type</span>
            <span>{point.anomaly_type || "—"}</span>
          </div>
          <div>
            <span>Winning model</span>
            <span>
              {point.model_name || "—"}
              {point.model_version ? ` · v${point.model_version}` : ""}
            </span>
          </div>
          <div>
            <span>Baseline version</span>
            <strong>
              {point.baseline_version != null ? `v${point.baseline_version}` : "—"}
            </strong>
          </div>
          <div>
            <span>Origin</span>
            <span>{point.origin || "—"}</span>
          </div>
        </div>
      </div>

      <div className="inspector-section">
        <span className="section-eyebrow">PROVENANCE</span>
        <div className="inspector-grid">
          <div>
            <strong>Dataset</strong>
            <span className="mono-note">{point.dataset_id}</span>
          </div>
          <div>
            <strong>Dataset name</strong>
            <span>{point.dataset_name || "—"}</span>
          </div>
          <div>
            <strong>Domain</strong>
            <span>{point.domain || "—"}</span>
          </div>
          <div>
            <strong>Workflow run</strong>
            <span className="mono-note">{point.workflow_run_id || "—"}</span>
          </div>
        </div>
      </div>

      <div className="inspector-actions">
        <button
          type="button"
          className="panel-link"
          onClick={() => {
            onClose();
          }}
        >
          Dismiss <X size={13} />
        </button>
      </div>
    </div>
  );
};

function OverviewView({
  onNavigate,
  activeDataset,
  domainInfo,
  baselineName,
  onStep,
  onAuto,
  onRunAll,
  onRefresh,
  refreshing,
  stageBusy,
  autoRunning,
}: {
  onNavigate: (view: NavId) => void;
  activeDataset: Dataset;
  domainInfo: (typeof domainMeta)[DatasetDomain];
  baselineName: string;
  onStep: () => void;
  onAuto: () => void;
  onRunAll: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  stageBusy: string;
  autoRunning: boolean;
}) {
  const completedStages = liveStages.filter(s => s.status === "completed").length;
  const energyTotal = Math.round(energyData.reduce((sum, p) => sum + p.energy, 0));
  const baselineTotal = energyData.reduce((sum, p) => sum + p.baseline, 0);
  const energyDeltaPct = baselineTotal > 0 ? ((energyTotal - baselineTotal) / baselineTotal) * 100 : 0;
  const energyDelta = energyData.length
    ? `${energyDeltaPct >= 0 ? "+" : ""}${energyDeltaPct.toFixed(1)}% vs baseline`
    : "no live readings";
  const healthScore = liveQualityMeta?.score ?? null;
  const failedChecks = liveQualityMeta?.failed ?? null;
  const recentActivity = activityEvents.slice(0, 4);
  const topAnomaly = anomalies[0] ?? null;
  const stageState = (key: string) => liveStages.find(s => s.id === key)?.status ?? "pending";
  return (
    <div className="view-content view-content--overview">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <div className="hero-kicker">
            <span className="hero-kicker__line" />
            AI-FIRST ENERGY OPERATING SYSTEM
          </div>
          <h2>
            Make every <em>kilowatt</em><br />
            explainable.
          </h2>
          <p>
            EcoMind turns operational data into an inspectable chain of decisions — from raw signal to practical
            action.
          </p>
          <div className="hero-panel__actions">
            <ActionButton icon={Play} onClick={() => onNavigate("library")}>
              Open active pipeline
            </ActionButton>
            <button className="text-button" type="button" onClick={() => onNavigate("reports")}>
              View latest report <ArrowRight size={14} />
            </button>
          </div>
          <div className="hero-panel__proof">
            <span>
              <CheckCircle2 size={14} />{" "}
              {liveStages.length ? `${liveStages.length} stages orchestrated` : "10 stages orchestrated"}
            </span>
            <span>
              <CheckCircle2 size={14} />{" "}
              No black-box handoffs
            </span>
          </div>
        </div>
        <div className="hero-panel__visual">
          <LivingHero
            healthScore={healthScore}
            completedStages={completedStages}
            totalStages={liveStages.length || 10}
            rows={Number(activeDataset.rows) || null}
            anomalies={liveAnomalyMeta?.total ?? anomalies.length}
          />
          <div className="telemetry-grid" />
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <div className="hero-core">
            <div className="hero-core__ring hero-core__ring--outer" />
            <div className="hero-core__ring hero-core__ring--inner" />
            <div className="hero-core__icon">
              <Leaf size={23} />
            </div>
            <span>AI CORE</span>
            <strong>{healthScore != null ? `${healthScore}%` : "—"}</strong>
            <small>quality score</small>
          </div>
          <div className="hero-visual-label hero-visual-label--top">
            <span className="status-dot status-dot--lime" />
            LIVE PIPELINE <strong>{liveStages.filter(s => s.status === "completed").length} / 10</strong>
          </div>
          <div className="hero-visual-label hero-visual-label--bottom">
            <span>ENERGY INTELLIGENCE</span>
            <strong>{activeDataset.id}</strong>
          </div>
          <div className="hero-signal hero-signal--one" />
          <div className="hero-signal hero-signal--two" />
          <div className="hero-signal hero-signal--three" />
        </div>
      </section>
      <section className="pipeline-panel">
        <div className="pipeline-panel__top">
          <div>
            <div className="section-eyebrow">INTELLIGENCE PIPELINE</div>
            <h2>One continuous thread from data to decision.</h2>
          </div>
          <div className="pipeline-controls">
            <span className="mono-note">
              RUN ID / {liveRunId ? liveRunId.slice(0, 12) : "no run yet · Step starts one"}
            </span>
            <button
              type="button"
              className="pipeline-control"
              onClick={onStep}
              disabled={!!stageBusy || autoRunning}
            >
              <Play size={13} />
              {stageBusy ? `Running ${stageBusy}` : "Step"}
            </button>
            <button
              type="button"
              className="pipeline-control pipeline-control--primary"
              onClick={onAuto}
              disabled={!!stageBusy || autoRunning}
              title="Run the remaining stages and follow them: the app opens each page as its stage completes"
            >
              <Play size={13} />
              {autoRunning ? "Running..." : "Guided tour"}
            </button>
            <button
              type="button"
              className="pipeline-control"
              onClick={onRunAll}
              disabled={!!stageBusy || autoRunning}
              title="Run every remaining stage, then land on the executive report"
            >
              <Play size={13} />
              Run all → report
            </button>
          </div>
        </div>
        <div className="pipeline-rail">
          {pipelineStages.map(stage => {
            const Icon = stage.icon;
            const ls = liveStages.find(s => s.id === (STAGE_KEY_BY_VIEW[stage.id] ?? stage.id));
            const done = ls?.status === "completed";
            return (
              <button
                type="button"
                className={`pipeline-stage ${done ? "pipeline-stage--done" : ""}`}
                key={stage.id}
                onClick={() => onNavigate(stage.id)}
              >
                <span className="pipeline-stage__node">
                  <Icon size={15} />
                </span>
                <span className="pipeline-stage__num">{stage.short}</span>
                <strong>{stage.label}</strong>
                {ls ? (
                  <span className="pipeline-stage__meta">
                    {done ? fmtLiveDuration(ls) : ls.status}
                  </span>
                ) : null}
                {stage.id !== "reports" ? <span className="pipeline-stage__connector" /> : null}
              </button>
            );
          })}
        </div>
      </section>
      <div className="dashboard-grid dashboard-grid--overview">
        <section className="panel panel--library">
          <SectionHeading
            eyebrow={`ACTIVE DATASET / ${activeDataset.id}`}
            title={activeDataset.name}
            detail={`${domainInfo.label} · ${activeDataset.location}`}
            action={
              <button className="panel-link" type="button" onClick={() => onNavigate("library")}>
                View library <ArrowRight size={13} />
              </button>
            }
          />
          <div className="dataset-summary">              <div className={`dataset-summary__icon dataset-summary__icon--${activeDataset.accent}`}>
                <AppIcon icon={datasetDomainIcon(activeDataset.domain)} size={23} />
            </div>
            <div className="dataset-summary__details">
              <div>
                <span className="mono-note">FRESHNESS / {activeDataset.freshness.toUpperCase()}</span>
                <TinyTag tone={activeDataset.accent}>AI CLASSIFIED</TinyTag>
              </div>
              <strong>{activeDataset.detail}</strong>
              <span>
                {activeDataset.rows} rows · {activeDataset.fieldCount ?? activeDataset.columnCount ?? "—"} fields · {activeDataset.freshness} freshness
              </span>
            </div>
            <div className="dataset-summary__health">
              <span>DATA HEALTH</span>
              <strong>{activeDataset.health}</strong>
              <div className="mini-progress">
                <i style={{ width: activeDataset.health }} />
              </div>
            </div>
          </div>
          <div className="mini-chart-wrap">
            <div className="mini-chart-label">
              <span>
                SIGNALS / {energyData.length} RECORDED POINT
                {energyData.length === 1 ? "" : "S"}
              </span>
              <strong>{energyData.length ? withUnit(fmtCount(energyTotal)) : "—"} <em>{energyDelta}</em></strong>
            </div>
            <div className="mini-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={energyData}>
                  <defs>
                    <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b6f36b" stopOpacity={0.30} />
                      <stop offset="100%" stopColor="#b6f36b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="energy"
                    stroke="#b6f36b"
                    strokeWidth={2.2}
                    fill="url(#miniFill)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="#718b7b"
                    strokeDasharray="4 4"
                    strokeWidth={1.2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="axis-note mini-chart-note">
              {energyData.length
                ? `Yellow: measured ${liveTargetColumn || "target"} for ${activeDataset.name}. Dashed green: the adaptive baseline the pipeline learned from the same rows — the reference every later stage compares against.`
                : "No recorded series for this dataset yet — run the pipeline to plot it."}
            </span>
          </div>
        </section>
        <section className="panel panel--health">
          <SectionHeading
            eyebrow="PIPELINE HEALTH"
            title="Everything is moving."
            action={
              <button
                className="icon-button icon-button--small"
                type="button"
                aria-label="Refresh recorded pipeline state"
                onClick={onRefresh}
              >
                <RefreshCw size={14} className={refreshing ? "is-spinning" : ""} />
              </button>
            }
          />
          <div className="health-score">
            <div className="health-score__ring" data-score={healthScore ?? ""}>
              <span>{healthScore ?? "—"}</span>
              <small>health</small>
            </div>
            <div>
              <strong>Good to model</strong>
              <p>{failedChecks == null ? "No quality run recorded for this dataset yet." : failedChecks === 0 ? "Every structural quality rule passed on the active run." : `${failedChecks} quality ${failedChecks === 1 ? "check" : "checks"} need attention before the next run.`}</p>
              <button
                className="panel-link"
                type="button"
                onClick={() => onNavigate("quality")}
              >
                Review quality <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <div className="health-list">
            {(["schema", "quality", "transformation", "model_selection"] as const).map(key => {
              const st = stageState(key);
              const tone = st === "completed" ? "lime" : st === "failed" ? "coral" : "orange";
              return (
                <div key={key}>
                  <span>
                    <span className={`status-dot status-dot--${tone}`} />
                    {STAGE_LABEL_TEXT[key]}
                  </span>
                  <strong>
                    {st === "completed"
                      ? key === "quality" && healthScore != null
                        ? `${healthScore} / 100`
                        : "Complete"
                      : st === "failed"
                        ? "Failed"
                        : "Pending"}
                  </strong>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel panel--activity">
          <SectionHeading
            eyebrow="LIVE OPERATIONS"
            title="Transparent by default."
            detail="Last 4 events from the active pipeline"
            action={
              <button className="panel-link" type="button" onClick={() => onNavigate("history")}>
                Open history <ArrowRight size={13} />
              </button>
            }
          />
          <div className="operation-list">
            {recentActivity.length ? (
              recentActivity.map((event, index) => (
                <div className="operation-row" key={`${event.time}-${event.operation}-${index}`}>
                  <span
                    className={`operation-row__icon operation-row__icon--${
                      event.severity === "warning" ? "orange" : event.severity === "success" ? "lime" : "blue"
                    }`}
                  >
                    <DatabaseZap size={14} />
                  </span>
                  <div>
                    <strong>{event.operation}</strong>
                    <span>
                      {event.service} / {event.time}
                    </span>
                  </div>
                  <TinyTag tone={event.severity === "warning" ? "orange" : event.severity === "success" ? "lime" : "blue"}>
                    {event.status}
                  </TinyTag>
                </div>
              ))
            ) : (
              <p className="mono-note">No pipeline activity recorded yet.</p>
            )}
          </div>
        </section>
        <section className="panel panel--next">
          <div className="next-step-card">
            <div className="next-step-card__top">
              <span className="section-eyebrow">NEXT BEST ACTION</span>
              <TinyTag tone="lime">AI SUGGESTED</TinyTag>
            </div>
            <h3>{topAnomaly ? `Review ${topAnomaly.type.toLowerCase()} on ${topAnomaly.feature}.` : "No action required yet."}</h3>
            <p>
              {topAnomaly
                ? `${topAnomaly.severity} severity · ${topAnomaly.reason}. Inspect the evidence before exporting.`
                : "Run the pipeline to derive the next best action from live anomalies and recommendations."}
            </p>
            <ActionButton variant="secondary" icon={ArrowRight} onClick={() => onNavigate("anomalies")}>
              Inspect anomaly
            </ActionButton>
          </div>
        </section>
      </div>
      <div className="overview-footer">
        <span>
          <span className="status-dot status-dot--lime" />
          {liveRunId ? `Run ${liveRunId.slice(0, 8)} / ${completedStages} of 10 stages complete` : "Pipeline idle — no run recorded"}
        </span>
        <span>Original source preserved{baselineName ? ` · ${baselineName}` : ""}</span>
        <span>Workspace: {activeDataset.name}</span>
      </div>
    </div>
  );
}

/**
 * Dataset preview. Shows the rows the backend recorded for a dataset, with the
 * unit derived from each column name, and can export exactly those rows as CSV.
 * Read-only: it never writes back to the source.
 */
function DatasetPreviewModal({
  dataset,
  rows,
  loading,
  error,
  onClose,
  onExport,
}: {
  dataset: Dataset;
  rows: Record<string, unknown>[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onExport: () => void;
}) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={`Preview of ${dataset.name}`}>
      <div className="modal">
        <div className="modal__head">
          <div>
            <span className="section-eyebrow">DATASET PREVIEW / READ-ONLY</span>
            <h2>{dataset.name}</h2>
            <span className="mono-note">
              {dataset.id} · {dataset.rows} rows · {dataset.columnCount ?? "—"} columns · {dataset.type}
            </span>
          </div>
          <div className="modal__actions">
            <button type="button" className="pipeline-control" onClick={onExport} disabled={!rows.length}>
              <Download size={13} /> Export CSV
            </button>
            <button type="button" className="icon-button" aria-label="Close preview" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="modal__body">
          {loading ? <p className="mono-note table-empty-note">Reading recorded rows…</p> : null}
          {!loading && error ? <p className="mono-note table-empty-note">{error}</p> : null}
          {!loading && !error && rows.length ? (
            <>
              <table className="preview-table">
                <thead>
                  <tr>
                    {columns.map(column => {
                      const unit = unitForColumn(column);
                      return (
                        <th key={column}>
                          <span className="preview-table__name">{column}</span>
                          <span className="mono-note">{unit ? displayUnit(unit) : "—"}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      {columns.map(column => (
                        <td key={column}>{String(row[column] ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mono-note preview-table__foot">
                Showing the first {rows.length} recorded rows. Export downloads these rows as CSV.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LibraryView({
  activeDataset,
  onSelect,
  onImport,
  onPreview,
}: {
  activeDataset: Dataset;
  onSelect: (dataset: Dataset) => void;
  onImport: () => void;
  onPreview: (dataset: Dataset) => void;
}) {
  const activeDomain = activeDataset.domain;
  const sound = useSound({ onPlay: () => {} });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"newest" | "rows" | "health" | "name">("newest");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("ecomind.favorites") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (id: string) => {
    setFavorites(previous => {
      const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
      window.localStorage.setItem("ecomind.favorites", JSON.stringify(next));
      return next;
    });
  };
  const healthValue = (dataset: Dataset) => parseInt(String(dataset.health).replace(/\D/g, ""), 10) || 0;
  const needle = query.trim().toLowerCase();
  const visible = datasets
    .filter(dataset =>
      !needle ||
      `${dataset.name} ${dataset.detail} ${dataset.type} ${dataset.location} ${dataset.id} ${dataset.domain}`
        .toLowerCase()
        .includes(needle),
    )
    .slice()
    .sort((a, b) => {
      const favourite = Number(favorites.includes(b.id)) - Number(favorites.includes(a.id));
      if (favourite !== 0) return favourite;
      if (sortKey === "rows") {
        return Number(String(b.rows).replace(/\D/g, "")) - Number(String(a.rows).replace(/\D/g, ""));
      }
      if (sortKey === "health") return healthValue(b) - healthValue(a);
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  const domainCounts = datasets.reduce<Record<string, number>>((acc, d) => {
    acc[d.domain] = (acc[d.domain] ?? 0) + 1;
    return acc;
  }, {});
  const domainPct = (n: number) => (datasets.length ? `${Math.round((n / datasets.length) * 100)}%` : "—");
  return (
    <div className="view-content">
      <div className="toolbar-row">
        <div className="toolbar-search">
          <Search size={15} />
          <input
            placeholder="Search name, industry, building, owner…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search dataset library"
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="toolbar-actions">
          <button
            className="filter-button"
            type="button"
            onClick={() => {
              const order: Array<typeof sortKey> = ["newest", "rows", "health", "name"];
              setSortKey(order[(order.indexOf(sortKey) + 1) % order.length]);
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
            title="Cycle sort order"
          >
<Filter size={14} />{" "}
            {sortKey === "newest" ? "Newest" : sortKey === "rows" ? "Rows" : sortKey === "health" ? "Health" : "A–Z"}{" "}
            <span>{visible.length}</span>
          </button>
          <ActionButton icon={Plus} onClick={onImport}>
            Import dataset
          </ActionButton>
        </div>
      </div>
      <div className="library-grid">
        {visible.map(dataset => {
          const Icon = dataset.icon;
          const active = activeDataset.id === dataset.id;
          const score = healthValue(dataset);
          return (
            <div className="dataset-card-wrap" key={dataset.id}>
            <button
              className={`dataset-card ${active ? "dataset-card--active" : ""}`}
              type="button"
              onClick={() => onSelect(dataset)}
            >
              <div className={`dataset-card__glow dataset-card__glow--${dataset.accent}`} />
              <div className="dataset-card__head">
                <div className={`dataset-card__icon dataset-card__icon--${dataset.accent}`}>
                  <Icon size={22} />
                </div>
                <div className="dataset-card__head-copy">
                  <span className="mono-note" title={dataset.id}>
                    {dataset.id}
                  </span>
                  <TinyTag
                    tone={dataset.accent === "lime" ? "lime" : dataset.accent === "orange" ? "orange" : "violet"}
                  >
                    AI CLASSIFIED
                  </TinyTag>
                </div>
              </div>
              <h3>{dataset.name}</h3>
              <p>{dataset.detail}</p>
              <div className="dataset-card__type">
                <span>{dataset.type}</span>
                <span>{dataset.location}</span>
              </div>
              <div className="dataset-card__stats">
                <div>
                  <span>ROWS</span>
                  <strong>{dataset.rows}</strong>
                </div>
                <div>
                  <span>HEALTH</span>
                  <strong
                    className={`health-ring health-ring--${score >= 80 ? "good" : score >= 60 ? "warn" : "bad"}`}
                    title={`AI health ${score}/100 — ${score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "warning" : "needs cleaning"}`}
                  >
                    <svg viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="15" className="health-ring__track" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        className="health-ring__fill"
                        style={{ strokeDashoffset: 94.25 - (94.25 * Math.min(100, score)) / 100 }}
                      />
                    </svg>
                    {dataset.health}
                  </strong>
                </div>
                <div>
                  <span>FRESHNESS</span>
                  <strong>{dataset.freshness}</strong>
                </div>
              </div>
              <div className="dataset-card__footer">
                <span>
                  <span className="status-dot status-dot--lime" />
                  {active ? "Active dataset" : "Ready to analyze"}
                </span>
                <ArrowUpRight size={15} />
              </div>
            </button>
            <div className="dataset-card__actions">
              <button type="button" onClick={() => onPreview(dataset)}>
                <Eye size={13} /> Preview rows
              </button>
              <button type="button" onClick={() => onSelect(dataset)}>
                <ArrowUpRight size={13} /> Open
              </button>
              <button
                type="button"
                aria-pressed={favorites.includes(dataset.id)}
                onClick={() => toggleFavorite(dataset.id)}
              >
                <Star size={13} /> {favorites.includes(dataset.id) ? "Favorited" : "Favorite"}
              </button>
            </div>
            </div>
          );
        })}
        {!datasets.length ? (
          <p className="mono-note library-empty">
            No datasets available. Import your first dataset to begin the ten-stage pipeline.
          </p>
        ) : null}
        {datasets.length > 0 && visible.length === 0 ? (
          <p className="mono-note library-empty">No dataset matches “{query}”. Clear the search to see all {datasets.length}.</p>
        ) : null}
        <button
          className="dataset-card dataset-card--import"
          type="button"
          onClick={() => {
            onImport();
            sound.play({ volume: 0.12, rate: 0.95 });
          }}
        >
          <div className="dataset-card--import__icon">
            <UploadCloud size={22} />
          </div>
          <strong>Import a new dataset</strong>
          <span>CSV or Excel · the two formats the API accepts</span>
          <div className="dataset-card--import__line" />
        </button>
      </div>
      <div className="library-bottom-grid">
        <section className="panel">
          <SectionHeading
            eyebrow="CLASSIFICATION LAYER"
            title="Context changes the UI."
            detail="EcoMind detects domain, meter family, and reporting grain at ingestion."
          />
          <div className="classification-row">
            <div>
              <Building2 size={16} />
              <span>Buildings</span>
              <strong>{domainPct(domainCounts.building ?? 0)}</strong>
            </div>
            <div>
              <Factory size={16} />
              <span>Industry</span>
              <strong>{domainPct(domainCounts.industry ?? 0)}</strong>
            </div>
            <div>
              <Warehouse size={16} />
              <span>Logistics</span>
              <strong>{domainPct(domainCounts.logistics ?? 0)}</strong>
            </div>
          </div>
        </section>
        <section className="panel panel--source">
          <div className="source-icon">
            <Database size={17} />
          </div>
          <div>
            <span className="section-eyebrow">DATABASE / OBJECT STORE</span>
            <h3>{datasets.length} analyzed dataset{datasets.length === 1 ? "" : "s"}</h3>
            <p>
              All versions are immutable, searchable, and traceable to their original import.
            </p>
          </div>
          <button
            className="icon-button icon-button--small"
            type="button"
            aria-label="Open storage"
            onClick={() => {
              sound.play({ volume: 0.1, rate: 0.95 });
            }}
          >
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </div>
  );
}


/**
 * Schema understanding map. The recorded dataset sits on the left, every signal
 * family its columns actually produced sits on the right, and light travels
 * from the source into each family. Both sides are derived from the recorded
 * schema — this is a view of what the backend found, not a catalogue.
 */
/**
 * Chart axis annotation. Explains what a series measures, the unit it is
 * expressed in and where that unit came from, so a chart can be read without
 * documentation. Hover or focus for the full explanation.
 */
const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

/**
 * Renders the scoped briefing draft as structured sections instead of one
 * unbroken blob: each block becomes a heading plus label/value rows, so the
 * preview is readable and can be scanned section by section.
 */
function ReportDraftBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  return (
    <div className="report-preview__sections">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        const titled = lines.length > 1;
        const [heading, ...rest] = lines;
        return (
          <section className="report-preview__section" key={index}>
            {titled ? <h4>{heading}</h4> : null}
            {(titled ? rest : lines).map((line, lineIndex) => {
              const split = line.indexOf(": ");
              return (
                <div className="report-preview__line" key={lineIndex}>
                  {split > 0 ? (
                    <>
                      <span>{line.slice(0, split)}</span>
                      <strong>{line.slice(split + 2)}</strong>
                    </>
                  ) : (
                    <strong>{line}</strong>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}


function AxisNote({ quantity, unit, origin }: { quantity: string; unit?: string | null; origin: string }) {
  const shown = unit ? displayUnit(unit) : "";
  return (
    <span
      className="axis-note"
      tabIndex={0}
      aria-label={`${quantity}${shown ? ` in ${shown}` : ""}. ${origin}`}
    >
      <Info size={11} aria-hidden="true" />
      <span>
        {quantity}
        {shown ? ` / ${shown}` : ""}
      </span>
      <span className="axis-note__pop" role="tooltip">
        <strong>
          {quantity}
          {shown ? ` · ${shown}` : ""}
        </strong>
        <span>{origin}</span>
        {!shown ? <em>No unit was recorded for this series, so none is shown.</em> : null}
      </span>
    </span>
  );
}

function QualityView({
  dataset,
  filter,
  setFilter,
  filteredQuality,
  repaired,
  onRepair,
  saved,
  onSave,
  onToast,
}: {
  dataset: Dataset;
  filter: string;
  setFilter: (filter: string) => void;
  filteredQuality: typeof qualityIssues;
  repaired: boolean;
  onRepair: () => void;
  saved: boolean;
  onSave: () => void;
  onToast?: (message: string) => void;
}) {
  // Presentation moved into QualityLab. The repair engine, the filter that
  // feeds this view and the save flow are unchanged and still owned here.
  return (
    <QualityLab
      dataset={{
        id: dataset.id,
        name: dataset.name,
        domain: dataset.domain,
        type: dataset.type,
        detail: dataset.detail,
        rows: dataset.rows,
        freshness: dataset.freshness,
        health: dataset.health,
        location: dataset.location,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
      }}
      domainLabel={(domainMeta[dataset.domain] ?? domainMeta.building).label}
      issues={qualityIssues}
      filteredQuality={filteredQuality}
      filter={filter}
      setFilter={setFilter}
      repaired={repaired}
      saved={saved}
      onRepair={onRepair}
      onSave={onSave}
      quality={liveQualityMeta}
      schema={liveSchema ?? []}
      targetColumn={liveTargetColumn}
      activity={activityEvents}
      versions={liveBaselineVersions}
      onToast={onToast}
    />
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Transformation view.
 *
 * Everything here is recorded by the backend: the steps the transformation
 * stage actually ran (with before -> after evidence per column) and the adaptive
 * baseline record it produced (identity, statistics, learned hour-of-week
 * profile). The view re-runs nothing and offers no toggles - a stage is
 * executed from the pipeline rail, never from a chart.
 */
function TransformView({
  transform,
  baseline,
  dataset,
  baselineName,
  onOpenBaselinePreview,
}: {
  transform?: LiveTransform;
  baseline?: LiveBaseline;
  dataset: Dataset;
  baselineName: string;
  onOpenBaselinePreview?: () => void;
}) {
  // Presentation moved into TransformLab. The stage records, the baseline and
  // the preview callback are passed through untouched.
  const selected = modelData.find(m => m.selected) ?? null;
  return (
    <TransformLab
      dataset={{
        id: dataset.id,
        name: dataset.name,
        domain: dataset.domain,
        type: dataset.type,
        detail: dataset.detail,
        rows: dataset.rows,
        freshness: dataset.freshness,
        health: dataset.health,
        location: dataset.location,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
      }}
      domainLabel={(domainMeta[dataset.domain] ?? domainMeta.building).label}
      transform={transform}
      baseline={baseline}
      baselineName={baselineName}
      signal={energyData}
      schema={liveSchema ?? []}
      targetUnit={liveTargetUnit}
      unitLabel={displayUnit(baseline?.unit || liveTargetUnit)}
      model={selected ? { name: selected.name, r2: selected.r2, mae: selected.mae, rmse: selected.rmse } : null}
      weights={liveCompetition?.weights ?? []}
      versions={liveBaselineVersions}
      onOpenBaselinePreview={onOpenBaselinePreview}
    />
  );
}

function ModelsView({
  selectedModel,
  setSelectedModel,
  dataset,
}: {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  dataset: Dataset;
}) {
  // Presentation moved into ModelLab; the recorded competition and the
  // selection state are passed through unchanged.
  return (
    <ModelLab
      models={modelData}
      competition={liveCompetition}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
      signal={energyData}
      unit={displayUnit(liveTargetUnit)}
      target={liveCompetition?.target || liveTargetColumn}
      versions={liveBaselineVersions}
      datasetName={dataset.name}
      rowCount={dataset.rowCount ?? null}
    />
  );
}

const AnomalyTooltipContent = (props: TooltipProps<number, string>) => {
  // TooltipProps carries the active point in `payload` (an array of the
  // stacked series entries at the hovered x). We read the observed series
  // entry and cast it to LiveAnomalyPoint.
  const raw = props.payload;
  const record = Array.isArray(raw) ? raw[0] : undefined;
  const p = (record && typeof record === "object" && "observed_energy_kwh" in record)
    ? (record as unknown as LiveAnomalyPoint)
    : undefined;
  if (!p || !Number.isFinite(p.observed_energy_kwh)) return null;
  const severityColor: Record<string, string> = {
    critical: "#f07f6e",
    high: "#f5a56d",
    medium: "#e6ca78",
    low: "#79d6c4",
  };
  const sevColor = severityColor[p.severity] ?? "#e6ca78";
  const observed = p.observed_energy_kwh;
  const baseline = p.baseline_energy_kwh;
  const deviation = p.deviation_percent;
  const locationLabel =
    [p.building_name, p.floor_no, p.room_code, p.device_name]
      .filter(Boolean)
      .join(" / ") ||
    [p.building_code, p.floor_no, p.room_code, p.device_code]
      .filter(Boolean)
      .join(" / ") ||
    "estate not recorded";
  return (
    <div
      className="anomaly-tooltip"
      style={{
        background: "#15231b",
        border: "1px solid #30473a",
        borderRadius: 8,
        color: "#eff8f1",
        fontSize: 11,
        padding: "8px 10px",
        minWidth: 200,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          paddingBottom: 6,
          borderBottom: "1px solid #30473a",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: sevColor,
            display: "inline-block",
          }}
        />
        <span style={{ fontWeight: 600, color: "#eff8f1" }}>
          {p.severity ? p.severity.toUpperCase() : "NO ANOMALY"}
        </span>
        {p.anomaly_type ? (
          <span style={{ color: "#a9c7a0", marginLeft: 6 }}>{p.anomaly_type}</span>
        ) : null}
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>LOCATION</div>
        <div style={{ color: "#eff8f1" }}>{locationLabel}</div>
        {p.device_type ? (
          <div style={{ fontSize: 10, color: "#a9c7a0", marginTop: 1 }}>
            device type: {p.device_type}
          </div>
        ) : null}
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>ENERGY</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#b6f36b" }}>observed</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {observed != null ? `${observed.toFixed(1)} kWh` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#718b7b" }}>baseline</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {baseline != null ? `${baseline.toFixed(1)} kWh` : "—"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#f5a56d" }}>deviation</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {deviation != null ? `${deviation >= 0 ? "+" : ""}${deviation.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>
      {p.confidence != null ? (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>AI / DETECTION</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>confidence</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {p.confidence.toFixed(2)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>winning model</span>
            <span>
              {p.model_name || "—"}
              {p.model_version ? ` · v${p.model_version}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>baseline version</span>
            <span>{p.baseline_version != null ? `v${p.baseline_version}` : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>origin</span>
            <span>{p.origin || "—"}</span>
          </div>
        </div>
      ) : null}
      <div style={{ fontSize: 9, color: "#5d7765", marginTop: 6, paddingTop: 4, borderTop: "1px solid #30473a" }}>
        dataset {p.dataset_id} · {p.domain || "—"}
      </div>
    </div>
  );
};

function ForecastTooltipContent(props: TooltipProps<number, string>) {
  // TooltipProps carries the active point in `activeData` (the single
  // series entry at the hovered x). We read it as a LiveForecastPoint.
  const raw = props.payload;
  const p = (raw && Array.isArray(raw) && raw[0] && typeof raw[0] === "object" && "day" in raw[0])
    ? (raw[0] as unknown as LiveForecastPoint)
    : undefined;
  if (!p || !p.day) return null;

  const units = liveTargetUnit ? displayUnit(liveTargetUnit) : "kWh";
  const observed = p.observed_energy_kwh;
  const forecast = p.forecast_energy_kwh;
  const lower = p.lower_kwh;
  const upper = p.upper_kwh;
  const cost = p.expected_cost_inr;
  const co2 = p.expected_co2_kg;
  const future = p.is_future;
  const inPast = future === false;
  const inFuture = future === true;

  return (
    <div
      className="anomaly-tooltip"
      style={{
        background: "#15231b",
        border: "1px solid #30473a",
        borderRadius: 8,
        color: "#eff8f1",
        fontSize: 11,
        padding: "8px 10px",
        minWidth: 230,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
          paddingBottom: 6,
          borderBottom: "1px solid #30473a",
        }}
      >
        <span style={{ fontWeight: 600, color: "#eff8f1", fontSize: 12 }}>
          {p.day}
        </span>
        {inFuture ? (
          <span style={{ fontSize: 9, color: "#8d86ff", fontWeight: 600, letterSpacing: "0.04em" }}>
            FUTURE
          </span>
        ) : inPast ? (
          <span style={{ fontSize: 9, color: "#b6f36b", fontWeight: 600, letterSpacing: "0.04em" }}>
            OBSERVED
          </span>
        ) : (
          <span style={{ fontSize: 9, color: "#718b7b", fontWeight: 600, letterSpacing: "0.04em" }}>
            PROJECTED
          </span>
        )}
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>DATASET</div>
        <div style={{ color: "#eff8f1" }}>
          {p.day && (() => {
            // Keep this read-only; dataset context is recorded at chart load time
            // (dataset.name + domain) and does not need a second fetch.
            return null;
          })() || "—"}
        </div>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>ENERGY</div>
        {observed != null && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#b6f36b" }}>observed</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtCount(observed)}{units}
            </span>
          </div>
        )}
        {forecast != null && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#8d86ff" }}>forecast</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtCount(forecast)}{units}
            </span>
          </div>
        )}
        {(lower != null && upper != null) ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#718b7b" }}>confidence interval</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#8fa79a" }}>
              {fmtCount(Number(((upper - lower) / 2).toFixed(1)))} ± {units}
            </span>
          </div>
        ) : null}
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: "#8fa79a", marginBottom: 2 }}>EXPECTED</div>
        {cost != null ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>cost</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {displayUnit("INR")}{fmtCount(cost)}
            </span>
          </div>
        ) : null}
        {co2 != null ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>CO₂</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtCount(co2)} kgCO₂
            </span>
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 9, color: "#5d7765", marginTop: 6, paddingTop: 4, borderTop: "1px solid #30473a" }}>
        forecast · {p.day}
      </div>
    </div>
  );
}

function AnomaliesView({
  window,
  setWindow,
  onInspect,
  onInspectPoint,
  onClearPoint,
  selectedPoint,
  dataset,
  baselineName,
  windowOptions,
}: {
  window: string;
  setWindow: (value: string) => void;
  onInspect: (anomaly: (typeof anomalies)[number]) => void;
  onInspectPoint: (point: LiveAnomalyPoint) => void;
  onClearPoint: () => void;
  selectedPoint: LiveAnomalyPoint | null;
  dataset: Dataset;
  baselineName: string;
  windowOptions: LiveWindowOption[];
}) {
  // Presentation moved into AnomalyLab. Detection records, the window control
  // and both inspector callbacks are passed through unchanged.
  return (
    <AnomalyLab
      window={window}
      setWindow={setWindow}
      windowOptions={windowOptions}
      points={anomalyData}
      anomalies={anomalies}
      meta={liveAnomalyMeta}
      pinned={selectedPoint}
      onInspectPoint={onInspectPoint}
      onClearPoint={onClearPoint}
      onInspect={onInspect}
      datasetName={dataset.name}
      datasetId={dataset.id}
      domainLabel={(domainMeta[dataset.domain] ?? domainMeta.building).label}
      baselineName={baselineName}
      unit={liveTargetUnit ? displayUnit(liveTargetUnit) : ""}
    />
  );
}



