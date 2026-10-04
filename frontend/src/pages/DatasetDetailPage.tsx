import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Callout,
  DetailList,
  DetailRow,
  EmptyState,
  KpiRow,
  KpiTile,
  LoadingState,
  Section,
} from '../lib/ui';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { datasets } from '../lib/api';
import { TrendChart } from '../lib/charts';
import { dec, energy, int, pctValue, stamp } from '../lib/format';

/**
 * Dataset detail — everything known about one file, in one place.
 *
 * The library page is a comparison surface: four rows, six numbers each, built
 * to be scanned. This is the opposite — the full profile for a single dataset,
 * including where the data came from and who to believe about it. Provenance is
 * given the same visual weight as row count on purpose, because "is this real
 * and can I cite it" is the first question asked of any energy dataset that ends
 * up in a board paper.
 */

/** Provenance is an open record, so unknown keys arrive typed `unknown`. */
function text(v: unknown, fallback = '-'): string {
  if (typeof v === 'string') return v || fallback;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

export function DatasetDetailPage() {
  const { datasetId } = useDatasetScope();

  const detail = useQuery({
    queryKey: ['dataset', datasetId],
    enabled: Boolean(datasetId),
    queryFn: () => datasets.getDataset(datasetId as string),
  });

  const shape = useQuery({
    queryKey: ['dataset-shape', datasetId],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      const res = await datasets.getContent(datasetId as string, { limit: 2160 });
      const rows = (res.rows ?? []) as Record<string, unknown>[];
      const byTime = new Map<string, number>();
      const byBuilding = new Map<string, number>();
      for (const r of rows) {
        const ts = r.timestamp;
        const v = r.energy_kwh;
        if (typeof ts !== 'string' || typeof v !== 'number') continue;
        byTime.set(ts, (byTime.get(ts) ?? 0) + v);
        const b = String(r.building_code ?? 'unknown');
        byBuilding.set(b, (byBuilding.get(b) ?? 0) + v);
      }
      const trend = [...byTime.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, value]) => {
          const d = new Date(ts);
          const label = `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${String(
            d.getHours(),
          ).padStart(2, '0')}:00`;
          return { timestamp: label, energy_kwh: value };
        });
      return { trend, byBuilding: [...byBuilding.entries()] };
    },
  });

  const d = detail.data;
  const buildings = useMemo(
    () => (shape.data?.byBuilding ?? []).sort((a, b) => b[1] - a[1]),
    [shape.data],
  );
  const windowEnergy = useMemo(
    () => (shape.data?.trend ?? []).reduce((s, r) => s + r.energy_kwh, 0),
    [shape.data],
  );
  const maxBuilding = Math.max(1, ...buildings.map((b) => b[1]));

  if (!datasetId) {
    return (
      <PageFrame title="Dataset detail" subtitle="Choose a dataset first.">
        <EmptyState title="No dataset is active" description="Pick one from the library." />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title={d?.name ?? 'Dataset detail'}
      subtitle={d?.description ?? 'Everything known about this file.'}
      actions={
        <Link to="/explore/$datasetId" params={{ datasetId }}>
          <Button variant="primary">Explore readings</Button>
        </Link>
      }
    >
      {detail.isLoading ? (
        <LoadingState label="Loading dataset profile" lines={6} />
      ) : detail.isError ? (
        <Callout tone="critical" title="This dataset could not be loaded">
          {(detail.error as Error)?.message ?? 'The dataset endpoint did not respond.'}
        </Callout>
      ) : !d ? (
        <EmptyState title="Not found" description="That dataset id does not exist." />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <PageHero
            eyebrow={d.source_type}
            value={int(d.row_count)}
            verdict={`${int(d.building_count ?? 0)} buildings · ${int(d.device_count ?? 0)} devices · added ${stamp(d.created_at ?? '')}`}
            tone={d.status === 'ready' ? 'ok' : 'warn'}
          />

          <KpiRow columns={4}>
            <KpiTile
              label="Rows"
              value={int(d.row_count)}
              hint={`${int(d.column_count)} columns`}
            />
            <KpiTile
              label="Hourly rows"
              value={int(d.hourly_row_count ?? 0)}
              hint="Meter readings"
            />
            <KpiTile
              label="Defect rate"
              value={d.defect_rate == null ? '-' : pctValue(d.defect_rate)}
              hint="As imported"
              tone={(d.defect_rate ?? 0) > 0.01 ? 'warn' : 'ok'}
            />
            <KpiTile
              label="File size"
              value={d.file_size_bytes ? `${dec(d.file_size_bytes / 1_048_576, 1)} MB` : '-'}
              hint="On disk"
            />
          </KpiRow>

          <Section
            title="Energy across the last 90 days"
            description="Summed by hour across every device in the file, so the shape is the estate's rather than one meter's."
          >
            <TrendChart
              title="Hourly energy"
              hint={
                shape.isLoading
                  ? 'Loading...'
                  : `${int((shape.data?.trend ?? []).length)} hours · ${energy(windowEnergy)} in view`
              }
              data={shape.data?.trend ?? []}
              x="timestamp"
              series={[
                {
                  key: 'energy_kwh',
                  label: 'Energy',
                  unit: 'kWh',
                  color: 'var(--chart-1)',
                  area: true,
                },
              ]}
              format={(v) => `${dec(v, 0)} kWh`}
              height={300}
            />
          </Section>

          {buildings.length > 0 ? (
            <Section
              title="Where the energy sits"
              description="Share of consumption by building. A single building carrying most of the estate is worth knowing before acting on any total."
            >
              <div className="flex flex-col gap-2">
                {buildings.map(([code, value]) => (
                  <div key={code} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-[var(--ink-low)]">
                      {code}
                    </span>
                    <div
                      className="h-2.5 min-w-0 flex-1 rounded-full bg-[var(--surface-inset)]"
                      role="img"
                      aria-label={`${code}: ${energy(value)}`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((value / maxBuilding) * 100, 1)}%`,
                          background: 'var(--chart-1)',
                        }}
                      />
                    </div>
                    <span className="num w-28 shrink-0 text-right text-xs">{energy(value)}</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="surface p-4">
              <h2 className="text-md font-semibold">Structure</h2>
              <DetailList className="mt-2">
                <DetailRow label="Granularity">
                  <span className="mono text-2xs">{d.granularity}</span>
                </DetailRow>
                <DetailRow label="Source type">
                  <span className="mono text-2xs">{d.source_type}</span>
                </DetailRow>
                <DetailRow label="Buildings">
                  <span className="num">{int(d.building_count ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Floors">
                  <span className="num">{int(d.floor_count ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Rooms">
                  <span className="num">{int(d.room_count ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Devices">
                  <span className="num">{int(d.device_count ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Monthly rows">
                  <span className="num">{int(d.monthly_row_count ?? 0)}</span>
                </DetailRow>
                <DetailRow label="Status">
                  <Badge color={d.status === 'ready' ? 'var(--ok)' : 'var(--warn)'}>
                    {d.status}
                  </Badge>
                </DetailRow>
              </DetailList>
            </div>

            <div className="surface p-4">
              <h2 className="text-md font-semibold">Provenance</h2>
              <DetailList className="mt-2">
                <DetailRow label="Origin">
                  <span className="text-xs">{text(d.provenance?.origin, d.source_type)}</span>
                </DetailRow>
                <DetailRow label="License">
                  <span className="text-xs">{text(d.license ?? d.provenance?.license)}</span>
                </DetailRow>
                <DetailRow label="Method">
                  <span className="text-xs">{text(d.provenance?.collection_method)}</span>
                </DetailRow>
                <DetailRow label="DOI">
                  <span className="mono text-2xs">{text(d.doi ?? d.provenance?.doi)}</span>
                </DetailRow>
                <DetailRow label="Source URL">
                  <span className="mono text-2xs break-all">
                    {text(d.source_url ?? d.provenance?.source_url)}
                  </span>
                </DetailRow>
                <DetailRow label="Citation">
                  <span className="text-xs">{text(d.provenance?.citation)}</span>
                </DetailRow>
                <DetailRow label="Version">
                  <span className="mono text-2xs">
                    {d.provenance?.version ?? '-'}
                    {d.provenance?.random_seed != null ? ` · seed ${d.provenance.random_seed}` : ''}
                  </span>
                </DetailRow>
                <DetailRow label="Notes">
                  <span className="text-xs">{text(d.notes ?? d.provenance?.notes)}</span>
                </DetailRow>
              </DetailList>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
