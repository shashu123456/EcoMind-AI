import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { datasets, runs } from '../lib/api';
import { errorMessage } from '../lib/api/client';
import type { Dataset } from '../lib/api/types';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { date, dec, int, pctValue } from '../lib/format';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  EmptyState,
  ErrorState,
  Inset,
  KpiRow,
  KpiTile,
  LoadingState,
  Panel,
  type Column,
} from '../lib/ui';

const GRANULARITY_LABEL: Record<string, string> = {
  asset: 'Building › Floor › Room › Device',
  meter: 'Building › Meter',
};

/**
 * Stage 1 — the dataset library.
 *
 * This is the one page that does not read a run, because a run cannot exist
 * until a dataset has been chosen. Everything after it is scoped to whichever
 * row the user settles on here.
 *
 * The grid shows counts, and the counts are labelled as counts. A dataset row
 * knows how many buildings exist; it does not know which ones. Every page that
 * needs actual building codes reads them out of the stage payload it already
 * displays, because inventing them from a count would be a fabrication with a
 * dropdown attached.
 */
export function LibraryPage() {
  const navigate = useNavigate();
  const { datasetId, runId, setActive } = useDatasetScope();
  const [selectedId, setSelectedId] = useState<string | null>(datasetId);

  const query = useQuery({
    queryKey: ['datasets'] as const,
    queryFn: datasets.listDatasets,
  });

  const start = useMutation({
    mutationFn: async (id: string) => runs.startRun(id),
    onSuccess: (run, id) => {
      setActive({ datasetId: id, runId: run.id });
      void navigate({ to: '/import/$datasetId', params: { datasetId: id } });
    },
  });

  const rows = query.data ?? [];
  const active = rows.find((d) => d.id === datasetId) ?? null;
  const shown = rows.find((d) => d.id === selectedId) ?? active ?? rows[0] ?? null;
  const totalRows = rows.reduce((acc, d) => acc + (d.row_count ?? 0), 0);
  const totalDevices = rows.reduce((acc, d) => acc + (d.device_count ?? 0), 0);

  const columns: Column<Dataset>[] = [
    {
      key: 'name',
      header: 'Dataset',
      cell: (d) => (
        <div className="min-w-0">
          <div className="font-medium text-neutral-900">{d.name}</div>
          {d.description ? (
            <div className="mt-0.5 line-clamp-1 text-2xs text-neutral-600">{d.description}</div>
          ) : null}
        </div>
      ),
    },
    { key: 'source_type', header: 'Source', width: '7rem' },
    {
      key: 'row_count',
      header: 'Rows',
      numeric: true,
      width: '6rem',
      cell: (d) => int(d.row_count),
    },
    {
      key: 'column_count',
      header: 'Cols',
      numeric: true,
      width: '5rem',
      cell: (d) => int(d.column_count),
    },
    {
      key: 'buildings',
      header: 'Estates',
      numeric: true,
      width: '6rem',
      cell: (d) => int(d.building_count),
    },
    {
      key: 'devices',
      header: 'Devices',
      numeric: true,
      width: '6rem',
      cell: (d) => int(d.device_count),
    },
    {
      key: 'defect_rate',
      header: 'Defects',
      numeric: true,
      width: '7rem',
      cell: (d) =>
        d.defect_rate === null || d.defect_rate === undefined
          ? '—'
          : pctValue(d.defect_rate * 100, 2),
    },
    { key: 'status', header: 'Status', width: '6rem' },
    { key: 'created_at', header: 'Added', width: '8rem', cell: (d) => date(d.created_at) },
  ];

  return (
    <PageFrame
      stage="library"
      status={rows.length > 0 ? 'done' : 'pending'}
      hero={
        <PageHero
          eyebrow="Datasets available"
          value={int(rows.length, '0')}
          verdict={
            rows.length === 0
              ? 'No datasets are loaded. Nothing else can be read until one exists.'
              : `${int(totalRows)} readings across ${int(totalDevices)} devices. Choosing one scopes all ten stages.`
          }
          tone={rows.length > 0 ? 'neutral' : 'warn'}
        />
      }
      actions={
        shown ? (
          runId ? (
            <Link to="/import/$datasetId" params={{ datasetId: shown.id }}>
              <Button variant="primary">Continue this dataset</Button>
            </Link>
          ) : (
            <Button
              variant="primary"
              loading={start.isPending}
              onClick={() => start.mutate(shown.id)}
            >
              Start a run on this dataset
            </Button>
          )
        ) : null
      }
      aside={
        shown ? (
          <Panel title="Selected dataset" hint={shown.name}>
            <dl className="space-y-2 text-sm">
              <Row label="Readings">{int(shown.row_count)}</Row>
              <Row label="Columns">{int(shown.column_count)}</Row>
              <Row label="Grain">{GRANULARITY_LABEL[shown.granularity] ?? shown.granularity}</Row>
              <Row label="Buildings">{int(shown.building_count)}</Row>
              <Row label="Floors">{int(shown.floor_count)}</Row>
              <Row label="Rooms">{int(shown.room_count)}</Row>
              <Row label="Devices">{int(shown.device_count)}</Row>
              <Row label="Hourly rows">{int(shown.hourly_row_count)}</Row>
              <Row label="Monthly rows">{int(shown.monthly_row_count)}</Row>
            </dl>
            <Inset className="mt-4">
              <p className="eyebrow">Note</p>
              <p className="mt-1 text-xs text-neutral-600">
                These are counts, not lists. Building, floor, room and device names appear in the
                stage payloads downstream.
              </p>
            </Inset>
            {shown.provenance ? (
              <div className="mt-4 space-y-2 border-t border-[var(--line-faint)] pt-3">
                <p className="eyebrow">Provenance</p>
                {Object.entries(shown.provenance).map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="shrink-0 text-neutral-600">{key.replace(/_/g, ' ')}</span>
                    <span className="min-w-0 break-words text-right font-medium text-neutral-800">
                      {String(value ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
        ) : null
      }
    >
      {query.isPending ? <LoadingState label="Reading the dataset library" /> : null}
      {query.isError ? (
        <ErrorState
          title="The dataset library could not be read"
          message={errorMessage(query.error, 'The library request failed.')}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.isSuccess && rows.length === 0 ? (
        <EmptyState
          title="The library is empty"
          description="Upload a CSV to begin. The expected shape is one row per device per hour with building, floor, room and device columns."
        />
      ) : null}

      {start.isError ? (
        <Callout tone="critical" title="The run could not be started">
          {errorMessage(start.error, 'Starting a run failed.')}
        </Callout>
      ) : null}

      {rows.length > 0 ? (
        <>
          <KpiRow columns={4}>
            <KpiTile label="Datasets" value={int(rows.length)} />
            <KpiTile label="Readings" value={int(totalRows)} />
            <KpiTile label="Devices" value={int(totalDevices)} />
            <KpiTile
              label="Estates tracked"
              value={int(rows.filter((d) => (d.building_count ?? 0) > 0).length)}
              hint="Datasets that name at least one building"
            />
          </KpiRow>

          <Card>
            <DataGrid
              rows={rows}
              columns={columns}
              rowKey={(d) => d.id}
              caption="Every dataset this platform can reason about. Select one to scope the pipeline."
              selectedKey={shown?.id}
              onRowClick={(d) => setSelectedId(d.id)}
              maxHeight="26rem"
            />
          </Card>

          {shown ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {shown.is_active ? (
                  <Badge color="var(--ok)">Active in the current run</Badge>
                ) : null}
                <Badge>{shown.source_type}</Badge>
                <Badge>{shown.status}</Badge>
                {shown.file_size_bytes ? (
                  <Badge>{dec((shown.file_size_bytes ?? 0) / 1_048_576, 1)} MB on disk</Badge>
                ) : null}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {datasetId !== shown.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(shown.id);
                      setActive({ datasetId: shown.id, runId: null });
                    }}
                  >
                    Make this the active dataset
                  </Button>
                ) : null}
                <Link
                  to="/import/$datasetId"
                  params={{ datasetId: shown.id }}
                  onClick={() => setActive({ datasetId: shown.id })}
                >
                  <Button variant="primary" size="sm">
                    Continue to import
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          <p className="text-2xs text-neutral-600">
            Selecting a different dataset clears the current run, the selected model and every
            recorded stage, because a stage status from one estate says nothing about another.
          </p>
        </>
      ) : null}
    </PageFrame>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-neutral-600">{label}</dt>
      <dd className="num min-w-0 break-words text-right font-medium text-neutral-800">
        {children}
      </dd>
    </div>
  );
}
