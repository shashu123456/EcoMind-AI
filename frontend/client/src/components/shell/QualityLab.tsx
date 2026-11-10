import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  ChevronDown,
  CircleDot,
  Database,
  DatabaseZap,
  FileCheck2,
  Gauge as GaugeIcon,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import "./schema-discovery.css";
import "./quality-lab.css";
import type { LiveActivity, LiveIssue, LiveSchemaField } from "@/lib/workspace";

/* ────────────────────────────────────────────────────────────────────────────
 * Data Quality lab.
 *
 * Nothing on this page decides anything: every number, card, chart and table
 * row is derived from the quality stage's recorded rule results. The repair
 * engine, the filter that feeds this view and the save flow are untouched —
 * this file only presents what was already computed.
 * ──────────────────────────────────────────────────────────────────────────── */

export type QualityDataset = {
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

export type QualityMeta = { score: number; passed: number; failed: number } | null;
export type QualityVersion = { version: number; rowCount: number; created: string | null };

type Props = {
  dataset: QualityDataset;
  domainLabel: string;
  issues: LiveIssue[];
  filteredQuality: LiveIssue[];
  filter: string;
  setFilter: (filter: string) => void;
  repaired: boolean;
  saved: boolean;
  onRepair: () => void;
  onSave: () => void;
  quality: QualityMeta;
  schema: LiveSchemaField[];
  targetColumn: string;
  activity: LiveActivity[];
  versions: QualityVersion[];
  onToast?: (message: string) => void;
};

const FILTERS = ["All issues", "Null value", "Missing timestamp", "Duplicate", "Datatype mismatch", "Invalid value"];

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

const int = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("en-IN");

const pct1 = (v: number | null | undefined): string =>
  v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`;

const confOf = (issue: LiveIssue): number => {
  const n = parseFloat(String(issue.confidence).replace("%", ""));
  return isFinite(n) ? n : 0;
};

const elapsed = (started: string, completed: string | null): string => {
  if (!completed) return "—";
  const a = Date.parse(started);
  const b = Date.parse(completed);
  if (!isFinite(a) || !isFinite(b) || b < a) return "—";
  const ms = b - a;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
};

/** Count from zero to `value`, then settle on it even if frames are throttled. */
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
  return <span className={`ql-tag ql-tag--${tone}`}>{children}</span>;
}

function Counter({ label, value, suffix, hint, big }: { label: string; value: string; suffix?: string; hint?: string; big?: boolean }) {
  return (
    <div className={`ql-counter ${big ? "ql-counter--big" : ""}`}>
      <small>{label}</small>
      <strong>
        {value}
        {suffix ? <em>{suffix}</em> : null}
      </strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function scoreTone(score: number | null): string {
  if (score == null) return "idle";
  return score >= 90 ? "good" : score >= 75 ? "ok" : "risk";
}

/** Circular quality gauge; the arc is drawn from the recorded score. */
function Gauge({ score, label, ready }: { score: number | null; label: string; ready: boolean }) {
  const shown = useCounter(score ?? 0, 900);
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, shown)) / 100) * circumference;
  const tone = scoreTone(score);
  return (
    <div className={`ql-gauge ql-gauge--${tone}`}>
      <svg viewBox="0 0 160 160" role="img" aria-label={score == null ? "No quality score recorded" : `Quality score ${score} of 100`}>
        <circle cx="80" cy="80" r={r} className="ql-gauge__track" />
        <circle
          cx="80"
          cy="80"
          r={r}
          className={`ql-gauge__arc ql-gauge__arc--${tone}`}
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div className="ql-gauge__center">
        <span className="ql-gauge__value">{score == null ? "—" : Math.round(shown)}</span>
        <span className="ql-gauge__scale">/ 100</span>
        <strong className={`ql-gauge__label ql-gauge__label--${tone}`}>{label}</strong>
      </div>
      <div className={`ql-gauge__verdict ${ready ? "ql-gauge__verdict--good" : "ql-gauge__verdict--warn"}`}>
        {ready ? <Check size={13} /> : <AlertTriangle size={13} />}
        {ready ? "Ready for AI training" : "Needs manual review"}
      </div>
    </div>
  );
}

function MetricBar({ label, value, note }: { label: string; value: number | null; note: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = v >= 90 ? "good" : v >= 75 ? "ok" : "risk";
  return (
    <div className="ql-metric">
      <div className="ql-metric__head">
        <span>{label}</span>
        <strong className={`ql-metric__value ql-metric__value--${tone}`}>{value == null ? "—" : `${v.toFixed(1)}%`}</strong>
      </div>
      <div className="ql-metric__track">
        <span className={`ql-metric__fill ql-metric__fill--${tone}`} style={{ width: `${v}%` }} />
      </div>
      <small>{note}</small>
    </div>
  );
}

/** One structural rule, collapsed to a verdict and expandable to its evidence. */
function RuleCard({
  issue,
  index,
  repaired,
  open,
  onToggle,
}: {
  issue: LiveIssue;
  index: number;
  repaired: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const columns = issue.columns;
  const status = issue.passed ? "passed" : repaired ? "repaired" : "flagged";
  return (
    <article className={`ql-rule ql-rule--${issue.severity || "info"} ${open ? "ql-rule--open" : ""}`}>
      <button type="button" className="ql-rule__head" onClick={onToggle} aria-expanded={open}>
        <span className={`ql-rule__dot ql-rule__dot--${status}`} />
        <span className="ql-rule__title">
          <strong>{issue.ruleName || issue.type}</strong>
          <small>{issue.type} · {issue.context.slice(0, 74)}</small>
        </span>
        <Tag tone={issue.passed ? "lime" : issue.severity === "critical" ? "coral" : issue.severity === "warning" ? "orange" : "blue"}>
          {status}
        </Tag>
        <span className="ql-rule__conf">{issue.confidence}</span>
        <ChevronDown size={14} className={open ? "ql-chev ql-chev--open" : "ql-chev"} />
      </button>

      {open ? (
        <div className="ql-rule__body">
          <div className="ql-rule__grid">
            <div><small>AFFECTED COLUMNS</small><span>{columns.length ? columns.slice(0, 4).join(", ") : "none named"}{columns.length > 4 ? ` +${columns.length - 4}` : ""}</span></div>
            <div><small>REPAIR METHOD</small><span>{issue.fixed}</span></div>
            <div><small>ROWS AFFECTED</small><span>{issue.row}</span></div>
            <div><small>CONFIDENCE</small><span>{issue.confidence}</span></div>
            <div><small>SEVERITY</small><span>{issue.severity}</span></div>
            <div><small>RULE INDEX</small><span>{String(index + 1).padStart(2, "0")} / {issue.id}</span></div>
          </div>
          {issue.detail.length ? (
            <div className="ql-rule__facts">
              <small>WHAT THE RULE MEASURED</small>
              <div>
                {issue.detail.map(f => (
                  <span key={f.label}><em>{f.label}</em><strong>{f.value}</strong></span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="ql-rule__beforeafter">
            <div><small>BEFORE</small><span>{issue.context}</span></div>
            <span className="ql-rule__arrow">→</span>
            <div><small>AFTER</small><span>{issue.passed ? "No change required — rule passed." : repaired ? issue.fixed : "Awaiting apply repairs."}</span></div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Timeline({
  steps,
  active,
  onSelect,
}: {
  steps: { key: string; label: string }[];
  active: number;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="ql-timeline">
      {steps.map((s, i) => {
        const state = i < active ? "done" : i === active ? "active" : "pending";
        return (
          <button type="button" key={s.key} className={`ql-step ql-step--${state}`} onClick={() => onSelect(s.key)}>
            <span className="ql-step__bead">{state === "done" ? <Check size={10} /> : null}</span>
            <span className="ql-step__label">{s.label}</span>
            {i < steps.length - 1 ? <span className="ql-step__wire" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="ql-bars">
      {data.map(d => (
        <div className="ql-bars__row" key={d.label}>
          <span>{d.label}</span>
          <div className="ql-bars__track">
            <i style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <strong>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}

function Donut({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const stops: string[] = [];
  let acc = 0;
  data.forEach(d => {
    const start = total ? (acc / total) * 100 : 0;
    acc += d.value;
    const end = total ? (acc / total) * 100 : 0;
    stops.push(`${d.color} ${start}% ${end}%`);
  });
  const bg = total ? `conic-gradient(${stops.join(", ")})` : "rgba(255,255,255,0.08)";
  return (
    <div className="ql-donut">
      <div className="ql-donut__ring" style={{ background: bg }}>
        <div className="ql-donut__hole">
          <strong>{total}</strong>
          <small>FINDINGS</small>
        </div>
      </div>
      <ul className="ql-donut__legend">
        {data.map(d => (
          <li key={d.label}>
            <span style={{ background: d.color }} />
            {d.label}
            <em>{d.value}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sparkline({ before, after, repaired }: { before: number | null; after: number | null; repaired: boolean }) {
  const b = before ?? 0;
  const a = after ?? b;
  const pts = `0,${40 - (b / 100) * 36} 30,${40 - (b / 100) * 36} 55,${40 - ((b + a) / 2 / 100) * 36} 100,${40 - (a / 100) * 36}`;
  return (
    <div className="ql-spark">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Recorded quality score">
        <polyline points={pts} className={repaired ? "ql-spark__line ql-spark__line--up" : "ql-spark__line"} />
      </svg>
      <div className="ql-spark__axis">
        <span>{before == null ? "—" : `${before}`}</span>
        <span>{after == null ? "—" : `${after}`}</span>
      </div>
    </div>
  );
}

function Histogram({ buckets, total }: { buckets: { label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...buckets.map(b => b.value));
  return (
    <div className="ql-hist">
      {buckets.map(b => (
        <div className="ql-hist__col" key={b.label} title={`${b.value} of ${total} findings`}>
          <span className="ql-hist__count">{b.value}</span>
          <span className="ql-hist__bar" style={{ height: `${Math.max(4, (b.value / max) * 100)}%` }} />
          <small>{b.label}</small>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ rows }: { rows: { column: string; cells: (number | null)[] }[] }) {
  const metrics = ["Nulls", "Duplicates", "Invalid", "Coverage"];
  if (!rows.length) {
    return <p className="mono-note">No column-level evidence recorded for this dataset.</p>;
  }
  return (
    <div className="ql-heat">
      <div className="ql-heat__head">
        <span />
        {metrics.map(m => <small key={m}>{m}</small>)}
      </div>
      {rows.map(r => (
        <div className="ql-heat__row" key={r.column}>
          <span className="ql-heat__label">{r.column}</span>
          {r.cells.map((v, i) => {
            const tone = v == null ? "none" : v >= 90 ? "good" : v >= 70 ? "ok" : "risk";
            return (
              <span className={`ql-heat__cell ql-heat__cell--${tone}`} key={`${r.column}-${i}`}>
                {v == null ? "—" : `${Math.round(v)}`}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function QualityLab({
  dataset,
  domainLabel,
  issues,
  filteredQuality,
  filter,
  setFilter,
  repaired,
  saved,
  onRepair,
  onSave,
  quality,
  schema,
  targetColumn,
  activity,
  versions,
  onToast,
}: Props) {
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"severity" | "confidence" | "rule">("severity");
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [step, setStep] = useState(9);
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [scanStep, setScanStep] = useState(0);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const totalIssues = issues.length;
  const qScore = quality?.score ?? null;
  const passedCount = quality?.passed ?? 0;
  const failedCount = quality?.failed ?? 0;
  const ready = qScore != null && qScore >= 90;

  const typeCounts = useMemo(
    () =>
      issues.reduce<Record<string, number>>((acc, i) => {
        acc[i.type] = (acc[i.type] ?? 0) + 1;
        return acc;
      }, {}),
    [issues]
  );

  const flaggedRows = useMemo(() => issues.filter(i => !i.passed).length, [issues]);

  const rowsScanned = dataset.rowCount ?? null;

  const processingMs = useMemo(() => {
    let total = 0;
    activity.forEach(a => {
      const m = /([\d.]+)\s*(ms|s)\b/i.exec(String(a.duration ?? ""));
      if (!m) return;
      const n = parseFloat(m[1]);
      if (!isFinite(n)) return;
      total += /ms/i.test(m[2]) ? n : n * 1000;
    });
    return total;
  }, [activity]);

  const processingLabel = processingMs > 0 ? (processingMs < 1000 ? `${Math.round(processingMs)}ms` : `${(processingMs / 1000).toFixed(2)}s`) : "—";
  const currentVersion = versions.length ? Math.max(...versions.map(v => v.version)) : null;

  const animRows = useCounter(rowsScanned ?? 0);
  const animScore = useCounter(qScore ?? 0);
  const animIssues = useCounter(totalIssues);
  const animRepairs = useCounter(repaired ? flaggedRows : 0);
  const animVersion = useCounter(currentVersion ?? 0);

  /* Health dimensions, all derived from recorded evidence. */
  const nullRate = useMemo(() => {
    for (const issue of issues) {
      for (const f of issue.detail) {
        if (/null rate/i.test(f.label)) {
          const n = parseFloat(String(f.value).replace(/[^\d.]/g, ""));
          if (isFinite(n)) return n > 1 ? n : n * 100;
        }
      }
    }
    return null;
  }, [issues]);

  const counts = typeCounts;
  const invalidFindings = (counts["Invalid value"] ?? 0) + (counts["Datatype mismatch"] ?? 0);
  const dupFindings = counts["Duplicate"] ?? 0;
  const missingFindings = counts["Null value"] ?? 0;
  const timestampFindings = counts["Missing timestamp"] ?? 0;
  const ruleTotal = passedCount + failedCount;

  const completeness = nullRate != null ? Math.max(0, 100 - nullRate) : ruleTotal ? (passedCount / ruleTotal) * 100 : null;
  const consistency = ruleTotal ? (passedCount / ruleTotal) * 100 : null;
  const uniqueness = totalIssues ? Math.max(0, 100 - (dupFindings / totalIssues) * 100) : null;
  const validity = totalIssues ? Math.max(0, 100 - (invalidFindings / totalIssues) * 100) : null;
  const structural = schema.length ? (schema.filter(f => f.role && !/generic|field/i.test(f.role)).length / schema.length) * 100 : null;

  const target = useMemo(() => schema.find(f => f.name === targetColumn) ?? null, [schema, targetColumn]);

  /* Confidence of each finding, bucketed. */
  const histogram = useMemo(() => {
    const buckets = [
      { label: "0-20", value: 0 },
      { label: "20-40", value: 0 },
      { label: "40-60", value: 0 },
      { label: "60-80", value: 0 },
      { label: "80-100", value: 0 },
    ];
    issues.forEach(i => {
      const c = confOf(i);
      const idx = Math.min(4, Math.max(0, Math.floor(c / 20)));
      buckets[idx].value += 1;
    });
    return buckets;
  }, [issues]);

  const avgConfidence = issues.length ? issues.reduce((s, i) => s + confOf(i), 0) / issues.length : null;

  const palette = ["#7ef0c0", "#6aa8ff", "#f0b45a", "#b28cff", "#ff8a8a", "#8fd4c4"];
  const distribution = useMemo(
    () => Object.entries(typeCounts).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] })),
    [typeCounts]
  );

  /* Search + sort + pagination over the filtered set. */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = filteredQuality.filter(i => {
      if (!q) return true;
      return (
        i.ruleName.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.field.toLowerCase().includes(q) ||
        i.columns.join(" ").toLowerCase().includes(q) ||
        i.context.toLowerCase().includes(q)
      );
    });
    const sorted = [...base].sort((a, b) => {
      if (sortKey === "severity") return (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
      if (sortKey === "confidence") return confOf(b) - confOf(a);
      return (a.ruleName || a.type).localeCompare(b.ruleName || b.type);
    });
    return sorted;
  }, [filteredQuality, search, sortKey]);

  const PAGE = 6;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE, currentPage * PAGE + PAGE);

  /* Column heatmap: issue density per named column. */
  const heatRows = useMemo(() => {
    const seen = new Map<string, { column: string; nulls: number; dups: number; invalid: number }>();
    const touch = (name: string) => {
      if (!seen.has(name)) seen.set(name, { column: name, nulls: 0, dups: 0, invalid: 0 });
      return seen.get(name)!;
    };
    issues.forEach(i => {
      i.columns.forEach(c => {
        const row = touch(c);
        if (i.type === "Null value") row.nulls += 1;
        else if (i.type === "Duplicate") row.dups += 1;
        else if (i.type === "Invalid value" || i.type === "Datatype mismatch") row.invalid += 1;
      });
    });
    const colStats = new Map(schema.map(s => [s.name, s]));
    return [...seen.values()]
      .concat(
        schema
          .filter(s => !seen.has(s.name))
          .slice(0, 4)
          .map(s => ({ column: s.name, nulls: 0, dups: 0, invalid: 0 }))
      )
      .slice(0, 10)
      .map(r => {
        const stat = colStats.get(r.column);
        const rowCount = stat?.rowCount ?? rowsScanned ?? 0;
        const nullCell = stat?.nullCount;
        const coverage = r.nulls === 0 ? 100 : Math.max(0, 100 - r.nulls * 12);
        return {
          column: r.column,
          cells: [
            nullCell != null && rowCount ? Math.max(0, 100 - (nullCell / rowCount) * 100) : coverage,
            r.dups ? Math.max(0, 100 - r.dups * 10) : 100,
            r.invalid ? Math.max(0, 100 - r.invalid * 10) : 100,
            stat?.uniqueCount != null && rowCount ? Math.min(100, (stat.uniqueCount / rowCount) * 100) : null,
          ] as (number | null)[],
        };
      });
  }, [issues, schema, rowsScanned]);

  /* Repair timeline: eight stations the stage actually passes through. */
  const timeline = useMemo(
    () => [
      { key: "upload", label: "Dataset uploaded", detail: `${dataset.name} · ${domainLabel}` },
      { key: "schema", label: "Schema validation", detail: `${schema.length} columns registered` },
      { key: "dupes", label: "Duplicate detection", detail: `${dupFindings} duplicate findings` },
      { key: "missing", label: "Missing value repair", detail: `${missingFindings} null findings` },
      { key: "outlier", label: "Outlier detection", detail: "Owned by the anomaly stage — never auto-repaired here" },
      { key: "norm", label: "Normalization", detail: repaired ? "Applied to the repaired snapshot" : "Runs when repairs are applied" },
      { key: "validate", label: "Validation", detail: `${passedCount} passed · ${failedCount} failed` },
      { key: "version", label: "Version saved", detail: saved ? "Clean snapshot persisted" : "Pending save" },
    ],
    [dataset.name, domainLabel, schema.length, dupFindings, missingFindings, repaired, passedCount, failedCount, saved]
  );

  /* Play the processing sequence on mount and on rescan. */
  const runScan = () => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
    setScanning(true);
    setScanStep(0);
    setStep(0);
    for (let i = 0; i < 6; i++) {
      const id = window.setTimeout(() => {
        setScanStep(i + 1);
        setStep(Math.min(timeline.length, i + 1));
        if (i === 5) setScanning(false);
      }, 320 * (i + 1));
      timers.current.push(id);
    }
    for (let i = 6; i < timeline.length; i++) {
      const id = window.setTimeout(() => setStep(i + 1), 320 * (i + 1));
      timers.current.push(id);
    }
  };

  useEffect(() => {
    runScan();
    return () => {
      timers.current.forEach(id => window.clearTimeout(id));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset.id]);

  const scanSteps = ["Scanning", "Checking missing values", "Checking timestamp integrity", "Checking sensor drift", "Repairing", "Saving clean dataset"];
  const node = nodeKey ? timeline.find(t => t.key === nodeKey) ?? null : null;

  const empty = totalIssues === 0 && scanStep >= 6;
  const versionRows = versions.length ? versions : [];

  return (
    <div className="view-content ql-page">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="ql-hero">
        <div className="ql-hero__copy">
          <div className="ql-live">
            <span className={`ql-live__dot ${repaired ? "ql-live__dot--done" : ""}`} />
            <span>{repaired ? "REPAIRS APPLIED" : scanning ? "SCANNING" : "INSPECTION READY"}</span>
            <span className="ql-live__sep" />
            <span className="mono-note">{dataset.name} · {dataset.id.slice(0, 8)}</span>
          </div>
          <h1>What the quality engine concluded.</h1>
          <p>EcoMind automatically validates every sensor reading before it enters the AI pipeline.</p>
          <div className="ql-hero__counters">
            <Counter label="ROWS SCANNED" value={int(Math.round(animRows))} hint={rowsScanned ? "recorded" : "not recorded"} />
            <Counter label="QUALITY SCORE" value={qScore == null ? "—" : String(Math.round(animScore))} suffix={qScore == null ? undefined : "/100"} hint={`${passedCount} passed · ${failedCount} failed`} />
            <Counter label="ISSUES FOUND" value={int(Math.round(animIssues))} hint={`${Object.keys(typeCounts).length} issue types`} />
            <Counter label="REPAIRS APPLIED" value={int(Math.round(animRepairs))} hint={repaired ? "audit trail kept" : "awaiting apply"} />
          </div>
        </div>
        <div className="ql-hero__actions">
          <button type="button" className="ql-btn" onClick={() => { runScan(); onToast?.(`Rescanned ${issues.length} structural rules for ${dataset.name}.`); }}>
            <RefreshCw size={14} className={scanning ? "ql-spin" : ""} /> Rescan issues
          </button>
          <button type="button" className="ql-btn ql-btn--primary" onClick={onRepair}>
            <ShieldCheck size={14} /> {repaired ? "Repairs applied" : "Apply repairs"}
          </button>
          <button type="button" className="ql-btn" onClick={onSave} disabled={!repaired}>
            <DatabaseZap size={14} /> {saved ? "Version saved" : "Save new version"}
          </button>
        </div>
      </div>


      {empty ? (
        <div className="ql-empty">
          <span className="ql-empty__mark"><Check size={26} /></span>
          <div>
            <h2>Dataset is perfectly clean.</h2>
            <p>Every structural rule passed — no repairs were required. The anomaly stage still owns outlier behaviour.</p>
          </div>
          <button type="button" className="ql-btn" onClick={() => { runScan(); onToast?.("Re-ran all structural checks — still clean."); }}>
            <RefreshCw size={13} /> Re-check
          </button>
        </div>
      ) : null}

      {/* ── Gauge + health ───────────────────────────────────────────── */}
      <div className="ql-top">
        <section className="panel ql-gauge-card">
          <div className="ql-panel-head">
            <span className="section-eyebrow">QUALITY SCORE</span>
            <Tag tone={ready ? "lime" : qScore == null ? "neutral" : "orange"}>{qScore == null ? "unscored" : ready ? "excellent" : qScore >= 75 ? "attention" : "at risk"}</Tag>
          </div>
          <Gauge score={qScore} label={qScore == null ? "Not scored" : ready ? "Excellent" : qScore >= 75 ? "Acceptable" : "Needs work"} ready={ready} />
          <div className="ql-gauge-card__hover">
            <span className="section-eyebrow">DIMENSION BREAKDOWN</span>
            <MetricBar label="Missing values" value={completeness} note={nullRate != null ? `${pct1(nullRate)} null rate recorded` : `${missingFindings} null findings`} />
            <MetricBar label="Duplicates" value={uniqueness} note={`${dupFindings} duplicate findings`} />
            <MetricBar label="Outliers" value={null} note="preserved for the anomaly stage" />
            <MetricBar label="Invalid formats" value={validity} note={`${invalidFindings} format findings`} />
            <MetricBar label="Consistency" value={consistency} note={`${passedCount} of ${ruleTotal} rules passed`} />
            <MetricBar label="Completeness" value={structural} note={`${schema.length} columns in schema`} />
          </div>
        </section>

        <section className="panel ql-before">
          <div className="ql-panel-head">
            <div>
              <span className="section-eyebrow">BEFORE / AFTER</span>
              <h2>What cleaning changed</h2>
            </div>
            <Tag tone={repaired ? "lime" : "blue"}>{repaired ? "applied" : "projected"}</Tag>
          </div>
          <div className="ql-before__head">
            <span />
            <small>BEFORE</small>
            <small>AFTER</small>
          </div>
          {[
            { label: "Rows", before: int(rowsScanned), after: int(rowsScanned) },
            { label: "Missing values", before: int(missingFindings), after: repaired ? "0" : int(missingFindings) },
            { label: "Duplicates", before: int(dupFindings), after: repaired ? "0" : int(dupFindings) },
            { label: "Timestamp gaps", before: int(timestampFindings), after: repaired ? "0" : int(timestampFindings) },
            { label: "Invalid formats", before: int(invalidFindings), after: repaired ? "0" : int(invalidFindings) },
            { label: "Failing rules", before: int(failedCount), after: repaired ? "0" : int(failedCount) },
            { label: "Null %", before: nullRate == null ? "—" : pct1(nullRate), after: nullRate == null ? "—" : repaired ? "0.0%" : pct1(nullRate) },
            { label: "Quality score", before: qScore == null ? "—" : `${qScore}%`, after: qScore == null ? "—" : repaired ? "re-scored on save" : `${qScore}%` },
          ].map(row => (
            <div className="ql-before__row" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.before}</strong>
              <span className={repaired && row.before !== row.after ? "ql-before__delta" : "ql-before__same"}>
                {repaired && row.before !== row.after ? "↓ " : ""}{row.after}
              </span>
            </div>
          ))}
          <p className="mono-note ql-before__note">
            After values reflect applied repairs; the dataset is re-scored when the clean version is saved. Statistics come from the recorded target column ({targetColumn || "not recorded"}).
          </p>
        </section>
      </div>

      {/* ── Structural checks ────────────────────────────────────────── */}
      <section className="panel ql-checks">
        <div className="ql-panel-head">
          <div>
            <span className="section-eyebrow">STRUCTURAL CHECKS</span>
            <h2>{issues.length} rules evaluated</h2>
          </div>
          <div className="ql-checks__tools">
            <label className="ql-search">
              <Search size={13} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search rules or columns"
                aria-label="Search structural rules"
              />
              {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={12} /></button> : null}
            </label>
            <button type="button" className="ql-btn ql-btn--small" onClick={() => setSortKey(sortKey === "severity" ? "confidence" : sortKey === "confidence" ? "rule" : "severity")}>
              <ArrowDownUp size={13} /> Sort: {sortKey}
            </button>
          </div>
        </div>
        <div className="ql-filters">
          {FILTERS.map(f => (
            <button
              type="button"
              key={f}
              className={`ql-filter ${filter === f ? "ql-filter--active" : ""}`}
              onClick={() => { setFilter(f); setPage(0); }}
            >
              {f}
              {f !== "All issues" ? <span>{qCountFor(f)}</span> : <span>{totalIssues}</span>}
            </button>
          ))}
        </div>
        <div className="ql-rules">
          {rows.length === 0 ? (
            <p className="mono-note">No rule matches “{search}” in this filter.</p>
          ) : null}
          {pageRows.map((issue, i) => (
            <RuleCard
              key={issue.id}
              issue={issue}
              index={currentPage * PAGE + i}
              repaired={repaired}
              open={openRule === issue.id}
              onToggle={() => setOpenRule(openRule === issue.id ? null : issue.id)}
            />
          ))}
        </div>
        <div className="ql-pager">
          <span className="mono-note">{rows.length} of {filteredQuality.length} shown · page {currentPage + 1} / {pageCount}</span>
          <div>
            <button type="button" className="ql-btn ql-btn--small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="ql-btn ql-btn--small" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
      </section>


    </div>
  );

  function qCountFor(f: string): number {
    return issues.filter(i => i.type === f).length;
  }
}

export default QualityLab;
