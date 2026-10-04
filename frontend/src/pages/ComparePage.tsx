import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Callout,
  DataGrid,
  DetailList,
  DetailRow,
  EmptyState,
  KpiRow,
  KpiTile,
  LoadingState,
  Section,
  Select,
  type Column,
} from '../lib/ui';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useJourney } from '../lib/journey';
import { datasets } from '../lib/api';
import { SERIES, TrendChart } from '../lib/charts';
import { dec, energy, int, pct, pctValue } from '../lib/format';

/**
 * Compare — two datasets on one axis.
 *
 * Comparing is where an energy platform is most often misused, so the page is
 * built around one refusal: it will not put two datasets on a shared axis
 * unless it can also show you how different they are in size, span and grain.
 * A 9-building campus and a 3-meter file produce lines that look comparable and
 * are not, and the size table below the chart is there so that claim cannot be
 * made by accident.
 */

/** One comparable fact about a dataset, resolved to a single number. */
interface Metric {
  key: string;
  label: string;
  unit: string;
  /** Higher is better for the estate only where it genuinely is. */
  good: 'higher' | 'lower' | 'none';
  read: (d: {
    row_count?: number | null;
    device_count?: number | null;
    building_count?: number | null;
    defect_rate?: number | null;
    anomaly_rate?: number | null;
    hourly_row_count?: number | null;
  }) => number | null;
  format: (v: number) => string;
}

const METRICS: readonly Metric[] = [
  {
    key: 'rows',
    label: 'Readings',
    unit: 'rows',
    good: 'none',
    read: (d) => d.row_count ?? null,
    format: (v) => int(v),
  },
  {
    key: 'devices',
    label: 'Devices',
    unit: 'devices',
    good: 'none',
    read: (d) => d.device_count ?? null,
    format: (v) => int(v),
  },
  {
    key: 'buildings',
    label: 'Buildings',
    unit: 'buildings',
    good: 'none',
    read: (d) => d.building_count ?? null,
    format: (v) => int(v),
  },
  {
    key: 'hourly',
    label: 'Hourly rows',
    unit: 'rows',
    good: 'none',
    read: (d) => d.hourly_row_count ?? null,
    format: (v) => int(v),
  },
  {
    key: 'defects',
    label: 'Defect rate',
    unit: '%',
    good: 'lower',
    read: (d) => (d.defect_rate == null ? null : d.defect_rate * 100),
    format: (v) => pct(v / 100, 2),
  },
  {
    key: 'anomalies',
    label: 'Anomaly rate',
    unit: '%',
    good: 'lower',
    read: (d) => (d.anomaly_rate == null ? null : d.anomaly_rate * 100),
    format: (v) => pct(v / 100, 2),
  },
];

interface Listed {
  id: string;
  name: string;
  row_count?: number | null;
  device_count?: number | null;
  building_count?: number | null;
  defect_rate?: number | null;
  anomaly_rate?: number | null;
  hourly_row_count?: number | null;
  source_type?: string;
}

/** Mean hourly energy per dataset, on a shared time axis. */
function useEnergyShape(datasetId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['compare-shape', datasetId],
    enabled: Boolean(datasetId) && enabled,
    queryFn: async () => {
      const res = await datasets.getContent(datasetId as string, { limit: 720 });
      const rows = (res.rows ?? []) as Record<string, unknown>[];
      const byTime = new Map<string, { total: number; n: number }>();
      for (const r of rows) {
        const ts = r.timestamp;
        const v = r.energy_kwh;
        if (typeof ts !== 'string' || typeof v !== 'number') continue;
        const cell = byTime.get(ts);
        if (cell) {
          cell.total += v;
          cell.n += 1;
        } else byTime.set(ts, { total: v, n: 1 });
      }
      return [...byTime.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, cell]) => {
          const d = new Date(ts);
          const label = `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${String(
            d.getHours(),
          ).padStart(2, '0')}:00`;
          return { timestamp: label, value: cell.total };
        });
    },
  });
}

export function ComparePage() {
  const { datasetId } = useDatasetScope();
  const activeDatasetId = useJourney((s) => s.activeDatasetId);
  const [left, setLeft] = useState<string>(datasetId ?? activeDatasetId ?? '');
  const [right, setRight] = useState('');

  const list = useQuery({ queryKey: ['datasets'], queryFn: () => datasets.listDatasets() });

  const items = (list.data ?? []) as Listed[];
  const options = useMemo(
    () =>
      items.map((d) => ({
        value: d.id,
        label: d.name.length > 34 ? `${d.name.slice(0, 33)}...` : d.name,
      })),
    [items],
  );

  const leftItem = items.find((d) => d.id === left) ?? null;
  const rightItem = items.find((d) => d.id === right) ?? null;

  const a = useEnergyShape(left || null, Boolean(left));
  const b = useEnergyShape(right || null, Boolean(right));

  // Both datasets are indexed by their own timestamps; overlaying the two raw
  // arrays would pair whatever hour each happened to land on. Normalise onto a
  // percentage of each one's own mean, which is the only honest shared axis.
  const overlay = useMemo(() => {
    const aRows = a.data ?? [];
    const bRows = b.data ?? [];
    if (!aRows.length && !bRows.length) return [];
    const aMean = aRows.reduce((s, r) => s + (r.value ?? 0), 0) / Math.max(aRows.length, 1) || 1;
    const bMean = bRows.reduce((s, r) => s + (r.value ?? 0), 0) / Math.max(bRows.length, 1) || 1;
    const len = Math.max(aRows.length, bRows.length);
    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < len; i += 1) {
      const rec: Record<string, unknown> = {
        timestamp: aRows[i]?.timestamp ?? bRows[i]?.timestamp ?? '',
      };
      if (aRows[i]) rec.a = (aRows[i].value / aMean) * 100;
      if (bRows[i]) rec.b = (bRows[i].value / bMean) * 100;
      out.push(rec);
    }
    return out;
  }, [a.data, b.data]);

  const tableRows = useMemo(
    () =>
      METRICS.map((m) => {
        const lv = m.read(leftItem ?? {});
        const rv = m.read(rightItem ?? {});
        return { metric: m.label, unit: m.unit, left: lv, right: rv };
      }),
    [leftItem, rightItem],
  );

  const tableColumns = useMemo<readonly Column<(typeof tableRows)[number]>[]>(
    () => [
      {
        key: 'metric',
        header: 'Measure',
        cell: (r) => <span className="text-md">{r.metric}</span>,
      },
      {
        key: 'left',
        header: leftItem?.name.slice(0, 28) ?? 'A',
        numeric: true,
        cell: (r) => <span className="num">{r.left === null ? '-' : dec(r.left, 2)}</span>,
      },
      {
        key: 'right',
        header: rightItem?.name.slice(0, 28) ?? 'B',
        numeric: true,
        cell: (r) => <span className="num">{r.right === null ? '-' : dec(r.right, 2)}</span>,
      },
      {
        key: 'ratio',
        header: 'Ratio',
        numeric: true,
        cell: (r) => {
          if (r.left === null || r.right === null || r.right === 0) {
            return <span className="text-ink-faint">-</span>;
          }
          const ratio = r.left / r.right;
          return <span className="num">{dec(ratio, 2)}x</span>;
        },
      },
    ],
    [leftItem, rightItem],
  );

  const sizeGap =
    leftItem?.row_count && rightItem?.row_count
      ? Math.max(leftItem.row_count, rightItem.row_count) /
        Math.max(Math.min(leftItem.row_count, rightItem.row_count), 1)
      : null;

  if (list.isLoading) {
    return (
      <PageFrame title="Compare two datasets" subtitle="Loading the catalogue...">
        <LoadingState label="Loading datasets" lines={5} />
      </PageFrame>
    );
  }

  if (items.length < 2) {
    return (
      <PageFrame title="Compare two datasets" subtitle="Two datasets are needed to compare.">
        <EmptyState
          title="Not enough datasets to compare"
          description="Comparison needs at least two datasets in the library. Upload or seed another, then return here."
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Compare two datasets"
      subtitle="Side by side, on an axis that does not flatter either one."
      actions={
        <div className="flex flex-wrap gap-2">
          <Select
            value={left || null}
            onChange={setLeft}
            options={options}
            label="A"
            className="w-64"
          />
          <Select
            value={right || null}
            onChange={setRight}
            options={options}
            label="B"
            className="w-64"
          />
        </div>
      }
    >
      {!rightItem ? (
        <EmptyState
          title="Pick a second dataset"
          description="Choose dataset B from the control above. Both are read over the same number of rows and indexed as a percentage of each one's own mean, because a raw overlay of two different-sized estates is a picture, not a comparison."
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <PageHero
            eyebrow="Comparison"
            value={sizeGap ? `${dec(sizeGap, 1)}x` : '-'}
            verdict={
              sizeGap
                ? `difference in size between ${leftItem?.name} and ${rightItem?.name}. The chart below normalises for it; the table does not hide it.`
                : 'Select two datasets to compare.'
            }
            tone={sizeGap && sizeGap > 10 ? 'warn' : 'info'}
          />

          {sizeGap && sizeGap > 10 ? (
            <Callout tone="warn" title="These two are not the same size">
              The larger holds {dec(sizeGap, 1)}x the readings of the smaller. That is why the
              overlay below is indexed to each dataset's own mean: plotted raw, the larger would
              simply be the higher line and the chart would say nothing except that one estate is
              bigger than the other.
            </Callout>
          ) : null}

          <KpiRow columns={4}>
            <KpiTile
              label="A"
              value={int(leftItem?.row_count ?? 0)}
              hint={leftItem?.source_type ?? 'rows'}
            />
            <KpiTile
              label="B"
              value={int(rightItem?.row_count ?? 0)}
              hint={rightItem?.source_type ?? 'rows'}
            />
            <KpiTile
              label="A devices"
              value={int(leftItem?.device_count ?? 0)}
              hint={`${int(leftItem?.building_count ?? 0)} buildings`}
            />
            <KpiTile
              label="B devices"
              value={int(rightItem?.device_count ?? 0)}
              hint={`${int(rightItem?.building_count ?? 0)} buildings`}
            />
          </KpiRow>

          {a.isLoading || b.isLoading ? (
            <LoadingState label="Reading both datasets" lines={5} />
          ) : (
            <TrendChart
              title="Hourly energy, indexed to each dataset's own mean"
              hint="100% is each dataset's average reading. Above the line is a busier-than-usual hour for that estate, not for the other one."
              data={overlay}
              x="timestamp"
              series={[
                {
                  key: 'a',
                  label: leftItem?.name ?? 'A',
                  unit: '% of own mean',
                  color: SERIES[0],
                },
                {
                  key: 'b',
                  label: rightItem?.name ?? 'B',
                  unit: '% of own mean',
                  color: SERIES[1],
                },
              ]}
              format={(v) => `${dec(v, 0)}%`}
              height={320}
            />
          )}

          <Section
            title="What actually differs"
            description="Read this before the chart. A ratio on a defect rate and a ratio on a row count do not mean the same thing."
          >
            <DataGrid
              rows={tableRows}
              columns={tableColumns}
              rowKey={(r) => r.metric}
              caption={`${METRICS.length} measures across two datasets`}
            />
          </Section>

          <div className="grid gap-3 md:grid-cols-2">
            {[leftItem, rightItem].map((d, i) =>
              d ? (
                <div key={d.id} className="surface p-4">
                  <div className="flex items-center gap-2">
                    <Badge color={i === 0 ? 'var(--chart-1)' : 'var(--chart-2)'}>
                      {i === 0 ? 'A' : 'B'}
                    </Badge>
                    <h3 className="min-w-0 truncate text-md font-semibold">{d.name}</h3>
                  </div>
                  <DetailList className="mt-2">
                    <DetailRow label="Source">
                      <span className="mono text-2xs">{d.source_type ?? '-'}</span>
                    </DetailRow>
                    <DetailRow label="Rows">
                      <span className="num">{int(d.row_count ?? 0)}</span>
                    </DetailRow>
                    <DetailRow label="Devices">
                      <span className="num">{int(d.device_count ?? 0)}</span>
                    </DetailRow>
                    <DetailRow label="Buildings">
                      <span className="num">{int(d.building_count ?? 0)}</span>
                    </DetailRow>
                    <DetailRow label="Defect rate">
                      <span className="num">
                        {d.defect_rate == null ? '-' : pctValue(d.defect_rate)}
                      </span>
                    </DetailRow>
                    <DetailRow label="Energy in window">
                      <span className="num">
                        {energy((a.data ?? []).reduce((s, r) => s + (r.value ?? 0), 0))}
                      </span>
                    </DetailRow>
                  </DetailList>
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </PageFrame>
  );
}
