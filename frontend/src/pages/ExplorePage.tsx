import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Callout,
  Card,
  DataGrid,
  DetailList,
  DetailRow,
  EmptyState,
  KpiRow,
  KpiTile,
  LoadingState,
  Section,
  SegmentedControl,
  Select,
  Tabs,
  type Column,
} from '../lib/ui';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { datasets } from '../lib/api';
import { SERIES, TrendChart, HeatmapGrid, type HeatmapCell, type SeriesSpec } from '../lib/charts';
import { dateTime, dec, energy, int, pctValue } from '../lib/format';

/**
 * Explore — the raw readings, before any stage has had an opinion about them.
 *
 * Every other page in the product shows you what a stage concluded. This one
 * shows you the readings those conclusions were drawn from, on the reasoning
 * that a number nobody can trace back to a reading is a number nobody should
 * act on. It is deliberately ungated: you do not need a model, a run or a
 * completed preparation phase to look at your own data.
 */

type Measure = 'energy' | 'power' | 'temperature' | 'humidity' | 'co2' | 'occupancy';

type View = 'shape' | 'rhythm' | 'rows';

interface MeasureSpec {
  key: Measure;
  label: string;
  column: string;
  unit: string;
  format: (v: unknown) => string;
  /** Sum or mean: the only honest reduction, and it depends on the measure. */
  agg: 'sum' | 'mean';
  tone?: 'ok' | 'info' | 'warn';
}

const MEASURES: readonly MeasureSpec[] = [
  {
    key: 'energy',
    label: 'Energy',
    column: 'energy_kwh',
    unit: 'kWh',
    format: (v) => dec(v, 1),
    agg: 'sum',
    tone: 'ok',
  },
  {
    key: 'power',
    label: 'Power',
    column: 'power_kw',
    unit: 'kW',
    format: (v) => dec(v, 2),
    agg: 'mean',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    column: 'temperature_c',
    unit: 'C',
    format: (v) => dec(v, 1),
    agg: 'mean',
    tone: 'warn',
  },
  {
    key: 'humidity',
    label: 'Humidity',
    column: 'humidity_pct',
    unit: '%',
    format: (v) => dec(v, 1),
    agg: 'mean',
  },
  {
    key: 'co2',
    label: 'CO2',
    column: 'co2_ppm',
    unit: 'ppm',
    format: (v) => dec(v, 0),
    agg: 'mean',
    tone: 'warn',
  },
  {
    key: 'occupancy',
    label: 'Occupancy',
    column: 'occupancy_count',
    unit: 'people',
    format: (v) => dec(v, 1),
    agg: 'mean',
    tone: 'info',
  },
];

/**
 * How many rows to read.
 *
 * Labelled as a row count rather than a time window on purpose: the endpoint
 * takes a `limit`, not a range, and 2,160 rows spread across 102 devices is
 * roughly 21 hours of data. Calling that "90 days" put a claim on screen that
 * the payload does not support.
 */
const SAMPLE_SIZES = [
  { value: '720', label: '720 rows' },
  { value: '2160', label: '2,160 rows' },
  { value: '8640', label: '8,640 rows' },
  { value: '21600', label: '21,600 rows' },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** Monday-first day index, matching the ISO convention used elsewhere. */
function dayIndex(iso: string): number {
  const d = new Date(iso).getDay();
  return (d + 6) % 7;
}

function hourOf(iso: string): number {
  return new Date(iso).getHours();
}

/** `2025-03-04T09:00:00` -> a short axis label that still shows the day. */
function tickLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleString('en', { month: 'short' });
  const hour = String(d.getHours()).padStart(2, '0');
  return `${day} ${month} ${hour}:00`;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function ExplorePage() {
  const { datasetId } = useDatasetScope();
  const [measure, setMeasure] = useState<Measure>('energy');
  const [windowSize, setWindowSize] = useState('2160');
  const [view, setView] = useState<View>('shape');

  const spec = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];
  const sampleLabel =
    SAMPLE_SIZES.find((w) => w.value === windowSize)?.label ?? `${windowSize} rows`;

  const query = useQuery({
    queryKey: ['explore', datasetId, windowSize],
    enabled: Boolean(datasetId),
    queryFn: () => datasets.getContent(datasetId as string, { limit: Number(windowSize) }),
  });

  const meta = query.data;
  const rows = useMemo(() => (query.data?.rows ?? []) as Record<string, unknown>[], [query.data]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      const c = r.device_category;
      if (typeof c === 'string' && c) seen.add(c);
    }
    return [...seen].sort();
  }, [rows]);

  /**
   * One pass over the readings produces both the trend and the per-category
   * series, so a chart and its legend can never describe different data. Mean
   * measures divide by the number of contributing rows; summed measures do not.
   */
  const { trend, series } = useMemo(() => {
    const byTime = new Map<string, Map<string, { total: number; n: number }>>();
    for (const r of rows) {
      const ts = r.timestamp;
      const v = num(r[spec.column]);
      if (typeof ts !== 'string' || v === null) continue;
      const cat = String(r.device_category ?? 'other');
      let bucket = byTime.get(ts);
      if (!bucket) {
        bucket = new Map();
        byTime.set(ts, bucket);
      }
      const cell = bucket.get(cat);
      if (cell) {
        cell.total += v;
        cell.n += 1;
      } else {
        bucket.set(cat, { total: v, n: 1 });
      }
    }
    const sorted = [...byTime.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const data = sorted.map(([ts, cats]) => {
      const record: Record<string, unknown> = { timestamp: tickLabel(ts) };
      for (const [cat, cell] of cats) {
        record[cat] = spec.agg === 'sum' ? cell.total : cell.total / Math.max(cell.n, 1);
      }
      return record;
    });
    const specs: readonly SeriesSpec[] = categories.map((cat, i) => ({
      key: cat,
      label: cat,
      unit: spec.unit,
      color: SERIES[i % SERIES.length],
      area: categories.length === 1,
    }));
    return { trend: data, series: specs };
  }, [rows, categories, spec]);

  /** Mean reading by hour of week: the shape of a building's actual week. */
  const rhythm = useMemo<readonly HeatmapCell[]>(() => {
    const sums = new Map<string, { total: number; n: number }>();
    for (const r of rows) {
      const ts = r.timestamp;
      const v = num(r[spec.column]);
      if (typeof ts !== 'string' || v === null) continue;
      const key = `${dayIndex(ts)}|${hourOf(ts)}`;
      const cell = sums.get(key);
      if (cell) {
        cell.total += v;
        cell.n += 1;
      } else {
        sums.set(key, { total: v, n: 1 });
      }
    }
    const cells: HeatmapCell[] = [];
    for (const [key, cell] of sums) {
      const parts = key.split('|');
      cells.push({
        row: DAY_NAMES[Number(parts[0])],
        column: HOUR_LABELS[Number(parts[1])],
        value: cell.total / Math.max(cell.n, 1),
      });
    }
    return cells;
  }, [rows, spec]);

  /** The real time span the fetched rows cover, so the page never overclaims. */
  const span = useMemo(() => {
    let first: number | null = null;
    let last: number | null = null;
    for (const r of rows) {
      const ts = r.timestamp;
      if (typeof ts !== 'string') continue;
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) continue;
      if (first === null || t < first) first = t;
      if (last === null || t > last) last = t;
    }
    if (first === null || last === null) return null;
    const hours = (last - first) / 3_600_000;
    return {
      first,
      last,
      hours,
      hoursLabel: hours < 48 ? `${dec(hours, 1)} hours` : `${dec(hours / 24, 1)} days`,
    };
  }, [rows]);

  const stats = useMemo(() => {
    const values: number[] = [];
    const buildings = new Set<string>();
    const devices = new Set<string>();
    let energyTotal = 0;
    for (const r of rows) {
      const v = num(r[spec.column]);
      if (v !== null) values.push(v);
      const b = r.building_code;
      const d = r.device_code;
      if (b !== undefined) buildings.add(String(b));
      if (d !== undefined) devices.add(String(d));
      const e = num(r.energy_kwh);
      if (e !== null) energyTotal += e;
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      n: values.length,
      mean: values.length ? sum / values.length : 0,
      max: values.length ? Math.max(...values) : 0,
      min: values.length ? Math.min(...values) : 0,
      buildings: buildings.size,
      devices: devices.size,
      energyTotal,
    };
  }, [rows, spec]);

  const rowColumns = useMemo<readonly Column<Record<string, unknown>>[]>(
    () => [
      {
        key: 'timestamp',
        header: 'Timestamp',
        cell: (r) => <span className="mono text-2xs">{String(r.timestamp ?? '')}</span>,
      },
      {
        key: 'building_code',
        header: 'Building',
        cell: (r) => <span className="mono text-2xs">{String(r.building_code ?? '-')}</span>,
      },
      {
        key: 'room_code',
        header: 'Room',
        cell: (r) => <span className="mono text-2xs">{String(r.room_code ?? '-')}</span>,
      },
      {
        key: 'device_code',
        header: 'Device',
        cell: (r) => <span className="mono text-2xs">{String(r.device_code ?? '-')}</span>,
      },
      {
        key: 'device_category',
        header: 'Category',
        cell: (r) => <Badge>{String(r.device_category ?? '-')}</Badge>,
      },
      {
        key: spec.column,
        header: `${spec.label} (${spec.unit})`,
        numeric: true,
        cell: (r) => <span className="num">{spec.format(r[spec.column])}</span>,
      },
    ],
    [spec],
  );

  if (!datasetId) {
    return (
      <PageFrame
        title="Explore the readings themselves"
        subtitle="Pick a dataset to open it. Explore needs no run and no completed stage."
      >
        <EmptyState
          title="No dataset is active"
          description="Choose a dataset from the library to open its readings."
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Explore the readings themselves"
      subtitle="Every other page shows what a stage concluded. This one shows what it concluded from."
      actions={
        <Select value={windowSize} onChange={setWindowSize} options={SAMPLE_SIZES} label="Sample" />
      }
      conclusion={
        <p className="text-md">
          {int(stats.n)} readings across {int(stats.devices)} devices and {int(stats.buildings)}{' '}
          buildings, showing {spec.label.toLowerCase()}
          {span ? ` over the ${span.hoursLabel} those rows cover` : ''}. Nothing here has been
          cleaned, modelled or scored, so a pattern that looks wrong is the data talking rather than
          a stage failing.
        </p>
      }
    >
      {query.isLoading ? (
        <LoadingState label="Reading the dataset" lines={6} />
      ) : query.isError ? (
        <Callout tone="critical" title="These readings could not be loaded">
          {(query.error as Error)?.message ?? 'The dataset content endpoint did not respond.'}
        </Callout>
      ) : rows.length === 0 ? (
        <EmptyState
          title="This dataset returned no rows"
          description="The file parsed but contains nothing in the window selected. Try a wider window, or check the import page for what arrived."
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <PageHero
            eyebrow={`${spec.label} in ${spec.unit}`}
            value={spec.format(stats.mean)}
            verdict={`mean of ${int(stats.n)} readings, peak ${spec.format(stats.max)}, floor ${spec.format(stats.min)}`}
            tone={spec.tone ?? 'info'}
          />

          <KpiRow columns={4}>
            <KpiTile
              label="Readings shown"
              value={int(stats.n)}
              hint={`of ${int(meta?.row_count ?? 0)} in the file`}
            />
            <KpiTile
              label="Devices"
              value={int(stats.devices)}
              hint={`${int(categories.length)} categories`}
            />
            <KpiTile
              label="Peak"
              value={spec.format(stats.max)}
              hint={`${spec.unit} at its highest`}
              tone={spec.tone}
            />
            <KpiTile label="Floor" value={spec.format(stats.min)} hint="Lowest in window" />
          </KpiRow>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl<Measure>
              ariaLabel="Measure"
              size="sm"
              value={measure}
              onChange={(next) => setMeasure(next as Measure)}
              options={MEASURES.map((m) => ({ value: m.key, label: m.label, hint: m.unit }))}
            />
            <Tabs
              value={view}
              onChange={(next) => setView(next as View)}
              tabs={[
                { value: 'shape', label: 'Over time' },
                { value: 'rhythm', label: 'Hour of week' },
                { value: 'rows', label: 'Raw readings', badge: rows.length },
              ]}
            />
          </div>

          {view === 'shape' ? (
            <TrendChart
              title={`${spec.label} over time, by device category`}
              hint={`${
                spec.agg === 'sum' ? 'Summed' : 'Averaged'
              } within each hour across ${int(trend.length)} hours.`}
              data={trend}
              x="timestamp"
              series={series}
              format={(v) => `${spec.format(v)} ${spec.unit}`}
              height={320}
            />
          ) : null}

          {view === 'rhythm' ? (
            <HeatmapGrid
              title="The shape of a week"
              hint="Mean reading by hour of day and day of week. An occupied building is not flat on weekdays, and not flat at night on any day."
              cells={rhythm}
              rowLabel="Day"
              columnLabel="Hour"
              legendTitle={spec.unit}
              unit={spec.unit}
              height={320}
              format={(v) => dec(v, 1)}
              rowOrder={DAY_NAMES}
              columnOrder={HOUR_LABELS}
            />
          ) : null}

          {view === 'rows' ? (
            <Section
              title="The readings, unaltered"
              description="The same rows the charts above are drawn from, so any pattern on a chart can be traced back to the readings that produced it."
            >
              <DataGrid
                rows={rows}
                columns={rowColumns}
                rowKey={(r) =>
                  `${String(r.device_code ?? 'd')}-${String(r.timestamp ?? '')}-${String(r.room_code ?? '')}`
                }
                maxHeight="32rem"
                caption={`${int(rows.length)} readings, ${sampleLabel}`}
              />
            </Section>
          ) : null}

          <Card className="p-5">
            <h2 className="text-md font-semibold">What is in this window</h2>
            <DetailList className="mt-2">
              <DetailRow label="Rows in file">
                <span className="num">{int(meta?.row_count ?? 0)}</span>
              </DetailRow>
              <DetailRow label="Rows read">
                <span className="num">{int(meta?.returned ?? rows.length)}</span>
              </DetailRow>
              <DetailRow label="Columns">
                <span className="num">{int(meta?.column_count ?? 0)}</span>
              </DetailRow>
              <DetailRow label="Rows requested">
                <span className="mono text-2xs">{sampleLabel}</span>
              </DetailRow>
              <DetailRow label="Time actually covered">
                <span className="mono text-2xs">
                  {span
                    ? `${dec(span.hours, 1)} h, from ${dateTime(new Date(span.first).toISOString())}`
                    : '-'}
                </span>
              </DetailRow>
              <DetailRow label="Categories">
                <span className="mono text-2xs">{categories.join(', ') || '-'}</span>
              </DetailRow>
              <DetailRow label="Energy in view">
                <span className="num">{energy(stats.energyTotal)}</span>
              </DetailRow>
              <DetailRow label="Share of file">
                <span className="num">
                  {pctValue(rows.length / Math.max(meta?.row_count ?? rows.length, 1))}
                </span>
              </DetailRow>
            </DetailList>
          </Card>
        </div>
      )}
    </PageFrame>
  );
}
