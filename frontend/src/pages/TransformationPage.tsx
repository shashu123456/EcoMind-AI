import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { StageGate } from '../app/StageGate';
import type { TransformationResult, TransformStep } from '../lib/api/types';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useStageOutput } from '../lib/stageOutput';
import { dateTime, duration, int } from '../lib/format';
import { PipelineFlow } from '../lib/charts';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  Inset,
  KpiRow,
  KpiTile,
  Section,
  type Column,
} from '../lib/ui';

type FlowStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * Stage 5 — transformation.
 *
 * This is the stage where the file stops being what arrived and starts being
 * what the analysis reads. It is therefore the stage most able to lie: a
 * normalised column looks identical to an un-normalised one until someone says
 * what was done to it. So every step is shown with the fields it touched and
 * the values it changed, and — the part that usually gets left out — the steps
 * that were *not* applied are shown as not applied.
 *
 * "Not applied" is the important half. Encoding, scaling and aggregation were
 * skipped on this dataset, and a reader who cannot see that will assume they
 * ran. A step that did nothing is recorded as a step that did nothing.
 */
export function TransformationPage() {
  const { datasetId } = useDatasetScope();
  const state = useStageOutput<TransformationResult>('transformation');
  const [openStep, setOpenStep] = useState<string | null>(null);

  const steps = state.output?.steps ?? [];
  const applied = steps.filter((s) => s.status === 'done');
  const skipped = steps.filter((s) => s.status !== 'done');
  const totalChanges = applied.reduce((acc, s) => acc + s.rows_changed, 0);
  const shown = steps.find((s) => s.step_key === openStep) ?? applied[0] ?? steps[0] ?? null;

  const fieldColumns: Column<TransformStep['fields'][number]>[] = [
    { key: 'column_name', header: 'Field', mono: true, width: '12rem' },
    {
      key: 'before_value',
      header: 'Before',
      cell: (f) => <span className="text-2xs text-neutral-600">{f.before_value || '—'}</span>,
    },
    {
      key: 'after_value',
      header: 'After',
      cell: (f) => (
        <span className="text-2xs font-medium text-neutral-800">{f.after_value || '—'}</span>
      ),
    },
    {
      key: 'changed',
      header: 'Rewritten',
      width: '6rem',
      cell: (f) =>
        f.changed ? (
          <span className="text-xs text-[var(--ok)]">yes</span>
        ) : (
          <span className="text-xs text-neutral-600">left as found</span>
        ),
    },
    {
      key: 'unit',
      header: 'Unit',
      width: '9rem',
      cell: (f) =>
        f.unit_before || f.unit_after ? (
          <span className="text-2xs text-neutral-600">
            {f.unit_before ?? '—'} → {f.unit_after ?? '—'}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <PageFrame
      stage="transformation"
      status={state.output ? 'done' : 'pending'}
      actions={
        <Link to="/model-selection/$datasetId" params={{ datasetId: datasetId ?? '' }}>
          <Button variant="primary">Continue to model selection</Button>
        </Link>
      }
    >
      <StageGate stage="transformation" state={state} blockedBy={['quality']}>
        {(output, s) => {
          const gain = output.columns_out - output.columns_in;
          return (
            <>
              <PageHero
                eyebrow="Rows written"
                value={int(output.rows_out)}
                unit="rows"
                verdict={s.decision ?? `${int(output.rows_out)} rows prepared for modelling.`}
                tone="neutral"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-neutral-600">
                  <span>
                    {int(applied.length)} of {steps.length} steps applied
                  </span>
                  <span>in {duration(output.elapsed_ms / 1000)}</span>
                  {output.applied_at ? <span>{dateTime(output.applied_at)}</span> : null}
                </div>
              </PageHero>

              <p className="max-w-3xl text-sm text-neutral-700">
                {int(output.rows_in)} rows in, {int(output.rows_out)} rows out across{' '}
                {int(output.columns_out)} columns — a net gain of {int(gain)} columns, all of them
                derived features rather than new measurements. {int(totalChanges)} cell writes were
                recorded across the applied steps, and the processed file is what every stage after
                this one reads.
              </p>

              {skipped.length > 0 ? (
                <Callout
                  tone="info"
                  title={`${int(skipped.length)} of ${int(steps.length)} steps were not applied`}
                >
                  {skipped.map((st) => st.label.toLowerCase()).join(', ')} did not run on this
                  dataset. Their absence is recorded here rather than left to be assumed — a reader
                  who thinks encoding ran on a column that was never encoded will draw the wrong
                  conclusion from every figure below.
                </Callout>
              ) : null}

              <KpiRow columns={5}>
                <KpiTile label="Rows in" value={int(output.rows_in)} />
                <KpiTile
                  label="Rows out"
                  value={int(output.rows_out)}
                  tone={output.rows_out < output.rows_in ? 'warn' : 'ok'}
                  hint={
                    output.rows_out < output.rows_in
                      ? 'Some rows were dropped — see each step'
                      : 'No row was lost'
                  }
                />
                <KpiTile label="Columns in" value={int(output.columns_in)} />
                <KpiTile label="Columns out" value={int(output.columns_out)} />
                <KpiTile
                  label="Derived features"
                  value={int(output.features.length)}
                  hint="New columns computed from the ones that arrived"
                />
              </KpiRow>

              <Section
                title="The five steps"
                description="In the order they are defined. Applied steps show what they wrote; the rest show why they were skipped."
              >
                <PipelineFlow
                  title="Transformation steps"
                  hint="Applied steps show the row count they rewrote. Select one to open its field-level changes."
                  stages={steps.map((st) => ({
                    key: st.step_key,
                    label: st.label,
                    status: (st.status === 'done'
                      ? 'done'
                      : st.status === 'failed'
                        ? 'failed'
                        : 'pending') as FlowStatus,
                    issuesFound: st.rows_changed,
                  }))}
                  format={(v) => (v === 0 ? 'no rows written' : `${int(v)} rows changed`)}
                  onSelect={(index) => {
                    const step = steps[index];
                    if (step) setOpenStep(step.step_key);
                  }}
                  activeIndex={Math.max(
                    steps.findIndex((st) => st.step_key === shown?.step_key),
                    0,
                  )}
                />
              </Section>

              {shown ? (
                <Section title={shown.label} description={shown.purpose}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        color={`var(--${shown.status === 'done' ? 'ok' : shown.status === 'failed' ? 'critical' : 'neutral'})`}
                      >
                        {shown.status === 'done'
                          ? 'applied'
                          : shown.status === 'failed'
                            ? 'failed'
                            : 'not applied'}
                      </Badge>
                      <Badge>{int(shown.rows_changed)} rows changed</Badge>
                      {shown.affected_columns.length > 0 ? (
                        <Badge>{int(shown.affected_columns.length)} columns affected</Badge>
                      ) : null}
                      {shown.applied_at ? <Badge>{dateTime(shown.applied_at)}</Badge> : null}
                    </div>

                    {shown.note ? (
                      <Callout tone="info" title="Why it was or was not applied">
                        {shown.note}
                      </Callout>
                    ) : null}

                    {shown.affected_columns.length > 0 ? (
                      <p className="text-xs text-neutral-600">
                        Columns touched: {shown.affected_columns.join(', ')}
                      </p>
                    ) : null}

                    {shown.fields.length > 0 ? (
                      <Card>
                        <DataGrid
                          rows={shown.fields}
                          columns={fieldColumns}
                          rowKey={(f) => f.column_name}
                          caption={`Field-level before and after for ${shown.label.toLowerCase()}.`}
                          maxHeight="24rem"
                        />
                      </Card>
                    ) : (
                      <Inset>
                        <p className="text-xs text-neutral-600">
                          This step reports no field-level changes. It either found nothing to
                          change or it did not run — the status above says which.
                        </p>
                      </Inset>
                    )}
                  </div>
                </Section>
              ) : null}

              <Section
                title="Derived features"
                description="New columns computed from the ones that arrived. Each is listed with the columns it was built from, because a feature with no stated parent is a feature nobody can audit."
              >
                <Card>
                  <DataGrid
                    rows={output.features}
                    columns={[
                      { key: 'name', header: 'Feature', mono: true, width: '14rem' },
                      { key: 'data_type', header: 'Type', width: '7rem' },
                      {
                        key: 'source_columns',
                        header: 'Built from',
                        cell: (f) => (
                          <span className="text-2xs text-neutral-600">
                            {f.source_columns.join(', ')}
                          </span>
                        ),
                      },
                      { key: 'description', header: 'What it means' },
                    ]}
                    rowKey={(f) => f.name}
                    caption={`${output.features.length} derived features.`}
                    maxHeight="26rem"
                  />
                </Card>
              </Section>

              {output.processed_file ? (
                <Inset>
                  <p className="eyebrow">Processed file</p>
                  <p className="mt-1 break-words text-xs text-neutral-700">
                    {output.processed_file}
                  </p>
                  <p className="mt-1 text-2xs text-neutral-600">
                    Every later stage reads this file rather than the uploaded original, so the
                    transformation is the single point where the analysis&apos;s view of the data is
                    decided.
                  </p>
                </Inset>
              ) : null}
            </>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}
