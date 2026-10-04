import { useMemo, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { aggregateBy, extentOf, niceDomain, numeric, ticks } from './scale';
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
import { EmptyState, Legend } from '../ui';

const compact = (v: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, notation: 'compact' }).format(v);

const withUnit = (unit: string) => (v: number) => `${compact(v)} ${unit}`;

// --- ForecastBand ---------------------------------------------------------

export interface ForecastBandProps extends Omit<ChartFrameProps, 'children'> {
  data: readonly Record<string, unknown>[];
  x: string;
  /** Lower bound of the plausible range — the P10. */
  lowKey: string;
  /** Point estimate. */
  midKey: string;
  /** Upper bound — the P90. */
  highKey: string;
  /** Optional observed history drawn behind the band. */
  actualKey?: string;
  unit?: string;
  /** Marks where history ends and forecast begins. */
  splitLabel?: string;
  annotation?: ReactNode;
}

/**
 * Actual history behind, forecast band in front.
 *
 * The band is the only uncertainty representation on the whole platform. No
 * RÂ², no RMSE, no confidence-gate verdict — a building manager needs "how much
 * could this be", not how well a regressor scored.
 */
export function ForecastBand({
  data,
  x,
  lowKey,
  midKey,
  highKey,
  actualKey,
  unit = 'kWh',
  splitLabel = 'Forecast starts',
  annotation,
  ...frame
}: ForecastBandProps) {
  const rows = data ?? [];
  const hasBand = rows.some((r) => numeric(r[lowKey]) !== null || numeric(r[highKey]) !== null);
  const forecastFrom = useMemo(() => {
    const first = rows.find((r) => numeric(r[midKey]) !== null);
    return first ? String(first[x]) : null;
  }, [rows, midKey, x]);

  const yDomain = useMemo(
    () => niceDomain(extentOf(rows, [lowKey, highKey, ...(actualKey ? [actualKey] : [])]), 0.06),
    [rows, lowKey, highKey, actualKey],
  );

  const fmt = withUnit(unit);

  const legend = (
    <Legend
      items={[
        ...(actualKey ? [{ label: 'Actual', color: SERIES[0], shape: 'line' as const }] : []),
        { label: 'Forecast', color: SERIES[1], shape: 'square' as const },
        { label: 'P10–P90 range', color: 'var(--chart-2)', shape: 'square' as const },
      ]}
    />
  );

  return (
    <ChartFrame
      legend={frame.legend ?? legend}
      height={frame.height ?? 300}
      empty={
        rows.length === 0
          ? (frame.empty ?? (
              <EmptyState
                title="No forecast yet"
                description="Run the forecast to see projected consumption."
              />
            ))
          : undefined
      }
      {...frame}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows as Record<string, unknown>[]} margin={MARGIN}>
          <defs>
            <linearGradient id="forecastBandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[1]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SERIES[1]} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={x} {...AXIS_PROPS} minTickGap={24} />
          <YAxis {...AXIS_PROPS} width={56} domain={yDomain} tickFormatter={compact} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: CHART.line, strokeWidth: 1 }}
            labelStyle={{ color: CHART.label, marginBottom: 4 }}
            formatter={(value: unknown, name: unknown) => [fmt(Number(value) || 0), String(name)]}
          />
          {forecastFrom && (
            <ReferenceLine
              x={forecastFrom}
              stroke={CHART.line}
              strokeDasharray="4 3"
              label={{
                value: splitLabel,
                fill: CHART.label,
                fontSize: 10,
                position: 'insideTopLeft',
              }}
            />
          )}
          {/* Band drawn as high â†’ low so the fill spans the plausible range. */}
          <Area
            dataKey={highKey}
            stroke="none"
            fill="url(#forecastBandFill)"
            isAnimationActive={false}
            name="P90"
            legendType="none"
          />
          <Area
            dataKey={lowKey}
            stroke="none"
            fill="var(--surface)"
            fillOpacity={1}
            isAnimationActive={false}
            name="P10"
            legendType="none"
          />
          {actualKey && (
            <Line
              dataKey={actualKey}
              stroke={SERIES[0]}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
              name="Actual"
              connectNulls={false}
            />
          )}
          <Line
            dataKey={midKey}
            stroke={SERIES[1]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name="Forecast"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      {annotation && <p className="prose-muted mt-2 px-2 text-2xs">{annotation}</p>}
    </ChartFrame>
  );
}

// --- DemandCurve ----------------------------------------------------------

/**
 * Load duration: kW on y, cumulative share of time on x. Answers "how much of
 * our load is avoidable peak" — the question behind every demand-reduction
 * recommendation. A plain time series cannot answer it.
 */
export function DemandCurve({
  data,
  demandKey,
  label = 'Load duration curve',
  unit = 'kW',
  annotations = [],
  ...frame
}: {
  data: readonly Record<string, unknown>[];
  demandKey: string;
  label?: string;
  unit?: string;
  annotations?: { value: number; caption: string }[];
} & Omit<ChartFrameProps, 'children'>) {
  const rows = useMemo(() => {
    const sorted = (data ?? [])
      .map((r) => numeric(r[demandKey]))
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a);
    const n = sorted.length;
    if (!n) return [];
    return sorted.map((v, i) => ({ demand: v, pctOfTime: (i / (n - 1 || 1)) * 100 }));
  }, [data, demandKey]);

  const yDomain = useMemo(() => niceDomain(extentOf(rows, ['demand']), 0.04), [rows]);

  return (
    <ChartFrame
      hint="Left edge is your peak hours. Every step right is progressively lower load."
      height={frame.height ?? 280}
      empty={
        rows.length === 0
          ? (frame.empty ?? (
              <EmptyState
                title="No demand profile"
                description="Demand data appears once readings are imported."
              />
            ))
          : undefined
      }
      {...frame}
      title={label}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="pctOfTime"
            type="number"
            domain={[0, 100]}
            {...AXIS_PROPS}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
          />
          <YAxis {...AXIS_PROPS} width={56} domain={yDomain} tickFormatter={compact} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: CHART.line }}
            labelFormatter={(v) => `Top ${Math.round(100 - Number(v))}% of hours`}
            formatter={(value: unknown) => [`${compact(Number(value) || 0)} ${unit}`, 'Load']}
          />
          {annotations.map((a, i) => (
            <ReferenceLine
              key={i}
              y={a.value}
              stroke={SERIES[3]}
              strokeDasharray="4 3"
              label={{ value: a.caption, fill: CHART.label, fontSize: 10, position: 'right' }}
            />
          ))}
          <Area
            dataKey="demand"
            stroke={SERIES[0]}
            strokeWidth={1.75}
            fill={SERIES[0]}
            fillOpacity={0.1}
            isAnimationActive={false}
            name="Load"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

// --- HeatmapGrid ----------------------------------------------------------

export interface HeatmapCell {
  row: string;
  column: string;
  value: number;
  meta?: Record<string, unknown>;
}

/**
 * Building Ã— month, floor Ã— hour, device Ã— day — whichever two dimensions the
 * page needs. A heatmap is the only honest way to show 56 devices Ã— 36 months.
 */
export function HeatmapGrid({
  cells,
  rowLabel,
  columnLabel,
  format = (v) => compact(v),
  unit,
  onCellClick,
  selected,
  rowOrder,
  columnOrder,
  legendTitle,
  ...frame
}: {
  cells: readonly HeatmapCell[];
  rowLabel: string;
  columnLabel: string;
  format?: (v: number) => string;
  unit?: string;
  onCellClick?: (cell: HeatmapCell) => void;
  selected?: { row: string; column: string };
  rowOrder?: readonly string[];
  columnOrder?: readonly string[];
  legendTitle?: string;
} & Omit<ChartFrameProps, 'children'>) {
  const model = useMemo(() => {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const lookup = new Map<string, HeatmapCell>();
    for (const cell of cells ?? []) {
      rowSet.add(cell.row);
      colSet.add(cell.column);
      lookup.set(`${cell.row} ${cell.column}`, cell);
    }
    const rows = rowOrder ? [...rowOrder] : [...rowSet];
    const columns = columnOrder ? [...columnOrder] : [...colSet];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const cell of lookup.values()) {
      if (Number.isFinite(cell.value)) {
        if (cell.value < min) min = cell.value;
        if (cell.value > max) max = cell.value;
      }
    }
    return { rows, columns, lookup, min, max };
  }, [cells, rowOrder, columnOrder]);

  const { rows, columns, lookup, min, max } = model;
  const span = max - min;

  function shade(value: number): string {
    if (!Number.isFinite(value)) return 'var(--surface-2)';
    const t = span > 0 ? (value - min) / span : 0.5;
    // Sequential single-hue ramp, light â†’ brand. Not a rainbow: rainbow ramps
    // invent boundaries that are not in the data.
    return `color-mix(in srgb, var(--chart-1) ${Math.round(8 + t * 68)}%, var(--surface-2))`;
  }

  const empty = frame.empty ?? (
    <EmptyState title="No matrix yet" description="Import readings to populate this view." />
  );

  const legendScale = useMemo(() => {
    const [lo, ...rest] = ticks(min, max, 5);
    return [lo, ...rest];
  }, [min, max]);

  return (
    <ChartFrame
      height={frame.height}
      empty={rows.length && columns.length ? undefined : empty}
      legend={
        frame.legend ?? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-neutral-600">
                {legendTitle ?? `${rowLabel} Ã— ${columnLabel}`}
              </span>
              <span className="flex items-center gap-1">
                {legendScale.map((t) => (
                  <span key={t} className="num text-2xs text-neutral-500">
                    {format(t)}
                  </span>
                ))}
              </span>
              <span
                aria-hidden
                className="h-2 w-24 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${shade(min)}, ${shade((min + max) / 2)}, ${shade(max)})`,
                }}
              />
            </div>
            {unit && <span className="text-2xs text-neutral-600">{unit}</span>}
          </div>
        )
      }
      {...frame}
    >
      <div className="h-full w-full overflow-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <caption className="sr-only">
            {rowLabel} by {columnLabel}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--surface)] pr-2 text-left text-2xs font-medium text-neutral-600"
              >
                {rowLabel}
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="whitespace-nowrap px-1 text-center text-2xs font-medium text-neutral-600"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-32 truncate bg-[var(--surface)] pr-2 text-right text-2xs font-medium text-neutral-700"
                  title={row}
                >
                  {row}
                </th>
                {columns.map((col) => {
                  const cell = lookup.get(`${row} ${col}`);
                  const isSelected = selected?.row === row && selected.column === col;
                  const Wrapper = onCellClick ? 'button' : 'div';
                  return (
                    <td key={col} className="p-0">
                      <Wrapper
                        {...(onCellClick && cell
                          ? {
                              type: 'button' as const,
                              onClick: () => onCellClick(cell),
                              title: `${row} Â· ${col}: ${format(cell.value)}${unit ? ` ${unit}` : ''}`,
                            }
                          : {
                              title: cell ? `${row} Â· ${col}: ${format(cell.value)}` : undefined,
                            })}
                        className="flex h-6 w-full min-w-9 items-center justify-center rounded-[3px] text-2xs tabular-nums"
                        style={{
                          backgroundColor: cell ? shade(cell.value) : 'var(--surface-2)',
                          color:
                            cell && span > 0 && (cell.value - min) / span > 0.6
                              ? 'var(--ink-invert)'
                              : 'var(--ink-mid)',
                          outline: isSelected ? '2px solid var(--brand)' : undefined,
                          cursor: onCellClick && cell ? 'pointer' : 'default',
                        }}
                      >
                        {cell ? format(cell.value) : ''}
                      </Wrapper>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartFrame>
  );
}

// --- PipelineFlow ---------------------------------------------------------

/**
 * The 8 Data Quality stages as a flow. Progress is *measured* — a stage is only
 * filled when the backend has reported it complete. The reveal animation is
 * bound to that state, which is why it is the only animation in the system.
 */
export function PipelineFlow({
  stages,
  format,
  onSelect,
  activeIndex,
  ...frame
}: {
  stages: readonly {
    key: string;
    label: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    issuesFound?: number;
    issuesRepaired?: number;
  }[];
  format?: (v: number) => string;
  onSelect?: (index: number) => void;
  activeIndex?: number;
} & Omit<ChartFrameProps, 'children'>) {
  const filled = stages.filter((s) => s.status === 'done').length;
  const pct = stages.length ? filled / stages.length : 0;
  const fmt = format ?? ((v: number) => compact(v));

  return (
    <ChartFrame
      height={frame.height ?? 132}
      legend={
        frame.legend ?? (
          <p className="num text-2xs text-neutral-600">
            {filled} of {stages.length} stages complete
            {stages.some((s) => s.status === 'failed') && ' · 1 stage failed'}
          </p>
        )
      }
      empty={frame.empty}
      {...frame}
    >
      <ol className="flex h-full items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex;
          const color =
            stage.status === 'done'
              ? 'var(--ok)'
              : stage.status === 'failed'
                ? 'var(--critical)'
                : stage.status === 'running'
                  ? 'var(--info)'
                  : 'var(--line-strong)';
          const Wrapper = onSelect ? 'button' : 'div';
          return (
            <li key={stage.key} className="flex min-w-24 flex-1 flex-col justify-center gap-1.5">
              <Wrapper
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(i) } : {})}
                className="rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                style={{
                  borderColor: isActive ? 'var(--brand)' : 'var(--line)',
                  backgroundColor: isActive ? 'var(--brand-tint)' : 'var(--surface-inset)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-2xs font-medium text-neutral-700">
                    {stage.label}
                  </span>
                </span>
                {stage.status === 'done' && (stage.issuesFound || 0) > 0 && (
                  <span className="num block text-2xs text-neutral-600">
                    {fmt(stage.issuesRepaired ?? 0)} of {fmt(stage.issuesFound ?? 0)} repaired
                  </span>
                )}
                {stage.status === 'done' && (stage.issuesFound ?? 0) === 0 && (
                  <span className="block text-2xs text-neutral-500">No issues</span>
                )}
                {stage.status === 'pending' && (
                  <span className="block text-2xs text-neutral-500">Waiting</span>
                )}
                {stage.status === 'running' && (
                  <span className="block text-2xs text-info">Working…</span>
                )}
                {stage.status === 'failed' && (
                  <span className="block text-2xs text-critical">Failed</span>
                )}
              </Wrapper>
            </li>
          );
        })}
      </ol>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full bg-ok transition-[width] duration-slow ease-out"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </ChartFrame>
  );
}

// --- SeverityBars ---------------------------------------------------------

/**
 * Severity as bars, always. A donut of five slices cannot be read to within
 * 10% of the largest slice, and severity is exactly the thing a user must
 * compare at a glance.
 */
export function SeverityBars({
  counts,
  total,
  onSelect,
  selected,
  ...frame
}: {
  counts: readonly { severity: string; label: string; color: string; count: number }[];
  total?: number;
  onSelect?: (severity: string) => void;
  selected?: string;
} & Omit<ChartFrameProps, 'children'>) {
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <ChartFrame
      height={frame.height ?? 200}
      empty={
        counts.length === 0
          ? (frame.empty ?? (
              <EmptyState
                title="No anomalies detected"
                description="Nothing exceeds the expected profile."
              />
            ))
          : undefined
      }
      {...frame}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={counts as unknown as Record<string, unknown>[]}
          margin={{ ...MARGIN, left: 8 }}
          barCategoryGap="26%"
        >
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
          <YAxis {...AXIS_PROPS} width={40} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(value: unknown) => [compact(Number(value) || 0), 'Anomalies']}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={48}>
            {counts.map((c) => (
              <Cell
                key={c.severity}
                fill={c.color}
                stroke={selected === c.severity ? 'var(--ink)' : undefined}
                strokeWidth={selected === c.severity ? 1.5 : 0}
                cursor={onSelect ? 'pointer' : undefined}
                onClick={onSelect ? () => onSelect(c.severity) : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {total !== undefined && (
        <p className="num mt-1 text-2xs text-neutral-600">
          {compact(total)} total across {counts.length} levels
        </p>
      )}
    </ChartFrame>
  );
}

/** Weekly seasonality — the shape that makes the annual forecast defensible. */
export function SeasonalityBars({
  data,
  labelKey = 'label',
  valueKey = 'value',
  unit = 'kWh',
  title = 'Monthly consumption',
  ...frame
}: {
  data: readonly Record<string, unknown>[];
  labelKey?: string;
  valueKey?: string;
  unit?: string;
  title?: string;
} & Omit<ChartFrameProps, 'children'>) {
  const rows = useMemo(
    () => aggregateBy(data ?? [], labelKey, [valueKey], 'sum') as Record<string, unknown>[],
    [data, labelKey, valueKey],
  );

  return (
    <ChartFrame
      title={title}
      hint="The recurring shape the annual projection is built on."
      height={frame.height ?? 200}
      empty={
        rows.length === 0
          ? (frame.empty ?? (
              <EmptyState
                title="Not enough history"
                description="Seasonality needs at least 12 months."
              />
            ))
          : undefined
      }
      {...frame}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={MARGIN}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={labelKey} {...AXIS_PROPS} interval={0} />
          <YAxis {...AXIS_PROPS} width={56} tickFormatter={compact} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(value: unknown) => [fmtUnit(Number(value) || 0, unit), 'Consumption']}
          />
          <Bar
            dataKey={valueKey}
            fill={SERIES[0]}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function fmtUnit(value: number, unit: string): string {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)} ${unit}`;
}
