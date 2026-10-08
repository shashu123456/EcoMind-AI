import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Building2,
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
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import "./AppShell.css";
import { useSound, playCompletionChime, playStartTone, unlockAudio } from "@/lib/useSound";
import { auth, datasets as datasetsApi, domain, getToken, workflow, type AuthUser } from "@/lib/api";
import { displayUnit, unitForColumn } from "@/lib/units";
import { FAMILY_LABEL, ROLE_LABEL, ROLE_NOTE, ROLE_ORDER, familyForColumn, roleForColumn, type FieldFamily, type FieldRole } from "@/lib/schema";
import {
  loadWorkspace, runPipeline, STAGE_KEYS,
  type LiveWorkspace, type LiveDataset, type LiveIssue, type LiveModel, type LivePoint,
  type LiveAnomalyPoint, type LiveAnomaly, type LiveForecastPoint, type LiveRec, type LiveActivity,
  type LiveStage, type LiveCompetition, type LiveQualityMeta, type LiveAnomalyMeta,
  type LiveTransform, type LiveBaseline, type LiveBaselineCell, type BackendDomain,
  type LiveWindowOption, deriveWindowOptions,
  type LiveForecastMeta, type LiveRecMeta, type LiveRun, type LiveSchemaField, type LiveBaselineVersion,
} from "@/lib/workspace";
import { Snowflake, Thermometer, Waves, ArrowUpDown, Cog } from "lucide-react";

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

function TinyTag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
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
    if (kind === "scan") sound.play({ volume: 0.14, rate: 0.9 });
    else if (kind === "done") sound.play({ volume: 0.2, rate: 1.05 });
    else if (kind === "alert") sound.play({ volume: 0.22, rate: 1.2 });
    else sound.play({ volume: 0.12, rate: 0.95 });
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
        </div>
        <div className="signin-chips">
          <span className="signin-chip">
            <Network size={13} />
            10-stage pipeline
          </span>
          <span className="signin-chip">
            <DatabaseZap size={13} />
            Raw data immutable
          </span>
          <span className="signin-chip">
            <BarChart3 size={13} />
            Score-ranked models
          </span>
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
  const [anomalyWindow, setAnomalyWindow] = useState("24H");
  const [forecastWindow, setForecastWindow] = useState("7 days");
  const [reportDraft, setReportDraft] = useState<string | null>(null);
  const [reportExported, setReportExported] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<(typeof anomalies)[number] | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(true);
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
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const attentionQueue = [...anomalies]
    .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))
    .slice(0, 3);
  const attentionCount =
    (liveAnomalyMeta?.severity?.critical ?? 0) + (liveAnomalyMeta?.severity?.high ?? 0);
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

  useEffect(() => {
    if (!signedIn && getToken()) setSignedIn(true);
  }, [signedIn]);

  // The real signed-in identity, straight from GET /auth/me. The topbar and the
  // profile popover show this instead of a hardcoded name.
  useEffect(() => {
    if (!signedIn) {
      setCurrentUser(null);
      return;
    }
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
  }, [signedIn]);

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
      liveAnomalyMeta = loaded.anomalyMeta ?? null;
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
    if (!signedIn) return;
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
  }, [signedIn, reloadKey]);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
              goTo("schema");
              setToast(`${dataset.name} is now the active dataset — showing what was discovered.`);
            }}
            onImport={() => goTo("import")}
            onPreview={dataset => void openPreview(dataset)}
          />
        );
      case "import":
        return (
          <ImportView
            scanRunning={scanRunning}
            scanStage={scanStage}
            fileName={uploadedFileName}
            activeDataset={activeDataset}
            uploadDomain={uploadDomain}
            onDomainChange={setUploadDomain}
            onScan={handleScan}
            onContinue={() => goTo("schema")}
            onUploaded={handleUploaded}
            onSelectDomain={domain => {
              setUploadDomain(domain);
              setToast(`Previewing ${domainMeta[domain].label} ingestion.`);
              sound.play({ volume: 0.1, rate: 0.9 });
            }}
          />
        );
      case "schema":
        return <SchemaView dataset={activeDataset} />;
      case "quality":
        return (
          <QualityView
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
          />
        );
      case "models":
        return <ModelsView selectedModel={selectedModel} setSelectedModel={setSelectedModel} />;
      case "anomalies":
        return (
          <AnomaliesView
            windowOptions={windowOptions}
            window={anomalyWindow}
            setWindow={setAnomalyWindow}
            onInspect={setSelectedAnomaly}
            dataset={activeDataset}
            baselineName={baselineName}
          />
        );
      case "prediction":
        return (
          <PredictionView
            windowOptions={windowOptions}
            window={forecastWindow}
            setWindow={setForecastWindow}
            onViewData={() => goTo("transform")}
            dataset={activeDataset}
            baselineName={baselineName}
            modelName={modelName}
          />
        );
      case "recommendations":
        return <RecommendationsView dataset={activeDataset} baselineName={baselineName} />;
      case "reports":
        return (
          <ReportsView
            exported={reportExported}
            draft={reportDraft}
            onCloseDraft={() => setReportDraft(null)}
            onDraft={() => {
              const totalAnoms = liveAnomalyMeta?.total ?? anomalies.length;
              const pri = (liveAnomalyMeta?.severity?.critical ?? 0) + (liveAnomalyMeta?.severity?.high ?? 0);
              const fcTotal = forecastData.reduce((sum, d) => sum + d.forecast, 0);
              const recCount = liveRecMeta?.total ?? recommendations.length;
              const savings = liveRecMeta?.savingsInr ?? 0;
              setReportDraft(
                `EcoMind AI — ${activeDataset.name}\n\nProject summary\nDataset: ${activeDataset.name} / ${activeDataset.id}\nDomain: ${domainInfo.label}\nRows: ${activeDataset.rows} · Fields: ${activeDataset.fieldCount ?? "—"}\nPipeline run: ${workspace?.runId ?? "—"}\n\nModel competition\nWinner: ${modelName}\n${liveCompetition ? `Target: ${liveCompetition.target} · Features: ${liveCompetition.features} · Train/test: ${liveCompetition.trainRows}/${liveCompetition.testRows}\n${liveCompetition.rationale}\n` : ""}Baseline\n${baselineName} · DQ score ${liveQualityMeta?.score ?? "—"} / 100\n\nAnalytics\nForecast next 7 days: ${withUnit(Math.round(fcTotal).toLocaleString("en-IN"))}\nModel MAPE backtest: ${liveForecastMeta?.mapeLabel ?? "—"}\n\nAnomalies\n${totalAnoms} detected; ${pri} critical/high priority\n\nRecommendations\n${recCount} ranked actions · est. savings ${displayUnit("INR")}${Math.round(savings).toLocaleString("en-IN")}/mo\n`
              );
              sound.play({ volume: 0.16, rate: 1.0 });
            }}
            onExport={() => void exportReportPdf()}
            dataset={activeDataset}
            domainInfo={domainInfo}
            baselineName={baselineName}
            modelName={modelName}
          />
        );
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
            <strong>{activeDataset.name}</strong>
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
                <TinyTag tone={attentionCount ? "coral" : "neutral"}>
                  {attentionCount ? `${attentionCount} critical / high` : "no alerts"}
                </TinyTag>
              </div>
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

            </div>
          ) : null}
        </div>
      </header>
      <main className="app-main" id="main-content">
        <div className="context-strip">
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
          {/* Present on every page: a demonstration should never have to hunt
              for the run controls, and they must never be dead. */}
          <div className="pipeline-quick">
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
              <span className="mono-note">{baselineName} / {domainInfo.label}</span>
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
        baselineName={baselineName}
        onClose={() => setSelectedAnomaly(null)}
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
  const rowCount = Math.min(activityEvents.length, 4);
  const activeRow = rowCount ? cursor % rowCount : -1;
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
          <TinyTag tone={paused ? "neutral" : "lime"}>
            {paused ? "PAUSED" : "STREAMING"}
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
          {activityEvents.length ? (
            activityEvents.slice(0, 4).map((event, index) => (
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
                <span>{event.result}</span>
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
  baselineName,
  onClose,
  onOpenChart,
}: {
  anomaly: (typeof anomalies)[number] | null;
  baselineName: string;
  onClose: () => void;
  onOpenChart: (anomaly: (typeof anomalies)[number]) => void;
}) {
  const sound = useSound({ onPlay: () => {} });
  return (
    <aside className={`inspector-drawer ${anomaly ? "inspector-drawer--open" : ""}`} aria-label="Inspector panel">
      <div className="inspector-drawer__head">
        <div>
          <span className="section-eyebrow">EVIDENCE INSPECTOR</span>
          <h2>{anomaly ? anomaly.id : "Select an evidence item"}</h2>
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
      {anomaly ? (
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
                OBSERVED VS BASELINE / {energyData.length} RECORDED POINT
                {energyData.length === 1 ? "" : "S"}
              </span>
              <strong>{energyData.length ? withUnit(fmtCount(energyTotal)) : "—"} <em>{energyDelta}</em></strong>
            </div>
            <div className="mini-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={energyData}>
                  <defs>
                    <linearGradient id="miniFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b6f36b" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#b6f36b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="energy"
                    stroke="#b6f36b"
                    strokeWidth={2}
                    fill="url(#miniFill)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="#5d7765"
                    strokeDasharray="3 4"
                    strokeWidth={1}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="axis-note mini-chart-note">
              {energyData.length
                ? `Solid: the measured ${liveTargetColumn || "target"} recorded for this dataset. Dashed: the adaptive baseline the pipeline learned from the same rows.`
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
          <input placeholder="Search dataset library" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="toolbar-actions">
          <button
            className="filter-button"
            type="button"
            onClick={() => {
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
          >
<Filter size={14} />{" "}
            Filter <span>{datasets.length}</span>
          </button>
          <ActionButton icon={Plus} onClick={onImport}>
            Import dataset
          </ActionButton>
        </div>
      </div>
      <div className="library-grid">
        {datasets.map(dataset => {
          const Icon = dataset.icon;
          const active = activeDataset.id === dataset.id;
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
                  <strong>{dataset.health}</strong>
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
            </div>
            </div>
          );
        })}
        {!datasets.length ? (
          <p className="mono-note library-empty">
            No datasets available. Import your first dataset to begin the ten-stage pipeline.
          </p>
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

function ImportView({
  scanRunning,
  scanStage,
  fileName,
  uploadDomain,
  onDomainChange,
  onScan,
  onContinue,
  onSelectDomain,
  onUploaded,
  activeDataset,
}: {
  scanRunning: boolean;
  scanStage: number;
  fileName: string;
  uploadDomain: DatasetDomain;
  onDomainChange: (domain: DatasetDomain) => void;
  onScan: (fileName?: string, domain?: DatasetDomain) => void;
  onContinue: () => void;
  onSelectDomain: (domain: DatasetDomain) => void;
  onUploaded: (datasetId: string) => void;
  activeDataset: Dataset;
}) {
  const [selectedFile, setSelectedFile] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [hoveredDomain, setHoveredDomain] = useState<DatasetDomain | null>(null);
  const activeFile = selectedFile || fileName;
  const sound = useSound({ onPlay: () => {} });
  const currentDomain = hoveredDomain ?? uploadDomain;
  const domain = domainMeta[currentDomain] ?? domainMeta.building;
  // Every supported domain, each with the hierarchy EcoMind looks for and the
  // sampling cadence that domain's telemetry normally carries.
  const domains: { id: DatasetDomain; label: string; icon: LucideIcon; accent: string }[] = [
    { id: "building", label: "Buildings", icon: Building2, accent: "lime" },
    { id: "industry", label: "Industry", icon: Factory, accent: "orange" },
    { id: "logistics", label: "Logistics", icon: Warehouse, accent: "violet" },
    { id: "hospital", label: "Hospital", icon: HeartPulse, accent: "coral" },
    { id: "campus", label: "Campus", icon: GraduationCap, accent: "blue" },
    { id: "mall", label: "Shopping mall", icon: ShoppingBag, accent: "yellow" },
    { id: "office", label: "Office complex", icon: Briefcase, accent: "lime" },
    { id: "datacentre", label: "Data centre", icon: Server, accent: "violet" },
    { id: "plant", label: "Generation plant", icon: Zap, accent: "orange" },
    { id: "transport", label: "Transport hub", icon: Plane, accent: "blue" },
    { id: "telecom", label: "Telecom site", icon: RadioTower, accent: "violet" },
    { id: "water", label: "Water utility", icon: Droplets, accent: "blue" },
  ];
  // Two different facts live on this page and used to be reported as one: a
  // file chosen *now*, and the dataset the workspace already holds. Merging
  // them is why the panel could announce "upload accepted" with nothing
  // uploaded. Each line below names which of the two it is describing.
  const detectedDomain = domainMeta[activeDataset.domain] ?? domainMeta.building;
  const hasFile = Boolean(selectedFile);
  const hasDataset = Boolean(activeDataset.id);
  const scanSteps = [
    {
      title: hasFile ? "File chosen this session" : hasDataset ? "Active dataset" : "Source",
      detail: hasFile
        ? activeFile
        : hasDataset
          ? activeDataset.name
          : "No file chosen yet — drop one on the left",
      icon: CloudUpload,
    },
    {
      title: "Data surface",
      detail: activeDataset.rowCount
        ? `${activeDataset.rows} rows · ${activeDataset.columnCount ?? "—"} columns recorded`
        : "Nothing recorded yet",
      icon: Activity,
    },
    {
      title: "Detected domain",
      detail: hasDataset ? `${detectedDomain.label} · classified by the backend` : "No dataset to classify",
      icon: WandSparkles,
    },
    {
      title: "Next step",
      detail: hasDataset ? "Schema discovery is available" : "Choose a file to begin",
      icon: CheckCircle2,
    },
  ];
  const scannable = hasFile && scanStage > 0;
  const selectFile = async (file?: File) => {
    if (!file) return;
    setSelectedFile(file.name);
    setUploadError("");
    setUploading(true);
    try {
      const created = await datasetsApi.upload(file, file.name);
      sound.play({ volume: 0.18, rate: 1.0 });
      onScan(file.name, currentDomain);
      onUploaded(created.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed — check that the backend is running.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="view-content">
      <div className="import-layout">
        <section
          className="import-dropzone"
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            void selectFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="import-dropzone__top">
            <span className="section-eyebrow">STEP 01 / INGESTION</span>
            <TinyTag tone="blue">SECURE BY DEFAULT</TinyTag>
          </div>
          <div className="import-dropzone__visual">
            <div className="upload-orb">
              <UploadCloud size={30} />
              <span />
            </div>
            <div className="upload-rays" />
          </div>
          <h2>Drop a dataset into the intelligence layer.</h2>
          <p>
            EcoMind will identify the domain, discover the schema, and preserve the source version before any
            transformation begins.
          </p>
          <input
            className="file-input"
            id="ecomind-file-upload"
            type="file"
            accept=".csv,.xlsx"
            onChange={event => void selectFile(event.currentTarget.files?.[0])}
          />
          <label className="dropzone-button" htmlFor="ecomind-file-upload">
            <UploadCloud size={17} />
            {uploading ? "Uploading dataset..." : "Choose a dataset"}
          </label>
          <span className="dropzone-note">
            CSV · Excel <span>or drag and drop</span>
          </span>
          {uploadError ? <p className="signin-error dropzone-error">{uploadError}</p> : null}
          <div className="dropzone-footer">
            <span>
              <ShieldCheck size={13} />
              {" "}
              encrypted in transit
            </span>
            <span>
              <Database size={13} />
              {" "}
              versioned storage
            </span>
            <span>
              <Eye size={13} />
              {" "}
              inspectable run
            </span>
          </div>
        </section>
        <section className="import-status-panel">
          <div className="status-panel__head">
            <div>
              <div className="section-eyebrow">INGESTION STATE</div>
              <h2>
                {scanRunning
                  ? "Reading the signal…"
                  : scannable
                    ? "File ingested."
                    : hasDataset
                      ? "Active dataset loaded."
                      : "Nothing selected yet."}
              </h2>
            </div>
            <span
              className={`status-badge ${scanRunning ? "status-badge--processing" : scannable ? "status-badge--done" : ""}`}
            >
              <span className="status-dot status-dot--lime" />
              {scanRunning ? "PROCESSING" : scannable ? "COMPLETE" : hasDataset ? "ACTIVE" : "STANDBY"}
            </span>
          </div>
          <div className="scan-progress">
            <div className="scan-progress__track">
              <i style={{ width: `${scanStage === 3 ? 100 : Math.round((scanStage / 3) * 100)}%` }} />
            </div>
            <span>
              <strong>
                {scanStage === 3 ? "100" : Math.round((scanStage / 3) * 100)}
              </strong>{" "}
              preflight complete
            </span>
          </div>
          <div className="scan-steps">
            {scanSteps.map((step, index) => {
              const Icon = step.icon;
              const done = scanStage > index || (scanStage === 3 && index === 3);
              const current = scanRunning && scanStage === index;
              return (
                <div
                  className={`scan-step ${done ? "scan-step--done" : ""} ${current ? "scan-step--current" : ""}`}
                  key={step.title}
                >
                  <span className="scan-step__icon">
                    {done ? <Check size={14} /> : <Icon size={14} />}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <span className="scan-step__state">
                    {done ? "DONE" : current ? "LIVE" : "QUEUED"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="classification-preview">
            <div className="classification-preview__visual">
              <domain.icon size={26} />
              <span>{domain.label.toUpperCase().slice(0, 9)}</span>
            </div>
            <div>
              <span className="section-eyebrow">AI CLASSIFICATION</span>
              <h3>{domain.label}</h3>
              <p>
                {domain.sub}{" "}
                <span>· {domain.matchStrength}</span>
              </p>
            </div>
          </div>
          {hasDataset || scannable ? (
            <ActionButton icon={ArrowRight} onClick={onContinue}>
              Continue to schema discovery
            </ActionButton>
          ) : (
            <button
              className="scan-demo-button"
              type="button"
              onClick={() => onScan(activeFile, currentDomain)}
              disabled={scanRunning}
            >
              {scanRunning ? "Reading the file…" : "Run preflight"}
              <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
      <div className="import-domain-picker">
        <span className="section-eyebrow">DOMAIN DETECTION</span>
        <h2>What kind of energy system is this?</h2>
        <p>
          EcoMind classifies a dataset from its own name, hierarchy codes and sampling cadence — nothing is
          chosen for you. The highlighted card is the domain recorded for{" "}
          <strong>{activeDataset.name}</strong>. Selecting a different card only overrides the classification
          of the next file you upload.
        </p>
        <div className="domain-selector">
          {domains.map(entry => {
            const DomainIcon = entry.icon;
            const detected = activeDataset.domain === entry.id;
            const override = uploadDomain === entry.id && !detected;
            const active = detected || override;
            const hover = hoveredDomain === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                className={`domain-card ${active ? "domain-card--active" : ""} ${hover ? "domain-card--hover" : ""}`}
                onMouseEnter={() => {
                  setHoveredDomain(entry.id);
                  sound.play({ volume: 0.08, rate: 0.9 });
                }}
                onMouseLeave={() => setHoveredDomain(null)}
                onClick={() => {
                  onSelectDomain(entry.id);
                  onDomainChange(entry.id);
                  setHoveredDomain(null);
                  sound.play({ volume: 0.12, rate: 1.0 });
                }}
              >
                <div className={`domain-card__icon domain-card__icon--${entry.accent}`}>
                  <DomainIcon size={20} />
                </div>
                <strong>{entry.label}</strong>
                <span>{domainMeta[entry.id].scene}</span>
                <span className="domain-card__foot">
                  <span className={`domain-card__badge domain-card__badge--${entry.accent}`}>
                    {detected ? "detected" : domainMeta[entry.id].anchor}
                  </span>
                  <span className="mono-note">{domainMeta[entry.id].cadence}</span>
                </span>
                {override ? <span className="domain-card__override">override · next upload</span> : null}
              </button>
            );
          })}
        </div>
        <div className="import-note-row">
          <div>
            <Info size={15} />
            <span>
              EcoMind never replaces an original dataset. Every repair and transformation creates a new
              immutable version.
            </span>
          </div>
          <span className="mono-note">IMPORT PROTOCOL / 04</span>
        </div>
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

function SchemaFlowMap({
  dataset,
  families,
  roleCounts,
}: {
  dataset: Dataset;
  families: { family: FieldFamily; units: string[]; count: number }[];
  roleCounts: Record<FieldRole, number>;
}) {
  const rows = families.length;
  return (
    <div className="schema-flow">
      <div className="schema-flow__source">
        <span className="schema-flow__source-icon">
          <Database size={19} />
        </span>
        <strong>{dataset.name}</strong>
        <span className="mono-note">
          {dataset.rows} rows · {dataset.columnCount ?? "—"} columns
        </span>
        <span className="schema-flow__source-status">
          <span className="status-dot status-dot--lime" />
          schema recorded
        </span>
      </div>
      <div className="schema-flow__rows">
        {!rows ? <p className="mono-note table-empty-note">No columns recorded yet.</p> : null}
        {families.map((node, index) => {
          const Icon = fieldIconFor(node.family);
          const units = node.units.filter(Boolean);
          return (
            <div className="schema-flow-row" key={node.family}>
              <span className="schema-flow-row__track" aria-hidden="true">
                <span className="flow-packet" style={{ animationDelay: `${(index * 0.32).toFixed(2)}s` }} />
              </span>
              <div
                className="schema-flow-chip"
                style={{ animationDelay: `${(index * 0.08).toFixed(2)}s` }}
              >
                <span className="schema-flow-chip__icon">
                  <Icon size={16} />
                </span>
                <div className="schema-flow-chip__copy">
                  <strong>{FAMILY_LABEL[node.family]}</strong>
                  <span className="mono-note">
                    {node.count} field{node.count === 1 ? "" : "s"}
                    {units.length ? ` · ${units.join(", ")}` : ""}
                  </span>
                </div>
                <span className="schema-flow-chip__pulse" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="schema-flow__roles">
        {ROLE_ORDER.filter(role => roleCounts[role] > 0).map(role => (
          <span className={`schema-role schema-role--${role}`} key={role}>
            <i aria-hidden="true" />
            <strong>{ROLE_LABEL[role]}</strong>
            <span className="mono-note">{roleCounts[role]}</span>
            {ROLE_NOTE[role]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SchemaView({ dataset }: { dataset: Dataset }) {
  const iconForRole = (role: FieldRole): LucideIcon =>
    role === "index"
      ? CalendarClock
      : role === "target"
        ? Leaf
        : role === "entity"
          ? Building2
          : role === "context"
            ? UserRound
            : Zap;
  // Every field, role, family and unit below is derived from the columns the
  // backend actually recorded for this dataset.
  const fields = (liveSchema ?? [])
    .map(f => {
      const role = roleForColumn(f.name, f.role);
      return {
        name: f.name,
        type: f.dtype,
        unit: unitForColumn(f.name),
        family: familyForColumn(f.name),
        role,
        icon: iconForRole(role),
      };
    })
    // Stable sort: index/entity/context/target first, backend order preserved inside a role.
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const roleCount = (role: FieldRole) => fields.filter(f => f.role === role).length;
  const roleCounts = ROLE_ORDER.reduce<Record<FieldRole, number>>(
    (acc, role) => {
      acc[role] = roleCount(role);
      return acc;
    },
    { index: 0, entity: 0, context: 0, target: 0, signal: 0 }
  );
  const summaryField = fields.find(f => f.name === liveTargetColumn) ?? fields.find(f => f.role === "target") ?? null;
  const targetFamily = summaryField ? summaryField.family : null;
  const families = (() => {
    const map = new Map<FieldFamily, { family: FieldFamily; units: Set<string>; count: number }>();
    fields.forEach(f => {
      const entry = map.get(f.family) ?? { family: f.family, units: new Set<string>(), count: 0 };
      if (f.unit) entry.units.add(f.unit);
      entry.count += 1;
      map.set(f.family, entry);
    });
    const all = [...map.values()].sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
    // Lead with the family the model actually modelled, then everything else.
    const ordered = targetFamily ? all.filter(f => f.family === targetFamily).concat(all.filter(f => f.family !== targetFamily)) : all;
    return ordered.slice(0, 6);
  })();
  const domainInfo = domainMeta[dataset.domain] ?? domainMeta.building;
  const domainSignalCount = fields.filter(f => f.role === "signal" || f.role === "target").length;
  const sound = useSound({ onPlay: () => {} });
  const indexField = fields.find(f => f.role === "index");
  const firstEntity = fields.find(f => f.role === "entity");
  const operations = [
    { label: "Store", detail: `${dataset.rows} rows ingested as v1`, icon: HardDrive, state: "complete" },
    { label: "Load", detail: `${dataset.rows} rows / ${dataset.columnCount ?? "—"} cols`, icon: Database, state: "complete" },
    {
      label: "Index",
      detail: indexField ? `${indexField.name}${firstEntity ? ` + ${firstEntity.name}` : ""}` : "no index field detected yet",
      icon: DatabaseZap,
      state: indexField ? "complete" : "pending",
    },
    {
      label: "Retrieve",
      detail: fields.length ? `${fields.length} fields served to the pipeline` : "waiting for a schema",
      icon: Eye,
      state: fields.length ? "live" : "pending",
    },
  ];
  return (
    <div className="view-content">
      <div className="schema-summary-row">
        <div className="schema-summary-card">
          <span className="section-eyebrow">AI UNDERSTANDING</span>
          <strong>{liveSchema ? `${liveSchema.length} fields` : "—"}</strong>
          <span>{liveSchema ? `${new Set(liveSchema.map(f => f.role)).size} roles detected` : "no schema recorded yet"}</span>
        </div>
        <div className="schema-summary-card">
          <span className="section-eyebrow">TEMPORAL GRAIN</span>
          <strong>{dataset.rowCount ? `${fmtCount(dataset.rowCount)} rows` : "—"}</strong>
          <span>{dataset.columnCount ? `${dataset.columnCount} columns detected` : "no dataset loaded"}</span>
        </div>          <div className="schema-summary-card">
            <span className="section-eyebrow">PRIMARY TARGET</span>
            <strong>{summaryField ? summaryField.name : "—"}</strong>
            <span>
              {summaryField
                ? `${displayUnit(summaryField.unit) || summaryField.type} · ${summaryField.role}`
                : "no target recorded yet"}
            </span>
          </div>
        <div className="schema-summary-card">
          <span className="section-eyebrow">DOMAIN FIT</span>
          <strong>{domainInfo.label}</strong>
          <span>{domainInfo.matchStrength} · {domainInfo.anchor}</span>
        </div>
      </div>
      <div className="schema-layout">
        <section className="panel schema-fields-panel">
          <SectionHeading
            eyebrow="GENERATED SCHEMA"
            title="Fields mapped by role"
            detail="AI inferred type, role, and quality risk from surrounding context."
            action={
              <button
                className="icon-button icon-button--small"
                type="button"
                aria-label="Schema settings"
                onClick={() => sound.play({ volume: 0.08, rate: 0.9 })}
              >
                <SlidersHorizontal size={14} />
              </button>
            }
          />
          <div className="schema-fields">
            {!fields.length ? (
              <p className="mono-note table-empty-note">No schema recorded yet for this dataset.</p>
            ) : null}
            {fields.map(field => {
              const Icon = field.icon;
              return (
                <div className="schema-field" key={field.name}>
                  <span className="schema-field__icon">
                    <Icon size={15} />
                  </span>
                  <div>
                    <strong>{field.name}</strong>
                    <span>
                      {field.type}
                      {field.unit ? ` · ${displayUnit(field.unit)}` : ""} · {field.role}
                    </span>
                  </div>
                  <span className={`field-role field-role--${field.role}`}>{field.role}</span>
                  <ChevronRight size={14} />
                </div>
              );
            })}
          </div>
          <div className="schema-field-family-strip">
            <span className="section-eyebrow">SIGNAL FAMILIES</span>
            <h3>Families detected in {dataset.name}</h3>
            <div className="family-mesh">
              {!families.length ? (
                <p className="mono-note table-empty-note">No signal families until a schema is recorded.</p>
              ) : null}
              {families.map(node => {
                const Icon = fieldIconFor(node.family);
                const units = [...node.units].map(displayUnit).filter(Boolean);
                return (
                  <div className="family-node" key={node.family}>
                    <span className="family-node__icon">
                      <Icon size={14} />
                    </span>
                    <span>{FAMILY_LABEL[node.family]}</span>
                    <span className="mono-note">
                      {node.count} field{node.count === 1 ? "" : "s"}
                      {units.length ? ` · ${units.join(", ")}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel-link panel-link--bottom">
            {liveSchema?.length ?? 0} fields recorded for this dataset
          </div>
        </section>
        <section className="panel relationship-panel">
          <SectionHeading
            eyebrow="SCHEMA UNDERSTANDING"
            title="How EcoMind reads this dataset"
            detail="Every family below is a group of columns the backend actually recorded. Light travels from the dataset into each one it understands."
          />
          <SchemaFlowMap
            dataset={dataset}
            families={families.map(node => ({
              family: node.family,
              count: node.count,
              units: [...node.units].map(displayUnit).filter(Boolean),
            }))}
            roleCounts={roleCounts}
          />
        </section>
      </div>
      <section className="panel operations-panel">
        <div className="operations-panel__header">
          <div>
            <div className="section-eyebrow">DATABASE OPERATIONS</div>
            <h2>From object store to query plan.</h2>
          </div>
          <TinyTag tone="lime">TRACEABLE</TinyTag>
        </div>
        <div className="operations-timeline">
          {operations.map((operation, index) => {
            const Icon = operation.icon;
            return (
              <div className="db-operation" key={operation.label}>
                <div className={`db-operation__icon db-operation__icon--${operation.state}`}>
                  <Icon size={15} />
                </div>
                <div>
                  <span className="mono-note">0{index + 1}</span>
                  <strong>{operation.label}</strong>
                  <p>{operation.detail}</p>
                </div>
                {index < operations.length - 1 ? <span className="db-operation__connector" /> : null}
              </div>
            );
          })}
        </div>
        <div className="operations-panel__foot">
          <span>
            <Database size={13} />{" "}
            {dataset.name} · import v1
          </span>
          <span className="mono-note">{liveBaselineVersions.length ? `v${liveBaselineVersions[0].version} / immutable` : "immutable"}</span>
        </div>
      </section>
    </div>
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
}: {
  dataset: Dataset;
  filter: string;
  setFilter: (filter: string) => void;
  filteredQuality: typeof qualityIssues;
  repaired: boolean;
  onRepair: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const filters = ["All issues", "Null value", "Missing timestamp", "Duplicate", "Datatype mismatch", "Invalid value"];
  const sound = useSound({ onPlay: () => {} });
  const totalIssues = qualityIssues.length;
  const typeCounts = qualityIssues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.type] = (acc[issue.type] ?? 0) + 1;
    return acc;
  }, {});
  const avgConfidence = qualityIssues.length
    ? qualityIssues.reduce((sum, issue) => sum + (parseFloat(issue.confidence) || 0), 0) / qualityIssues.length
    : 0;
  const qScore = liveQualityMeta?.score ?? null;
  return (
    <div className="view-content">
      <div className="quality-topline">
        <div className="quality-kpis">
          <Metric
            label="ISSUES"
            value={String(totalIssues)}
            delta={`${Object.keys(typeCounts).length} types flagged`}
            accent="coral"
          />
          <Metric
            label="REPAIRS"
            value={repaired ? String(totalIssues) : "0"}
            delta={repaired ? "ready to save" : "pending"}
            direction="up"
            accent="lime"
          />
          <Metric
            label="DQ SCORE"
            value={qScore != null ? `${qScore} / 100` : "—"}
            delta="structural rules only"
            direction="down"
            accent="blue"
          />
        </div>
        <div className="quality-actions">
          <ActionButton variant="secondary" icon={RefreshCw} onClick={() => sound.play({ volume: 0.08, rate: 0.9 })}>
            Rescan issues
          </ActionButton>
          <ActionButton icon={ShieldCheck} onClick={onRepair}>
            {repaired ? "Repairs applied" : "Apply repairs"}
          </ActionButton>
        </div>
      </div>
      {/* The overall run comes first; filtering is a drill-down on top of it. */}
      <section className="panel quality-process">
        <SectionHeading
          eyebrow="QUALITY PROCESS / STAGE 04"
          title="What the structural check evaluated"
          detail="Missing values, timestamps, duplicates, data types, units, schema shape and invalid categoricals. Outliers and abnormal behaviour are deliberately excluded — the anomaly stage owns those."
        />
        <div className="quality-process__grid">
          <div className="quality-process__rules">
            <span className="section-eyebrow">RULE OUTCOMES</span>
            {Object.entries(typeCounts).length ? (
              Object.entries(typeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div className="quality-rule" key={type}>
                    <span className="quality-rule__dot quality-rule__dot--flag" />
                    <span className="quality-rule__label">{type}</span>
                    <span className="mono-note">{count} flagged</span>
                  </div>
                ))
            ) : (
              <p className="mono-note table-empty-note">
                Every structural rule passed on this dataset — nothing was repaired.
              </p>
            )}
          </div>
          <div className="quality-process__meter">
            <span className="section-eyebrow">DATA QUALITY SCORE</span>
            <strong>{qScore != null ? `${qScore} / 100` : "—"}</strong>
            <span
              className="quality-meter"
              role="img"
              aria-label={qScore != null ? `Data quality score ${qScore} of 100` : "No quality score recorded"}
            >
              <span className="quality-meter__fill" style={{ width: `${qScore ?? 0}%` }} />
            </span>
            <span className="mono-note">
              {totalIssues} flagged rows · {Object.keys(typeCounts).length} rule types ·{" "}
              {avgConfidence ? `average confidence ${avgConfidence.toFixed(1)}%` : "no confidences recorded"}
            </span>
            <span className="mono-note">
              {repaired ? "Repairs applied and versioned" : "Source preserved — no repair written yet"}
            </span>
          </div>
        </div>
      </section>
      <div className="quality-filters">
        <span className="section-eyebrow">FILTER BY ISSUE TYPE</span>
        {filters.map(item => (
          <button
            type="button"
            className={`quality-filter ${filter === item ? "quality-filter--active" : ""}`}
            onClick={() => {
              setFilter(item);
              sound.play({ volume: 0.08, rate: 0.9 });
            }}
            key={item}
          >
            {item}
            {item !== "All issues" ? (
              <span>
                {typeCounts[item] ?? 0}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="quality-three-panel">
        <section className="quality-panel">
          <div className="quality-panel__head">
            <div>
              <span className="panel-step">01</span>
              <div>
                <div className="section-eyebrow">SOURCE SNAPSHOT</div>
                <h2>Raw issue rows</h2>
              </div>
            </div>
            <TinyTag tone="coral">{repaired ? "RESOLVED" : "BEFORE"}</TinyTag>
          </div>
          <div className="quality-table">
            {!filteredQuality.length ? (
              <p className="mono-note table-empty-note">No structural quality issues recorded for this dataset.</p>
            ) : null}
            {filteredQuality.map(issue => (
              <div className="quality-row" key={issue.id}>
                <span className="quality-row__id">{issue.id}</span>
                <div>
                  <strong>{issue.field}</strong>
                  <span>row {issue.row}</span>
                </div>
                <code>{issue.raw}</code>
                <TinyTag tone="coral">{issue.type}</TinyTag>
              </div>
            ))}
          </div>
          <div className="quality-panel__footer">
            <span>
              <AlertTriangle size={13} />{" "}
              showing {filteredQuality.length} of {totalIssues} flagged rows
            </span>
            <button
              type="button"
              onClick={() => sound.play({ volume: 0.08, rate: 0.9 })}
            >
              <Eye size={13} />{" "}
              inspect raw
            </button>
          </div>
        </section>
        <section className="quality-panel quality-panel--ai">
          <div className="quality-panel__head">
            <div>
              <span className="panel-step panel-step--lime">02</span>
              <div>
                <div className="section-eyebrow">CONTEXT ENGINE</div>
                <h2>Live AI repair</h2>
              </div>
            </div>
            <span className="ai-mini-status">
              <span className="status-dot status-dot--lime" />
              {repaired ? "APPLIED" : "READY"}
            </span>
          </div>
          <div className="repair-console">
            <div className="repair-console__header">
              <span className="terminal-glyph">›_</span>
              <span>repair_context / {dataset.id.toLowerCase()}</span>
              <span className="repair-console__cursor" />
            </div>
            {filteredQuality.slice(0, 4).map((issue, index) => (
              <div className="repair-line" key={issue.id}>
                <span className="repair-line__num">0{index + 1}</span>
                <div>
                  <span className="repair-line__label">CONTEXT WINDOW</span>
                  <code>{issue.context}</code>
                  <span className="repair-line__reason">
                    <Sparkles size={11} />{" "}
                    {issue.type === "Duplicate"
                      ? "dedupe by event_id + timestamp"
                      : issue.type === "Missing timestamp"
                      ? "infer cadence from adjacent rows"
                      : "surrounding context + domain rule"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="quality-panel__footer">
            <span>
              <CircleDot size={13} />{" "}
              {repaired ? "Repair applied with audit trail" : "Repairs are reversible until saved"}
            </span>
            <span className="mono-note">CONFIDENCE / {avgConfidence ? `${avgConfidence.toFixed(1)}%` : "—"}</span>
          </div>
        </section>
        <section className="quality-panel">
          <div className="quality-panel__head">
            <div>
              <span className="panel-step panel-step--blue">03</span>
              <div>
                <div className="section-eyebrow">VERSION PREVIEW</div>
                <h2>Corrected rows</h2>
              </div>
            </div>
            <TinyTag tone="lime">{repaired ? "SAVED" : "PREVIEW"}</TinyTag>
          </div>
          <div className="quality-table">
            {filteredQuality.map(issue => (
              <div className="quality-row quality-row--corrected" key={issue.id}>
                <span className="quality-row__id">{issue.id}</span>
                <div>
                  <strong>{issue.field}</strong>
                  <span>row {issue.row}</span>
                </div>
                <code>{repaired ? issue.fixed : "pending"}</code>
                <TinyTag tone="lime">{issue.confidence}</TinyTag>
              </div>
            ))}
          </div>
          <div className="quality-panel__footer">
            <span>
              <Database size={13} />{" "}
              {saved ? "New version persisted" : "Original source stays untouched"}
            </span>
            <button
              type="button"
              onClick={() => {
                sound.play({ volume: 0.1, rate: 0.95 });
              }}
            >
              <FileCheck2 size={13} />{" "}
              audit trail
            </button>
          </div>
        </section>
      </div>
      {!saved && (
        <div className="quality-save-row">
          <div className="quality-save-note">
            <Database size={15} />
            <span>
              Saving creates a new immutable version. The raw source remains available for audit.
            </span>
          </div>
          <ActionButton icon={DatabaseZap} onClick={onSave} disabled={!repaired}>
            {saved ? "Version saved" : "Save new version"}
          </ActionButton>
        </div>
      )}
      <div className="quality-scope-note">
        <ShieldCheck size={15} />
        <div>
          <strong>Scope guardrail</strong>
          <span>
            EcoMind repairs null values, missing timestamps, duplicates, datatype mismatches, and invalid values
            only. Outliers are preserved for the anomaly stage.
          </span>
        </div>
        <span className="mono-note">RULESET / QUALITY_05</span>
      </div>
    </div>
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
}: {
  transform?: LiveTransform;
  baseline?: LiveBaseline;
  dataset: Dataset;
  baselineName: string;
}) {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const domainInfo = domainMeta[dataset.domain] ?? domainMeta.building;
  const unit = displayUnit(baseline?.unit || liveTargetUnit);
  const steps = transform?.steps ?? [];
  const cells = baseline?.hourOfWeek ?? [];

  const heat = useMemo(() => {
    if (!cells.length) return null;
    const medians = cells.map(c => c.median);
    const lo = Math.min(...medians);
    const hi = Math.max(...medians);
    const grid: (LiveBaselineCell | null)[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => null)
    );
    cells.forEach(c => {
      if (c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) grid[c.day][c.hour] = c;
    });
    return { grid, lo, hi };
  }, [cells]);

  const fmtValue = (n: number): string =>
    n >= 1000 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(1);

  return (
    <div className="view-content">
      <div className="transform-banner">
        <div className="transform-banner__icon">
          <WandSparkles size={24} />
        </div>
        <div>
          <span className="section-eyebrow">ADAPTIVE BASELINE / GENERATED FROM THIS DATASET</span>
          <h2>
            {dataset.name} / {domainInfo.label.toLowerCase()} aware
          </h2>
          <p>
            {baseline
              ? `Learned from ${fmtCount(baseline.rowCount)} readings of ${
                  baseline.target || "the target column"
                } for this dataset only - never a global profile.`
              : "No adaptive baseline has been recorded for this dataset yet."}
          </p>
        </div>
        <div className="transform-banner__metric">
          <span>BASELINE FIT</span>
          <strong>
            {modelData.find(m => m.selected)?.r2 != null
              ? `${modelData.find(m => m.selected)?.r2} R²`
              : "—"}
          </strong>
          <TinyTag tone="lime">{baseline ? "GENERATED" : "PENDING"}</TinyTag>
        </div>
      </div>

      <div className="transform-layout">
        <section className="panel transform-steps-panel">
          <SectionHeading
            eyebrow="RECORDED TRANSFORMATION"
            title="What the stage actually did"
            detail="Every step is a record from the transformation stage, with the columns it touched and the value it wrote."
          />
          <div className="transform-steps">
            {!steps.length ? (
              <p className="mono-note table-empty-note">
                No transformation has been recorded for this run yet.
              </p>
            ) : null}
            {steps.map((step, index) => {
              const open = openStep === step.key;
              return (
                <div className={`transform-step ${open ? "transform-step--open" : ""}`} key={step.key}>
                  <button
                    type="button"
                    className="transform-step__head"
                    aria-expanded={open}
                    onClick={() => setOpenStep(open ? null : step.key)}
                  >
                    <span className="transform-step__index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <span>{step.purpose}</span>
                    </div>
                    <div className="transform-step__meta">
                      <TinyTag tone={step.status === "done" ? "lime" : "neutral"}>
                        {step.status || "recorded"}
                      </TinyTag>
                      <span className="mono-note">{fmtCount(step.rowsChanged)} rows</span>
                      <span className="mono-note">{step.columns.length} columns</span>
                    </div>
                    <ChevronDown size={15} className={open ? "transform-step__chevron--open" : ""} />
                  </button>
                  {open ? (
                    <div className="transform-step__evidence">
                      {!step.fields.length ? (
                        <p className="mono-note table-empty-note">No per-column evidence recorded.</p>
                      ) : null}
                      {step.fields.map(field => (
                        <div
                          className={`transform-evidence ${field.changed ? "transform-evidence--changed" : ""}`}
                          key={field.column}
                        >
                          <span className="transform-evidence__column">{field.column}</span>
                          <code>{field.before}</code>
                          <ArrowRight size={12} />
                          <code>{field.after}</code>
                          <span className="mono-note">
                            {field.unitBefore || field.unitAfter
                              ? `${field.unitBefore || "—"} → ${field.unitAfter || "—"}`
                              : ""}
                          </span>
                          {field.changed ? (
                            <TinyTag tone="blue">changed</TinyTag>
                          ) : (
                            <TinyTag tone="neutral">kept</TinyTag>
                          )}
                        </div>
                      ))}
                      {step.note ? <p className="transform-step__note">{step.note}</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="transform-step-footer">
            <span>
              <DatabaseZap size={13} />{" "}
              every step writes a new immutable version — the uploaded file is never modified
            </span>
            <span className="mono-note">
              {steps.length} step{steps.length === 1 ? "" : "s"} recorded
            </span>
          </div>
        </section>

        <section className="panel transform-baseline-panel">
          <SectionHeading
            eyebrow="BASELINE DATASET PREVIEW"
            title="The normal EcoMind learned"
            detail="Computed from this dataset alone — the reference every later stage compares against."
          />
          {!baseline ? (
            <p className="mono-note table-empty-note">
              Run the adaptive baseline stage to generate this dataset’s own normal behaviour.
            </p>
          ) : (
            <>
              <div className="baseline-identity">
                <span className="baseline-identity__cell">
                  <small>TARGET</small>
                  <strong>{baseline.target || "—"}</strong>
                </span>
                <span className="baseline-identity__cell">
                  <small>UNIT</small>
                  <strong>{unit || "—"}</strong>
                </span>
                <span className="baseline-identity__cell">
                  <small>LEARNED FROM</small>
                  <strong>{fmtCount(baseline.rowCount)} rows</strong>
                </span>
                <span className="baseline-identity__cell">
                  <small>ENTITY COLUMN</small>
                  <strong>{baseline.deviceColumn || "—"}</strong>
                </span>
                <span className="baseline-identity__cell">
                  <small>GENERATED</small>
                  <strong>{baseline.generatedAt ? fmtRunClock(baseline.generatedAt) : "—"}</strong>
                </span>
                <span className="baseline-identity__cell">
                  <small>VERSION</small>
                  <strong>{baselineName || "—"}</strong>
                </span>
              </div>
              <div className="baseline-stats">
                {(
                  [
                    ["MIN", baseline.stats.min],
                    ["P25", baseline.stats.p25],
                    ["MEDIAN", baseline.stats.median],
                    ["MEAN", baseline.stats.mean],
                    ["P75", baseline.stats.p75],
                    ["P95", baseline.stats.p95],
                    ["MAX", baseline.stats.max],
                    ["STD DEV", baseline.stats.std],
                  ] as [string, number][]
                ).map(([label, value]) => (
                  <span className="baseline-stat" key={label}>
                    <small>{label}</small>
                    <strong>{fmtValue(value)}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {heat ? (
        <section className="panel baseline-heat-panel">
          <SectionHeading
            eyebrow="LEARNED PROFILE / HOUR OF WEEK"
            title="When this dataset behaves normally"
            detail={`Median ${
              baseline?.target || "load"
            } for every hour of every weekday, learned from this dataset alone. Hover a cell for the exact value.`}
          />
          <div
            className="baseline-heat"
            role="img"
            aria-label={`Hour-of-week median ${baseline?.target || "load"} heatmap`}
          >
            <div className="baseline-heat__hours">
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>
              ))}
            </div>
            {heat.grid.map((row, day) => (
              <div className="baseline-heat__row" key={day}>
                <span className="baseline-heat__day">{WEEKDAY_LABELS[day] ?? `D${day}`}</span>
                {row.map((cell, hour) => {
                  const span = heat.hi - heat.lo;
                  const alpha = cell ? (span > 0 ? 10 + 78 * ((cell.median - heat.lo) / span) : 45) : 0;
                  return (
                    <span
                      className={`baseline-heat__cell ${cell ? "" : "baseline-heat__cell--empty"}`}
                      key={hour}
                      style={cell ? { background: `rgb(182 243 107 / ${alpha.toFixed(1)}%)` } : undefined}
                      title={
                        cell
                          ? `${WEEKDAY_LABELS[day] ?? day} ${String(hour).padStart(2, "0")}:00 — median ${fmtValue(
                              cell.median
                            )}${unit ? ` ${unit}` : ""} · mean ${fmtValue(cell.mean)} · ${fmtCount(
                              cell.count
                            )} readings`
                          : undefined
                      }
                    >
                      {cell ? fmtValue(cell.median) : "—"}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className="chart-legend">
              <span>
                <i style={{ background: "rgb(182 243 107 / 20%)" }} /> low
              </span>
              <span>
                <i style={{ background: "rgb(182 243 107 / 88%)" }} /> high
              </span>
              <span className="mono-note">
                {heat.lo.toLocaleString("en-IN")} – {heat.hi.toLocaleString("en-IN")}
                {unit ? ` ${unit}` : ""} median
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="database-trace">
        <div className="database-trace__label">
          <Database size={15} />
          <span>VERSIONED DATABASE TRACE</span>
        </div>
        <div className="database-trace__flow">
          <span>uploaded source</span>
          <ArrowRight size={13} />
          <span className="database-trace__active">transformed</span>
          <ArrowRight size={13} />
          <span>model input</span>
        </div>
        <span className="trace-status">
          <span className="status-dot status-dot--lime" />
          {steps.length ? `${steps.length} steps recorded` : "awaiting stage 05"}
        </span>
      </div>
    </div>
  );
}

function ModelsView({
  selectedModel,
  setSelectedModel,
}: {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}) {
  const sound = useSound({ onPlay: () => {} });
  const comp = liveCompetition;
  const winner = modelData.find(m => m.selected) ?? modelData[0] ?? null;
  const second = modelData[1] ?? null;
  const topR2 = winner ? winner.r2 : null;
  const topMae = winner ? winner.mae : null;
  const maeGain = winner && second && second.mae > 0 ? ((winner.mae - second.mae) / second.mae) * 100 : null;
  return (
    <div className="view-content">
      <div className="models-topline">
        <div className="models-kpis">
          <Metric
            label="BEST MODEL"
            value={topR2 != null ? `R² ${topR2}` : "—"}
            delta={winner ? "selected on measured results" : "no run yet"}
            accent="lime"
          />
          <Metric
            label="ERROR / MAE"
            value={topMae != null ? withUnit(String(topMae)) : "—"}
            delta={maeGain != null ? `${maeGain <= 0 ? "" : "+"}${maeGain.toFixed(1)}% vs next` : "no run yet"}
            direction={maeGain != null && maeGain < 0 ? "down" : "up"}
            accent="blue"
          />
          <Metric
            label="TRAIN SPLIT"
            value={comp ? `${fmtCount(comp.trainRows)} rows` : "—"}
            delta={comp ? `${comp.features} features / test ${fmtCount(comp.testRows)}` : "no run yet"}
            direction="down"
            accent="violet"
          />
        </div>
        <div className="system-chip">
          <span className="status-dot status-dot--violet" />
          {modelData.length ? `${modelData.length} model${modelData.length === 1 ? "" : "s"} compared` : "no competition recorded"}
        </div>
      </div>
      <div className="models-layout">
        <section className="panel model-ranking-panel">
          <SectionHeading
            eyebrow="MODEL COMPETITION"
            title="Same data. Clear winner."
            detail="Ranked by MAE first, then stability across the validation window."
          />
          <div className="model-list">
            {modelData.map((model, index) => (
              <button
                type="button"
                className={`model-row ${selectedModel === model.name ? "model-row--selected" : ""}`}
                key={model.name}
                onClick={() => {
                  setSelectedModel(model.name);
                  sound.play({ volume: 0.1, rate: 0.95 });
                }}
              >
                <span className={`model-rank ${index === 0 ? "model-rank--winner" : ""}`}>
                  0{index + 1}
                </span>
                <span
                  className="model-row__badge"
                  style={{ color: model.color, borderColor: `${model.color}55` }}
                >
                  {model.short}
                </span>
                <div className="model-row__name">
                  <strong>{model.name}</strong>
                  <span>
                    {model.rationale
                      ? model.rationale.length > 110
                        ? `${model.rationale.slice(0, 107)}...`
                        : model.rationale
                      : `rank ${index + 1} candidate`}
                  </span>
                </div>
                <div className="model-row__metrics">
                  <span>
                    <small>MAE</small>
                    <strong>{model.mae}</strong>
                  </span>
                  <span>
                    <small>RMSE</small>
                    <strong>{model.rmse}</strong>
                  </span>
                  <span>
                    <small>R²</small>
                    <strong>{model.r2}</strong>
                  </span>
                </div>
                {model.selected ? (
                  <TinyTag tone="lime">PROMOTED</TinyTag>
                ) : (
                  <ChevronRight size={15} />
                )}
              </button>
            ))}
          </div>
        </section>
        <section className="panel model-chart-panel">
          <SectionHeading
            eyebrow="EVALUATION METRICS"
            title="Error profile"
            detail="Lower MAE is better. Lower spread means a steadier operating forecast."
          />
          <div className="model-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelData} layout="vertical" margin={{ left: 0, right: 18 }}>
                <CartesianGrid stroke="#24342d" strokeDasharray="2 5" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#61776a"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#768e7f", fontSize: 10 }}
                />
                <YAxis
                  dataKey="short"
                  type="category"
                  stroke="#61776a"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#b9c9bd", fontSize: 11 }}
                  width={38}
                />
                <RechartsTooltip
                  cursor={{ fill: "#1e3127" }}
                  contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
                />
                <Bar dataKey="mae" fill="#b6f36b" radius={[0, 5, 5, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="model-chart-footer">
            <AxisNote
              quantity="MAE"
              unit={liveTargetUnit}
              origin="Recorded by the model selection stage: mean absolute error of this model on the held-out test split, in the unit of the modelled target column."
            />
            <span className="mono-note">VALIDATION / 20%</span>
          </div>
        </section>
      </div>
      {modelData.length > 1 ? (
        <section className="panel model-headtohead">
          <SectionHeading
            eyebrow="HEAD TO HEAD"
            title="Every candidate on the same rows"
            detail="All candidates trained on identical processed rows and scored on the same held-out split. The winner leads each metric it is allowed to lead."
          />
          <div className="h2h">
            <div className="h2h__row h2h__row--head">
              <span className="h2h__metric">METRIC</span>
              {modelData.map(model => (
                <span key={model.name} className={model.selected ? "h2h__winner" : ""}>
                  {model.short}
                  {model.selected ? " \u2605" : ""}
                </span>
              ))}
            </div>
            {(
              [
                { label: "R\u00b2", unit: "", better: "high" as const, get: (m: LiveModel) => m.r2, fmt: (v: number) => v.toFixed(3) },
                { label: "RMSE", unit: liveTargetUnit ? displayUnit(liveTargetUnit) : "", better: "low" as const, get: (m: LiveModel) => m.rmse, fmt: (v: number) => fmtCount(v) },
                { label: "MAE", unit: liveTargetUnit ? displayUnit(liveTargetUnit) : "", better: "low" as const, get: (m: LiveModel) => m.mae, fmt: (v: number) => fmtCount(v) },
                { label: "Training", unit: "s", better: "low" as const, get: (m: LiveModel) => m.trainSeconds ?? null, fmt: (v: number) => v.toFixed(3) },
                { label: "Composite", unit: "", better: "high" as const, get: (m: LiveModel) => m.composite ?? null, fmt: (v: number) => v.toFixed(3) },
                { label: "MAPE", unit: "%", better: "low" as const, get: (m: LiveModel) => m.mape ?? null, fmt: (v: number) => v.toFixed(1) },
              ] as {
                label: string;
                unit: string;
                better: "high" | "low";
                get: (model: LiveModel) => number | null;
                fmt: (value: number) => string;
              }[]
            ).map(row => {
              const values = modelData.map(row.get).filter((value): value is number => value != null);
              if (!values.length) return null;
              const best = row.better === "high" ? Math.max(...values) : Math.min(...values);
              return (
                <div className="h2h__row" key={row.label}>
                  <span className="h2h__metric">
                    {row.label}
                    {row.unit ? ` (${row.unit})` : ""}
                  </span>
                  {modelData.map(model => {
                    const value = row.get(model);
                    const isBest = value != null && Math.abs(value - best) < 1e-9;
                    return (
                      <span key={model.name} className={isBest ? "h2h__best" : ""}>
                        {value == null ? "\u2014" : row.fmt(value)}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="h2h__foot">
            <span>
              <strong>{comp?.winner ?? "\u2014"}</strong> won on composite score
              {comp ? ` by ${comp.margin.toFixed(3)}` : ""}
              {comp?.nearTie ? " \u2014 recorded as a near tie, so the difference sits inside noise." : ""}
            </span>
            <span className="mono-note">
              {comp?.criteria?.length ? `won: ${comp.criteria.join(", ")}` : ""}
              {comp?.lostCriteria?.length ? ` \u00b7 traded away: ${comp.lostCriteria.join(", ")}` : ""}
            </span>
          </div>
        </section>
      ) : null}
      <div className="winner-callout">
        <div className="winner-callout__icon">
          <Sparkles size={18} />
        </div>
        <div>
          <span className="section-eyebrow">WHY {comp?.winner ? comp.winner.toUpperCase() : "THIS MODEL"}</span>
          <h3>{comp?.nearTie ? "A near-tie, decided on stability." : "Chosen on measured results."}</h3>
          <p>
            {comp && comp.rationale
              ? comp.rationale
              : winner
                ? `${winner.name} led the competition on one identical train/test split.`
                : "Run the pipeline to record the selection rationale."}
          </p>
        </div>
        <ActionButton variant="secondary" icon={Eye}>
          Inspect evaluation
        </ActionButton>
      </div>
    </div>
  );
}

function AnomaliesView({
  window,
  setWindow,
  onInspect,
  dataset,
  baselineName,
  windowOptions,
}: {
  window: string;
  setWindow: (value: string) => void;
  onInspect: (anomaly: (typeof anomalies)[number]) => void;
  dataset: Dataset;
  baselineName: string;
  windowOptions: LiveWindowOption[];
}) {
  const sound = useSound({ onPlay: () => {} });
  const meta = liveAnomalyMeta;
  const anomalyTotal = meta?.total ?? anomalies.length;
  const criticalHigh = (meta?.severity?.critical ?? 0) + (meta?.severity?.high ?? 0);
  const activeWindow =
    windowOptions.find(option => option.id === window) ?? windowOptions[windowOptions.length - 1] ?? null;
  const series = activeWindow ? anomalyData.slice(-activeWindow.points) : anomalyData;
  const baselineMax = series.length ? Math.max(...series.map(p => p.baseline)) : 0;
  const thresholdLine = baselineMax > 0 ? Number((baselineMax * 1.2).toFixed(1)) : 0;
  return (
    <div className="view-content">
      <div className="anomaly-topline">
        <div className="quality-kpis">
          <Metric
            label="ANOMALIES"
            value={String(anomalyTotal)}
            delta={`${criticalHigh} critical / high`}
            accent="coral"
          />
          <Metric
            label="DETECTION RATE"
            value={meta ? `${meta.ratePct.toFixed(2)}%` : "—"}
            delta={meta ? `${fmtCount(meta.scanned)} readings scanned` : "no run yet"}
            direction="down"
            accent="lime"
          />
          <Metric
            label="EXCESS COST"
            value={meta ? `${displayUnit("INR")}${fmtCount(meta.excessCost)}` : "—"}
            delta={meta ? `${fmtCount(meta.excessCo2)} ${displayUnit("kgCO2")}` : "no run yet"}
            direction="up"
            accent="orange"
          />
        </div>
        {windowOptions.length ? (
          <div className="segmented-control">
            {windowOptions.map(option => (
              <button
                type="button"
                className={activeWindow?.id === option.id ? "active" : ""}
                key={option.id}
                title={option.detail}
                onClick={() => {
                  setWindow(option.id);
                  sound.play({ volume: 0.08, rate: 0.9 });
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="mono-note">
            No time axis recorded for this dataset — the detection window follows the data as it is.
          </span>
        )}
      </div>
      <section className="panel anomaly-chart-panel">
        <div className="anomaly-chart-head">
          <div>
            <div className="section-eyebrow">DEVIATION FROM BASELINE / {window}</div>
            <h2>{anomalyTotal ? `${anomalyTotal} event${anomalyTotal === 1 ? "" : "s"} broke the pattern.` : "No anomalies recorded."}</h2>
          </div>
          <div className="chart-legend">
            <span>
              <i style={{ background: "#b6f36b" }} />
              {" "}
              observed load
            </span>
            <span>
              <i style={{ background: "#718b7b" }} />
              {" "}
              baseline
            </span>
            <span>
              <i className="legend-dot legend-dot--coral" />
              {" "}
              anomaly
            </span>
            <AxisNote
              quantity="Observed load"
              unit={liveTargetUnit}
              origin="Recorded by the anomaly stage: the measured target column compared against the adaptive baseline for this dataset. Readings outside the learned threshold are marked as anomalies."
            />
          </div>
        </div>
        <div className="anomaly-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 16, right: 24, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#24342d" strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#61776a"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#768e7f", fontSize: 10 }}
              />
              <YAxis
                stroke="#61776a"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#768e7f", fontSize: 10 }}
              />
              <ReferenceLine
                y={thresholdLine}
                stroke="#f5a56d"
                strokeDasharray="3 5"
                strokeOpacity={0.5}
              />
              <RechartsTooltip
                contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#718b7b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#b6f36b"
                strokeWidth={2.5}
                dot={{ fill: "#b6f36b", r: 3, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="anomaly"
                stroke="#f07f6e"
                strokeWidth={0}
                dot={{ fill: "#f07f6e", r: 6, stroke: "#251b18", strokeWidth: 2 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="anomaly-chart-footer">
          <span className="mono-note">BASELINE / {baselineName}</span>
          <span>Threshold: {meta ? `+${meta.threshold}%` : "—"} over learned baseline</span>
        </div>
        <div className="anomaly-chart-sub">
          <div className="anomaly-chart-sub__item">
            <span className="section-eyebrow">DATASET</span>
            <strong>{dataset.name}</strong>
            <span>{dataset.id} · {domainMeta[dataset.domain].label}</span>
          </div>
          <div className="anomaly-chart-sub__item">
            <span className="section-eyebrow">BASELINE</span>
            <strong>{baselineName}</strong>
            <span>operating-day aware</span>
          </div>
        </div>
      </section>
      <section className="panel anomaly-breakdown">
        <SectionHeading
          eyebrow="DETECTION BREAKDOWN"
          title="How the anomalies split"
          detail="Severity counts and the classes EcoMind detected, both recorded by the anomaly stage."
        />
        {!anomalyTotal ? (
          <p className="mono-note table-empty-note">No anomalies recorded for this run yet.</p>
        ) : (
          <div className="anomaly-breakdown__grid">
            <div className="anomaly-breakdown__block">
              <span className="section-eyebrow">SEVERITY</span>
              <div className="severity-bar" role="img" aria-label="Anomaly severity split">
                {SEVERITY_ORDER.map(sev => {
                  const count = meta?.severity?.[sev] ?? 0;
                  const width = anomalyTotal ? (count / anomalyTotal) * 100 : 0;
                  return count ? (
                    <span
                      key={sev}
                      className={`severity-bar__seg severity-bar__seg--${sev}`}
                      style={{ width: `${width.toFixed(2)}%` }}
                      title={`${sev}: ${fmtCount(count)}`}
                    />
                  ) : null;
                })}
              </div>
              <div className="severity-legend">
                {SEVERITY_ORDER.map(sev => (
                  <span className={`severity-legend__item severity-legend__item--${sev}`} key={sev}>
                    <i aria-hidden="true" /> {sev} · {fmtCount(meta?.severity?.[sev] ?? 0)}
                  </span>
                ))}
              </div>
            </div>
            <div className="anomaly-breakdown__block">
              <span className="section-eyebrow">DETECTED CLASSES</span>
              <div className="class-rank">
                {!(meta?.byClass ?? []).length ? (
                  <p className="mono-note table-empty-note">No class breakdown recorded.</p>
                ) : null}
                {(meta?.byClass ?? []).map(item => {
                  const share = anomalyTotal ? (item.count / anomalyTotal) * 100 : 0;
                  return (
                    <div className="class-rank__row" key={item.label}>
                      <span className="class-rank__label">{item.label}</span>
                      <span className="class-rank__track">
                        <span className="class-rank__fill" style={{ width: `${Math.min(100, share).toFixed(1)}%` }} />
                      </span>
                      <span className="mono-note">
                        {fmtCount(item.count)} · {share.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="panel anomaly-table-panel">
        <div className="table-panel-head">
          <div>
            <div className="section-eyebrow">ANOMALY QUEUE</div>
            <h2>Evidence, not just alerts.</h2>
          </div>
          <button
            className="filter-button"
            type="button"
            onClick={() => sound.play({ volume: 0.08, rate: 0.9 })}
          >
            <ListFilter size={14} />{" "}
            Filter <span>{anomalies.length}</span>
          </button>
        </div>
        <div className="data-table">
          <div className="data-table__head">
            <span>SEVERITY</span>
            <span>TYPE</span>
            <span>TIMESTAMP</span>
            <span>AFFECTED FEATURE</span>
            <span>REASON</span>
            <span />
          </div>
          {anomalies.map(item => (
            <div className="data-table__row" key={item.id}>
              <span>
                <TinyTag
                  tone={
                    item.color === "coral"
                      ? "coral"
                      : item.color === "orange"
                      ? "orange"
                      : item.color === "yellow"
                      ? "neutral"
                      : "blue"
                  }
                >
                  {item.severity}
                </TinyTag>
              </span>
              <strong>{item.type}</strong>
              <span className="mono-note">{item.timestamp}</span>
              <code>{item.feature}</code>
              <span>{item.reason}</span>
              <button
                type="button"
                aria-label={`Inspect ${item.id}`}
                onClick={() => {
                  onInspect(item);
                  sound.play({ volume: 0.12, rate: 1.05 });
                }}
              >
                <Eye size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PredictionView({
  window,
  setWindow,
  windowOptions,
  onViewData,
  dataset,
  baselineName,
  modelName,
}: {
  window: string;
  setWindow: (value: string) => void;
  onViewData: () => void;
  dataset: Dataset;
  baselineName: string;
  modelName: string;
  windowOptions: LiveWindowOption[];
}) {
  const sound = useSound({ onPlay: () => {} });
  const fm = liveForecastMeta;
  const activeWindow =
    windowOptions.find(option => option.id === window) ?? windowOptions[windowOptions.length - 1] ?? null;
  const forecastPoints = activeWindow ? forecastData.slice(-activeWindow.points) : forecastData;
  const forecastTotal = forecastPoints.reduce((sum, d) => sum + (d.forecast || 0), 0);
  const savingsInr = liveRecMeta?.savingsInr ?? 0;
  const savingsCo2 = liveRecMeta?.savingsCo2 ?? 0;
  // Read the chart's own recorded values so the annotations below describe the
  // series on screen rather than a summary computed from something else.
  const observedPoints = forecastPoints.filter(p => p.actual != null);
  const futurePoints = forecastPoints.filter(p => p.actual == null);
  const observedAvg = observedPoints.length
    ? observedPoints.reduce((sum, p) => sum + (p.actual || 0), 0) / observedPoints.length
    : 0;
  const futureAvg = futurePoints.length
    ? futurePoints.reduce((sum, p) => sum + p.forecast, 0) / futurePoints.length
    : 0;
  const horizonDeltaPct = observedAvg > 0 ? ((futureAvg - observedAvg) / observedAvg) * 100 : null;
  const peakDay = forecastPoints.length
    ? forecastPoints.reduce((best, p) => (p.forecast > best.forecast ? p : best), forecastPoints[0])
    : null;
  const originDay = observedPoints.length ? observedPoints[observedPoints.length - 1].day : "";
  const bandWidth = forecastPoints.length
    ? forecastPoints.reduce((sum, p) => sum + Math.max(0, p.high - p.low), 0) / forecastPoints.length
    : 0;
  return (
    <div className="view-content">
      <div className="prediction-topline">
        <div className="prediction-kpis">
          <Metric
            label="FORECAST HORIZON"
            value={forecastData.length ? withUnit(fmtCount(forecastTotal)) : "—"}
            delta={fm ? `${fm.mape.toFixed(1)}% MAPE backtest` : "no run yet"}
            direction="down"
            accent="lime"
          />
          <Metric
            label="SAVINGS / MONTH"
            value={liveRecMeta ? `${displayUnit("INR")}${fmtCount(savingsInr)}` : "—"}
            delta="from ranked actions"
            direction="down"
            accent="orange"
          />
          <Metric
            label="CO₂ AVOIDED"
            value={liveRecMeta ? `${fmtCount(savingsCo2)} kg` : "—"}
            delta="per month"
            direction="down"
            accent="blue"
          />
        </div>
        <div className="prediction-actions">
          {windowOptions.length ? (
            <div className="segmented-control">
              {windowOptions.map(option => (
                <button
                  type="button"
                  className={activeWindow?.id === option.id ? "active" : ""}
                  key={option.id}
                  title={option.detail}
                  onClick={() => {
                    setWindow(option.id);
                    sound.play({ volume: 0.08, rate: 0.9 });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="mono-note">
              No time axis recorded — the horizon is shown exactly as the forecast stage wrote it.
            </span>
          )}
          <ActionButton variant="secondary" icon={Table2} onClick={onViewData}>
            View processed data
          </ActionButton>
        </div>
      </div>
      <div className="prediction-layout">
        <section className="panel prediction-chart-panel">
          <div className="prediction-chart-head">
            <div>
              <div className="section-eyebrow">FORECAST / {window.toUpperCase()}</div>
              <h2>Energy consumption forecast</h2>
              <p>
                {modelName} · {baselineName} · confidence band shown
              </p>
            </div>
            <TinyTag tone="violet">{fm ? `${fm.algorithm} · ${fm.mape.toFixed(1)}% MAPE` : "no run yet"}</TinyTag>
          </div>
          <div className="prediction-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastPoints} margin={{ top: 20, right: 22, left: -6, bottom: 4 }}>
                <defs>
                  <linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8d86ff" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#8d86ff" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="observedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b6f36b" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#b6f36b" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8d86ff" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#8d86ff" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24342d" strokeDasharray="2 5" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#61776a"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={22}
                  tick={{ fill: "#768e7f", fontSize: 10 }}
                />
                <YAxis
                  stroke="#61776a"
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tick={{ fill: "#768e7f", fontSize: 10 }}
                  tickFormatter={value => fmtCount(Number(value))}
                />
                <RechartsTooltip
                  contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
                  labelFormatter={label => `Day ${label}`}
                  formatter={(value, name) => [withUnit(fmtCount(Number(value))), String(name)]}
                />
                {originDay ? (
                  <ReferenceLine
                    x={originDay}
                    stroke="#5d7765"
                    strokeDasharray="4 4"
                    label={{ value: "now", position: "insideTopRight", fill: "#8fa79a", fontSize: 10 }}
                  />
                ) : null}
                <Area type="monotone" dataKey="high" stroke="none" fill="url(#confidenceFill)" />
                <Area type="monotone" dataKey="low" stroke="none" fill="#132119" />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#b6f36b"
                  strokeWidth={2.6}
                  fill="url(#observedFill)"
                  dot={{ fill: "#b6f36b", r: 2.4, strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke="#8d86ff"
                  strokeWidth={2.4}
                  fill="url(#forecastFill)"
                  dot={{ fill: "#8d86ff", r: 2.4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="forecast-readout">
            {/* Only cells the recorded horizon can actually fill are shown: a
                row of dashes is noise, not information. */}
            {observedPoints.length ? (
              <div className="forecast-readout__cell">
                <small>OBSERVED DAYS</small>
                <strong>{observedPoints.length}</strong>
              </div>
            ) : null}
            <div className="forecast-readout__cell">
              <small>FORECAST DAYS</small>
              <strong>{futurePoints.length || "—"}</strong>
            </div>
            <div className="forecast-readout__cell">
              <small>PEAK DAY</small>
              <strong>{peakDay ? `${peakDay.day} · ${withUnit(fmtCount(peakDay.forecast))}` : "—"}</strong>
            </div>
            <div className="forecast-readout__cell">
              <small>AVG CONFIDENCE BAND</small>
              <strong>{bandWidth ? `±${withUnit(fmtCount(bandWidth / 2))}` : "—"}</strong>
            </div>
            {horizonDeltaPct != null ? (
              <div className="forecast-readout__cell">
                <small>HORIZON VS OBSERVED</small>
                <strong className={horizonDeltaPct < 0 ? "forecast-readout__down" : ""}>
                  {`${horizonDeltaPct >= 0 ? "+" : ""}${horizonDeltaPct.toFixed(1)}%`}
                </strong>
              </div>
            ) : null}
          </div>
          <div className="chart-legend">
            <span>
              <i style={{ background: "#b6f36b" }} />
              {" "}
              observed
            </span>
            <span>
              <i style={{ background: "#8d86ff" }} />
              {" "}
              forecast
            </span>
            <span>
              <i style={{ background: "#8d86ff", opacity: 0.28 }} />
              {" "}
              confidence band
            </span>
            <AxisNote
              quantity="Daily total"
              unit={liveTargetUnit}
              origin="Recorded by the forecast stage: the selected model's prediction for each day of the horizon, with the backtest confidence band."
            />
          </div>
        </section>
        <section className="panel forecast-breakdown">
          <SectionHeading eyebrow="FORECAST BREAKDOWN" title="What moves the number" />
          {liveCompetition?.weights?.length ? (
            liveCompetition.weights.slice(0, 4).map(weight => (
              <div className="forecast-factor" key={weight.label}>
                <span className="forecast-factor__icon forecast-factor__icon--lime">
                  <TrendingUp size={15} />
                </span>
                <div>
                  <strong>{weight.label}</strong>
                  <span>recorded model weight</span>
                </div>
                <strong>{weight.weight.toFixed(2)}</strong>
              </div>
            ))
          ) : (
            <p className="mono-note forecast-breakdown__empty">No model weights recorded for this run.</p>
          )}
          <div className="forecast-breakdown__note">
            <Sparkles size={14} />
            <span>Forecast is stable across all validation slices.</span>
          </div>
        </section>
      </div>
      <div className="prediction-detail">
        <section className="panel forecast-days">
          <SectionHeading
            eyebrow="DAY BY DAY"
            title="The horizon, one line at a time"
            detail="Every recorded forecast value with its backtest interval, in the unit of the modelled target column."
          />
          {!forecastData.length ? (
            <p className="mono-note table-empty-note">No forecast recorded for this dataset yet.</p>
          ) : (
            <div className="data-table">
              <div className="data-table__head forecast-days__row">
                <span>DAY</span>
                <span>OBSERVED</span>
                <span>FORECAST</span>
                <span>INTERVAL</span>
                <span>VS OBSERVED</span>
              </div>
              {forecastData.map(point => {
                const delta =
                  point.actual != null && point.actual !== 0
                    ? ((point.forecast - point.actual) / point.actual) * 100
                    : null;
                const u = liveTargetUnit ? ` ${displayUnit(liveTargetUnit)}` : "";
                return (
                  <div className="data-table__row forecast-days__row" key={point.day}>
                    <span>{point.day}</span>
                    <span>{point.actual != null ? `${fmtCount(point.actual)}${u}` : "—"}</span>
                    <span>
                      {fmtCount(point.forecast)}
                      {u}
                    </span>
                    <span className="mono-note">
                      {fmtCount(point.low)} – {fmtCount(point.high)}
                    </span>
                    <span className={delta == null ? "mono-note" : delta > 0 ? "delta-up" : "delta-down"}>
                      {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel forecast-impact">
          <SectionHeading
            eyebrow="BUSINESS IMPACT"
            title="What this horizon is worth"
            detail="Recorded alongside the forecast: cost, carbon and the model that produced it."
          />
          <div className="impact-list">
            <div className="impact-row">
              <span>Cost opportunity</span>
              <strong>
                {liveRecMeta ? `${displayUnit("INR")}${fmtCount(savingsInr)}` : "—"}
                <small> / month</small>
              </strong>
            </div>
            <div className="impact-row">
              <span>Carbon avoided</span>
              <strong>
                {liveRecMeta ? fmtCount(savingsCo2) : "—"}
                <small> {displayUnit("kgCO2")} / month</small>
              </strong>
            </div>
            <div className="impact-row">
              <span>Backtest error</span>
              <strong>
                {fm?.mape ? `${fm.mape.toFixed(1)}` : "—"}
                <small> % MAPE</small>
              </strong>
            </div>
            <div className="impact-row">
              <span>Selected model</span>
              <strong>{modelName || "—"}</strong>
            </div>
            <div className="impact-row">
              <span>Horizon origin</span>
              <strong>{fm?.origin || "—"}</strong>
            </div>
            <div className="impact-row">
              <span>Baseline compared</span>
              <strong>{baselineName || "—"}</strong>
            </div>
          </div>
        </section>
      </div>
      <div className="prediction-footnote">
        <span>
          <Info size={14} />{" "}
          Cost uses current tariff schedule · carbon uses regional grid factor
        </span>
        <span className="mono-note">
          GENERATED / {fm?.origin ?? "—"}
        </span>
      </div>
    </div>
  );
}

function RecommendationsView({
  dataset,
  baselineName,
}: {
  dataset: Dataset;
  baselineName: string;
}) {
  const sound = useSound({ onPlay: () => {} });
  const recCount = liveRecMeta?.total ?? recommendations.length;
  const savingsInr = liveRecMeta?.savingsInr ?? 0;
  const savingsCo2 = liveRecMeta?.savingsCo2 ?? 0;
  const anomalyCount = liveAnomalyMeta?.total ?? anomalies.length;
  const avgConf = recommendations.length
    ? recommendations.reduce((sum, r) => sum + (parseFloat(r.confidence) || 0), 0) / recommendations.length
    : 0;
  return (
    <div className="view-content">
      <div className="recommendation-banner">
        <div className="recommendation-banner__icon">
          <Lightbulb size={22} />
        </div>
        <div>
          <span className="section-eyebrow">AI ACTION LAYER</span>
          <h2>{recCount ? `${recCount} action${recCount === 1 ? "" : "s"} ${recCount === 1 ? "is" : "are"} worth your attention.` : "No recommendations recorded."}</h2>
          <p>
            Generated from {anomalyCount} anomalies, the {baselineName} baseline, and the recorded forecast.
          </p>
        </div>
        <div className="recommendation-banner__score">
          <span>EXPECTED MONTHLY IMPACT</span>
          <strong>{displayUnit("INR")}{fmtCount(savingsInr)}</strong>
          <span>{fmtCount(savingsCo2)} {displayUnit("kgCO2")} avoided</span>
        </div>
      </div>
      <div className="recommendation-layout">
        <section className="recommendation-list">
          {!recommendations.length ? (
            <p className="mono-note table-empty-note">No recommendations recorded for this dataset.</p>
          ) : null}
          {recommendations.map(item => (
            <article className={`recommendation-card recommendation-card--${item.color}`} key={item.priority}>
              <div className="recommendation-card__index">{item.priority}</div>
              <div className="recommendation-card__body">
                <div className="recommendation-card__meta">
                  <TinyTag
                    tone={
                      item.color === "lime"
                        ? "lime"
                        : item.color === "orange"
                        ? "orange"
                        : "violet"
                    }
                  >
                    {item.color === "lime" ? "QUICK WIN" : item.color === "orange" ? "INSPECT" : "OPTIMIZE"}
                  </TinyTag>
                  <span>
                    <Sparkles size={12} />{" "}
                    {item.confidence} confidence
                  </span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="recommendation-card__impact">
                  <span>
                    <TrendingDown size={13} />{" "}
                    {item.impact}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      sound.play({ volume: 0.12, rate: 1.05 });
                    }}
                  >
                    Add to action plan <ArrowRight size={13} />
                  </button>
                </div>
              </div>
              <button
                className="recommendation-card__check"
                type="button"
                aria-label={`Mark ${item.title} complete`}
                onClick={() => {
                  sound.play({ volume: 0.14, rate: 1.1 });
                }}
              >
                <Check size={15} />
              </button>
            </article>
          ))}
        </section>
        <aside className="recommendation-aside">
          <section className="panel evidence-panel">
            <SectionHeading
              eyebrow="EVIDENCE GRAPH"
              title="Why these actions"
              detail="Recommendation confidence is grounded in the active run."
            />
            <div className="evidence-ring">
              <div className="evidence-ring__circle">
                <strong>{avgConf ? Math.round(avgConf) : "—"}</strong>
                <span>confidence</span>
              </div>
              <div className="evidence-ring__labels">
                <span>
                  <i style={{ background: "#b6f36b" }} />
                  {" "}
                  {anomalyCount} anomalies
                </span>
                <span>
                  <i style={{ background: "#8d86ff" }} />
                  {" "}
                  7-day forecast
                </span>
                <span>
                  <i style={{ background: "#f5a56d" }} />
                  {" "}
                  tariff context
                </span>
              </div>
            </div>
            <div className="evidence-foot">
              <span>
                <Database size={13} />{" "}
                {dataset.id.toLowerCase()}
              </span>
              <span>
                <Clock3 size={13} />{" "}
                refreshed {dataset.freshness}
              </span>
            </div>
          </section>
          <section className="panel recommendation-note">
            <Info size={16} />
            <div>
              <strong>Human-in-the-loop</strong>
              <p>These are suggestions, not automated changes. Your team stays in control of execution.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ReportsView({
  exported,
  draft,
  onDraft,
  onCloseDraft,
  onExport,
  dataset,
  domainInfo,
  baselineName,
  modelName,
}: {
  exported: boolean;
  draft: string | null;
  onDraft: () => void;
  onCloseDraft: () => void;
  onExport: () => void;
  dataset: Dataset;
  domainInfo: (typeof domainMeta)[DatasetDomain];
  baselineName: string;
  modelName: string;
}) {
  const sound = useSound({ onPlay: () => {} });
  const [copied, setCopied] = useState(false);
  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const downloadDraft = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([draft], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ecomind-${dataset.id.toLowerCase()}-briefing.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const sections = [
    {
      label: "Project summary",
      detail: liveRunId ? `Dataset ${dataset.id} / run ${liveRunId.slice(0, 8)}` : "No run recorded yet",
      icon: FileText,
    },
    {
      label: "Analytics",
      detail: `${modelName} metrics + forecast breakdown`,
      icon: BarChart3,
    },
    {
      label: "Anomalies",
      detail: `${liveAnomalyMeta?.total ?? anomalies.length} flagged events with evidence`,
      icon: AlertTriangle,
    },
    {
      label: "Recommendations",
      detail: `${liveRecMeta?.total ?? recommendations.length} ranked operating actions`,
      icon: Lightbulb,
    },
  ];
  return (
    <div className="view-content">
      <div className="report-layout">
        <section className="report-cover">
          <div className="report-cover__grid" />
          <div className="report-cover__top">
            <span className="brand-mini">
              <EcoMindMark size={23} />
              <strong>EcoMind</strong>
            </span>
            <span className="mono-note">REPORT / {fmtRunClock(new Date().toISOString())}</span>
          </div>
          <div className="report-cover__content">
            <span className="section-eyebrow">
              {dataset.name} / {dataset.id}
            </span>
            <h2>
              Energy intelligence
              <br />
              <em>briefing</em>
            </h2>
            <p>
              Project-scoped findings from the {dataset.name} AI pipeline.
            </p>
            <div className="report-cover__rule" />
            <div className="report-cover__meta">
              <span>
                <small>DATASET</small>
                <strong>{dataset.name}</strong>
              </span>
              <span>
                <small>DOMAIN</small>
                <strong>{domainInfo.label}</strong>
              </span>
              <span>
                <small>VERSION</small>
                <strong>{baselineName}</strong>
              </span>
              <span>
                <small>MODEL</small>
                <strong>{modelName}</strong>
              </span>
            </div>
          </div>
          <div className="report-cover__footer">
            <span>
              <span className="status-dot status-dot--lime" />
              AI decisions inspectable
            </span>
            <span>Page 01 / {String(sections.length + 5).padStart(2, "0")}</span>
          </div>
        </section>
        <section className="panel report-export-panel">
          <div className="report-export-panel__head">
            <div>
              <div className="section-eyebrow">EXPORT SCOPE</div>
              <h2>Only project truth.</h2>
              <p>
                Reports include the active project's summaries, analytics, anomalies, predictions, and
                recommendations — nothing else.
              </p>
            </div>
            <div className="report-format">
              <span>FORMAT</span>
              <strong>PDF</strong>
              <ChevronDown size={13} />
            </div>
          </div>
          <div className="report-sections">
            {sections.map(section => {
              const Icon = section.icon;
              return (
                <div className="report-section-row" key={section.label}>
                  <span className="report-section-row__icon">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{section.label}</strong>
                    <span>{section.detail}</span>
                  </div>
                  <CheckCircle2 size={15} className="report-section-row__check" />
                </div>
              );
            })}
          </div>
          <div className="report-export-panel__footer">
            <div>
              <span className="mono-note">{sections.length} SECTIONS / DATASET {dataset.id}</span>
              <span>{exported ? "Exported just now" : "Last generated: never"}</span>
            </div>
            <div className="report-export-actions">
              <button
                className="report-preview-button"
                type="button"
                onClick={() => {
                  onDraft();
                  sound.play({ volume: 0.14, rate: 1.0 });
                }}
              >
                <Sparkles size={14} />
                {" "}
                {draft ? "Regenerate preview" : "Preview report"}
              </button>
              {draft && (
                <div className="report-preview">
                  <div className="report-preview__head">
                    <span className="section-eyebrow">REPORT PREVIEW</span>
                    <h3>Scoped briefing draft</h3>
                    <button
                      type="button"
                      className="report-preview__close"
                      aria-label="Close report preview"
                      onClick={() => {
                        sound.play({ volume: 0.08, rate: 0.85 });
                        onCloseDraft();
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="report-preview__body">
                    <ReportDraftBody text={draft} />
                  </div>
                  <div className="report-preview__actions">
                    <button
                      type="button"
                      onClick={() => {
                        void copyDraft();
                        sound.play({ volume: 0.1, rate: 0.9 });
                      }}
                    >
                      {copied ? "Copied" : "Copy briefing"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadDraft();
                        sound.play({ volume: 0.1, rate: 0.9 });
                      }}
                    >
                      Download .md
                    </button>
                    <ActionButton icon={Download} onClick={onExport}>
                      Download report
                    </ActionButton>
                  </div>
                </div>
              )}
              <ActionButton icon={exported ? Check : Download} onClick={onExport}>
                {exported ? "Report exported" : "Export project report"}
              </ActionButton>
            </div>
          </div>
        </section>
      </div>
      <div className="report-history-strip">
        <div>
          <FileCheck2 size={15} />
          <span>
            <strong>Export control</strong>{" "}
            Project-scoped summaries only
          </span>
        </div>
        <div>
          <Database size={15} />
          <span>
            <strong>Source</strong>{" "}
            {dataset.name} / {baselineName}
          </span>
        </div>
        <div>
          <ShieldCheck size={15} />
          <span>
            <strong>Privacy</strong>{" "}
            No cross-workspace data
          </span>
        </div>
      </div>
    </div>
  );
}
