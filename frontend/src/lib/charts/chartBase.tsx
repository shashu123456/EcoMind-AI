import type { ReactNode } from 'react';
import { cn } from '../cn';

/** Chart chrome reads from the same tokens as the page, so charts never drift from the UI. */
export const CHART = {
  grid: 'var(--line-faint)',
  axis: 'var(--ink-faint)',
  label: 'var(--ink-low)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  line: 'var(--line-strong)',
  font: 'Inter, sans-serif',
  radius: 4,
} as const;

export const SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const;

export const AXIS_PROPS = {
  stroke: CHART.axis,
  tick: { fill: CHART.label, fontSize: 11, fontFamily: CHART.font },
  tickLine: false,
  axisLine: { stroke: CHART.line },
} as const;

export const GRID_PROPS = {
  stroke: CHART.grid,
  strokeDasharray: '0',
  vertical: false,
} as const;

export const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** A consistent tooltip shell. Recharts' own tooltip is unstyled. */
export const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--line-strong)',
  borderRadius: 6,
  boxShadow: 'var(--shadow-md)',
  fontSize: 12,
  fontFamily: CHART.font,
  padding: '8px 10px',
  color: 'var(--ink)',
} as const;

export interface ChartFrameProps {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  /**
   * Rendered *instead of* the chart when there is nothing to plot.
   *
   * This is a replacement, not an overlay: passing a truthy node here hides
   * `children` entirely. A caller must therefore decide with a condition and
   * pass `undefined` when there is data —
   * `empty={rows.length === 0 ? <EmptyState .../> : undefined}`.
   *
   * Passing an always-truthy empty node is a silent, total failure: the plot
   * never renders and nothing reports an error, which is exactly what happened
   * to every chart in this directory before it was fixed.
   */
  empty?: ReactNode;
  height?: number | string;
  /** Print-friendly: drop the card chrome for PDF embedding. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Every chart sits in one of these. The frame owns the title, the empty state
 * and the height so that 40 charts across 10 pages all measure the same.
 */
export function ChartFrame({
  title,
  hint,
  actions,
  legend,
  empty,
  height = 260,
  bare,
  className,
  children,
}: ChartFrameProps) {
  const hasHeader = Boolean(title || actions || legend);
  return (
    <figure className={cn(bare ? 'flex flex-col' : 'surface flex flex-col', className)}>
      {hasHeader && (
        <figcaption
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-2',
            bare ? 'mb-2' : 'border-b border-[var(--line)] px-4 py-3',
          )}
        >
          <div className="min-w-0">
            <h3 className="text-md font-semibold text-neutral-800">{title}</h3>
            {hint && <p className="prose-muted mt-0.5 text-xs">{hint}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </figcaption>
      )}
      {empty ? (
        <div style={{ minHeight: height }} className="flex items-center justify-center px-4 py-8">
          {empty}
        </div>
      ) : (
        <div className={cn(bare ? '' : 'flex-1 px-2 py-3', bare && 'px-0')}>
          <div style={{ height, width: '100%' }}>{children}</div>
        </div>
      )}
      {legend && (
        <div className={cn(bare ? 'mt-2' : 'border-t border-[var(--line)] px-4 py-2.5')}>
          {legend}
        </div>
      )}
    </figure>
  );
}
