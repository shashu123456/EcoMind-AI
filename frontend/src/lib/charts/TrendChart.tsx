import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { decimate, aggregateBy, extentOf, niceDomain, type Domain } from './scale';
import {
  AXIS_PROPS,
  CHART,
  ChartFrame,
  GRID_PROPS,
  MARGIN,
  SERIES,
  TOOLTIP_STYLE,
  type ChartFrameProps,
} from './chartBase';
import { Legend } from '../ui';
import { EmptyState } from '../ui';

export interface SeriesSpec {
  key: string;
  label: string;
  /** Rendered on the y-axis. Required — an unlabelled axis is unreadable. */
  unit: string;
  color?: string;
  dashed?: boolean;
  area?: boolean;
}

// --- TrendChart -----------------------------------------------------------

export interface TrendChartProps extends Omit<ChartFrameProps, 'children'> {
  data: readonly Record<string, unknown>[];
  x: string;
  series: readonly SeriesSpec[];
  /** Values to render in thousands separators. Defaults to every series key. */
  format?: (v: unknown, series: SeriesSpec) => string;
  maxPoints?: number;
}

/**
 * Consumption over time. Multiple series are overlaid lines, never stacked —
 * the reader needs absolute values against a shared scale, and stacking would
 * force them to do arithmetic to compare buildings.
 */
export function TrendChart({
  data,
  x,
  series,
  format,
  maxPoints = 400,
  empty,
  ...frame
}: TrendChartProps) {
  const rows = useMemo(() => {
    const src = decimate(
      data ?? [],
      x,
      maxPoints,
      series.map((s) => s.key),
    );
    return aggregateBy(
      src,
      x,
      series.map((s) => s.key),
      'sum',
    );
  }, [data, x, maxPoints, series]);

  const yDomain = useMemo<Domain>(
    () =>
      niceDomain(
        extentOf(
          rows,
          series.map((s) => s.key),
        ),
      ),
    [rows, series],
  );

  const label = (v: unknown, s: SeriesSpec) =>
    format
      ? format(v, s)
      : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(v) || 0)} ${s.unit}`;

  const legend = (
    <Legend
      items={series.map((s, i) => ({
        label: s.label,
        color: s.color ?? SERIES[i % SERIES.length],
        shape: s.area ? ('square' as const) : ('line' as const),
      }))}
    />
  );

  return (
    <ChartFrame
      legend={frame.legend ?? legend}
      empty={
        rows.length === 0
          ? (empty ?? (
              <EmptyState
                title="No readings in this range"
                description="Widen the time range or clear filters."
              />
            ))
          : undefined
      }
      {...frame}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows as Record<string, unknown>[]} margin={MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={x} {...AXIS_PROPS} minTickGap={28} />
          <YAxis
            {...AXIS_PROPS}
            width={56}
            domain={yDomain}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
            }
          />{' '}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: CHART.line, strokeWidth: 1 }}
            labelStyle={{ color: CHART.label, marginBottom: 4 }}
            formatter={(value: unknown, name: unknown) => {
              const spec = series.find((s) => s.key === name || s.label === name) ?? series[0];
              return [label(value, spec), spec.label];
            }}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? SERIES[i % SERIES.length]}
              strokeWidth={series.length === 1 ? 1.75 : 1.5}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// --- BarCompare -----------------------------------------------------------

export interface BarCompareProps extends Omit<ChartFrameProps, 'children'> {
  data: readonly Record<string, unknown>[];
  category: string;
  series: readonly SeriesSpec[];
  format?: (v: unknown, series: SeriesSpec) => string;
  layout?: 'horizontal' | 'vertical';
  /** Colour every bar by this key instead of by series. */
  colorBy?: string;
  colorScale?: Record<string, string>;
  maxPoints?: number;
  reference?: { value: number; label?: string };
}

/**
 * Grouped comparison. Horizontal by default because the category labels are
 * building/floor/device names, and truncated building names on a y-axis are
 * the most common way these charts become unreadable.
 */
export function BarCompare({
  data,
  category,
  series,
  format,
  layout = 'horizontal',
  colorBy,
  colorScale,
  maxPoints = 60,
  reference,
  empty,
  ...frame
}: BarCompareProps) {
  const horizontal = layout === 'horizontal';
  const rows = useMemo(() => {
    const src = Array.isArray(data) ? data : [];
    if (src.length <= maxPoints) return src;
    const sorted = [...src].sort(
      (a, b) => (Number(b[series[0].key]) || 0) - (Number(a[series[0].key]) || 0),
    );
    return sorted.slice(0, maxPoints);
  }, [data, maxPoints, series]);

  const label = (v: unknown, s: SeriesSpec) =>
    format
      ? format(v, s)
      : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(v) || 0)} ${s.unit}`;

  const legend = (
    <Legend
      items={series.map((s, i) => ({
        label: s.label,
        color: s.color ?? SERIES[i % SERIES.length],
        shape: 'square' as const,
      }))}
    />
  );

  return (
    <ChartFrame
      legend={colorBy ? undefined : (frame.legend ?? legend)}
      empty={
        rows.length === 0
          ? (empty ?? (
              <EmptyState
                title="Nothing to compare"
                description="No records match the current filters."
              />
            ))
          : undefined
      }
      {...frame}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows as Record<string, unknown>[]}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ ...MARGIN, left: horizontal ? 8 : 0, bottom: horizontal ? 0 : 8 }}
          barCategoryGap={horizontal ? '18%' : '28%'}
        >
          {' '}
          <CartesianGrid {...GRID_PROPS} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...AXIS_PROPS} />
              <YAxis
                type="category"
                dataKey={category}
                {...AXIS_PROPS}
                width={132}
                interval={0}
                tick={{ ...AXIS_PROPS.tick, fontSize: 11 }}
              />
            </>
          ) : (
            <>
              <XAxis
                type="category"
                dataKey={category}
                {...AXIS_PROPS}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={52}
              />
              <YAxis type="number" {...AXIS_PROPS} width={56} />
            </>
          )}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'var(--surface-2)' }}
            labelFormatter={(v) => String(v)}
            formatter={(value: unknown, name: unknown) => {
              const spec = series.find((s) => s.key === name || s.label === name) ?? series[0];
              return [label(value, spec), spec.label];
            }}
          />
          {reference && (
            <ReferenceLine
              {...(horizontal ? { x: reference.value } : { y: reference.value })}
              stroke={CHART.line}
              strokeDasharray="4 3"
              label={{
                value: reference.label,
                fill: CHART.label,
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? SERIES[i % SERIES.length]}
              radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              isAnimationActive={false}
              maxBarSize={28}
            >
              {colorBy &&
                rows.map((row, ri) => {
                  const key = String(row[colorBy]);
                  return <Cell key={ri} fill={colorScale?.[key] ?? SERIES[i % SERIES.length]} />;
                })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// --- RankedBars -----------------------------------------------------------

/**
 * A ranked list rendered as inline bars. Preferred over a chart whenever the
 * reader needs the *label* as much as the value — anomaly top-N, cost by
 * floor, savings by device.
 */
export function RankedBars({
  rows,
  valueKey,
  labelKey,
  format,
  max = 12,
  color = 'var(--brand)',
  onSelect,
  emptyLabel = 'No records',
}: {
  rows: readonly Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  format?: (v: unknown) => string;
  max?: number;
  color?: string;
  onSelect?: (row: Record<string, unknown>) => void;
  emptyLabel?: string;
}) {
  const data = useMemo(
    () =>
      [...(rows ?? [])]
        .filter((r) => Number.isFinite(Number(r[valueKey])))
        .sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]))
        .slice(0, max),
    [rows, valueKey, max],
  );

  const maxValue = useMemo(
    () => Math.max(...data.map((d) => Number(d[valueKey])), 0),
    [data, valueKey],
  );

  if (!data.length) {
    return <p className="py-6 text-center text-sm text-neutral-600">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {data.map((row, i) => {
        const value = Number(row[valueKey]);
        const label = String(row[labelKey] ?? '—');
        const Wrapper = onSelect ? 'button' : 'div';
        return (
          <li key={`${label}-${i}`}>
            <Wrapper
              {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(row) } : {})}
              className={
                onSelect
                  ? 'group flex w-full items-center gap-3 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--surface-2)]'
                  : 'flex items-center gap-3 px-1.5 py-1'
              }
            >
              <span className="w-4 shrink-0 text-right text-2xs text-neutral-500">{i + 1}</span>
              <span
                className="min-w-0 flex-1 truncate text-sm text-neutral-700 group-hover:text-neutral-800"
                title={label}
              >
                {label}
              </span>
              <span
                aria-hidden
                className="h-1.5 shrink-0 rounded-full"
                style={{
                  width: `${maxValue > 0 ? (value / maxValue) * 38 : 0}%`,
                  backgroundColor: color,
                  minWidth: 2,
                }}
              />
              <span className="num w-20 shrink-0 text-right text-sm font-medium text-neutral-800">
                {format
                  ? format(value)
                  : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)}
              </span>
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}
