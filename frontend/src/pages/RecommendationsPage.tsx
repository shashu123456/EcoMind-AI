import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  DetailList,
  DetailRow,
  Inset,
  KpiRow,
  KpiTile,
  Panel,
  ProgressBar,
  Section,
  Tabs,
  type Column,
} from '../lib/ui';
import { BarCompare } from '../lib/charts';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { co2Tonnes, dec, energy, int, rupees, rupeesCompact } from '../lib/format';
import type { ProgrammeBuilding, RecommendationItem, RecommendationResult } from '../lib/api/types';

type View = 'actions' | 'programme';

const PRIORITY_TONE: Record<string, string> = {
  P1: 'var(--critical)',
  P2: 'var(--warn)',
  P3: 'var(--info)',
};

const VERDICT_TONE: Record<string, 'ok' | 'warn' | 'critical'> = {
  viable: 'ok',
  marginal: 'warn',
  not_viable: 'critical',
  unknown: 'warn',
};

const VERDICT_MEANING: Record<string, string> = {
  viable: 'pays for itself inside a year',
  marginal: 'pays for itself inside three years',
  not_viable: 'never pays for itself at this cost and this saving',
  unknown: 'no cost was available to judge it against',
};

function verdictTone(v: string): 'ok' | 'warn' | 'critical' {
  return VERDICT_TONE[v] ?? 'warn';
}

export function RecommendationsPage() {
  const state = useStageOutput<RecommendationResult>('recommendation');
  const { datasetId } = useDatasetScope();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('actions');
  const [priority, setPriority] = useState<string | null>(null);

  return (
    <PageFrame
      stage="recommendation"
      status={state.output ? 'done' : 'pending'}
      actions={
        datasetId ? (
          <Button
            variant="primary"
            onClick={() => void navigate({ to: '/report/$datasetId', params: { datasetId } })}
          >
            Continue to report
          </Button>
        ) : undefined
      }
    >
      <StageGate stage="recommendation" state={state} blockedBy={['anomaly', 'forecast']}>
        {(output) => {
          const estate = output.programme.estate;
          const items = priority
            ? output.recommendations.filter((r) => r.priority === priority)
            : output.recommendations;
          const thresholds = output.payback_thresholds_months;

          const actionColumns: readonly Column<RecommendationItem>[] = [
            {
              key: 'priority',
              header: 'Pri',
              width: '3.5rem',
              cell: (row) => (
                <Badge color={PRIORITY_TONE[row.priority] ?? 'var(--ink-low)'}>
                  {row.priority}
                </Badge>
              ),
            },
            {
              key: 'title',
              header: 'Action',
              cell: (row) => (
                <span>
                  <span className="font-medium">{row.title}</span>
                  <span className="block text-2xs text-[var(--ink-low)]">
                    {row.building_code}
                    {row.floor_no ? ` · floor ${row.floor_no}` : ''}
                    {row.room_code ? ` · ${row.room_code}` : ''} · {row.device_code}
                  </span>
                </span>
              ),
            },
            {
              key: 'savings_kwh',
              header: 'kWh saved',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.savings_kwh, 1)}</span>,
            },
            {
              key: 'savings_cost_inr',
              header: 'Saved',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.savings_cost_inr)}</span>,
            },
            {
              key: 'estimated_cost_inr',
              header: 'Costs',
              numeric: true,
              cell: (row) =>
                row.estimated_cost_inr === null ? (
                  <span className="text-[var(--ink-low)]">investigate first</span>
                ) : (
                  <span className="num">{rupees(row.estimated_cost_inr)}</span>
                ),
            },
            {
              key: 'payback_months',
              header: 'Payback',
              numeric: true,
              cell: (row) =>
                row.payback_months === null ? (
                  <span className="text-[var(--ink-low)]">—</span>
                ) : (
                  <span className="num">{dec(row.payback_months, 1)} mo</span>
                ),
            },
            {
              key: 'payback_verdict',
              header: 'Verdict',
              cell: (row) => (
                <Badge color={`var(--${verdictTone(row.payback_verdict)})`}>
                  {row.payback_verdict.replace(/_/g, ' ')}
                </Badge>
              ),
            },
            {
              key: 'anomaly_ids',
              header: 'Receipts',
              numeric: true,
              cell: (row) => (
                <span className="num text-md">{int(row.anomaly_ids.length)} findings</span>
              ),
            },
          ];

          const buildingColumns: readonly Column<ProgrammeBuilding>[] = [
            {
              key: 'building_code',
              header: 'Building',
              cell: (row) => <span className="mono font-medium">{row.building_code}</span>,
            },
            {
              key: 'recommendations',
              header: 'Actions',
              numeric: true,
              cell: (row) => <span className="num">{int(row.recommendations)}</span>,
            },
            {
              key: 'p1_actions',
              header: 'P1',
              numeric: true,
              cell: (row) => <span className="num">{int(row.p1_actions)}</span>,
            },
            {
              key: 'devices_affected',
              header: 'Devices',
              numeric: true,
              cell: (row) => <span className="num">{int(row.devices_affected)}</span>,
            },
            {
              key: 'monthly_recoverable_inr',
              header: 'Monthly',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.monthly_recoverable_inr)}</span>,
            },
            {
              key: 'programme_cost_inr',
              header: 'One visit costs',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.programme_cost_inr)}</span>,
            },
            {
              key: 'payback_months',
              header: 'Payback',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.payback_months, 1)} mo</span>,
            },
            {
              key: 'payback_verdict',
              header: 'Verdict',
              cell: (row) => (
                <Badge color={`var(--${verdictTone(row.payback_verdict)})`}>
                  {row.payback_verdict.replace(/_/g, ' ')}
                </Badge>
              ),
            },
          ];

          const estateViable = estate.payback_verdict === 'viable';

          return (
            <div className="flex min-w-0 flex-col gap-4">
              <PageHero
                eyebrow="Recoverable across all actions"
                value={rupees(estate.annual_recoverable_inr)}
                verdict={`a year, ${energy(estate.recoverable_kwh)} and ${co2Tonnes(estate.annual_recoverable_co2_kg)} of carbon — against ${rupees(estate.programme_cost_inr)} to do it in one pass, a payback of ${dec(estate.payback_months, 1)} months`}
                tone={estateViable ? 'ok' : 'warn'}
              />

              <div className="prose-muted max-w-3xl text-md">
                <p>
                  {int(output.total)} actions, grouped by device and anomaly class so fifty readings
                  on one meter arrive as one action rather than fifty. Every line cites the findings
                  it rests on and the forecast that sized it.
                </p>
              </div>

              {output.programme.estate.payback_verdict === 'not_viable' ? (
                <Callout
                  tone="critical"
                  title={`At ${rupees(estate.monthly_recoverable_inr)} a month this does not pay for itself`}
                >
                  The recovery is real and the anomalies are real — they are just too small to fund
                  a programme at these intervention costs. A {rupees(estate.programme_cost_inr)}{' '}
                  mobilisation against {rupees(estate.annual_recoverable_inr)} a year is{' '}
                  {dec(estate.payback_months, 1)} months. Two things follow, and only two: fix the
                  metering and the room mappings, which are cheap and make every future estimate
                  better, and treat the operational savings as a bonus rather than a budget line.
                </Callout>
              ) : null}

              <KpiRow columns={5}>
                <KpiTile
                  label="Actions"
                  value={int(output.total)}
                  hint={`${int(output.by_priority.P1)} P1 · ${int(output.by_priority.P2)} P2 · ${int(output.by_priority.P3)} P3`}
                />
                <KpiTile
                  label="Monthly recovery"
                  value={rupees(estate.monthly_recoverable_inr)}
                  hint="After the per-class recovery fraction"
                />
                <KpiTile
                  label="Annual recovery"
                  value={rupeesCompact(estate.annual_recoverable_inr)}
                  hint={energy(estate.recoverable_kwh)}
                  tone="ok"
                />
                <KpiTile
                  label="Programme cost"
                  value={rupees(estate.programme_cost_inr)}
                  hint="One mobilisation for the estate"
                />
                <KpiTile
                  label="Payback"
                  value={dec(estate.payback_months, 1)}
                  unit="months"
                  tone={verdictTone(estate.payback_verdict)}
                  hint={VERDICT_MEANING[estate.payback_verdict] ?? ''}
                />
              </KpiRow>

              <Section title="Why this order">
                <Inset className="text-md">{output.priority_basis}</Inset>
                <div className="flex flex-wrap gap-2">
                  <Badge color="var(--info)">viable ≤ {dec(thresholds.viable, 0)} months</Badge>
                  <Badge color="var(--warn)">marginal ≤ {dec(thresholds.marginal, 0)} months</Badge>
                  <Badge color="var(--critical)">not viable beyond that</Badge>
                </div>
              </Section>

              <Tabs
                value={view}
                onChange={(next) => setView(next as View)}
                tabs={[
                  { value: 'actions', label: 'Individual actions', badge: output.total },
                  {
                    value: 'programme',
                    label: 'Programme by building',
                    badge: Object.keys(output.programme.buildings).length,
                  },
                ]}
              />

              {view === 'actions' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={priority ? 'secondary' : 'primary'}
                      onClick={() => setPriority(null)}
                    >
                      All priorities ({int(output.total)})
                    </Button>
                    {(['P1', 'P2', 'P3'] as const).map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant={priority === p ? 'primary' : 'secondary'}
                        onClick={() => setPriority(priority === p ? null : p)}
                      >
                        {p} ({int(output.by_priority[p])})
                      </Button>
                    ))}
                  </div>
                  <DataGrid
                    rows={items}
                    columns={actionColumns}
                    rowKey={(row) => row.id}
                    maxHeight="32rem"
                    caption={`${int(items.length)} of ${int(output.total)} actions · grouped by device and class`}
                  />
                  <ActionEvidence items={items.slice(0, 3)} />
                </div>
              ) : null}

              {view === 'programme' ? (
                <div className="flex flex-col gap-4">
                  <Callout tone="info" title="One mobilisation per building, not one per line item">
                    {output.programme.method}
                  </Callout>
                  <BarCompare
                    title="What each building recovers a month"
                    hint="Recovery after the per-class fraction, priced at the blended tariff rate"
                    data={Object.values(output.programme.buildings).map((b) => ({
                      building: b.building_code,
                      monthly_inr: b.monthly_recoverable_inr,
                    }))}
                    category="building"
                    series={[{ key: 'monthly_inr', label: 'Monthly recovery', unit: 'INR' }]}
                    format={(v) => rupees(v)}
                    layout="vertical"
                    height={200}
                  />
                  <DataGrid
                    rows={Object.values(output.programme.buildings)}
                    columns={buildingColumns}
                    rowKey={(row) => row.building_code}
                    caption={`Estate total ${rupees(estate.annual_recoverable_inr)} a year against ${rupees(estate.programme_cost_inr)}`}
                  />
                  <Card className="p-4">
                    <span className="eyebrow">Estate position</span>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <span className="block text-2xs text-[var(--ink-low)]">
                          Recovers a year
                        </span>
                        <span className="num text-xl font-semibold">
                          {rupees(estate.annual_recoverable_inr)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs text-[var(--ink-low)]">Costs once</span>
                        <span className="num text-xl font-semibold">
                          {rupees(estate.programme_cost_inr)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs text-[var(--ink-low)]">Payback</span>
                        <span className="num text-xl font-semibold">
                          {dec(estate.payback_months, 1)} mo
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        value={Math.min(
                          1,
                          estate.annual_recoverable_inr / Math.max(1e-9, estate.programme_cost_inr),
                        )}
                        tone={verdictTone(estate.payback_verdict)}
                        label={`${dec((estate.annual_recoverable_inr / Math.max(1e-9, estate.programme_cost_inr)) * 100, 1)}% of the cost recovered in year one`}
                        showValue
                      />
                    </div>
                  </Card>
                </div>
              ) : null}

              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <Section title="The savings arithmetic">
                  <Inset className="text-md">{output.savings_inventory.note}</Inset>
                  <DetailList>
                    <DetailRow label="Raw excess detected">
                      <span className="num">{energy(output.savings_inventory.raw_excess_kwh)}</span>
                    </DetailRow>
                    <DetailRow label="Grouped into actions">
                      <span className="num">{int(output.savings_inventory.groups)} groups</span>
                    </DetailRow>
                    <DetailRow label="After recovery fractions">
                      <span className="num">
                        {energy(output.savings_inventory.grouped_recoverable_kwh)}
                      </span>
                    </DetailRow>
                    <DetailRow label="Forecast available">
                      <span className="mono">{output.forecast_basis_available ? 'yes' : 'no'}</span>
                    </DetailRow>
                  </DetailList>
                </Section>
                <Panel title="What a payback verdict means here">
                  <div className="space-y-2">
                    {(['viable', 'marginal', 'not_viable', 'unknown'] as const).map((v) => (
                      <div key={v} className="flex items-baseline gap-2">
                        <Badge color={`var(--${verdictTone(v)})`}>{v.replace(/_/g, ' ')}</Badge>
                        <span className="text-md text-[var(--ink-mid)]">{VERDICT_MEANING[v]}</span>
                      </div>
                    ))}
                  </div>
                  <Callout tone="neutral" title="Why a range and not a point">
                    A median-baseline energy estimate cannot support a payback quoted to the month.
                    The number is a direction, and the verdict is what to act on.
                  </Callout>
                </Panel>
              </div>
            </div>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}

function ActionEvidence({ items }: { items: readonly RecommendationItem[] }) {
  if (items.length === 0) return null;
  return (
    <Section
      title="What the top actions actually say"
      description="Each one states the evidence it rests on, the specific fix, and what it would cost."
    >
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={PRIORITY_TONE[item.priority] ?? 'var(--ink-low)'}>
                {item.priority}
              </Badge>
              <span className="font-medium">{item.title}</span>
              <Badge color={`var(--${verdictTone(item.payback_verdict)})`}>
                {item.payback_verdict.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="mt-2 text-md text-[var(--ink-mid)]">{item.reason}</p>
            <p className="mt-2 text-md">
              <span className="text-2xs text-[var(--ink-low)]">Do this: </span>
              {item.action}
            </p>
            <div className="mt-3">
              <DetailList>
                <DetailRow label="Saves">
                  <span className="num">
                    {dec(item.savings_kwh, 1)} kWh · {rupees(item.savings_cost_inr)} ·{' '}
                    {co2Tonnes(item.savings_co2_kg)}
                  </span>
                </DetailRow>
                <DetailRow label="Costs">
                  <span className="num">
                    {item.estimated_cost_inr === null
                      ? 'not costed'
                      : rupees(item.estimated_cost_inr)}
                  </span>
                </DetailRow>
                <DetailRow label="Rests on">
                  <span className="num">{int(item.anomaly_ids.length)} measured findings</span>
                </DetailRow>
                <DetailRow label="Sized by">{item.forecast_basis}</DetailRow>
                <DetailRow label="Confidence">
                  <span className="num">{dec(item.confidence, 2)}</span>
                </DetailRow>
              </DetailList>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
