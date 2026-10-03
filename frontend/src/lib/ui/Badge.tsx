import type { ReactNode } from 'react';
import { cn } from '../cn';

export type Severity = 'normal' | 'low' | 'moderate' | 'high' | 'critical';

const SEVERITY_COLOR: Record<Severity, string> = {
  normal: 'var(--sev-normal)',
  low: 'var(--sev-low)',
  moderate: 'var(--sev-moderate)',
  high: 'var(--sev-high)',
  critical: 'var(--sev-critical)',
};

export const SEVERITY_ORDER: Severity[] = ['normal', 'low', 'moderate', 'high', 'critical'];

const SEVERITY_LABEL: Record<Severity, string> = {
  normal: 'Normal',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

/** A tinted pill on a solid dot. Used for severity, status and counts. */
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
 */
export function SeverityTag({
  severity,
  count,
  className,
}: {
  severity: Severity;
  count?: number;
  className?: string;
}) {
  const colour = SEVERITY_COLOR[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color: colour, borderColor: `${colour}55`, backgroundColor: `${colour}14` }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
        aria-hidden
      />
      {SEVERITY_LABEL[severity]}
      {count !== undefined && <span className="num font-semibold">{count}</span>}
    </span>
  );
}

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

export { SEVERITY_COLOR, SEVERITY_LABEL, STAGE_STATUS };
