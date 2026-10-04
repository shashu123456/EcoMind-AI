import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { StageGate } from '../app/StageGate';
import { datasets } from '../lib/api';
import type { ImportColumn, ImportResult } from '../lib/api/types';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useStageOutput } from '../lib/stageOutput';
import { dec, duration, int } from '../lib/format';
import {
  Button,
  Card,
  DataGrid,
  EmptyState,
  ErrorState,
  KpiRow,
  KpiTile,
  LoadingState,
  Section,
  type Column,
} from '../lib/ui';

const GRANULARITY_LABEL: Record<string, string> = {
  asset: 'Building › Floor › Room › Device',
  meter: 'Building › Meter',
};

/** A stable key for a raw preview row, which has no id column by definition. */
function rowIdentity(row: Record<string, unknown>): string {
  const stamp = row.timestamp ?? row.time ?? row.date;
  const device = row.device_code ?? row.asset_id ?? row.meter_id;
  if (stamp !== undefined || device !== undefined) return `${stamp ?? ''}|${device ?? ''}`;
  return Object.entries(row)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('|');
}

/**
 * Stage 2 — the estate census.
 *
 * Before any number is trusted, someone has to be able to say what the file
 * actually is: how many readings, over what span, at what grain, and where it
 * came from. This page answers that and shows the raw rows so the census can be
 * checked against the file rather than taken on trust.
 *
 * It is also the first stage whose output includes the missing-cell count, and
 * that count is shown rather than summarised away. A dataset that hides its
 * missing cells is a dataset whose quality score cannot be believed.
 */
export function ImportPage() {
  const { datasetId } = useDatasetScope();
  const state = useStageOutput<ImportResult>('import');

  const preview = useQuery({
    queryKey: ['dataset-preview', datasetId] as const,
    enabled: Boolean(datasetId),
    queryFn: () => datasets.getPreview(datasetId as string, { limit: 25 }),
  });

  const columns: Column<ImportColumn>[] = [
    { key: 'name', header: 'Column', mono: true, width: '12rem' },
    { key: 'dtype', header: 'Type', width: '6rem' },
    {
      key: 'null_count',
      header: 'Nulls',
      numeric: true,
      width: '6rem',
      cell: (c) =>
        c.null_count > 0 ? <span className="text-[var(--warn)]">{int(c.null_count)}</span> : '0',
    },
    {
      key: 'unique_count',
      header: 'Distinct',
      numeric: true,
      width: '7rem',
      cell: (c) => int(c.unique_count),
    },
    {
      key: 'sample_values',
      header: 'Observed values',
      cell: (c) => (
        <span className="text-2xs text-neutral-600">
          {c.sample_values.map((v) => String(v)).join(' · ') || '—'}
        </span>
      ),
    },
  ];

  const previewColumns: Column<Record<string, unknown>>[] = (preview.data?.columns ?? []).map(
    (col) => ({
      key: col.name,
      header: col.name,
      mono: true,
      width: '9rem',
      cell: (row) => {
        const v = row[col.name];
        return v === null || v === undefined ? (
          <span className="text-neutral-400">null</span>
        ) : (
          String(v)
        );
      },
    }),
  );

  const missingCells = state.output
    ? state.output.columns.reduce((acc, c) => acc + c.null_count, 0)
    : 0;

  return (
    <PageFrame
      stage="import"
      status={state.output ? 'done' : 'pending'}
      actions={
        <Link to="/schema/$datasetId" params={{ datasetId: datasetId ?? '' }}>
          <Button variant="primary">Continue to schema discovery</Button>
        </Link>
      }
    >
      <StageGate stage="import" state={state}>
        {(output, s) => (
          <>
            <PageHero
              eyebrow="Readings loaded"
              value={int(output.row_count)}
              unit="rows"
              verdict={s.decision ?? `${output.name} is loaded and ready for the pipeline.`}
              tone="neutral"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-neutral-600">
                <span>
                  {int(output.column_count)} columns · {int(output.device_count)} devices ·{' '}
                  {dec(output.row_count / Math.max(output.device_count, 1), 1)} readings per device
                </span>
                {s.durationMs !== null ? (
                  <span>Read in {duration(s.durationMs / 1000)}</span>
                ) : null}
              </div>
            </PageHero>

            <p className="max-w-3xl text-sm text-neutral-700">
              {output.name} carries {int(output.row_count)} readings at{' '}
              {GRANULARITY_LABEL[output.granularity] ?? output.granularity} grain. Everything
              downstream — the quality rules, the features, the baseline every reading is judged
              against — is derived from exactly these rows and nothing else.
            </p>

            <KpiRow columns={5}>
              <KpiTile label="Readings" value={int(output.row_count)} />
              <KpiTile label="Columns" value={int(output.column_count)} />
              <KpiTile label="Devices" value={int(output.device_count)} />
              <KpiTile label="Source" value={output.source_type} hint="Where the file came from" />
              <KpiTile
                label="Missing cells"
                value={int(missingCells)}
                hint="Counted here, scored by the next stage"
                tone={missingCells > 0 ? 'warn' : 'ok'}
              />
            </KpiRow>

            <Section
              title="Column census"
              description="Every column as it arrived from the file, before anything has been inferred about it."
            >
              <Card>
                <DataGrid
                  rows={output.columns}
                  columns={columns}
                  rowKey={(c) => c.name}
                  caption={`${output.columns.length} columns read from the source file.`}
                  maxHeight="28rem"
                />
              </Card>
            </Section>

            <Section
              title="First rows as stored"
              description="The opening slice of the file, exactly as it will be read. If these rows do not look like the estate, nothing further down the pipeline is worth reading."
            >
              <Card>
                {preview.isPending ? (
                  <LoadingState label="Reading the first rows" lines={4} />
                ) : preview.isError ? (
                  <ErrorState
                    title="The preview could not be read"
                    message={
                      preview.error instanceof Error
                        ? preview.error.message
                        : 'The preview request failed.'
                    }
                    onRetry={() => void preview.refetch()}
                  />
                ) : (preview.data?.rows.length ?? 0) === 0 ? (
                  <EmptyState
                    title="No rows came back"
                    description="The file was registered but its contents could not be read back. Try re-uploading it."
                  />
                ) : (
                  <DataGrid
                    rows={preview.data?.rows ?? []}
                    columns={previewColumns}
                    rowKey={rowIdentity}
                    caption={`${preview.data?.returned ?? 0} of ${int(preview.data?.row_count)} rows, starting at ${int(preview.data?.start)}.`}
                    maxHeight="24rem"
                  />
                )}
              </Card>
            </Section>

            <Section
              title="Provenance"
              description="Recorded at registration so any figure can be traced back to the file it came from."
            >
              <Card>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {Object.entries(output.provenance ?? {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 border-b border-[var(--line-faint)] py-1.5"
                    >
                      <dt className="shrink-0 text-xs text-neutral-600">
                        {key.replace(/_/g, ' ')}
                      </dt>
                      <dd className="min-w-0 break-words text-right text-xs font-medium text-neutral-800">
                        {String(value ?? '—')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </Section>
          </>
        )}
      </StageGate>
    </PageFrame>
  );
}
