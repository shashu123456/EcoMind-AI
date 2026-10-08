import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, Building2,
  CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDot, Clock3, CloudUpload,
  Cpu, Database, DatabaseZap, Download, Eye, Factory, FileCheck2, FileClock, FileText, Filter,
  Gauge, HardDrive, History, Info, Layers3, Leaf, Lightbulb, ListFilter, LockKeyhole, Mail, Moon, MousePointer2, Network,
  PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, Sun, Table2, TrendingDown, TrendingUp, UploadCloud, UserRound,
  WandSparkles, Warehouse, X, Zap
} from "lucide-react";
import { EcoMindMark } from "@/components/icons/EcoMindMark";
import { useTheme } from "@/contexts/ThemeContext";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import "./AppShell.css";
import { useSound } from "@/lib/useSound";
import { auth, getToken } from "@/lib/api";
import {
  loadWorkspace, runPipeline,
  type LiveWorkspace, type LiveDataset, type LiveIssue, type LiveModel, type LivePoint,
  type LiveAnomalyPoint, type LiveAnomaly, type LiveForecastPoint, type LiveRec, type LiveActivity,
} from "@/lib/workspace";
import { Snowflake, Thermometer, Waves, ArrowUpDown, Cog } from "lucide-react";

type NavId = "overview" | "library" | "import" | "schema" | "quality" | "transform" | "models" | "anomalies" | "prediction" | "recommendations" | "reports" | "history" | "notifications" | "settings";
type DatasetDomain = "building" | "industry" | "logistics";
type Dataset = { id: string; name: string; domain: DatasetDomain; type: string; detail: string; rows: string; freshness: string; health: string; accent: string; icon: LucideIcon; location: string; unitSystem: "metric-india" | "metric-eu" };
type MeterFamily = "motor" | "hvac" | "lighting" | "compressor" | "conveyor" | "coldroom" | "chiller" | "lift" | "pump" | "utility";
type DatasetField = { name: string; family: MeterFamily; unit: string; role: string; onboarded: boolean };

let datasets: Dataset[] = [
  { id: "BLDG-042", name: "Northstar Campus", domain: "building", type: "Commercial building", detail: "Energy + occupancy telemetry", rows: "2.4M", freshness: "18 min ago", health: "98.7%", accent: "lime", icon: Building2, location: "Bengaluru · IN", unitSystem: "metric-india" },
  { id: "IND-017", name: "Riverton Works", domain: "industry", type: "Industrial plant", detail: "Production line + utility loads", rows: "841K", freshness: "2 hr ago", health: "94.1%", accent: "orange", icon: Factory, location: "Pune · IN", unitSystem: "metric-india" },
  { id: "WH-008", name: "Aster Logistics", domain: "logistics", type: "Distribution center", detail: "HVAC + cold-chain meters", rows: "6.8M", freshness: "Yesterday", health: "99.2%", accent: "violet", icon: Warehouse, location: "Hyderabad · IN", unitSystem: "metric-india" },
];

const domainMeta: Record<DatasetDomain, { label: string; sub: string; matchStrength: string; scene: string; icon: LucideIcon; accent: string; fmt: string; cadence: string; anchor: string }> = {
  building: { label: "Commercial building", sub: "Energy + occupancy telemetry", matchStrength: "98.7%", scene: "Meter rooms, tenant zones, BMS feeds", icon: Building2, accent: "lime", fmt: "kWh / m² · INR · kgCO₂", cadence: "10-minute", anchor: "floor level" },
  industry: { label: "Industrial plant", sub: "Production line + utility loads", matchStrength: "97.4%", scene: "Motors, chillers, compressors, shift cadence", icon: Factory, accent: "orange", fmt: "kWh / tonne · INR · kgCO₂", cadence: "5-minute", anchor: "machine group" },
  logistics: { label: "Distribution center", sub: "HVAC + cold-chain meters", matchStrength: "99.1%", scene: "Dock doors, cold rooms, conveyor banks", icon: Warehouse, accent: "violet", fmt: "kWh / pallet · INR · kgCO₂", cadence: "15-minute", anchor: "door / zone" },
};

const defaultFieldsByDomain: Record<DatasetDomain, DatasetField[]> = {
  building: [
    { name: "meter_kw", family: "utility", unit: "kW", role: "primary load", onboarded: true },
    { name: "hvac_kw", family: "hvac", unit: "kW", role: "hvac load", onboarded: true },
    { name: "lighting_kw", family: "lighting", unit: "kW", role: "lighting load", onboarded: true },
    { name: "occupancy", family: "utility", unit: "people", role: "context", onboarded: true },
    { name: "co2_kg", family: "utility", unit: "kgCO₂", role: "derived emissions", onboarded: true },
    { name: "zone_id", family: "utility", unit: "id", role: "entity", onboarded: true },
  ],
  industry: [
    { name: "motor_kw", family: "motor", unit: "kW", role: "primary load", onboarded: true },
    { name: "compressor_kw", family: "compressor", unit: "kW", role: "compressed air", onboarded: true },
    { name: "chiller_kw", family: "chiller", unit: "kW", role: "cooling load", onboarded: true },
    { name: "conveyor_kw", family: "conveyor", unit: "kW", role: "line load", onboarded: true },
    { name: "shift_id", family: "utility", unit: "id", role: "context", onboarded: true },
    { name: "tonnes", family: "utility", unit: "t", role: "production volume", onboarded: true },
  ],
  logistics: [
    { name: "coldroom_kw", family: "coldroom", unit: "kW", role: "cold chain", onboarded: true },
    { name: "dock_kw", family: "utility", unit: "kW", role: "dock load", onboarded: true },
    { name: "conveyor_kw", family: "conveyor", unit: "kW", role: "sorting load", onboarded: true },
    { name: "hvac_kw", family: "hvac", unit: "kW", role: "ambient hvac", onboarded: true },
    { name: "pallets", family: "utility", unit: "palettes", role: "throughput", onboarded: true },
    { name: "zone_id", family: "utility", unit: "id", role: "entity", onboarded: true },
  ],
};

const navSections: { label: string; items: { id: NavId; label: string; icon: LucideIcon; status?: string }[] }[] = [
  { label: "Workspace", items: [{ id: "overview", label: "Mission control", icon: Gauge }, { id: "library", label: "Dataset library", icon: Layers3, status: "3" }, { id: "import", label: "Import dataset", icon: UploadCloud }] },
  { label: "Understand", items: [{ id: "schema", label: "Schema discovery", icon: Network }, { id: "quality", label: "Data quality", icon: ShieldCheck, status: "19" }, { id: "transform", label: "Transformation", icon: WandSparkles }] },
  { label: "Analyze", items: [{ id: "models", label: "Model competition", icon: Cpu }, { id: "anomalies", label: "Anomaly detection", icon: AlertTriangle, status: "7" }, { id: "prediction", label: "Prediction", icon: TrendingUp }, { id: "recommendations", label: "Recommendations", icon: Lightbulb, status: "4" }, { id: "reports", label: "Reports", icon: FileText }] },
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

let energyData: LivePoint[] = [
  { time: "00:00", energy: 38, baseline: 36 },
  { time: "04:00", energy: 33, baseline: 35 },
  { time: "08:00", energy: 61, baseline: 56 },
  { time: "12:00", energy: 73, baseline: 68 },
  { time: "16:00", energy: 67, baseline: 64 },
  { time: "20:00", energy: 49, baseline: 47 },
  { time: "24:00", energy: 42, baseline: 39 },
];

let forecastData: LiveForecastPoint[] = [
  { day: "08 Oct", actual: 72, forecast: 72, low: 67, high: 78 },
  { day: "09 Oct", actual: 66, forecast: 66, low: 61, high: 72 },
  { day: "10 Oct", actual: 71, forecast: 71, low: 64, high: 77 },
  { day: "11 Oct", actual: null, forecast: 76, low: 69, high: 83 },
  { day: "12 Oct", actual: null, forecast: 74, low: 67, high: 81 },
  { day: "13 Oct", actual: null, forecast: 69, low: 62, high: 76 },
  { day: "14 Oct", actual: null, forecast: 64, low: 58, high: 71 },
];

let qualityIssues: LiveIssue[] = [
  { id: "Q-1024", type: "Null value", field: "meter_kw", row: "18,204", raw: "—", context: "meter_kw at 18:00 is 42.8 kW", fixed: "42.8", confidence: "99.8%" },
  { id: "Q-1025", type: "Missing timestamp", field: "timestamp", row: "18,205", raw: "2026-10-06 18:10 → —", context: "Cadence inferred from adjacent rows", fixed: "2026-10-06 18:20", confidence: "98.4%" },
  { id: "Q-1026", type: "Duplicate", field: "event_id", row: "31,990", raw: "evt_9f12", context: "Duplicate of row 31,989", fixed: "Removed in v1.4", confidence: "100%" },
  { id: "Q-1027", type: "Datatype mismatch", field: "occupancy", row: "42,116", raw: '"n/a"', context: "Occupancy schema expects integer", fixed: "0", confidence: "97.1%" },
  { id: "Q-1028", type: "Invalid value", field: "co2_kg", row: "52,881", raw: "-18.4", context: "Negative emissions are not valid", fixed: "18.4", confidence: "96.6%" },
];

let modelData: LiveModel[] = [
  { name: "Gradient Boost", short: "GB", mae: 4.82, rmse: 7.31, r2: 0.94, color: "#b6f36b" },
  { name: "XGBoost", short: "XGB", mae: 5.14, rmse: 7.92, r2: 0.92, color: "#79d6c4" },
  { name: "Random Forest", short: "RF", mae: 5.78, rmse: 8.46, r2: 0.90, color: "#8d86ff" },
  { name: "Prophet", short: "PRO", mae: 7.12, rmse: 10.11, r2: 0.84, color: "#f5a56d" },
];

let anomalyData: LiveAnomalyPoint[] = [
  { time: "00:00", actual: 38, baseline: 36, anomaly: null },
  { time: "04:00", actual: 33, baseline: 35, anomaly: null },
  { time: "08:00", actual: 61, baseline: 56, anomaly: null },
  { time: "10:00", actual: 81, baseline: 60, anomaly: 81 },
  { time: "12:00", actual: 73, baseline: 68, anomaly: null },
  { time: "14:00", actual: 94, baseline: 66, anomaly: 94 },
  { time: "16:00", actual: 67, baseline: 64, anomaly: null },
  { time: "20:00", actual: 49, baseline: 47, anomaly: null },
  { time: "24:00", actual: 42, baseline: 39, anomaly: null },
];

let anomalies: LiveAnomaly[] = [
  { id: "AN-2048", severity: "Critical", type: "Load spike", timestamp: "06 Oct · 14:10", feature: "meter_kw", reason: "+42% above seasonal baseline", color: "coral" },
  { id: "AN-2047", severity: "High", type: "After-hours load", timestamp: "06 Oct · 10:24", feature: "hvac_kw", reason: "Occupancy signal at 0; HVAC remains active", color: "orange" },
  { id: "AN-2041", severity: "Medium", type: "Drift", timestamp: "05 Oct · 21:06", feature: "co2_kg", reason: "Baseline drift across 4 consecutive windows", color: "yellow" },
  { id: "AN-2033", severity: "Low", type: "Gap", timestamp: "05 Oct · 03:12", feature: "timestamp", reason: "10-minute telemetry gap detected", color: "blue" },
];

let recommendations: LiveRec[] = [
  { priority: "01", title: "Schedule a 30-minute HVAC setback", body: "The 14:00 load spike repeats on 4 of the last 7 days. Shift pre-cooling to 13:30 and cap zone 3 to 72%.", impact: "Save ~₹18,400 / mo", confidence: "94%", color: "lime" },
  { priority: "02", title: "Inspect chiller loop 02", body: "After-hours load is 17% above the learned occupancy baseline. A valve inspection is recommended before the next peak window.", impact: "Avoid 1.2 tCO₂ / mo", confidence: "89%", color: "orange" },
  { priority: "03", title: "Move the peak tariff window", body: "Your load forecast shows a 16:00–18:00 crest. Consider shifting batch processing to 11:00 while the tariff is lower.", impact: "Save ~₹9,600 / mo", confidence: "86%", color: "violet" },
];

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
  history: { kicker: "System / Run history", title: "Every run, versioned.", description: "Traceable pipeline operations for Northstar Campus." },
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
  const [email, setEmail] = useState("analyst@northstar.energy");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const signinSound = useSound({ onPlay: () => {} });
  const submit = async (fallbackRegister = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const pass = password || "Passw0rd!";
    try {
      try {
        await auth.login(email, pass);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (!fallbackRegister && (status === 401 || status === 400 || status === 404)) {
          await auth.register(email, pass, email.split("@")[0] || "Analyst");
        } else if (!fallbackRegister) {
          throw err;
        } else {
          await auth.register(email, pass, email.split("@")[0] || "Analyst");
        }
      }
      signinSound.play({ volume: 0.2, rate: 1.1 });
      onEnter();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Check the API is running.");
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
          <span>Northstar Campus / workspace preview</span>
          <span>Build 1.4.0</span>
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
              void submit(false);
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
              <label className="signin-check">
                <input type="checkbox" defaultChecked />
                {" "}
                <span>Remember this device</span>
              </label>
              <button type="button">Forgot password?</button>
            </div>
            {error ? <p className="signin-error">{error}</p> : null}
            <button className="signin-submit" type="submit" disabled={busy}>
              <span>{busy ? "Connecting…" : "Enter workspace"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="signin-divider">
            <span>or continue with</span>
          </div>
          <button
            className="sso-button"
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            <span className="sso-button__glyph">N</span>{" "}
            Continue with Northstar SSO
          </button>
          <p className="signin-legal">
            By continuing, you agree to the workspace security policy.<br />
            Your data remains scoped to this project.
          </p>
        </div>
        <div className="signin-card__meta">
          <span>
            <LockKeyhole size={12} />
            SOC2-ready workspace controls
          </span>
          <span>
            <ShieldCheck size={12} />
            Human-in-the-loop by default
          </span>
        </div>
      </div>
    </div>
  );
}

function fieldIconFor(family: MeterFamily): LucideIcon {
  if (family === "motor") return Cpu;
  if (family === "hvac") return Activity;
  if (family === "lighting") return Lightbulb;
  if (family === "compressor") return Cog;
  if (family === "conveyor") return Warehouse;
  if (family === "coldroom") return Snowflake;
  if (family === "chiller") return Thermometer;
  if (family === "lift") return ArrowUpDown;
  if (family === "pump") return Waves;
  return Zap;
}

function datasetDomainIcon(domain: DatasetDomain): LucideIcon {
  if (domain === "industry") return Factory;
  if (domain === "logistics") return Warehouse;
  return Building2;
}

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const sound = useSound({ onPlay: () => {} });
  const [signedIn, setSignedIn] = useState(false);
  const [activeView, setActiveView] = useState<NavId>("overview");
  const [activeDataset, setActiveDataset] = useState<Dataset>(datasets[0]);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [scanRunning, setScanRunning] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState("northstar-campus-oct.csv");
  const [uploadDomain, setUploadDomain] = useState<DatasetDomain>("building");
  const [qualityFilter, setQualityFilter] = useState("All issues");
  const [qualityRepaired, setQualityRepaired] = useState(false);
  const [versionSaved, setVersionSaved] = useState(false);
  const [enabledTransforms, setEnabledTransforms] = useState(["resample", "normalize", "baseline"]);
  const [selectedModel, setSelectedModel] = useState("Gradient Boost");
  const [anomalyWindow, setAnomalyWindow] = useState("24H");
  const [forecastWindow, setForecastWindow] = useState("7 days");
  const [reportDraft, setReportDraft] = useState<string | null>(null);
  const [reportExported, setReportExported] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<(typeof anomalies)[number] | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalPaused, setTerminalPaused] = useState(false);
  const [workspace, setWorkspace] = useState<LiveWorkspace | null>(null);
  const isDark = theme === "dark";
  const filteredQuality = qualityIssues.filter(
    issue => qualityFilter === "All issues" || issue.type === qualityFilter
  );
  const domainInfo = useMemo(() => domainMeta[activeDataset.domain] ?? domainMeta.building, [activeDataset.domain]);
  const baselineName = useMemo(() => workspace?.baselineLabel ?? "Baseline v1", [workspace]);
  const modelName = useMemo(() => workspace?.modelName || selectedModel, [workspace, selectedModel]);

  useEffect(() => {
    if (!signedIn && getToken()) setSignedIn(true);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const apply = (loaded: LiveWorkspace) => {
      if (loaded.datasets.length) datasets = loaded.datasets;
      if (loaded.energy) energyData = loaded.energy;
      if (loaded.forecast) forecastData = loaded.forecast;
      if (loaded.quality) qualityIssues = loaded.quality;
      if (loaded.models) modelData = loaded.models;
      if (loaded.anomalyPoints) anomalyData = loaded.anomalyPoints;
      if (loaded.anomalies) anomalies = loaded.anomalies;
      if (loaded.recs) recommendations = loaded.recs;
      if (loaded.activity?.length) activityEvents = loaded.activity;
      navSections.forEach(section =>
        section.items.forEach(item => {
          if (item.id === "library") item.status = String(datasets.length);
          else if (item.id === "quality") item.status = String(qualityIssues.length);
          else if (item.id === "anomalies") item.status = String(anomalies.length);
          else if (item.id === "recommendations") item.status = String(recommendations.length);
        })
      );
      setActiveDataset(prev => datasets.find(d => d.id === prev.id) ?? datasets[0]);
      setWorkspace(loaded);
    };
    (async () => {
      const res = await loadWorkspace();
      if (cancelled) return;
      if (!res) {
        if (!getToken()) setSignedIn(false);
        else setWorkspace(null);
        return;
      }
      apply(res.workspace);
      if (res.pendingRun) {
        setToast("No completed run for this dataset — executing pipeline stages.");
        try {
          await runPipeline(res.pendingRun, key => {
            if (!cancelled) setToast(`Stage “${key}” complete.`);
          });
          const again = await loadWorkspace();
          if (!cancelled && again) apply(again.workspace);
        } catch {
          if (!cancelled) setToast("Pipeline run failed — showing recorded backend data.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  useEffect(() => {
    if (!scanRunning) return;
    const timer = window.setInterval(() => {
      setScanStage(current => {
        if (current >= 3) {
          window.clearInterval(timer);
          setScanRunning(false);
          setToast(`${uploadDomain === "building" ? "Commercial building" : uploadDomain === "industry" ? "Industrial plant" : "Distribution center"} dataset classified.`);
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

  useEffect(() => {
    if (!reportDraft) return;
    const timer = window.setTimeout(() => setReportDraft(null), 8000);
    return () => window.clearTimeout(timer);
  }, [reportDraft]);

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
    setToast("Upload accepted. AI preflight is starting.");
    sound.play({ volume: 0.16, rate: 0.95 });
  };

  const renderView = () => {
    switch (activeView) {
      case "library":
        return (
          <LibraryView
            activeDataset={activeDataset}
            onSelect={dataset => {
              setActiveDataset(dataset);
              setToast(`${dataset.name} is now the active dataset.`);
              sound.play({ volume: 0.14, rate: 0.9 });
            }}
            onImport={() => goTo("import")}
          />
        );
      case "import":
        return (
          <ImportView
            scanRunning={scanRunning}
            scanStage={scanStage}
            fileName={uploadedFileName}
            uploadDomain={uploadDomain}
            onDomainChange={setUploadDomain}
            onScan={handleScan}
            onContinue={() => goTo("schema")}
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
            filter={qualityFilter}
            setFilter={setQualityFilter}
            filteredQuality={filteredQuality}
            repaired={qualityRepaired}
            onRepair={() => {
              setQualityRepaired(true);
              setToast("19 repair candidates resolved. Source v1.3 remains unchanged.");
              sound.play({ volume: 0.18, rate: 1.0 });
            }}
            saved={versionSaved}
            onSave={() => {
              setVersionSaved(true);
              setToast("Clean dataset saved as database version v1.4.");
              sound.play({ volume: 0.2, rate: 1.1 });
            }}
          />
        );
      case "transform":
        return (
          <TransformView
            enabled={enabledTransforms}
            setEnabled={setEnabledTransforms}
            onRun={() => {
              setToast("Transformation graph executed and indexed as v1.5.");
              sound.play({ volume: 0.2, rate: 1.15 });
            }}
            dataset={activeDataset}
            baselineName={baselineName}
          />
        );
      case "models":
        return <ModelsView selectedModel={selectedModel} setSelectedModel={setSelectedModel} />;
      case "anomalies":
        return (
          <AnomaliesView
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
            onDraft={() => {
              setReportDraft(
                `EcoMind AI — ${activeDataset.name}\n\nProject summary\nDataset: ${activeDataset.name} / ${activeDataset.id}\nDomain: ${domainInfo.label}\nVersion: v1.5 transformed\nModel: ${modelName} / R² 0.94\n\nAnalytics\nForecast: 4,812 kWh next 7 days\nEstimated cost: ₹68,420\nCO₂e: 1.82 t\n\nAnomalies\n7 detected; 2 high priority\n\nRecommendations\n4 ranked operating actions\n`
              );
              sound.play({ volume: 0.16, rate: 1.0 });
            }}
            onExport={() => {
              const report = reportDraft ?? "";
              if (!report) return;
              const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `ecomind-${activeDataset.id.toLowerCase()}-report.txt`;
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 0);
              setReportExported(true);
              setReportDraft(null);
              setToast("Project report exported with scoped analysis sections only.");
              sound.play({ volume: 0.22, rate: 1.15 });
            }}
            dataset={activeDataset}
            domainInfo={domainInfo}
            baselineName={baselineName}
            modelName={modelName}
          />
        );
      case "history":
        return <EmptySystemView icon={FileClock} title="Run history is ready." description="Every pipeline version, model decision, and export is captured here as your workspace grows." />;
      case "notifications":
        return <EmptySystemView icon={Bell} title="No unread alerts." description="High-value events from Northstar Campus will appear here with the evidence that triggered them." />;
      case "settings":
        return <EmptySystemView icon={Settings2} title="Workspace settings." description="Defaults for data retention, baseline refresh, and report visibility live here." />;
      default:
        return <OverviewView onNavigate={goTo} activeDataset={activeDataset} domainInfo={domainInfo} />;
    }
  };

  return (
    <div
      className={`eco-app ${isDark ? "eco-app--dark" : "eco-app--light"} ${sidebarExpanded ? "eco-app--nav-open" : "eco-app--nav-closed"}`}
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
          <div className="workspace-select__mark">NC</div>
          <div>
            <span className="workspace-select__label">Workspace</span>
            <strong>Northstar Campus</strong>
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
          <span>Northstar Campus</span>
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
            <span className="avatar">AK</span>
            <span className="profile-button__name">Aarav Khanna</span>
            <AppIcon icon={ChevronDown} size={13} />
          </button>
          {notificationsOpen ? (
            <div className="popover popover--notifications">
              <div className="popover__head">
                <strong>Attention queue</strong>
                <TinyTag tone="coral">4 open</TinyTag>
              </div>
              <div className="popover-row">
                <span className="status-dot status-dot--coral" />
                <div>
                  <strong>Load spike detected</strong>
                  <span>06 Oct · 14:10 / meter_kw</span>
                </div>
              </div>
              <div className="popover-row">
                <span className="status-dot status-dot--orange" />
                <div>
                  <strong>HVAC after-hours load</strong>
                  <span>06 Oct · 10:24 / hvac_kw</span>
                </div>
              </div>
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
                <span className="avatar avatar--large">AK</span>
                <div>
                  <strong>Aarav Khanna</strong>
                  <span>Energy operations / Admin</span>
                </div>
              </div>
              <button type="button" onClick={() => goTo("settings")}>
                <Settings2 size={14} />{" "}
                Workspace settings
              </button>
              <button type="button">
                <UserRound size={14} />{" "}
                Account preferences
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
            <strong>{baselineName}</strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">MODEL</span>
            <strong>{modelName}</strong>
          </span>
          <span className="context-strip__item">
            <span className="context-strip__label">WINDOW</span>
            <strong>01–07 Oct 2026</strong>
          </span>
          <span className="context-strip__item context-strip__item--status">
            <span className="context-strip__label">SYNC</span>
            <strong>
              <span className="status-dot status-dot--lime" />
              18 min ago
            </strong>
          </span>
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
              <span className="mono-note">v1.4 / {domainInfo.accent} domain</span>
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
      <InspectorDrawer anomaly={selectedAnomaly} onClose={() => setSelectedAnomaly(null)} />
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

let activityEvents: LiveActivity[] = [
  { time: "08:44:21", status: "STREAM", service: "forecast-engine", operation: "Prediction generated", duration: "1.8s", result: "4,812 kWh / 7d", severity: "info" },
  { time: "08:43:58", status: "DONE", service: "recommendation-ai", operation: "Recommendation generated", duration: "2.4s", result: "4 actions ranked", severity: "success" },
  { time: "08:42:12", status: "DONE", service: "schema-engine", operation: "Database index committed", duration: "0.6s", result: "42 fields / 5 joins", severity: "success" },
  { time: "08:41:46", status: "WARN", service: "quality-engine", operation: "Repair candidates found", duration: "3.1s", result: "19 rows / 5 rules", severity: "warning" },
  { time: "08:38:03", status: "DONE", service: "model-lab", operation: "Gradient Boost promoted", duration: "11.7s", result: "R² 0.94 / MAE 4.82", severity: "success" },
];

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
  const live = activityEvents[cursor % activityEvents.length];
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
          <div className="activity-terminal__row activity-terminal__row--live">
            <span>{live.time}</span>
            <span>
              <i className="terminal-live-dot" />
              {live.status}
            </span>
            <span>{live.service}</span>
            <strong>{live.operation}</strong>
            <span>{live.duration}</span>
            <span>{live.result}</span>
            <TinyTag
              tone={live.severity === "warning" ? "orange" : live.severity === "success" ? "lime" : "blue"}
            >
              {live.severity}
            </TinyTag>
          </div>
          <div className="activity-terminal__row">
            <span>08:35:28</span>
            <span>
              <i className="terminal-done-dot" />
              DONE
            </span>
            <span>anomaly-engine</span>
            <strong>Evidence window indexed</strong>
            <span>0.9s</span>
            <span>7 anomalies / 2 priority</span>
            <TinyTag tone="coral">review</TinyTag>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InspectorDrawer({
  anomaly,
  onClose,
}: {
  anomaly: (typeof anomalies)[number] | null;
  onClose: () => void;
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
              <span>ENERGY IMPACT</span>
              <strong>+42%</strong>
              <small>above baseline</small>
            </div>
            <div>
              <span>COST IMPACT</span>
              <strong>₹4,820</strong>
              <small>estimated / month</small>
            </div>
            <div>
              <span>CO₂ IMPACT</span>
              <strong>+180 kg</strong>
              <small>estimated / month</small>
            </div>
            <div>
              <span>CONFIDENCE</span>
              <strong>96.2%</strong>
              <small>evidence score</small>
            </div>
          </div>
          <div className="inspector-evidence">
            <div>
              <span className="section-eyebrow">TECHNICAL EVIDENCE</span>
              <code>feature = {anomaly.feature}</code>
              <code>reason = {anomaly.reason}</code>
              <code>baseline = {anomaly.id.includes("2048") ? "northstar_v1.3" : "northstar_v1.3"}</code>
              <code>source = quality_v1.4</code>
            </div>
          </div>
          <div className="inspector-actions">
            <button
              type="button"
              className="action-button action-button--secondary"
              onClick={() => {
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
}: {
  onNavigate: (view: NavId) => void;
  activeDataset: Dataset;
  domainInfo: (typeof domainMeta)[DatasetDomain];
}) {
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
              10 stages orchestrated
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
            <strong>98.7%</strong>
            <small>confidence</small>
          </div>
          <div className="hero-visual-label hero-visual-label--top">
            <span className="status-dot status-dot--lime" />
            LIVE PIPELINE <strong>10 / 10</strong>
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
          <span className="mono-note">RUN ID / eco_2026_10_07_042</span>
        </div>
        <div className="pipeline-rail">
          {pipelineStages.map(stage => {
            const Icon = stage.icon;
            return (
              <button
                type="button"
                className="pipeline-stage"
                key={stage.id}
                onClick={() => onNavigate(stage.id)}
              >
                <span className="pipeline-stage__node">
                  <Icon size={15} />
                </span>
                <span className="pipeline-stage__num">{stage.short}</span>
                <strong>{stage.label}</strong>
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
                <span className="mono-note">INGESTED 06 OCT 2026</span>
                <TinyTag tone={activeDataset.accent}>AI CLASSIFIED</TinyTag>
              </div>
              <strong>{activeDataset.detail}</strong>
              <span>
                {activeDataset.rows} rows · 42 fields · {activeDataset.freshness} freshness
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
              <span>ENERGY LOAD / LAST 24H</span>
              <strong>1,248 kWh <em>−6.2%</em></strong>
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
          </div>
        </section>
        <section className="panel panel--health">
          <SectionHeading
            eyebrow="PIPELINE HEALTH"
            title="Everything is moving."
            action={
              <button className="icon-button icon-button--small" type="button" aria-label="Refresh pipeline">
                <RefreshCw size={14} />
              </button>
            }
          />
          <div className="health-score">
            <div className="health-score__ring">
              <span>94</span>
              <small>health</small>
            </div>
            <div>
              <strong>Good to model</strong>
              <p>2 quality checks need attention before the next run.</p>
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
            <div>
              <span>
                <span className="status-dot status-dot--lime" />
                Schema
              </span>
              <strong>Complete</strong>
            </div>
            <div>
              <span>
                <span className="status-dot status-dot--lime" />
                Quality
              </span>
              <strong>94 / 100</strong>
            </div>
            <div>
              <span>
                <span className="status-dot status-dot--orange" />
                Transform
              </span>
              <strong>Ready</strong>
            </div>
            <div>
              <span>
                <span className="status-dot status-dot--violet" />
                Model
              </span>
              <strong>Selected</strong>
            </div>
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
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--lime">
                <DatabaseZap size={14} />
              </span>
              <div>
                <strong>Indexed schema relationships</strong>
                <span>Schema discovery · 08:42:12</span>
              </div>
              <TinyTag tone="lime">DONE</TinyTag>
            </div>
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--blue">
                <ShieldCheck size={14} />
              </span>
              <div>
                <strong>Scanned 42 fields for quality</strong>
                <span>Data quality · 08:41:46</span>
              </div>
              <TinyTag tone="blue">19 ISSUES</TinyTag>
            </div>
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--violet">
                <Cpu size={14} />
              </span>
              <div>
                <strong>Gradient Boost promoted</strong>
                <span>Model competition · 08:38:03</span>
              </div>
              <TinyTag tone="violet">R² 0.94</TinyTag>
            </div>
            <div className="operation-row">
              <span className="operation-row__icon operation-row__icon--orange">
                <AlertTriangle size={14} />
              </span>
              <div>
                <strong>Load spike detected at 14:10</strong>
                <span>Anomaly detection · 08:35:28</span>
              </div>
              <TinyTag tone="orange">REVIEW</TinyTag>
            </div>
          </div>
        </section>
        <section className="panel panel--next">
          <div className="next-step-card">
            <div className="next-step-card__top">
              <span className="section-eyebrow">NEXT BEST ACTION</span>
              <TinyTag tone="lime">AI SUGGESTED</TinyTag>
            </div>
            <h3>Review the after-hours HVAC anomaly.</h3>
            <p>
              One anomaly is blocking a higher confidence cost forecast. Inspect the evidence before exporting.
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
          Data synced 18 minutes ago
        </span>
        <span>Original source preserved · Version v1.3</span>
        <span>Workspace: Northstar Campus</span>
      </div>
    </div>
  );
}

function LibraryView({
  activeDataset,
  onSelect,
  onImport,
}: {
  activeDataset: Dataset;
  onSelect: (dataset: Dataset) => void;
  onImport: () => void;
}) {
  const activeDomain = activeDataset.domain;
  const sound = useSound({ onPlay: () => {} });
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
            Filter <span>3</span>
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
            <button
              className={`dataset-card ${active ? "dataset-card--active" : ""}`}
              key={dataset.id}
              type="button"
              onClick={() => onSelect(dataset)}
            >
              <div className={`dataset-card__glow dataset-card__glow--${dataset.accent}`} />
              <div className="dataset-card__head">
                <div className={`dataset-card__icon dataset-card__icon--${dataset.accent}`}>
                  <Icon size={22} />
                </div>
                <div className="dataset-card__head-copy">
                  <span className="mono-note">{dataset.id}</span>
                  <TinyTag
                    tone={dataset.accent === "lime" ? "lime" : dataset.accent === "orange" ? "orange" : "violet"}
                  >
                    AI CLASSIFIED
                  </TinyTag>
                </div>
                <span className="dataset-card__more">···</span>
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
          );
        })}
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
          <span>CSV, Parquet, JSON · up to 5 GB</span>
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
              <strong>42%</strong>
            </div>
            <div>
              <Factory size={16} />
              <span>Industry</span>
              <strong>36%</strong>
            </div>
            <div>
              <Warehouse size={16} />
              <span>Logistics</span>
              <strong>22%</strong>
            </div>
          </div>
        </section>
        <section className="panel panel--source">
          <div className="source-icon">
            <Database size={17} />
          </div>
          <div>
            <span className="section-eyebrow">DATABASE / OBJECT STORE</span>
            <h3>3 analyzed datasets</h3>
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
}: {
  scanRunning: boolean;
  scanStage: number;
  fileName: string;
  uploadDomain: DatasetDomain;
  onDomainChange: (domain: DatasetDomain) => void;
  onScan: (fileName?: string, domain?: DatasetDomain) => void;
  onContinue: () => void;
  onSelectDomain: (domain: DatasetDomain) => void;
}) {
  const [selectedFile, setSelectedFile] = useState("");
  const [hoveredDomain, setHoveredDomain] = useState<DatasetDomain | null>(null);
  const activeFile = selectedFile || fileName;
  const sound = useSound({ onPlay: () => {} });
  const currentDomain = hoveredDomain ?? uploadDomain;
  const domain = domainMeta[currentDomain] ?? domainMeta.building;
  const domains: { id: DatasetDomain; label: string; icon: LucideIcon; accent: string }[] = [
    { id: "building", label: "Buildings", icon: Building2, accent: "lime" },
    { id: "industry", label: "Industry", icon: Factory, accent: "orange" },
    { id: "logistics", label: "Logistics", icon: Warehouse, accent: "violet" },
  ];
  const scanSteps = [
    { title: "Upload accepted", detail: `${activeFile} · 284 MB`, icon: CloudUpload },
    { title: "Scanning data surface", detail: "Reading 2.4M rows and 42 columns", icon: Activity },
    { title: "Detecting metadata", detail: `Timezone, cadence, units, ${domain.label.toLowerCase()}`, icon: WandSparkles },
    { title: "Ready for schema discovery", detail: `${domain.label} / energy telemetry`, icon: CheckCircle2 },
  ];
  const selectFile = (file?: File) => {
    if (!file) return;
    setSelectedFile(file.name);
    onScan(file.name, currentDomain);
    sound.play({ volume: 0.18, rate: 1.0 });
  };
  return (
    <div className="view-content">
      <div className="import-layout">
        <section
          className="import-dropzone"
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            selectFile(event.dataTransfer.files[0]);
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
            accept=".csv,.json,.parquet,.xlsx,.xls"
            onChange={event => selectFile(event.currentTarget.files?.[0])}
          />
          <label className="dropzone-button" htmlFor="ecomind-file-upload">
            <UploadCloud size={17} />
            {scanRunning ? "Processing dataset..." : "Choose a dataset"}
          </label>
          <span className="dropzone-note">
            CSV · JSON · Parquet · Excel <span>or drag and drop</span>
          </span>
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
              <div className="section-eyebrow">AI PREFLIGHT</div>
              <h2>
                {scanRunning ? "Reading the signal..." : scanStage === 3 ? "Dataset is ready." : "Waiting for a dataset."}
              </h2>
            </div>
            <span
              className={`status-badge ${scanRunning ? "status-badge--processing" : scanStage === 3 ? "status-badge--done" : ""}`}
            >
              <span className="status-dot status-dot--lime" />
              {scanRunning ? "PROCESSING" : scanStage === 3 ? "COMPLETE" : "STANDBY"}
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
                <span>· {domain.matchStrength} confidence</span>
              </p>
            </div>
          </div>
          {scanStage === 3 ? (
            <ActionButton icon={ArrowRight} onClick={onContinue}>
              Continue to schema discovery
            </ActionButton>
          ) : (
            <button
              className="scan-demo-button"
              type="button"
              onClick={() => onScan(activeFile, currentDomain)}
            >
              {scanRunning ? "AI is processing this dataset" : "Run AI preflight"}
              <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
      <div className="import-domain-picker">
        <span className="section-eyebrow">ADAPTIVE DOMAIN PREVIEW</span>
        <h2>Which signal is this?</h2>
        <p>
          EcoMind inspects the first rows and adjusts the import visuals, meter families, and baseline template
          to match the domain.
        </p>
        <div className="domain-selector">
          {domains.map(domain => {
            const DomainIcon = domain.icon;
            const active = uploadDomain === domain.id;
            const hover = hoveredDomain === domain.id;
            return (
              <button
                key={domain.id}
                type="button"
                className={`domain-card ${active ? "domain-card--active" : ""} ${hover ? "domain-card--hover" : ""}`}
                onMouseEnter={() => {
                  setHoveredDomain(domain.id);
                  sound.play({ volume: 0.08, rate: 0.9 });
                }}
                onMouseLeave={() => setHoveredDomain(null)}
                onClick={() => {
                  onSelectDomain(domain.id);
                  onDomainChange(domain.id);
                  setHoveredDomain(null);
                  sound.play({ volume: 0.12, rate: 1.0 });
                }}
              >
                <div className={`domain-card__icon domain-card__icon--${domain.accent}`}>
                  <DomainIcon size={20} />
                </div>
                <strong>{domain.label}</strong>
                <span>{domainMeta[domain.id].scene}</span>
                <span className={`domain-card__badge domain-card__badge--${domain.accent}`}>
                  {domainMeta[domain.id].matchStrength}
                </span>
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

function SchemaView({ dataset }: { dataset: Dataset }) {
  const fields = [
    { name: "timestamp", type: "datetime", role: "index", icon: CalendarClock },
    { name: "meter_kw", type: "float", role: "signal", icon: Zap },
    { name: "occupancy", type: "integer", role: "context", icon: UserRound },
    { name: "hvac_kw", type: "float", role: "signal", icon: Activity },
    { name: "co2_kg", type: "float", role: "target", icon: Leaf },
    { name: "zone_id", type: "string", role: "entity", icon: Building2 },
  ];
  const domainFields = defaultFieldsByDomain[dataset.domain] ?? defaultFieldsByDomain.building;
  const domainSignalCount = domainFields.length;
  const summaryField = domainFields[0] ?? fields[1];
  const domainInfo = domainMeta[dataset.domain] ?? domainMeta.building;
  const sound = useSound({ onPlay: () => {} });
  const operations = [
    { label: "Store", detail: "raw/northstar/v1.3", icon: HardDrive, state: "complete" },
    { label: "Load", detail: "2.4M rows / 42 cols", icon: Database, state: "complete" },
    { label: "Index", detail: "timestamp + zone_id", icon: DatabaseZap, state: "complete" },
    { label: "Retrieve", detail: "query plan ready", icon: Eye, state: "live" },
  ];
  return (
    <div className="view-content">
      <div className="schema-summary-row">
        <div className="schema-summary-card">
          <span className="section-eyebrow">AI UNDERSTANDING</span>
          <strong>6 entity groups</strong>
          <span>42 fields mapped · 5 relationships found</span>
        </div>
        <div className="schema-summary-card">
          <span className="section-eyebrow">TEMPORAL GRAIN</span>
          <strong>10 minute cadence</strong>
          <span>2026-09-01 → 2026-10-06 · Asia/Kolkata</span>
        </div>
        <div className="schema-summary-card">
          <span className="section-eyebrow">PRIMARY TARGET</span>
          <strong>{summaryField.name}</strong>
          <span>{summaryField.unit} · {summaryField.role}</span>
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
                      {field.type} · {field.role}
                    </span>
                  </div>
                  <span className={`field-role field-role--${field.role}`}>{field.role}</span>
                  <ChevronRight size={14} />
                </div>
              );
            })}
          </div>
          <div className="schema-field-family-strip">
            <span className="section-eyebrow">METER FAMILIES</span>
            <h3>
              {dataset.domain === "building" ? "Building meter families" : dataset.domain === "industry" ? "Industrial meter families" : "Logistics meter families"}
            </h3>
            <div className="family-mesh">
              {domainFields.slice(0, 5).map(field => {
                const Icon = fieldIconFor(field.family);
                return (
                  <div className="family-node" key={field.name}>
                    <span className="family-node__icon">
                      <Icon size={14} />
                    </span>
                    <span>{field.family}</span>
                    <span className="mono-note">{field.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <button type="button" className="panel-link panel-link--bottom">
            View all 42 fields <ArrowRight size={13} />
          </button>
        </section>
        <section className="panel relationship-panel">
          <SectionHeading
            eyebrow="RELATIONSHIP GRAPH"
            title="How the data connects"
            detail="The schema becomes a queryable map of the operational system."
          />
          <div className="relationship-map">
            <div className="relationship-lines">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="relationship-node relationship-node--root">
              <Database size={17} />
              <strong>northstar_readings</strong>
              <span>2.4M rows</span>
            </div>
            <div className="relationship-node relationship-node--top">
              <Building2 size={15} />
              <strong>building</strong>
              <span>1 entity</span>
            </div>
            <div className="relationship-node relationship-node--left">
              <Activity size={15} />
              <strong>meter</strong>
              <span>42 signals</span>
            </div>
            <div className="relationship-node relationship-node--right">
              <UserRound size={15} />
              <strong>occupancy</strong>
              <span>context</span>
            </div>
            <div className="relationship-node relationship-node--bottom">
              <Leaf size={15} />
              <strong>emissions</strong>
              <span>derived</span>
            </div>
            <div className="relationship-map__legend">
              <span>
                <i className="legend-dot legend-dot--lime" />
                {" "}
                primary table
              </span>
              <span>
                <i className="legend-dot legend-dot--blue" />
                {" "}
                relationship
              </span>
              <span>
                <i className="legend-dot legend-dot--violet" />
                {" "}
                derived
              </span>
            </div>
          </div>
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
            storage path: raw/northstar/v1.3
          </span>
          <span className="mono-note">v1.3 / immutable</span>
        </div>
      </section>
    </div>
  );
}

function QualityView({
  filter,
  setFilter,
  filteredQuality,
  repaired,
  onRepair,
  saved,
  onSave,
}: {
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
  return (
    <div className="view-content">
      <div className="quality-topline">
        <div className="quality-kpis">
          <Metric label="ISSUES" value="19" delta="5 types flagged" accent="coral" />
          <Metric label="REPAIRS" value={repaired ? "19" : "0"} delta={repaired ? "ready to save" : "pending"} direction="up" accent="lime" />
          <Metric label="SOURCE" value="v1.3" delta="preserved" direction="down" accent="blue" />
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
                {item === "Null value" ? "7" : item === "Missing timestamp" ? "4" : item === "Duplicate" ? "3" : item === "Datatype mismatch" ? "3" : "2"}
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
              showing {filteredQuality.length} of 19 flagged rows
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
              <span>repair_context / northstar_v1.3</span>
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
            <span className="mono-note">CONFIDENCE / 98.4%</span>
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
            <TinyTag tone="lime">{repaired ? "v1.4" : "PREVIEW"}</TinyTag>
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
              {saved ? "New version persisted" : "Original v1.3 stays untouched"}
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
              Saving creates <strong>northstar_v1.4</strong>. The raw source remains available as v1.3.
            </span>
          </div>
          <ActionButton icon={DatabaseZap} onClick={onSave} disabled={!repaired}>
            {saved ? "v1.4 saved" : "Save new version"}
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

function TransformView({
  enabled,
  setEnabled,
  onRun,
  dataset,
  baselineName,
}: {
  enabled: string[];
  setEnabled: (steps: string[]) => void;
  onRun: () => void;
  dataset: Dataset;
  baselineName: string;
}) {
  const sound = useSound({ onPlay: () => {} });
  const steps = [
    { id: "resample", label: "Temporal resampling", detail: "10 min → 30 min windows", icon: Clock3, color: "lime" },
    { id: "normalize", label: "Feature normalization", detail: "Robust scale / meter_kw", icon: SlidersHorizontal, color: "blue" },
    { id: "baseline", label: "Seasonal baseline", detail: "weekday + occupancy aware", icon: TrendingUp, color: "violet" },
    { id: "derive", label: "Derived emissions", detail: "kWh × grid factor", icon: Leaf, color: "orange" },
  ];
  const domainInfo = domainMeta[dataset.domain] ?? domainMeta.building;
  return (
    <div className="view-content">
      <div className="transform-banner">
        <div className="transform-banner__icon">
          <WandSparkles size={24} />
        </div>
        <div>
          <span className="section-eyebrow">DATASET-SPECIFIC BASELINE</span>
          <h2>
            {dataset.name} / {domainInfo.label.toLowerCase()} aware
          </h2>
          <p>
            The baseline learns from occupancy, weekday, and local tariff context — not a generic global average.
          </p>
        </div>
        <div className="transform-banner__metric">
          <span>BASELINE FIT</span>
          <strong>0.94 R²</strong>
          <TinyTag tone="lime">SELECTED</TinyTag>
        </div>
      </div>
      <div className="transform-layout">
        <section className="panel transform-steps-panel">
          <SectionHeading
            eyebrow="PROCESSING GRAPH"
            title="Transform in the open"
            detail="Toggle each step and watch the versioned flow."
            action={
              <ActionButton icon={Play} onClick={onRun}>
                Run transform
              </ActionButton>
            }
          />
          <div className="transform-steps">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const active = enabled.includes(step.id);
              return (
                <div
                  className={`transform-step ${active ? "transform-step--active" : ""}`}
                  key={step.id}
                >
                  <span className="transform-step__index">0{index + 1}</span>
                  <span className={`transform-step__icon transform-step__icon--${step.color}`}>
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <button
                    className={`toggle ${active ? "toggle--on" : ""}`}
                    type="button"
                    aria-label={`Toggle ${step.label}`}
                    aria-pressed={active}
                    onClick={() => {
                      setEnabled(active ? enabled.filter(item => item !== step.id) : [...enabled, step.id]);
                      sound.play({ volume: 0.08, rate: 0.9 });
                    }}
                  >
                    <span />
                  </button>
                  {index < steps.length - 1 ? <span className="transform-step__connector" /> : null}
                </div>
              );
            })}
          </div>
          <div className="transform-step-footer">
            <span>
              <DatabaseZap size={13} />{" "}
              output will save as <strong>northstar_v1.5</strong>
            </span>
            <span className="mono-note">{enabled.length} steps / 42 fields</span>
          </div>
        </section>
        <section className="panel transform-chart-panel">
          <SectionHeading
            eyebrow="PREVIEW / MODEL INPUT"
            title="Signal after transformation"
            detail="Baseline and cleaned load, shown together."
          />
          <div className="transform-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={energyData}>
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
                <RechartsTooltip
                  contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
                />
                <Line type="monotone" dataKey="energy" stroke="#b6f36b" strokeWidth={2.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke="#718b7b"
                  strokeDasharray="4 4"
                  strokeWidth={1.4}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            <span>
              <i style={{ background: "#b6f36b" }} />
              {" "}
              transformed load
            </span>
            <span>
              <i style={{ background: "#718b7b" }} />
              {" "}
              learned baseline
            </span>
            <span className="mono-note">kW / 24h</span>
          </div>
        </section>
      </div>
      <div className="database-trace">
        <div className="database-trace__label">
          <Database size={15} />
          <span>VERSIONED DATABASE TRACE</span>
        </div>
        <div className="database-trace__flow">
          <span>v1.4 cleaned</span>
          <ArrowRight size={13} />
          <span className="database-trace__active">v1.5 transformed</span>
          <ArrowRight size={13} />
          <span>model input</span>
        </div>
        <span className="trace-status">
          <span className="status-dot status-dot--lime" />
          ready
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
  return (
    <div className="view-content">
      <div className="models-topline">
        <div className="models-kpis">
          <Metric label="BEST MODEL" value="R² 0.94" delta="+2.1% vs next" accent="lime" />
          <Metric label="ERROR / MAE" value="4.82 kW" delta="−18.4%" direction="down" accent="blue" />
          <Metric label="TRAIN WINDOW" value="35 days" delta="same dataset" direction="down" accent="violet" />
        </div>
        <div className="system-chip">
          <span className="status-dot status-dot--violet" />
          4 models compared
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
                    {index === 0 ? "best fit for current baseline" : "validation candidate"}
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
                {index === 0 ? (
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
            <span>MAE / kW</span>
            <span className="mono-note">VALIDATION / 20%</span>
          </div>
        </section>
      </div>
      <div className="winner-callout">
        <div className="winner-callout__icon">
          <Sparkles size={18} />
        </div>
        <div>
          <span className="section-eyebrow">WHY GRADIENT BOOST</span>
          <h3>Best balance of precision and stability.</h3>
          <p>
            It reduces error by 18.4% over the next model while holding a 0.94 R² across occupancy and after-hours
            slices.
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
}: {
  window: string;
  setWindow: (value: string) => void;
  onInspect: (anomaly: (typeof anomalies)[number]) => void;
  dataset: Dataset;
  baselineName: string;
}) {
  const sound = useSound({ onPlay: () => {} });
  return (
    <div className="view-content">
      <div className="anomaly-topline">
        <div className="quality-kpis">
          <Metric label="ANOMALIES" value="07" delta="2 high priority" accent="coral" />
          <Metric label="BASELINE DRIFT" value="3.2%" delta="within threshold" direction="down" accent="lime" />
          <Metric label="LAST DETECTED" value="14:10" delta="06 Oct 2026" direction="down" accent="orange" />
        </div>
        <div className="segmented-control">
          {["24H", "7D", "30D"].map(item => (
            <button
              type="button"
              className={window === item ? "active" : ""}
              key={item}
              onClick={() => {
                setWindow(item);
                sound.play({ volume: 0.08, rate: 0.9 });
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <section className="panel anomaly-chart-panel">
        <div className="anomaly-chart-head">
          <div>
            <div className="section-eyebrow">DEVIATION FROM BASELINE / {window}</div>
            <h2>Two moments broke the pattern.</h2>
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
          </div>
        </div>
        <div className="anomaly-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={anomalyData} margin={{ top: 16, right: 24, left: -14, bottom: 0 }}>
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
                y={76}
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
          <span>Threshold: +20% over learned baseline</span>
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
            Filter <span>4</span>
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
}) {
  const sound = useSound({ onPlay: () => {} });
  return (
    <div className="view-content">
      <div className="prediction-topline">
        <div className="prediction-kpis">
          <Metric
            label="NEXT 7 DAYS"
            value="4,812 kWh"
            delta="−6.2% vs baseline"
            direction="down"
            accent="lime"
          />
          <Metric
            label="EST. COST"
            value="₹68,420"
            delta="₹4,900 avoided"
            direction="down"
            accent="orange"
          />
          <Metric
            label="CO₂e"
            value="1.82 t"
            delta="−8.4%"
            direction="down"
            accent="blue"
          />
        </div>
        <div className="prediction-actions">
          <div className="segmented-control">
            {["7 days", "30 days", "90 days"].map(item => (
              <button
                type="button"
                className={window === item ? "active" : ""}
                key={item}
                onClick={() => {
                  setWindow(item);
                  sound.play({ volume: 0.08, rate: 0.9 });
                }}
              >
                {item}
              </button>
            ))}
          </div>
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
            <TinyTag tone="violet">R² 0.94</TinyTag>
          </div>
          <div className="prediction-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 14, right: 18, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8d86ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#8d86ff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24342d" strokeDasharray="2 5" vertical={false} />
                <XAxis
                  dataKey="day"
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
                <RechartsTooltip
                  contentStyle={{ background: "#15231b", border: "1px solid #30473a", borderRadius: 8, color: "#eff8f1", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="high" stroke="none" fill="url(#confidenceFill)" />
                <Area type="monotone" dataKey="low" stroke="none" fill="#132119" />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#b6f36b"
                  strokeWidth={2.7}
                  dot={{ fill: "#b6f36b", r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#8d86ff"
                  strokeWidth={2.3}
                  strokeDasharray="5 4"
                  dot={{ fill: "#8d86ff", r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
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
            <span className="mono-note">kWh / day</span>
          </div>
        </section>
        <section className="panel forecast-breakdown">
          <SectionHeading eyebrow="FORECAST BREAKDOWN" title="What moves the number" />
          <div className="forecast-factor">
            <span className="forecast-factor__icon forecast-factor__icon--lime">
              <CalendarClock size={15} />
            </span>
            <div>
              <strong>Operating hours</strong>
              <span>Largest signal / 42% influence</span>
            </div>
            <strong>+18%</strong>
          </div>
          <div className="forecast-factor">
            <span className="forecast-factor__icon forecast-factor__icon--violet">
              <CloudUpload size={15} />
            </span>
            <div>
              <strong>Occupancy profile</strong>
              <span>Current pattern / 28% influence</span>
            </div>
            <strong>−7%</strong>
          </div>
          <div className="forecast-factor">
            <span className="forecast-factor__icon forecast-factor__icon--orange">
              <Zap size={15} />
            </span>
            <div>
              <strong>Tariff window</strong>
              <span>Weekday schedule / 18% influence</span>
            </div>
            <strong>+4%</strong>
          </div>
          <div className="forecast-factor">
            <span className="forecast-factor__icon forecast-factor__icon--blue">
              <Leaf size={15} />
            </span>
            <div>
              <strong>Weather proxy</strong>
              <span>Temperature signal / 12% influence</span>
            </div>
            <strong>−2%</strong>
          </div>
          <div className="forecast-breakdown__note">
            <Sparkles size={14} />
            <span>Forecast is stable across all validation slices.</span>
          </div>
        </section>
      </div>
      <div className="prediction-footnote">
        <span>
          <Info size={14} />{" "}
          Cost uses current tariff schedule · carbon uses regional grid factor
        </span>
        <span className="mono-note">
          GENERATED / 07 OCT 2026 · 08:44
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
  return (
    <div className="view-content">
      <div className="recommendation-banner">
        <div className="recommendation-banner__icon">
          <Lightbulb size={22} />
        </div>
        <div>
          <span className="section-eyebrow">AI ACTION LAYER</span>
          <h2>Four actions are worth your attention.</h2>
          <p>
            Generated from 7 anomalies, the {baselineName} baseline, and the next 7-day forecast.
          </p>
        </div>
        <div className="recommendation-banner__score">
          <span>EXPECTED MONTHLY IMPACT</span>
          <strong>₹28,000</strong>
          <span>+ 1.2 tCO₂ avoided</span>
        </div>
      </div>
      <div className="recommendation-layout">
        <section className="recommendation-list">
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
          <article className="recommendation-card recommendation-card--more">
            <div className="recommendation-card__index">04</div>
            <div>
              <span className="section-eyebrow">LOWER CONFIDENCE</span>
              <h3>Review the 10-minute telemetry gap</h3>
              <p>Low risk, but worth checking before the next model refresh.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                sound.play({ volume: 0.1, rate: 0.95 });
              }}
            >
              <ArrowRight size={15} />
            </button>
          </article>
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
                <strong>94</strong>
                <span>confidence</span>
              </div>
              <div className="evidence-ring__labels">
                <span>
                  <i style={{ background: "#b6f36b" }} />
                  {" "}
                  7 anomalies
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
                {dataset.id.toLowerCase()}_v1.5
              </span>
              <span>
                <Clock3 size={13} />{" "}
                refreshed 18 min ago
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
  onExport,
  dataset,
  domainInfo,
  baselineName,
  modelName,
}: {
  exported: boolean;
  draft: string | null;
  onDraft: () => void;
  onExport: () => void;
  dataset: Dataset;
  domainInfo: (typeof domainMeta)[DatasetDomain];
  baselineName: string;
  modelName: string;
}) {
  const sound = useSound({ onPlay: () => {} });
  const sections = [
    { label: "Project summary", detail: "Scope, dataset, versions, run health", icon: FileText },
    { label: "Analytics", detail: "Model metrics + forecast breakdown", icon: BarChart3 },
    { label: "Anomalies", detail: "7 flagged events with evidence", icon: AlertTriangle },
    { label: "Recommendations", detail: "4 ranked operating actions", icon: Lightbulb },
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
            <span className="mono-note">REPORT / 07 OCT 2026</span>
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
                <strong>v1.5 transformed</strong>
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
            <span>Page 01 / 08</span>
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
              <span className="mono-note">EST. 8 PAGES / 1.2 MB</span>
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
                disabled={!!draft}
              >
                <Sparkles size={14} />
                {" "}
                Preview report
              </button>
              {draft && (
                <div className="report-preview">
                  <div className="report-preview__head">
                    <span className="section-eyebrow">REPORT PREVIEW</span>
                    <h3>Scoped briefing draft</h3>
                    <button
                      type="button"
                      className="report-preview__close"
                      onClick={() => {
                        sound.play({ volume: 0.08, rate: 0.85 });
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <pre className="report-preview__body">{draft}</pre>
                  <div className="report-preview__actions">
                    <button
                      type="button"
                      onClick={() => {
                        sound.play({ volume: 0.1, rate: 0.9 });
                      }}
                    >
                      Edit scope
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
            {dataset.name} / v1.5
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
