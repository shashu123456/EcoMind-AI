import type { ReactNode } from 'react';
import { cn } from '../cn';

export type KpiTone = 'neutral' | 'ok' | 'warn' | 'critical' | 'info';

const TONE: Record<KpiTone, { value: string; delta: string }> = {
  neutral: { value: 'var(--ink)', delta: 'var(--ink-low)' },
  ok: { value: 'var(--ok)', delta: 'var(--ok)' },
  warn: { value: 'var(--warn)', delta: 'var(--warn)' },
  critical: { value: 'var(--critical)', delta: 'var(--critical)' },
  info: { value: 'var(--info)', delta: 'var(--info)' },
};

interface KpiTileProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  delta?: ReactNode;
  /** Whether `delta` reads as good or bad. Defaults to `neutral` (informational). */
  deltaSentiment?: 'good' | 'bad' | 'neutral';
  tone?: KpiTone;
  icon?: ReactNode;
  className?: string;
}

const SENTIMENT = {
  good: 'text-ok',
  bad: 'text-critical',
  neutral: 'text-neutral-600',
} as const;

/**
 * One number, its unit, and its direction. Never decorative — a tile with no
 * comparative context should be an EmptyState, not a KPI.
 */
export function KpiTile({
  label,
  value,
  unit,
  hint,
  delta,
  deltaSentiment = 'neutral',
  tone = 'neutral',
  icon,
  className,
}: KpiTileProps) {
  return (
    <div className={cn('surface flex flex-col justify-between gap-3 px-4 py-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {icon && <span className="shrink-0 text-neutral-500">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="num text-2xl font-semibold leading-none"
          style={{ color: TONE[tone].value }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-neutral-600">{unit}</span>}
      </div>
      {(delta || hint) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          {delta && (
            <span className={cn('num font-medium', SENTIMENT[deltaSentiment])}>{delta}</span>
          )}
          {hint && <span className="text-neutral-600">{hint}</span>}
        </div>
      )}
    </div>
  );
}

/** A horizontal row of KPI tiles. */
export function KpiRow({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        columns === 5 && 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
        columns === 6 && 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The page's single dominant conclusion. There is exactly one of these per
 * page — it answers "what should I do" before any chart is on screen.
 */
export function HeroMetric({
  eyebrow,
  value,
  unit,
  verdict,
  tone = 'neutral',
  children,
  className,
}: {
  eyebrow: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  verdict?: ReactNode;
  tone?: KpiTone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('surface p-6', className)}>
      <span className="eyebrow">{eyebrow}</span>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="num text-4xl font-semibold leading-none"
          style={{ color: TONE[tone].value }}
        >
          {value}
        </span>
        {unit && <span className="text-md text-neutral-600">{unit}</span>}
      </div>
      {verdict && <p className="mt-3 max-w-2xl text-md text-neutral-700">{verdict}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
