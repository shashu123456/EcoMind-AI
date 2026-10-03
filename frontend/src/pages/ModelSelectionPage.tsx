import { Link, useNavigate } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  DetailList,
  DetailRow,
  KpiRow,
  KpiTile,
  MeterBar,
  Panel,
  Section,
  type Column,
} from '../lib/ui';
import { BarCompare, RankedBars } from '../lib/charts';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { dec, energy, int, num, pct, scoreFromFraction } from '../lib/format';
import type { ModelCandidate, ModelSelectionResult } from '../lib/api/types';

const CRITERIA_ORDER = ['r2', 'rmse', 'speed'] as const;
type Criterion = (typeof CRITERIA_ORDER)[number];

const CRITERIA_LABEL: Record<Criterion, string> = {
  r2: 'Fit (R²)',
  rmse: 'Error (RMSE)',
  speed: 'Training time',
};

const CRITERIA_NOTE: Record<Criterion, string> = {
  r2: 'How much of the variation in hourly consumption the model explains. Higher is better.',
  rmse: 'Typical size of a wrong prediction, in kWh. Lower is better.',
  speed: 'How long the model took to train. Faster leaves more budget for re-running.',
};

const CRITERIA_WEIGHTED = {
  r2: 0.5,
  rmse: 0.35,
  speed: 0.15,
} as const;

const FAMILY_TONE: Record<string, string> = {
  boosted: 'var(--brand)',
  linear: 'var(--chart-2)',
  neighbour: 'var(--chart-3)',
  seasonal: 'var(--chart-4)',
};

function scoreTone(score: number): 'ok' | 'warn' | 'critical' {
  if (score >= 0.85) return 'ok';
  if (score >= 0.7) return 'warn';
  return 'critical';
}

function metric(candidate: ModelCandidate, criterion: Criterion): number {
  if (criterion === 'speed') return candidate.metrics.training_seconds ?? 0;
  const value = candidate.metrics[criterion];
  return typeof value === 'number' ? value : 0;
}

function describeWeights(weights: Record<string, number>): string {
  return CRITERIA_ORDER.map((c) => `${CRITERIA_LABEL[c]} ${pct(weights[c] ?? 0, 0)}`).join(', ');
}

export function ModelSelectionPage() {
  const state = useStageOutput<ModelSelectionResult>('model_selection');
  const { datasetId } = useDatasetScope();
  const navigate = useNavigate();

  return (
    <PageFrame
      stage="model_selection"
      status={state.output ? 'done' : 'pending'}
      actions={
        datasetId ? (
          <Button
            variant="primary"
            onClick={() => void navigate({ to: '/anomalies/$datasetId', params: { datasetId } })}
          >
            Continue to anomalies
          </Button>
        ) : undefined
      }
    >
      <StageGate stage="model_selection" state={state} blockedBy={['transformation']}>
        {(output) => {
          const { candidates, weights, near_tie, margin_over_second } = output;
          const ordered = [...candidates].sort((a, b) => a.selection_rank - b.selection_rank);
          const runnerUp = ordered[1];
          const features = Object.entries(output.feature_importances)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
          const traits = output.dataset_characteristics;

          const rankColumns: readonly Column<ModelCandidate>[] = [
            {
              key: 'selection_rank',
              header: '#',
              width: '3rem',
              align: 'right',
              cell: (row) => <span className="num">{row.selection_rank}</span>,
            },
            {
              key: 'display_name',
              header: 'Candidate',
              cell: (row) => (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: FAMILY_TONE[row.family] ?? 'var(--ink-low)' }}
                  />
                  <span className={row.is_selected ? 'font-medium' : undefined}>
                    {row.display_name}
                  </span>
                  {row.is_selected ? <Badge color="var(--brand)">selected</Badge> : null}
                </span>
              ),
            },
            {
              key: 'family',
              header: 'Family',
              cell: (row) => <span className="text-md text-[var(--ink-mid)]">{row.family}</span>,
            },
            {
              key: 'r2',
              header: 'R²',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.metrics.r2, 4)}</span>,
            },
            {
              key: 'rmse',
              header: 'RMSE kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.metrics.rmse, 3)}</span>,
            },
            {
              key: 'mae',
              header: 'MAE kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.metrics.mae, 3)}</span>,
            },
            {
              key: 'mape',
              header: 'MAPE %',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.metrics.mape, 2)}</span>,
            },
            {
              key: 'training_seconds',
              header: 'Train s',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.metrics.training_seconds, 2)}</span>,
            },
            {
              key: 'composite_score',
              header: 'Weighted',
              numeric: true,
              cell: (row) => <span className="num font-medium">{dec(row.composite_score, 4)}</span>,
            },
          ];

          return (
            <div className="flex min-w-0 flex-col gap-4">
              <PageHero
                eyebrow="Chosen approach"
                value={output.selected_algorithm.replace(/_/g, ' ')}
                verdict={
                  near_tie
                    ? `margin over ${runnerUp?.display_name ?? 'the runner-up'} of ${dec(margin_over_second * 100, 2)}% — inside the near-tie threshold`
                    : `margin over ${runnerUp?.display_name ?? 'the runner-up'} of ${pct(margin_over_second, 2)}`
                }
              />

              <div className="prose-muted max-w-3xl text-md">
                <p>{output.rationale}</p>
              </div>

              {near_tie ? (
                <Callout tone="warn" title="The top two models are effectively tied">
                  {runnerUp?.display_name ?? 'The runner-up'} scored{' '}
                  {dec(runnerUp?.composite_score ?? 0, 4)} against{' '}
                  {dec(output.candidates.find((c) => c.is_selected)?.composite_score ?? 0, 4)}. Any
                  further work on {runnerUp?.display_name ?? 'it'} would change the answer, so treat
                  the anomaly and forecast pages as being built on a choice that could flip.
                </Callout>
              ) : null}

              <KpiRow columns={5}>
                <KpiTile
                  label="Candidates trained"
                  value={int(candidates.length)}
                  hint="Same split, same features, same target"
                />
                <KpiTile
                  label="Train rows"
                  value={int(output.train_rows)}
                  hint={`Test rows ${int(output.test_rows)} — ${output.split_strategy}`}
                />
                <KpiTile
                  label="Features"
                  value={int(output.feature_count)}
                  hint={`${dec(traits.span_days, 0)} days of history available`}
                />
                <KpiTile
                  label="Best R²"
                  value={dec(Math.max(...candidates.map((c) => num(c.metrics.r2) ?? 0)), 4)}
                  tone="ok"
                  hint="Held-out, never trained on"
                />
                <KpiTile
                  label="Target spread"
                  value={dec(traits.target_cv, 3)}
                  unit="CV"
                  hint={`mean ${dec(traits.target_mean, 3)} kWh, sd ${dec(traits.target_std, 3)}`}
                />
              </KpiRow>

              <BarCompare
                title="Weighted score by candidate"
                hint={`Normalised per criterion then combined — ${describeWeights(weights)}`}
                data={ordered.map((c) => ({
                  algorithm: c.display_name,
                  weighted: c.composite_score,
                }))}
                category="algorithm"
                series={[{ key: 'weighted', label: 'Weighted score', unit: '' }]}
                format={(v) => dec(v, 4)}
                reference={{
                  value: ordered[0]?.composite_score ?? 0,
                  label: 'selected',
                }}
                height={220}
              />

              <Section
                title={`The ${candidates.length} candidates`}
                description="Every candidate was trained and scored on the same held-out tail, so the comparison is between results rather than between setups."
              >
                <DataGrid
                  rows={ordered}
                  columns={rankColumns}
                  rowKey={(row) => row.id}
                  caption={`${int(candidates.length)} candidates · ${output.excluded_columns.length} columns excluded before modelling`}
                />
              </Section>

              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <Section
                  title="Why this one"
                  description="The criteria that decided the winner, and the ones it had to concede."
                >
                  <div className="flex flex-wrap gap-2">
                    {output.winning_criteria.map((c) => (
                      <Badge key={c} color="var(--ok)">
                        won on {CRITERIA_LABEL[c as Criterion] ?? c}
                      </Badge>
                    ))}
                    {output.lost_criteria.map((c) => (
                      <Badge key={c} color="var(--warn)">
                        lost on {CRITERIA_LABEL[c as Criterion] ?? c}
                      </Badge>
                    ))}
                  </div>
                  <DetailList>
                    <DetailRow label="Target column">
                      <span className="mono">{output.target_column}</span>
                    </DetailRow>
                    <DetailRow label="Split">
                      <span className="mono">{output.split_strategy}</span>
                    </DetailRow>
                    <DetailRow label="Weights">
                      <span className="mono">{describeWeights(weights)}</span>
                    </DetailRow>
                    <DetailRow label="Dataset">
                      <span className="mono">
                        {int(traits.rows)} rows{traits.sampled ? ' (sampled)' : ''} ·{' '}
                        {int(traits.devices)} devices · {int(traits.buildings)} buildings
                      </span>
                    </DetailRow>
                    <DetailRow label="Matrix hash">
                      <span className="mono text-2xs">{traits.matrix_hash}</span>
                    </DetailRow>
                    <DetailRow label="Excluded">
                      <span className="mono text-2xs">
                        {output.excluded_columns.join(', ') || 'none'}
                      </span>
                    </DetailRow>
                    <DetailRow label="Decided">
                      <span className="mono">{output.decided_at}</span>
                    </DetailRow>
                  </DetailList>
                </Section>

                <Section
                  title="What the model leans on"
                  description="Feature importance as measured on the fitted model, not as described by the designer."
                >
                  <RankedBars
                    rows={features}
                    valueKey="value"
                    labelKey="name"
                    max={10}
                    format={(v) => dec(v, 4)}
                  />
                  <Callout tone="neutral" title="One feature does nearly all the work">
                    {features[0]?.name ?? 'the leading feature'} carries{' '}
                    {pct(features[0]?.value ?? 0, 1)} of the importance. The temperature, humidity
                    and occupancy columns are present and cost nothing, but they explain very little
                    on their own. Treat weather as a small correction, not as the driver.
                  </Callout>
                </Section>
              </div>

              <Section
                title="What each criterion was worth"
                description="The three numbers that produced the weighted score, and why each one carries its weight."
              >
                <div className="grid gap-3 md:grid-cols-3">
                  {CRITERIA_ORDER.map((criterion) => (
                    <Card key={criterion} className="p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="eyebrow">{CRITERIA_LABEL[criterion]}</span>
                        <span className="num text-md">{pct(CRITERIA_WEIGHTED[criterion], 0)}</span>
                      </div>
                      <div className="mt-2">
                        <MeterBar
                          value={CRITERIA_WEIGHTED[criterion]}
                          max={1}
                          tone={
                            criterion === 'r2' ? 'brand' : criterion === 'rmse' ? 'info' : 'neutral'
                          }
                        />
                      </div>
                      <p className="mt-2 text-md text-[var(--ink-mid)]">
                        {CRITERIA_NOTE[criterion]}
                      </p>
                    </Card>
                  ))}
                </div>
              </Section>

              <Panel title="Reading these numbers">
                <p className="text-md text-[var(--ink-mid)]">
                  These metrics describe how well a model reproduces this dataset, not how good the
                  buildings are. They are the evidence behind the forecast on the next page and are
                  deliberately kept off the report — a board paper should not read as a building
                  rating.
                </p>
                <p className="mt-2 text-md text-[var(--ink-mid)]">
                  <span className="text-[var(--ink)]">{energy(traits.target_mean * 24)}</span> of
                  campus consumption per day at the historical mean of {dec(traits.target_mean, 3)}{' '}
                  kWh per device-hour, across {int(traits.devices)} devices.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge
                    color={`var(--${scoreTone(ordered[0]?.composite_score ?? 0) === 'ok' ? 'ok' : scoreTone(ordered[0]?.composite_score ?? 0) === 'warn' ? 'warn' : 'critical'})`}
                  >
                    weighted {dec(ordered[0]?.composite_score ?? 0, 4)}
                  </Badge>
                  <Badge color="var(--info)">
                    fit {scoreFromFraction(ordered[0]?.metrics.r2 ?? 0)}
                  </Badge>
                </div>
                <div className="mt-3">
                  {datasetId ? (
                    <Link
                      to="/anomalies/$datasetId"
                      params={{ datasetId }}
                      className="text-md text-[var(--brand)] underline"
                    >
                      Continue to anomalies
                    </Link>
                  ) : null}
                </div>
              </Panel>
            </div>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}
