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
  Divider,
  KpiRow,
  KpiTile,
  Panel,
  Section,
  Tabs,
  type Column,
} from '../lib/ui';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { useJourney } from '../lib/journey';
import { co2Tonnes, dec, int, num, power, rupees, stamp } from '../lib/format';
import type { ReportFigures, ReportResult, ReportSection } from '../lib/api/types';

type View = 'read' | 'figures';

const FIGURE_FORMAT: Record<
  string,
  'number' | 'currency' | 'energy' | 'co2' | 'power' | 'score' | 'text'
> = {
  readings: 'number',
  buildings: 'number',
  floors: 'number',
  rooms: 'number',
  devices: 'number',
  forecast_method: 'text',
  projected_30d_kwh: 'energy',
  projected_30d_inr: 'currency',
  annual_recoverable_kwh: 'energy',
  annual_recoverable_inr: 'currency',
  data_quality_score: 'score',
  peak_demand_kw: 'power',
  load_factor_pct: 'number',
  anomaly_readings: 'number',
  recommendations: 'number',
  p1_actions: 'number',
  co2_tonnes: 'co2',
  payback_months: 'number',
  annual_recoverable_co2_kg: 'co2',
};

function formatFigure(key: string, value: ReportFigures[string]): string {
  const kind = FIGURE_FORMAT[key];
  if (value === null || value === undefined) return 'not determined';
  switch (kind) {
    case 'number':
      return int(value);
    case 'currency':
      return rupees(value);
    case 'energy':
      return dec(value, 0);
    case 'co2':
      return co2Tonnes(value);
    case 'power':
      return power(value);
    case 'score':
      return dec(value, 1);
    case 'text':
      return String(value);
    default:
      return typeof value === 'number' ? dec(value, 2) : String(value);
  }
}

function figureRows(section: ReportSection): { key: string; value: ReportFigures[string] }[] {
  return Object.entries(section.figures).map(([key, value]) => ({ key, value }));
}

const FIGURE_COLUMNS: readonly Column<{ key: string; value: ReportFigures[string] }>[] = [
  { key: 'key', header: 'Figure', cell: (row) => <span className="mono text-md">{row.key}</span> },
  {
    key: 'value',
    header: 'Value',
    numeric: true,
    cell: (row) => <span className="num">{formatFigure(row.key, row.value)}</span>,
  },
];

export function ReportPage() {
  const state = useStageOutput<ReportResult>('report');
  const runId = useJourney((s) => s.runId);
  const navigate = useNavigate();
  const [view, setView] = useState<View>('read');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <PageFrame
      stage="report"
      status={state.output ? 'done' : 'pending'}
      actions={
        <Button variant="secondary" onClick={() => navigate({ to: '/' })}>
          Back to status
        </Button>
      }
    >
      <StageGate stage="report" state={state} blockedBy={['forecast', 'recommendation']}>
        {(output) => {
          const sections = output.sections;
          const overall = output.summary.overall_health;
          const spend = output.summary.spend;
          const opportunity = output.summary.opportunity;
          const dq = num(overall?.data_quality_score) ?? 0;
          const allFigures = sections.flatMap((s) => figureRows(s));

          return (
            <div className="flex min-w-0 flex-col gap-4">
              <PageHero
                eyebrow={output.title}
                value={rupees(spend?.projected_30d_inr)}
                verdict={`the next 30 days · ${dec(dq, 1)}/100 data quality · ${int(spend?.projected_30d_kwh)} kWh · ${int(opportunity?.recommendations)} actions, of which ${int(opportunity?.p1_actions)} are P1`}
                tone={
                  opportunity?.payback_verdict === 'viable'
                    ? 'ok'
                    : opportunity?.payback_verdict === 'marginal'
                      ? 'warn'
                      : 'critical'
                }
              />

              <div className="prose-muted max-w-3xl text-md">
                <p>
                  {int(output.summary.sections)} sections, assembled entirely from what the previous
                  nine stages recorded. Nothing here is recomputed — every figure below is the same
                  one the page that produced it showed you, which is the only way a summary can be
                  trusted to agree with the evidence behind it.
                </p>
              </div>

              <KpiRow columns={4}>
                <KpiTile
                  label="Data quality"
                  value={dec(dq, 1)}
                  unit="/ 100"
                  tone={dq >= 95 ? 'ok' : dq >= 80 ? 'warn' : 'critical'}
                  hint="Measured by seven rules across five dimensions"
                />
                <KpiTile
                  label="Projected 30 days"
                  value={rupees(spend?.projected_30d_inr)}
                  hint={dec(spend?.projected_30d_kwh, 0) + ' kWh'}
                />
                <KpiTile
                  label="Peak demand"
                  value={power(overall?.peak_demand_kw)}
                  hint={`${dec(overall?.load_factor_pct, 1)}% load factor`}
                  tone="info"
                />
                <KpiTile
                  label="Carbon"
                  value={co2Tonnes(spend?.co2_tonnes)}
                  hint="Projected over 30 days"
                />
              </KpiRow>

              {opportunity?.payback_verdict === 'not_viable' ? (
                <Callout
                  tone="critical"
                  title="The opportunity is real and too small to fund a programme"
                >
                  {int(opportunity.recommendations)} actions recover{' '}
                  {rupees(opportunity.annual_recoverable_inr)} a year and pay back in{' '}
                  {dec(opportunity.payback_months, 1)} months. Report that plainly rather than
                  inflating a recovery fraction until the number looks fundable — a programme that
                  does not pay for itself is still the correct finding to hand management.
                </Callout>
              ) : null}

              <Tabs
                value={view}
                onChange={(next) => setView(next as View)}
                tabs={[
                  { value: 'read', label: 'Read it', badge: sections.length },
                  { value: 'figures', label: 'Every figure', badge: allFigures.length },
                ]}
              />

              {view === 'read' ? (
                <div className="flex min-w-0 flex-col gap-4">
                  <Panel title="Standing of this document">
                    <DetailList>
                      <DetailRow label="Prepared for">
                        <span className="mono">{output.organization_name}</span>
                      </DetailRow>
                      <DetailRow label="Run">
                        <span className="mono text-2xs">{shortRun(runId)}</span>
                      </DetailRow>
                      <DetailRow label="Status">
                        <Badge
                          color={`var(--${output.status === 'ready' ? 'ok' : output.status === 'failed' ? 'critical' : 'warn'})`}
                        >
                          {output.status}
                        </Badge>
                      </DetailRow>
                      <DetailRow label="Format">
                        <span className="mono">{output.format}</span>
                      </DetailRow>
                      <DetailRow label="Generated">
                        <span className="mono">{stamp(output.generated_at)}</span>
                      </DetailRow>
                      <DetailRow label="Took">
                        <span className="num">{int(output.elapsed_ms)} ms</span>
                      </DetailRow>
                    </DetailList>
                    <Callout tone="neutral" title="No model metrics appear in this report">
                      R², RMSE and feature importances are evidence for the person choosing an
                      approach, not for the person signing off a budget. They were deliberately
                      excluded from every section below, and the builder refuses to emit a section
                      that carries them.
                    </Callout>
                  </Panel>

                  {sections.map((section) => {
                    const expanded = open === section.key;
                    return (
                      <Card key={section.key} className="p-5">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <span className="num text-2xs text-[var(--ink-low)]">
                            {section.order} / {sections.length}
                          </span>
                          <h2 className="text-lg font-semibold">{section.title}</h2>
                        </div>
                        <div className="prose-muted mt-2 whitespace-pre-line text-md leading-relaxed">
                          {section.body}
                        </div>
                        {Object.keys(section.figures).length > 0 ? (
                          <>
                            <Divider className="my-3" />
                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              {figureRows(section).map((f) => (
                                <span key={f.key} className="text-md">
                                  <span className="text-[var(--ink-low)]">
                                    {f.key.replace(/_/g, ' ')}:{' '}
                                  </span>
                                  <span className="num">{formatFigure(f.key, f.value)}</span>
                                </span>
                              ))}
                            </div>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="mt-3 text-md text-[var(--brand)] underline"
                          onClick={() => setOpen(expanded ? null : section.key)}
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide section figures' : 'Show section figures'}
                        </button>
                        {expanded ? (
                          <div className="mt-2">
                            <DataGrid
                              rows={figureRows(section)}
                              columns={FIGURE_COLUMNS}
                              rowKey={(row) => row.key}
                              caption={`${section.key} · ${Object.keys(section.figures).length} figures`}
                            />
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ) : null}

              {view === 'figures' ? (
                <Section
                  title="Every figure in the report, in one table"
                  description="A reader who wants to check one number should not have to read twelve sections to find it — or trust that it appears nowhere else by a different route."
                >
                  <DataGrid
                    rows={allFigures.map((f) => ({ ...f, value: f.value }))}
                    columns={[
                      {
                        key: 'key',
                        header: 'Figure',
                        cell: (row) => <span className="mono text-md">{row.key}</span>,
                      },
                      {
                        key: 'value',
                        header: 'Value',
                        numeric: true,
                        cell: (row) => (
                          <span className="num">{formatFigure(row.key, row.value)}</span>
                        ),
                      },
                    ]}
                    rowKey={(row) => `${row.key}`}
                    maxHeight="40rem"
                    caption={`${allFigures.length} figures across ${sections.length} sections`}
                  />
                </Section>
              ) : null}
            </div>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}

function shortRun(runId: string | null): string {
  if (!runId) return 'not recorded';
  return runId.length > 8 ? `${runId.slice(0, 8)}…` : runId;
}
