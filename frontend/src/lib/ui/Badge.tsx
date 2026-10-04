import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Two vocabularies live here and they are deliberately not the same set.
 *
 * `Severity` is the classifier's *five-step contract* — the vocabulary that
 * appears in schema documentation and in the detector's own source. It is what
 * the backend can technically produce.
 *
 * `DataSeverity` is what the detector actually emits, and therefore the only
 * thing allowed to label a row on screen. The gap between the two is not a
 * detail: rendering a "Critical" row that reads 0 invites the reader to
 * conclude the estate is healthy, when the truth is that the classifier never
 * emits the value at all. See `anomaly_service._severity` and the
 * `severity_bands` the scan now publishes.
 */

/** The five-step model ramp. Schema documentation only — never labels data. */
export type Severity = 'critical' | DataSeverity | 'normal';

/** The classifier's emitted vocabulary: what a row on screen may say (§5.4). */
export type DataSeverity = 'high' | 'moderate' | 'low';

/**
 * A severity outside the three-step data ramp.
 *
 * This is a real state, not a defensive branch: the backend declares
 * `critical` in its taxonomy and reserves it for values it cannot currently
 * produce. If a future threshold change ever does produce one, the honest
 * rendering is "this exists and the ramp does not cover it" — not a silent
 * remap onto `high`, which would understate it.
 */
export type OutOfRampSeverity = 'out-of-ramp';

export type DisplaySeverity = DataSeverity | OutOfRampSeverity;

const SEVERITY_COLOR: Record<Severity, string> = {
  normal: 'var(--sev-normal)',
  low: 'var(--sev-low)',
  moderate: 'var(--sev-moderate)',
  high: 'var(--sev-high)',
  critical: 'var(--sev-critical)',
};

export const SEVERITY_ORDER: Severity[] = ['normal', 'low', 'moderate', 'high', 'critical'];

/** Display order for data rows — highest first, matching the ramp. */
export const DATA_SEVERITY_ORDER: readonly DataSeverity[] = ['high', 'moderate', 'low'];

const SEVERITY_LABEL: Record<Severity, string> = {
  normal: 'Normal',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

/**
 * Narrow a raw backend string to something the ramp can colour, or flag it.
 *
 * Returns `'out-of-ramp'` rather than a default severity on purpose. Every
 * other choice here — `'high'`, `'low'`, dropping the row — quietly reclassifies
 * data the reader has no way to check, which is the failure this product is
 * trying hardest to avoid.
 */
export function toDataSeverity(value: string): DisplaySeverity {
  return (DATA_SEVERITY_ORDER as readonly string[]).includes(value)
    ? (value as DataSeverity)
    : 'out-of-ramp';
}

/** A tinted pill on a solid dot. Used for status and counts. */
export function Badge({
  children,
  color,
  className,
  dot,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium',
        'whitespace-nowrap',
        className,
      )}
      style={
        color
          ? {
              color: 'var(--ink)',
              borderColor: 'var(--line)',
              backgroundColor: 'var(--surface-2)',
              boxShadow: `inset 0 0 0 1px ${color}22`,
            }
          : undefined
      }
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

/**
 * Severity is always a colour *and* a word. Never colour alone — this has to
 * survive greyscale printing and colour-vision deficiency.
 *
 * The vocabulary is three, not five. `critical` is documented in the schema
 * but never emitted by this detector, and a red "Critical 0" row would imply
 * the absence of an emergency rather than the absence of the ability to detect
 * one — so the ramp simply does not have a step for it.
 */
export function SeverityTag({
  severity,
  count,
  className,
}: {
  severity: DisplaySeverity;
  count?: number;
  className?: string;
}) {
  const outOfRamp = severity === 'out-of-ramp';
  const colour = outOfRamp ? SEVERITY_COLOR.critical : SEVERITY_COLOR[severity];
  const label = outOfRamp ? 'Critical' : SEVERITY_LABEL[severity];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color: colour, borderColor: `${colour}55`, backgroundColor: `${colour}14` }}
      title={
        outOfRamp
          ? 'Outside the three-step severity ramp. The classifier declares this value but does not currently emit it.'
          : undefined
      }
    >
      {/* A ring rather than a filled dot: the mark itself says this is outside
          the ramp the other rows are drawn from. */}
      <span
        className={cn('h-1.5 w-1.5 shrink-0', outOfRamp ? 'rounded-full' : 'rounded-full')}
        style={
          outOfRamp
            ? { borderColor: colour, borderWidth: 2, borderStyle: 'solid' }
            : { backgroundColor: colour }
        }
        aria-hidden
      />
      {label}
      {count !== undefined && <span className="num font-semibold">{count}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Delta semantics — DESIGN_SPEC §10.5
// ---------------------------------------------------------------------------

/**
 * Whether an increase in a quantity is good, bad, or neither.
 *
 * This is a correctness rule, not a style. Unifying it is what stops the
 * product showing a green "+18% energy" as a win: energy going *up* is the bad
 * direction, and a component that guessed would be lying in a way no reader can
 * catch without knowing the metric.
 */
export type DeltaTone = 'good' | 'bad' | 'neutral';

/** The quantities §10.5 enumerates. Adding one here is a deliberate act. */
export type DeltaQuantity =
  | 'cost'
  | 'spend'
  | 'co2'
  | 'anomalies'
  | 'excess_kwh'
  | 'payback_months'
  | 'energy_saved'
  | 'recoverable_kwh'
  | 'load_factor'
  | 'dq_score'
  | 'r2'
  | 'latency'
  | 'duration';

/** How an *increase* in each quantity reads. One table, enforced in one place. */
const INCREASE_TONE: Record<DeltaQuantity, DeltaTone> = {
  cost: 'bad',
  spend: 'bad',
  co2: 'bad',
  anomalies: 'bad',
  excess_kwh: 'bad',
  payback_months: 'bad',
  energy_saved: 'good',
  recoverable_kwh: 'good',
  load_factor: 'good',
  dq_score: 'good',
  r2: 'good',
  // Neither direction is good news; the arrow and the number carry the meaning.
  latency: 'neutral',
  duration: 'neutral',
};

/** The tone for a change of `direction` in `quantity`. */
export function deltaTone(quantity: DeltaQuantity, direction: 'up' | 'down'): DeltaTone {
  const upTone = INCREASE_TONE[quantity];
  return direction === 'up' ? upTone : flip(upTone);
}

function flip(tone: DeltaTone): DeltaTone {
  if (tone === 'good') return 'bad';
  if (tone === 'bad') return 'good';
  return 'neutral';
}

const DELTA_COLOR: Record<DeltaTone, string> = {
  good: 'var(--ok)',
  bad: 'var(--critical)',
  neutral: 'var(--ink-low)',
};

/**
 * A signed change, coloured by whether that direction is good news.
 *
 * `tone` may be passed directly for quantities outside §10.5. When it is
 * omitted, the caller must supply `quantity` and the table decides — which is
 * the point, because the table is the thing that has to be right.
 *
 * The arrow is decorative: the sign is always present in the text as well, so
 * the meaning survives a screen reader, a greyscale print, and a reader who
 * cannot distinguish the two hues.
 */
export function DeltaBadge({
  value,
  quantity,
  direction,
  tone,
  className,
  suffix,
}: {
  /** The signed change, e.g. `'+18%'`, `'-3.2 pts'`, `'0%'`. */
  value: string;
  quantity?: DeltaQuantity;
  direction?: 'up' | 'down';
  tone?: DeltaTone;
  className?: string;
  suffix?: string;
}) {
  const resolved: DeltaTone =
    tone ?? (quantity && direction ? deltaTone(quantity, direction) : 'neutral');
  const colour = DELTA_COLOR[resolved];
  const glyph = resolved === 'neutral' ? '±' : direction === 'down' ? '↓' : '↑';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-2xs font-medium',
        className,
      )}
      style={{ color: colour }}
    >
      <span aria-hidden>{glyph}</span>
      <span className="num">{value}</span>
      {suffix ? <span className="text-[var(--ink-mid)]">{suffix}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------

export type DataQualityStatus = 'complete' | 'imputed' | 'repaired' | 'flagged' | 'excluded';

const STATUS: Record<DataQualityStatus, { label: string; color: string }> = {
  complete: { label: 'Complete', color: 'var(--ok)' },
  imputed: { label: 'Imputed', color: 'var(--info)' },
  repaired: { label: 'Repaired', color: 'var(--info)' },
  flagged: { label: 'Flagged', color: 'var(--warn)' },
  excluded: { label: 'Excluded', color: 'var(--critical)' },
};

/** Per-row provenance after Data Quality. Never "clean" — always says what happened. */
export function QualityTag({
  status,
  className,
}: {
  status: DataQualityStatus;
  className?: string;
}) {
  const { label, color } = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
    >
      {label}
    </span>
  );
}

export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped';

const STAGE_STATUS: Record<StageStatus, { label: string; color: string }> = {
  pending: { label: 'Not started', color: 'var(--ink-faint)' },
  running: { label: 'Running', color: 'var(--info)' },
  done: { label: 'Complete', color: 'var(--ok)' },
  failed: { label: 'Failed', color: 'var(--critical)' },
  blocked: { label: 'Blocked', color: 'var(--warn)' },
  skipped: { label: 'Skipped', color: 'var(--ink-faint)' },
};

export function StageStatusTag({ status, className }: { status: StageStatus; className?: string }) {
  const { label, color } = STAGE_STATUS[status] ?? STAGE_STATUS.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
    >
      {label}
    </span>
  );
}

export function statusColor(status: string): string {
  return (STAGE_STATUS as Record<string, { color: string }>)[status]?.color ?? 'var(--ink-faint)';
}

export function statusLabel(status: string): string {
  return (STAGE_STATUS as Record<string, { label: string }>)[status]?.label ?? status;
}

/** Typed aliases. The stepper and process views work in StageStatus, not string. */
export function stageStatusColor(status: StageStatus): string {
  return statusColor(status);
}

export function stageStatusLabel(status: StageStatus): string {
  return statusLabel(status);
}

export type { CSSProperties };

export { SEVERITY_COLOR, SEVERITY_LABEL, STAGE_STATUS };
