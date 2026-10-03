import type { ReactNode } from 'react';
import { cn } from '../cn';

export type BarTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'critical' | 'info';

/**
 * Determinate progress. `value` is a 0-1 fraction.
 *
 * When a long operation is running this must reflect *measured* progress
 * (rows processed, models trained) — never a timer that ticks to 90% and
 * hopes.
 */
export function ProgressBar({
  value,
  tone = 'brand',
  label,
  showValue,
  size = 'md',
  className,
}: {
  value: number;
  tone?: BarTone;
  label?: ReactNode;
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const color = `var(--${tone === 'brand' ? 'brand' : tone})`;
  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          {label && <span className="text-neutral-700">{label}</span>}
          {showValue && (
            <span className="num font-medium text-neutral-800">{Math.round(pct * 100)}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'w-full overflow-hidden rounded-full bg-[var(--surface-3)]',
          size === 'sm' ? 'h-1' : 'h-1.5',
        )}
      >
        <div
          className="h-full rounded-full transition-[width] duration-slow ease-out"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/**
 * Indeterminate — only for work whose duration is genuinely unknown before it
 * starts. Anything measurable should use ProgressBar with real numbers.
 */
export function IndeterminateBar({ label, className }: { label?: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full', className)}>
      {label && <div className="mb-1.5 text-xs text-neutral-700">{label}</div>}
      <div
        role="progressbar"
        aria-valuetext="In progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
      >
        <div
          className="h-full w-1/3 rounded-full bg-brand"
          style={{ animation: 'indeterminate 1.2s var(--ease) infinite' }}
        />
      </div>
      <style>{`@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

/**
 * A bounded score as a horizontal bar with a threshold marker. Used for
 * quality dimensions, cost breakdown and ranked comparisons.
 */
export function MeterBar({
  value,
  max,
  tone = 'brand',
  threshold,
  className,
}: {
  value: number;
  max: number;
  tone?: BarTone;
  /** Draw a tick where a limit sits, e.g. a fault ceiling. */
  threshold?: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(1, value / safeMax));
  const thresholdPct =
    threshold !== undefined ? Math.max(0, Math.min(1, threshold / safeMax)) : null;
  return (
    <div className={cn('relative h-1.5 w-full rounded-full bg-[var(--surface-3)]', className)}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct * 100}%`,
          backgroundColor: `var(--${tone === 'brand' ? 'brand' : tone})`,
        }}
      />
      {thresholdPct !== null && (
        <span
          aria-hidden
          className="absolute -top-0.5 h-2.5 w-px bg-[var(--ink-faint)]"
          style={{ left: `${thresholdPct * 100}%` }}
        />
      )}
    </div>
  );
}
