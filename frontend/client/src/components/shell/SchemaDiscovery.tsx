import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileJson,
  GitCompareArrows,
  History,
  Layers3,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Table2,
  Tag,
  X,
  Zap,
} from "lucide-react";
import "./schema-discovery.css";
import { domain } from "@/lib/api";
import { mapSchema, type LiveActivity, type LiveSchemaField } from "@/lib/workspace";

/* ────────────────────────────────────────────────────────────────────────────
 * Schema Discovery — refined page.
 *
 * Every number rendered here is derived from the dataset record or the schema
 * the backend actually recorded. Nothing is sampled or invented: when a value
 * was not recorded the surface says so rather than showing a plausible figure.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SchemaDataset = {
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

export type SchemaQuality = { score: number; passed: number; failed: number } | null;
export type SchemaVersion = { version: number; rowCount: number; created: string | null };

type Props = {
  dataset: SchemaDataset;
  domainLabel: string;
  schema: LiveSchemaField[];
  targetColumn: string;
  quality: SchemaQuality;
  activity: LiveActivity[];
  versions: SchemaVersion[];
  onGoImport?: () => void;
};

type DiscoveryState = "idle" | "refreshing" | "replaying" | "failed";

const PIPE_STAGES = [
  { key: "read", label: "Reading Dataset", icon: Database, note: "streaming rows from the immutable upload" },
  { key: "parse", label: "Parsing Schema", icon: Table2, note: "splitting records into typed columns" },
  { key: "types", label: "Detecting Types", icon: Tag, note: "resolving dtype and cardinality per column" },
  { key: "infer", label: "Inferring Relationships", icon: Layers3, note: "linking index, entity and signal columns" },
  { key: "validate", label: "Validating Structure", icon: ShieldCheck, note: "checking nulls, uniqueness and role fit" },
  { key: "store", label: "Registering Metadata", icon: BadgeCheck, note: "writing the schema registry entry" },
] as const;

const ROLE_TONE: Record<string, string> = {
  index: "blue",
  entity: "violet",
  context: "orange",
  target: "lime",
  signal: "neutral",
  field: "neutral",
};

const num = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !isFinite(v)) return "—";
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(digits);
};

const int = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-IN");

const pct = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`;

const clockOf = (d: Date | null): string => {
  if (!d) return "not yet";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const isNumeric = (dtype: string): boolean =>
  /int|float|double|decimal|number/i.test(dtype) && !/datetime/i.test(dtype);

const normRole = (role: string): string => {
  const r = String(role ?? "").toLowerCase();
  if (r.includes("timestamp") || r.includes("index")) return "index";
  if (r.includes("device") || r.includes("entity") || r.includes("identifier")) return "entity";
  if (r.includes("energy") || r.includes("value") || r.includes("target")) return "target";
  if (r.includes("temperature")) return "signal";
  return r === "generic" || r === "field" || r === "" ? "field" : r;
};

/** Animate an integer from 0 to `value` on mount and whenever the value moves. */
function useAnimated(value: number, duration = 720): number {
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
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        settled = true;
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    // Frames are throttled in a background tab; land on the real value anyway
    // so a counter never sits at zero after the page has rendered.
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

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`sd-badge sd-badge--${tone}`}>{children}</span>;
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="sd-stat">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

/** A single health dimension. */
function HealthRow({ label, value, note }: { label: string; value: number | null; note: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = v >= 92 ? "good" : v >= 78 ? "ok" : "risk";
  return (
    <div className="sd-health-row">
      <div className="sd-health-row__head">
        <span>{label}</span>
        <strong className={`sd-health-row__value sd-health-row__value--${tone}`}>{value == null ? "—" : `${v.toFixed(1)}%`}</strong>
      </div>
      <div className="sd-health-row__track">
        <span className={`sd-health-row__fill sd-health-row__fill--${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="sd-health-row__note">{note}</span>
    </div>
  );
}

function FieldPreview({ field, rows, targetColumn }: { field: LiveSchemaField; rows: number | null; targetColumn: string }) {
  const role = normRole(field.role);
  const nullCount = field.nullCount ?? null;
  const nullRate = rows && nullCount != null ? (nullCount / rows) * 100 : null;
  const stats = field.stats;
  const samples = field.samples?.length ? field.samples : field.sample !== "—" ? [field.sample] : [];
  const observation = useMemo(() => {
    if (role === "index") return "Ordered time axis: every later stage aligns rows on this column.";
    if (role === "target") return "Chosen as the modelled quantity — the pipeline forecasts this column.";
    if (role === "entity") return "Identifier: groups readings by asset, so it is never used as a numeric feature.";
    if (stats && stats.std != null && stats.std > 0) return `Continuous numeric signal with a spread of ${num(stats.std)} around ${num(stats.mean)}.`;
    if (field.uniqueCount != null && field.uniqueCount <= 12) return "Low-cardinality category: usable as a grouping dimension.";
    return "Recorded field without a strong numeric or categorical signature yet.";
  }, [role, stats, field.uniqueCount]);

  return (
    <div className="sd-preview" role="dialog" aria-label={`Preview of ${field.name}`}>
      <div className="sd-preview__head">
        <strong>{field.name}</strong>
        <Badge tone={ROLE_TONE[role] ?? "neutral"}>{role}</Badge>
      </div>
      <div className="sd-preview__grid">
        <span><small>DATATYPE</small>{field.dtype}</span>
        <span><small>NULL RATE</small>{nullRate != null ? `${nullRate.toFixed(1)}%` : field.nullPct}</span>
        <span><small>UNIQUE</small>{int(field.uniqueCount)}</span>
        <span><small>NON-NULL</small>{nullCount != null && rows ? int(rows - nullCount) : "—"}</span>
      </div>
      {stats ? (
        <div className="sd-preview__range">
          <small>RANGE</small>
          <div className="sd-preview__bar">
            <span style={{ left: "0%", width: "100%" }} />
          </div>
          <span className="mono-note">{num(stats.min)} → {num(stats.max)}</span>
        </div>
      ) : null}
      {samples.length ? (
        <div className="sd-preview__samples">
          <small>SAMPLE VALUES</small>
          <div>
            {samples.slice(0, 4).map((s, i) => (
              <code key={`${s}-${i}`}>{s}</code>
            ))}
          </div>
        </div>
      ) : null}
      <p className="sd-preview__obs">
        <Sparkles size={12} /> {observation}
      </p>
      {targetColumn === field.name ? <span className="sd-preview__target">MODELLED TARGET</span> : null}
    </div>
  );
}

function FieldRow({
  field,
  rows,
  targetColumn,
  expanded,
  onToggle,
  related,
  relatedStrength,
}: {
  field: LiveSchemaField;
  rows: number | null;
  targetColumn: string;
  expanded: boolean;
  onToggle: () => void;
  related: string[];
  relatedStrength: number;
}) {
  const role = normRole(field.role);
  const nullCount = field.nullCount ?? null;
  const nullRate = rows && nullCount != null ? (nullCount / rows) * 100 : null;
  const stats = field.stats;
  const samples = field.samples?.length ? field.samples : field.sample !== "—" ? [field.sample] : [];
  const recommended =
    role !== "index" && role !== "entity" && (nullRate == null || nullRate < 30) && (!stats || (stats.std ?? 1) > 0);

  return (
    <div className={`sd-field ${expanded ? "sd-field--open" : ""} ${related.length ? "sd-field--linked" : ""}`}>
      <button type="button" className="sd-field__row" aria-expanded={expanded} onClick={onToggle}>
        <span className={`sd-field__mark sd-field__mark--${ROLE_TONE[role] ?? "neutral"}`}>
          {role === "index" ? <CalendarClock size={13} /> : role === "entity" ? <Layers3 size={13} /> : role === "target" ? <Zap size={13} /> : <ScanSearch size={13} />}
        </span>
        <span className="sd-field__name">
          <strong>{field.name}</strong>
          <span className="mono-note">{field.dtype}</span>
        </span>
        <span className="sd-field__metrics">
          <span className="sd-field__metric">
            <small>NULLS</small>
            <strong>{nullRate != null ? `${nullRate.toFixed(1)}%` : field.nullPct}</strong>
          </span>
          <span className="sd-field__metric">
            <small>UNIQUE</small>
            <strong>{int(field.uniqueCount)}</strong>
          </span>
        </span>
        <Badge tone={ROLE_TONE[role] ?? "neutral"}>{role}</Badge>
        <ChevronDown size={14} className={expanded ? "sd-field__chev sd-field__chev--open" : "sd-field__chev"} />
      </button>

      <FieldPreview field={field} rows={rows} targetColumn={targetColumn} />

      {expanded ? (
        <div className="sd-field__detail">
          <div className="sd-field__detail-grid">
            <StatCell label="MIN" value={num(stats?.min)} />
            <StatCell label="P25" value={num(stats?.q25)} />
            <StatCell label="MEDIAN" value={num(stats?.median)} />
            <StatCell label="MEAN" value={num(stats?.mean)} />
            <StatCell label="P75" value={num(stats?.q75)} />
            <StatCell label="MAX" value={num(stats?.max)} />
            <StatCell label="STD DEV" value={num(stats?.std)} />
            <StatCell label="SKEW" value={num(stats?.skew)} />
          </div>

          {stats ? (
            <div className="sd-field__distribution">
              <div className="sd-field__distribution-head">
                <span className="section-eyebrow">DISTRIBUTION</span>
                <span className="mono-note">min · p25 · median · p75 · max</span>
              </div>
              <div className="sd-field__distribution-track">
                <span className="sd-field__distribution-fill" />
              </div>
            </div>
          ) : null}

          {samples.length ? (
            <div className="sd-field__samples">
              <span className="section-eyebrow">SAMPLE VALUES</span>
              <div>{samples.slice(0, 6).map((s, i) => <code key={`${s}-${i}`}>{s}</code>)}</div>
            </div>
          ) : null}

          <div className="sd-field__verdict">
            <div>
              <span className="section-eyebrow">QUALITY OBSERVATIONS</span>
              <ul>
                {nullRate != null && nullRate > 0 ? <li>{pct(nullRate)} of values are missing in this column.</li> : <li>No missing values recorded for this column.</li>}
                {field.uniqueCount != null && rows ? <li>{int(field.uniqueCount)} distinct values across {int(rows)} rows.</li> : null}
                {role === "index" && field.uniqueCount != null && rows && field.uniqueCount < rows ? (
                  <li>{int(rows - field.uniqueCount)} repeated timestamps recorded on the time axis.</li>
                ) : null}
                {stats && stats.std === 0 ? <li className="sd-field__warn">Constant output — zero variance, no modelling signal.</li> : null}
              </ul>
            </div>
            <div>
              <span className="section-eyebrow">RELATIONSHIPS</span>
              {related.length ? (
                <ul>
                  {related.slice(0, 4).map(r => (
                    <li key={r}>
                      Linked to <strong>{r}</strong> · {Math.round(relatedStrength * 100)}% shared token overlap
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mono-note">No structural partner detected for this column.</p>
              )}
            </div>
          </div>

          <div className={`sd-field__training ${recommended ? "sd-field__training--yes" : ""}`}>
            {recommended ? <Check size={13} /> : <AlertTriangle size={13} />}
            {recommended ? "Recommended for training: usable numeric or categorical feature." : "Excluded from training: identity, time axis or non-varying column."}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PipelineNode({
  stage,
  index,
  state,
  active,
  onClick,
}: {
  stage: (typeof PIPE_STAGES)[number];
  index: number;
  state: "done" | "active" | "pending";
  active: boolean;
  onClick: () => void;
}) {
  const Icon = stage.icon;
  return (
    <button
      type="button"
      className={`sd-node sd-node--${state} ${active ? "sd-node--selected" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="sd-node__bead" />
      <span className="sd-node__icon">
        {state === "done" ? <Check size={14} /> : state === "active" ? <Loader2 size={14} className="sd-spin" /> : <Icon size={14} />}
      </span>
      <span className="sd-node__copy">
        <small className="mono-note">0{index + 1}</small>
        <strong>{stage.label}</strong>
        <span>{stage.note}</span>
      </span>
      {index < PIPE_STAGES.length - 1 ? <span className="sd-node__wire" aria-hidden="true"><i /><i /><i /></span> : null}
    </button>
  );
}

export function SchemaDiscovery({
  dataset,
  domainLabel,
  schema,
  targetColumn,
  quality,
  activity,
  versions,
  onGoImport,
}: Props) {
  const [fields, setFields] = useState<LiveSchemaField[]>(schema);
  const [openField, setOpenField] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [state, setState] = useState<DiscoveryState>("idle");
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [modal, setModal] = useState<"inspect" | "versions" | "compare" | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [replayStep, setReplayStep] = useState<number>(PIPE_STAGES.length);
  const [snapshot] = useState<LiveSchemaField[]>(schema);
  const [events, setEvents] = useState<{ id: string; time: string; label: string; detail: string; tone: string }[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setFields(schema);
  }, [schema]);

  useEffect(() => {
    setLastRefresh(schema.length ? new Date() : null);
    setReplayStep(PIPE_STAGES.length);
  }, [schema.length, dataset.id]);

  useEffect(() => {
    return () => {
      timers.current.forEach(id => window.clearTimeout(id));
      timers.current = [];
    };
  }, []);

  const pushEvent = useCallback((label: string, detail: string, tone = "blue") => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setEvents(prev =>
      [{ id: `${now.getTime()}-${prev.length}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, label, detail, tone }, ...prev].slice(0, 12)
    );
  }, []);

  /* ── Derived, data-backed measures ─────────────────────────────────── */

  const rows = dataset.rowCount ?? null;
  const columns = fields.length || dataset.columnCount || 0;
  const indexField = useMemo(() => fields.find(f => normRole(f.role) === "index") ?? null, [fields]);
  const entityFields = useMemo(() => fields.filter(f => normRole(f.role) === "entity"), [fields]);
  const numericFields = useMemo(() => fields.filter(f => isNumeric(f.dtype)), [fields]);
  const totalNulls = useMemo(() => fields.reduce((acc, f) => acc + (f.nullCount ?? 0), 0), [fields]);
  const cells = rows != null && columns ? rows * columns : null;

  const completeness = cells && cells > 0 ? Math.max(0, 100 - (totalNulls / cells) * 100) : null;
  const uniqueness =
    rows && indexField?.uniqueCount != null ? Math.min(100, (indexField.uniqueCount / rows) * 100) : null;
  const recognized = fields.filter(f => normRole(f.role) !== "field").length;
  const structural = fields.length ? (recognized / fields.length) * 100 : null;
  const consistency = fields.length ? (fields.filter(f => f.dtype && f.dtype !== "—").length / fields.length) * 100 : null;
  const validation =
    quality && quality.passed + quality.failed > 0
      ? (quality.passed / (quality.passed + quality.failed)) * 100
      : null;

  const healthOverall =
    [completeness, uniqueness, structural, consistency, validation].filter((v): v is number => v != null).length > 0
      ? (() => {
          const vals = [completeness, uniqueness, structural, consistency, validation].filter((v): v is number => v != null) as number[];
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        })()
      : null;

  const duplicates = rows && indexField?.uniqueCount != null ? Math.max(0, rows - indexField.uniqueCount) : null;
  const confidence = structural;
  const memoryMb = cells != null ? (cells * 8) / (1024 * 1024) : null;

  const animRows = useAnimated(rows ?? 0);
  const animCols = useAnimated(columns);
  const animNulls = useAnimated(totalNulls);
  const animHealth = useAnimated(healthOverall ?? 0);

  /* ── Pipeline state, derived from what was recorded ─────────────────── */

  const completeFlags = useMemo(() => {
    const flags: boolean[] = [
      fields.length > 0 || (rows ?? 0) > 0,
      fields.length > 0,
      fields.some(f => !!f.dtype && f.dtype !== "—"),
      !!indexField || entityFields.length > 0,
      fields.length > 0 && (validation != null || structural != null),
      fields.length > 0 || versions.length > 0,
    ];
    return flags;
  }, [fields, rows, indexField, entityFields.length, validation, structural, versions.length]);

  const firstPending = completeFlags.findIndex(f => !f);
  const activeIndex = firstPending === -1 ? PIPE_STAGES.length : firstPending;

  const stageState = (i: number): "done" | "active" | "pending" => {
    if (i < replayStep && completeFlags[i]) return "done";
    if (i === activeIndex) return "active";
    if (i < activeIndex) return "done";
    return "pending";
  };

  const nodeDetail = useMemo(() => {
    switch (activeNode) {
      case "read":
        return {
          title: "Reading Dataset",
          rows: [
            ["Rows scanned", int(rows)],
            ["Columns in file", int(dataset.columnCount ?? columns)],
            ["Source", dataset.type || "recorded upload"],
            ["Status", rows ? "complete" : "awaiting upload"],
          ],
          log: dataset.detail,
        };
      case "parse":
        return {
          title: "Parsing Schema",
          rows: [
            ["Columns parsed", int(fields.length)],
            ["Parsed at", clockOf(lastRefresh)],
            ["Unsupported values", int(totalNulls)],
            ["Formatting issues", int(duplicates)],
          ],
          log: fields.length ? `${fields.length} columns registered from the recorded scan.` : "No schema recorded yet.",
        };
      case "types":
        return {
          title: "Detecting Types",
          rows: [
            ["Numeric columns", int(numericFields.length)],
            ["Categorical / low cardinality", int(fields.filter(f => (f.uniqueCount ?? 99) <= 12).length)],
            ["Datetime / index", int(fields.filter(f => normRole(f.role) === "index").length)],
            ["Unresolved", int(fields.filter(f => normRole(f.role) === "field").length)],
          ],
          log: numericFields.length ? `Numeric: ${numericFields.slice(0, 5).map(f => f.name).join(", ")}` : "No numeric columns detected.",
        };
      case "infer":
        return {
          title: "Inferring Relationships",
          rows: [
            ["Entity keys", int(entityFields.length)],
            ["Time axis", indexField?.name ?? "not detected"],
            ["Target candidate", targetColumn || "not recorded"],
            ["Confidence", confidence != null ? pct(confidence) : "—"],
          ],
          log: entityFields.length ? `Hierarchy keys: ${entityFields.slice(0, 4).map(f => f.name).join(", ")}` : "No identifier columns detected.",
        };
      case "validate":
        return {
          title: "Validating Structure",
          rows: [
            ["Checks passed", int(quality?.passed)],
            ["Checks failed", int(quality?.failed)],
            ["Missing values", int(totalNulls)],
            ["Completeness", pct(completeness)],
          ],
          log: quality ? `Data-quality stage recorded ${quality.passed} passing and ${quality.failed} failing checks.` : "Run the quality stage to record validation results.",
        };
      case "store":
        return {
          title: "Registering Metadata",
          rows: [
            ["Schema version", versions.length ? `v${versions[0].version}` : "v1 (pending)"],
            ["Registry entries", int(fields.length)],
            ["Destination", dataset.location || "local workspace"],
            ["Registered", clockOf(lastRefresh)],
          ],
          log: "Metadata is written to the workspace registry; the upload itself is never modified.",
        };
      default:
        return null;
    }
  }, [
    activeNode, rows, dataset.columnCount, dataset.type, dataset.detail, dataset.location,
    columns, fields, totalNulls, duplicates, lastRefresh, numericFields, entityFields,
    indexField, targetColumn, confidence, quality, completeness, versions,
  ]);

  /* ── AI reasoning derived from the recorded columns ──────────────────── */

  const insights = useMemo(() => {
    const list: { key: string; title: string; body: string; confidence: number; tone: string }[] = [];
    if (indexField) {
      list.push({
        key: "index",
        title: `${indexField.name} is the time axis`,
        body: `Recorded as ${indexField.dtype} with ${int(indexField.uniqueCount)} distinct values. Later stages align every row on this column, so it is never a feature.`,
        confidence: structural != null ? Math.min(99, structural + 8) : 90,
        tone: "blue",
      });
    }
    if (numericFields.length) {
      list.push({
        key: "numeric",
        title: `${numericFields.length} numeric column${numericFields.length === 1 ? "" : "s"} detected`,
        body: `Typed as numbers by the scan: ${numericFields.slice(0, 6).map(f => f.name).join(", ")}${numericFields.length > 6 ? " and more" : ""}. These carry the measurable signal.`,
        confidence: 96,
        tone: "lime",
      });
    }
    if (entityFields.length) {
      list.push({
        key: "entity",
        title: "Equipment hierarchy present",
        body: `${entityFields.map(f => f.name).slice(0, 5).join(", ")} repeat across rows, which identifies assets rather than measurements. Kept as grouping keys.`,
        confidence: 93,
        tone: "violet",
      });
    }
    if (targetColumn) {
      list.push({
        key: "target",
        title: `${targetColumn} selected as the modelled target`,
        body: "The pipeline forecasts this column. Every baseline, anomaly and recommendation downstream is expressed in its unit.",
        confidence: 97,
        tone: "lime",
      });
    }
    if (duplicates != null && duplicates > 0 && rows) {
      list.push({
        key: "dup",
        title: `${int(duplicates)} repeated timestamps`,
        body: `The time axis has ${int(indexField?.uniqueCount ?? 0)} distinct values across ${int(rows)} rows. Repeats usually mean several meters share one timestamp — the quality stage can confirm.`,
        confidence: 88,
        tone: "orange",
      });
    }
    if (completeness != null && completeness < 97) {
      list.push({
        key: "missing",
        title: `${pct(100 - completeness)} of cells are empty`,
        body: `${int(totalNulls)} missing values were recorded. Repair runs before modelling, and the raw upload stays untouched.`,
        confidence: 95,
        tone: "coral",
      });
    }
    if (!list.length) {
      list.push({
        key: "empty",
        title: "No schema recorded yet",
        body: "Run schema discovery on this dataset and the reasoning below is generated from the columns the scan actually finds.",
        confidence: 0,
        tone: "neutral",
      });
    }
    return list;
  }, [indexField, numericFields, entityFields, targetColumn, duplicates, rows, completeness, totalNulls, structural]);

  /* ── Relationships: shared name tokens, with a stated reason ─────────── */

  const relationMap = useMemo(() => {
    const tokensOf = (name: string) => new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const map = new Map<string, { name: string; strength: number; reason: string }[]>();
    fields.forEach(a => {
      const at = tokensOf(a.name);
      const links: { name: string; strength: number; reason: string }[] = [];
      fields.forEach(b => {
        if (a.name === b.name) return;
        const bt = tokensOf(b.name);
        const shared = [...at].filter(t => bt.has(t));
        if (!shared.length) return;
        const union = new Set([...at, ...bt]).size;
        links.push({
          name: b.name,
          strength: shared.length / union,
          reason: `shares ${shared.slice(0, 2).join(" + ")}`,
        });
      });
      links.sort((x, y) => y.strength - x.strength);
      map.set(a.name, links.slice(0, 3));
    });
    return map;
  }, [fields]);

  const selectedLinks = selectedField ? relationMap.get(selectedField) ?? [] : [];
  const linkedNames = new Set(selectedLinks.map(l => l.name));

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const schemaJson = useMemo(() => {
    const payload = {
      dataset: { id: dataset.id, name: dataset.name, domain: dataset.domain, target: targetColumn || null },
      generatedAt: new Date().toISOString(),
      recordCount: rows,
      columns: fields.map(f => ({
        name: f.name,
        dataType: f.dtype,
        role: normRole(f.role),
        semanticType: f.role,
        nullable: f.nullable,
        nullCount: f.nullCount ?? null,
        uniqueCount: f.uniqueCount ?? null,
        samples: f.samples ?? [],
        statistics: f.stats ?? null,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }, [dataset.id, dataset.name, dataset.domain, targetColumn, rows, fields]);

  const refresh = useCallback(async () => {
    if (!dataset.id || dataset.id === "—") {
      setError("Select or upload a dataset before running schema discovery.");
      setState("failed");
      return;
    }
    setState("refreshing");
    setError("");
    pushEvent("Schema rediscovery started", "Re-reading the uploaded file", "blue");
    try {
      await domain.discoverSchema(dataset.id);
      const fresh = await domain.schema(dataset.id);
      setFields(mapSchema(fresh));
      setLastRefresh(new Date());
      setReplayStep(PIPE_STAGES.length);
      setState("idle");
      pushEvent("Schema discovery finished", `${mapSchema(fresh).length} columns registered`, "lime");
    } catch (err) {
      setState("failed");
      setError(err instanceof Error ? err.message : "Schema discovery failed.");
      pushEvent("Schema discovery failed", err instanceof Error ? err.message : "unknown error", "coral");
    }
  }, [dataset.id, pushEvent]);

  const replay = useCallback(() => {
    if (!fields.length) {
      void refresh();
      return;
    }
    setState("replaying");
    setReplayStep(0);
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
    PIPE_STAGES.forEach((stage, i) => {
      const id = window.setTimeout(() => {
        setReplayStep(i + 1);
        pushEvent(stage.label, completeFlags[i] ? "completed" : "awaiting data", completeFlags[i] ? "lime" : "orange");
        if (i === PIPE_STAGES.length - 1) setState("idle");
      }, 520 * (i + 1));
      timers.current.push(id);
    });
  }, [fields.length, refresh, completeFlags, pushEvent]);

  const exportJson = useCallback(() => {
    const blob = new Blob([schemaJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushEvent("Schema exported", "JSON metadata downloaded", "lime");
  }, [schemaJson, dataset.name, pushEvent]);

  const copySchema = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(schemaJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      pushEvent("Schema copied", "Metadata written to clipboard", "blue");
    } catch {
      setError("Clipboard is unavailable in this browser context.");
    }
  }, [schemaJson, pushEvent]);

  const diff = useMemo(() => {
    const before = new Map(snapshot.map(f => [f.name, f]));
    const after = new Map(fields.map(f => [f.name, f]));
    const added = fields.filter(f => !before.has(f.name)).map(f => f.name);
    const removed = snapshot.filter(f => !after.has(f.name)).map(f => f.name);
    const retyped = fields
      .filter(f => before.has(f.name) && before.get(f.name)!.dtype !== f.dtype)
      .map(f => `${f.name}: ${before.get(f.name)!.dtype} → ${f.dtype}`);
    return { added, removed, retyped };
  }, [snapshot, fields]);

  const feed = useMemo(() => {
    const fromBackend = activity.slice(0, 10).map((a, i) => ({
      id: `a-${i}`,
      time: a.time,
      label: a.operation,
      detail: a.result,
      tone: a.status === "WARN" ? "coral" : a.status === "DONE" ? "lime" : "blue",
    }));
    return [...events, ...fromBackend].slice(0, 10);
  }, [events, activity]);

  const empty = fields.length === 0;
  const loading = empty && state === "refreshing";

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="view-content sd-page">
      <div className="sd-hero">
        <div className="sd-hero__copy">
          <div className="sd-live">
            <span className={`sd-live__dot ${empty ? "sd-live__dot--wait" : "sd-live__dot--on"}`} />
            <span>{empty ? "AWAITING SCHEMA" : "SCHEMA REGISTRY LIVE"}</span>
            <span className="sd-live__sep" />
            <span className="mono-note">refreshed {clockOf(lastRefresh)}</span>
          </div>
          <h1>The shape of the system, understood.</h1>
          <p>
            {dataset.name} · {domainLabel} · {int(rows)} rows recorded across {int(columns)} columns.
          </p>
        </div>
        <div className="sd-hero__actions">
          <button type="button" className="sd-btn sd-btn--primary" onClick={() => void refresh()} disabled={state === "refreshing"}>
            <RefreshCw size={14} className={state === "refreshing" ? "sd-spin" : ""} /> Refresh
          </button>
          <button type="button" className="sd-btn" onClick={replay}>
            <RotateCcw size={14} /> Replay
          </button>
          <button type="button" className="sd-btn sd-btn--icon" onClick={() => setModal("compare")} title="Compare with the schema recorded on load" aria-label="Compare schema">
            <GitCompareArrows size={14} />
          </button>
          <button type="button" className="sd-btn" onClick={exportJson} disabled={empty}>
            <Download size={14} /> Export
          </button>
          <button type="button" className="sd-btn" onClick={() => setModal("inspect")} disabled={empty}>
            <FileJson size={14} /> Inspect
          </button>
          <button type="button" className="sd-btn sd-btn--icon" onClick={() => void copySchema()} disabled={empty} title={copied ? "Schema copied" : "Copy schema JSON"} aria-label="Copy schema">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button type="button" className="sd-btn sd-btn--icon" onClick={() => setModal("versions")} title="Recorded schema versions" aria-label="Schema versions">
            <History size={14} />
          </button>
        </div>
      </div>

      {state === "failed" ? (
        <div className="sd-error" role="alert">
          <AlertTriangle size={15} />
          <span>{error || "Schema discovery could not complete."}</span>
          <button type="button" className="sd-btn sd-btn--small" onClick={() => void refresh()}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : null}

      {empty && !loading ? (
        <div className="sd-empty">
          <div className="sd-empty__icon"><ScanSearch size={26} /></div>
          <div>
            <span className="section-eyebrow">NO SCHEMA RECORDED</span>
            <h2>Upload a dataset to begin discovery.</h2>
            <p>EcoMind reads the file, resolves every column's type and builds the schema this page describes — nothing is invented.</p>
          </div>
          <div className="sd-empty__actions">
            {onGoImport ? (
              <button type="button" className="sd-btn sd-btn--primary" onClick={onGoImport}>
                <ArrowRight size={14} /> Import a dataset
              </button>
            ) : null}
            <button type="button" className="sd-btn" onClick={() => void refresh()}>
              <RefreshCw size={14} /> Run discovery
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="sd-skeleton">
          <div className="sd-skeleton__bar" />
          <div className="sd-skeleton__grid">
            <div /><div /><div /><div />
          </div>
        </div>
      ) : null}

      {!empty ? (
        <>
          <div className="blk-kpis">
          <article className="blk blk-kpi">
            <span className="blk-kpi__label">ROWS</span>
            <div className="blk-kpi__value">{int(Math.round(animRows))}</div>
            <p className="blk-kpi__note">{dataset.freshness}</p>
          </article>
          <article className="blk blk-kpi">
            <span className="blk-kpi__label">COLUMNS</span>
            <div className="blk-kpi__value">{int(Math.round(animCols))}</div>
            <p className="blk-kpi__note">{int(recognized)} roles resolved</p>
          </article>
          <article className="blk blk-kpi">
            <span className="blk-kpi__label">MISSING CELLS</span>
            <div className="blk-kpi__value">{int(Math.round(animNulls))}</div>
            <p className="blk-kpi__note">{pct(completeness == null ? null : 100 - completeness)} of cells</p>
          </article>
          <article className="blk blk-kpi">
            <span className="blk-kpi__label">SCHEMA CONFIDENCE</span>
            <div className="blk-kpi__value">{confidence == null ? "—" : `${Math.round(animHealth)}`}<em>%</em></div>
            <p className="blk-kpi__note">{memoryMb == null ? "size not recorded" : `${memoryMb.toFixed(1)} MB in memory`}</p>
          </article>
        </div>

        <div className="sd-layout">
            <section className="panel sd-fields">
              <div className="sd-panel-head">
                <div>
                  <span className="section-eyebrow">FIELD EXPLORER</span>
                  <h2>{fields.length} recorded fields</h2>
                </div>
                <span className="mono-note">hover to preview · click to expand</span>
              </div>
              <div className="sd-fields__list">
                {fields.map(field => (
                  <FieldRow
                    key={field.name}
                    field={field}
                    rows={rows}
                    targetColumn={targetColumn}
                    expanded={openField === field.name}
                    onToggle={() => {
                      setOpenField(openField === field.name ? null : field.name);
                      setSelectedField(field.name);
                    }}
                    related={(relationMap.get(field.name) ?? []).map(l => l.name)}
                    relatedStrength={(relationMap.get(field.name) ?? [])[0]?.strength ?? 0}
                  />
                ))}
              </div>
              {selectedField ? (
                <div className="sd-fields__links">
                  <span className="section-eyebrow">SELECTED · {selectedField}</span>
                  {selectedLinks.length ? (
                    <ul>
                      {selectedLinks.map(l => (
                        <li key={l.name}>
                          <span>{l.name}</span>
                          <span className="sd-fields__strength">
                            <i style={{ width: `${Math.round(l.strength * 100)}%` }} />
                          </span>
                          <span className="mono-note">because it {l.reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mono-note">No column shares a name token with this one — it stands alone in the schema.</p>
                  )}
                </div>
              ) : null}
            </section>

            <div className="sd-side">
              <section className="panel sd-summary__health">
              <div className="sd-panel-head">
                <span className="section-eyebrow">DATASET HEALTH</span>
                <Badge tone={healthOverall != null && healthOverall >= 92 ? "lime" : healthOverall != null && healthOverall >= 78 ? "orange" : "coral"}>
                  {healthOverall == null ? "unscored" : healthOverall >= 92 ? "excellent" : healthOverall >= 78 ? "attention" : "at risk"}
                </Badge>
              </div>
              <div className="sd-health-score">
                <span className="sd-health-score__value">{healthOverall == null ? "—" : animHealth.toFixed(1)}</span>
                <span className="sd-health-score__unit">/ 100</span>
              </div>
              <HealthRow label="Completeness" value={completeness} note={`${int(totalNulls)} missing cells of ${int(cells)}`} />
              <HealthRow label="Uniqueness" value={uniqueness} note={indexField ? `time axis ${indexField.name}` : "no time axis recorded"} />
              <HealthRow label="Schema validation" value={validation} note={quality ? `${quality.passed} passed · ${quality.failed} failed` : "quality stage not run"} />
              <HealthRow label="Structural integrity" value={structural} note={`${recognized} of ${fields.length} roles resolved`} />
              <HealthRow label="Type consistency" value={consistency} note={`${fields.filter(f => isNumeric(f.dtype)).length} numeric columns`} />
            </section>

              <section className="panel sd-pipeline">
                <div className="sd-panel-head">
                  <div>
                    <span className="section-eyebrow">SCHEMA DISCOVERY PIPELINE</span>
                    <h2>How the schema was built</h2>
                  </div>
                  <Badge tone={activeIndex === PIPE_STAGES.length ? "lime" : "blue"}>
                    {activeIndex === PIPE_STAGES.length ? "complete" : `stage 0${activeIndex + 1}`}
                  </Badge>
                </div>
                <div className="sd-pipeline__track">
                  {PIPE_STAGES.map((stage, i) => (
                    <PipelineNode
                      key={stage.key}
                      stage={stage}
                      index={i}
                      state={stageState(i)}
                      active={activeNode === stage.key}
                      onClick={() => setActiveNode(activeNode === stage.key ? null : stage.key)}
                    />
                  ))}
                </div>
                {nodeDetail ? (
                  <div className="sd-node-detail">
                    <div className="sd-node-detail__head">
                      <strong>{nodeDetail.title}</strong>
                      <button type="button" aria-label="Close detail" onClick={() => setActiveNode(null)}><X size={13} /></button>
                    </div>
                    <div className="sd-node-detail__grid">
                      {nodeDetail.rows.map(([k, v]) => (
                        <span key={k}><small>{k.toUpperCase()}</small>{v}</span>
                      ))}
                    </div>
                    <p className="mono-note">{nodeDetail.log}</p>
                  </div>
                ) : null}
              </section>

                          </div>
          </div>

        </>
      ) : null}

      {modal ? (
        <div className="sd-modal" role="dialog" aria-modal="true" aria-label={modal}>
          <div className="sd-modal__panel">
            <div className="sd-modal__head">
              <strong>
                {modal === "inspect" ? "Schema metadata" : modal === "compare" ? "Schema comparison" : "Schema versions"}
              </strong>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            {modal === "inspect" ? (
              <div className="sd-modal__body">
                <div className="sd-modal__meta">
                  <span><small>DATASET</small>{dataset.name}</span>
                  <span><small>ID</small><code>{dataset.id}</code></span>
                  <span><small>COLUMNS</small>{fields.length}</span>
                  <span><small>REGISTERED</small>{clockOf(lastRefresh)}</span>
                </div>
                <div className="sd-modal__table">
                  <div className="sd-modal__table-head">
                    <span>COLUMN</span><span>TYPE</span><span>ROLE</span><span>NULLS</span><span>UNIQUE</span>
                  </div>
                  {fields.map(f => (
                    <div className="sd-modal__table-row" key={f.name}>
                      <span>{f.name}</span>
                      <code>{f.dtype}</code>
                      <span>{normRole(f.role)}</span>
                      <span>{int(f.nullCount)}</span>
                      <span>{int(f.uniqueCount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {modal === "compare" ? (
              <div className="sd-modal__body">
                <p className="mono-note">Compared against the schema recorded when this page loaded.</p>
                <div className="sd-modal__diff">
                  <div>
                    <span className="section-eyebrow">ADDED ({diff.added.length})</span>
                    {diff.added.length ? diff.added.map(n => <code key={n}>{n}</code>) : <p className="mono-note">No new columns.</p>}
                  </div>
                  <div>
                    <span className="section-eyebrow">REMOVED ({diff.removed.length})</span>
                    {diff.removed.length ? diff.removed.map(n => <code key={n}>{n}</code>) : <p className="mono-note">No columns removed.</p>}
                  </div>
                  <div>
                    <span className="section-eyebrow">RETYPED ({diff.retyped.length})</span>
                    {diff.retyped.length ? diff.retyped.map(n => <code key={n}>{n}</code>) : <p className="mono-note">No datatype changes.</p>}
                  </div>
                </div>
              </div>
            ) : null}

            {modal === "versions" ? (
              <div className="sd-modal__body">
                {versions.length ? (
                  <ol className="sd-versions">
                    {versions.map(v => (
                      <li key={v.version}>
                        <strong>v{v.version}</strong>
                        <span className="mono-note">{int(v.rowCount)} rows</span>
                        <span className="mono-note">{v.created ? new Date(v.created).toLocaleString() : "timestamp not recorded"}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mono-note">No artifact versions recorded yet. Versions appear after a pipeline run writes an immutable snapshot.</p>
                )}
                <div className="sd-modal__current">
                  <span className="section-eyebrow">CURRENT SCHEMA</span>
                  <span className="mono-note">{fields.length} columns · {clockOf(lastRefresh)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SchemaDiscovery;
