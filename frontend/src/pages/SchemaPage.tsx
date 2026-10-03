import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { PageFrame, PageHero } from '../app/PageFrame';
import { StageGate } from '../app/StageGate';
import type { SchemaColumn, SchemaDiscovery } from '../lib/api/types';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { useStageOutput } from '../lib/stageOutput';
import { dateTime, duration, int } from '../lib/format';
import { RankedBars } from '../lib/charts';
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

/** Roles that carry the analysis, in the order a reader should meet them. */
const ROLE_ORDER = [
  'energy_timestamp',
  'energy_target',
  'device_identifier',
  'building_code',
  'floor_number',
  'room_code',
  'device_category',
  'device_type',
  'temperature_c',
  'humidity_pct',
  'occupancy_count',
  'voltage_v',
  'current_a',
  'power_factor',
];

const ROLE_NOTE: Record<string, string> = {
  energy_timestamp: 'The time column every forecast is indexed against.',
  energy_target: 'The reading being predicted. Everything else is a predictor of this.',
  device_identifier:
    'Which meter a row belongs to. Without it the hourly series cannot be assembled.',
  building_code: 'The estate boundary. Used to scope every per-building figure.',
  floor_number: 'The vertical position of the meter.',
  room_code: 'The space the meter serves.',
  device_category:
    'The class of load — HVAC, lighting, plug, meter. Set as an identifier, not a number.',
  device_type: 'The specific equipment class.',
  temperature_c: 'Weather context for HVAC load.',
  humidity_pct: 'Weather context.',
  occupancy_count:
    'How many people were in the space. The strongest non-lagged signal in the data.',
  voltage_v: 'Supply voltage. Out-of-range values here are physically impossible, not merely odd.',
  current_a: 'Measured current draw.',
  power_factor: 'How efficiently the load converts power. Values outside 0.6–1.0 are impossible.',
};

/**
 * Stage 3 — schema discovery.
 *
 * The point of this stage is not to describe the file; the import page already
 * did that. It is to say which role each column plays in the analysis, and to
 * show the evidence for that claim so the claim can be checked.
 *
 * Every column carries its own sample values and its own distinct count, which
 * is what turns "this is the timestamp column" from an assertion into something
 * a reader can confirm at a glance. Columns the inference could not classify
 * are shown last and said so, because an unclassified column is a question for
 * the estates team, not a footnote.
 */
export function SchemaPage() {
  const { datasetId } = useDatasetScope();
  const state = useStageOutput<SchemaDiscovery>('schema');

  const roleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const col of state.output?.columns ?? []) {
      const role = col.semantic_type ?? 'unclassified';
      map.set(role, (map.get(role) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [state.output]);

  const columns: Column<SchemaColumn>[] = [
    { key: 'name', header: 'Column', mono: true, width: '11rem' },
    { key: 'data_type', header: 'Inferred type', width: '7rem' },
    {
      key: 'semantic_type',
      header: 'Role in the analysis',
      width: '11rem',
      cell: (c) =>
        c.semantic_type ? (
          <Badge>{c.semantic_type}</Badge>
        ) : (
          <span className="text-2xs text-[var(--warn)]">unclassified</span>
        ),
    },
    {
      key: 'nullable',
      header: 'Nullable',
      width: '5rem',
      cell: (c) => (c.nullable ? 'yes' : 'no'),
    },
    {
      key: 'null_count',
      header: 'Nulls',
      numeric: true,
      width: '5rem',
      cell: (c) => (c.null_count > 0 ? int(c.null_count) : '0'),
    },
    {
      key: 'unique_count',
      header: 'Distinct',
      numeric: true,
      width: '6rem',
      cell: (c) => int(c.unique_count),
    },
    {
      key: 'sample_values',
      header: 'Observed values',
      cell: (c) => (
        <span className="text-2xs text-neutral-600">
          {(c.sample_values ?? []).map((v) => String(v)).join(' · ') || '—'}
        </span>
      ),
    },
  ];

  return (
    <PageFrame
      stage="schema"
      status={state.output ? 'done' : 'pending'}
      actions={
        <Link to="/quality/$datasetId" params={{ datasetId: datasetId ?? '' }}>
          <Button variant="primary">Continue to data quality</Button>
        </Link>
      }
    >
      <StageGate stage="schema" state={state} blockedBy={['import']}>
        {(output, s) => {
          const sorted = [...output.columns].sort((a, b) => {
            const ra = a.semantic_type ? ROLE_ORDER.indexOf(a.semantic_type) : 999;
            const rb = b.semantic_type ? ROLE_ORDER.indexOf(b.semantic_type) : 999;
            return ra - rb || a.name.localeCompare(b.name);
          });
          const unclassified = sorted.filter((c) => !c.semantic_type);
          const target = output.columns.find((c) => c.semantic_type === 'energy_target');
          const keyCol =
            output.columns.find((c) => c.semantic_type === 'device_identifier') ??
            output.columns.find((c) => c.semantic_type === 'building_code');

          return (
            <>
              <PageHero
                eyebrow="Columns classified"
                value={int(output.columns.length)}
                unit="roles"
                verdict={s.decision ?? `${output.columns.length} columns were classified.`}
                tone={output.warnings.length > 0 ? 'warn' : 'neutral'}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-neutral-600">
                  <span>
                    inferred in {duration(output.elapsed_ms / 1000)} ·{' '}
                    {dateTime(output.discovered_at)}
                  </span>
                  <span>source: {output.source}</span>
                </div>
              </PageHero>

              <p className="max-w-3xl text-sm text-neutral-700">
                {int(output.columns.length)} columns were each assigned one role out of{' '}
                {int(roleCounts.length)} that the analysis knows how to use
                {target ? `, with ${target.name} as the reading to predict` : ''}
                {keyCol ? ` and ${keyCol.name} identifying which meter a row belongs to` : ''}. A
                role is not a label applied afterwards — it decides which columns become the
                estimator's features and which are excluded as identifiers.
              </p>

              {output.warnings.length > 0 ? (
                <Callout tone="warn" title={`${output.warnings.length} inference warnings`}>
                  <ul className="list-disc space-y-1 pl-4">
                    {output.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              ) : null}

              {output.dropped_columns.length > 0 ? (
                <Callout tone="warn" title="Columns excluded before analysis">
                  {output.dropped_columns.join(', ')} — dropped before features were built. They
                  remain in the source file; they are simply not read by the model.
                </Callout>
              ) : null}

              <KpiRow columns={4}>
                <KpiTile label="Columns" value={int(output.columns.length)} />
                <KpiTile label="Roles used" value={int(roleCounts.length)} />
                <KpiTile
                  label="Unclassified"
                  value={int(unclassified.length)}
                  tone={unclassified.length > 0 ? 'warn' : 'ok'}
                  hint="Columns the inference could not place"
                />
                <KpiTile
                  label="Varying columns"
                  value={int(sorted.filter((c) => c.unique_count > 1).length)}
                  hint="Columns that hold more than one distinct value"
                />
              </KpiRow>

              <Section
                title="Column roles"
                description="Every column, in the order the analysis uses it, with the evidence for its role."
              >
                <Card>
                  <DataGrid
                    rows={sorted}
                    columns={columns}
                    rowKey={(c) => c.name}
                    caption={`${sorted.length} columns classified from inference.`}
                    maxHeight="34rem"
                  />
                </Card>
              </Section>

              {roleCounts.length > 0 ? (
                <Section
                  title="Roles present"
                  description="How many columns each role covers. A role with many columns means the file carries more than one measurement of the same thing."
                >
                  <Card>
                    <RankedBars
                      rows={roleCounts}
                      valueKey="count"
                      labelKey="label"
                      max={roleCounts.length}
                      format={(v) => `${int(v)} column${int(v) === '1' ? '' : 's'}`}
                    />
                  </Card>
                </Section>
              ) : null}

              <Section
                title="What each role is for"
                description="The reason a column was classified the way it was."
              >
                <Card>
                  <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                    {roleCounts.map(({ label, count }) => (
                      <div key={label} className="border-b border-[var(--line-faint)] pb-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-xs font-medium text-neutral-800">{label}</dt>
                          <dd className="num shrink-0 text-2xs text-neutral-600">{count}</dd>
                        </div>
                        <dd className="mt-0.5 text-2xs text-neutral-600">
                          {ROLE_NOTE[label] ?? 'No note recorded for this role.'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {unclassified.length > 0 ? (
                    <Inset className="mt-4">
                      <p className="eyebrow">Unclassified columns</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {unclassified.map((c) => c.name).join(', ')} could not be assigned a role
                        the analysis knows. They are read as numbers rather than as identity or
                        time, which is the safe default — but if any of them is really an identifier
                        or a timestamp, the estates team should say so.
                      </p>
                    </Inset>
                  ) : null}
                </Card>
              </Section>
            </>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}
