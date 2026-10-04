import { useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataGrid,
  DetailList,
  DetailRow,
  Divider,
  EmptyState,
  Inset,
  KpiRow,
  KpiTile,
  Panel,
  Section,
  Tabs,
  useToast,
  type Column,
} from '../lib/ui';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { downloadReportPdf } from '../lib/api/runs';
import { useJourney } from '../lib/journey';
import {
  co2Kg,
  co2Tonnes,
  dec,
  energy,
  int,
  num,
  power,
  rupees,
  rupeesCompact,
  stamp,
} from '../lib/format';
import type {
  RecommendationResult,
  ReportFigures,
  ReportResult,
  ReportSection,
} from '../lib/api/types';

type View = 'read' | 'figures' | 'action-plan';

const FIGURE_FORMAT: Record<
  string,
  'number' | 'currency' | 'energy' | 'co2' | 'co2kg' | 'power' | 'score' | 'text'
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
    case 'co2kg':
      return co2Kg(value);
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

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'var(--critical)',
  P2: 'var(--warn)',
  P3: 'var(--info)',
};

function verdictColor(verdict: string): string {
  if (verdict === 'viable') return 'var(--ok)';
  if (verdict === 'marginal') return 'var(--warn)';
  if (verdict === 'not_viable') return 'var(--critical)';
  return 'var(--ink-low)';
}

export function ReportPage() {
  const state = useStageOutput<ReportResult>('report');
  /**
   * The action plan is the recommendation stage, read here rather than on a
   * page of its own. A reader who has the report open should not have to
   * navigate away to find out what to actually do about it.
   */
  const recState = useStageOutput<RecommendationResult>('recommendation');
  const runId = useJourney((s) => s.runId);
  const navigate = useNavigate();
  const location = useLocation();
  /*
   * The fragment is the source of truth, not a mirror of it.
   *
   * This used to keep `view` in state and copy the fragment into it from an
   * effect, which meant two sources of truth that could disagree and an extra
   * render on every tab change. Deriving instead makes the address bar and the
   * tab the same fact, so back/forward works and a shared link lands on the tab
   * the sender was reading -- which is what the comment below always intended.
   */
  const view: View =
    location.hash.replace('#', '') === 'action-plan'
      ? 'action-plan'
      : location.hash.replace('#', '') === 'figures'
        ? 'figures'
        : 'read';
  const [open, setOpen] = useState<string | null>(null);

  /**
   * The action plan is its own URL fragment on this page, so the status
   * stepper, the run bar and the forecast page can all deep-link straight to
   * it. Reading the fragment on change means a back/forward navigation also
   * moves between the tabs, not just a fresh load.
   */
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const selectView = (next: View) => {
    // Keep the address bar honest so the tab someone is reading can be shared.
    void navigate({
      to: '.',
      hash: next === 'read' ? undefined : next,
      replace: true,
    });
  };

  return (
    <PageFrame
      stage="report"
      status={state.output ? 'done' : 'pending'}
      actions={
        <>
          {/* Only offered once a report exists. The backend genuinely renders
              a PDF now, so this button leads to a file rather than to a
              promise the platform used to make and could not keep. */}
          {state.output?.run_id && (
            <Button
              variant="secondary"
              loading={downloading}
              onClick={() => {
                setDownloading(true);
                void downloadReportPdf(state.output!.run_id)
                  .catch((err: unknown) => {
                    toast.error(err instanceof Error ? err.message : 'Download failed');
                  })
                  .finally(() => setDownloading(false));
              }}
            >
              Download PDF
            </Button>
          )}
          <Button variant="secondary" onClick={() => void navigate({ to: '/' })}>
            Back to status
          </Button>
        </>
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

          const rec = recState.output;
          const estate = rec?.programme?.estate;
          const actions = rec?.recommendations ?? [];
          // Fastest payback first so a manager can start with the cheapest
          // slice of the programme and begin recovering cost immediately.
          const ranked = [...actions].sort((a, b) => {
            const pa = a.payback_months ?? Number.POSITIVE_INFINITY;
            const pb = b.payback_months ?? Number.POSITIVE_INFINITY;
            return pa - pb;
          });
          const thresholds = rec?.payback_thresholds_months;
          const shown = ranked.slice(0, 20);

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
                onChange={(next) => selectView(next as View)}
                tabs={[
                  { value: 'read', label: 'Read it', badge: sections.length },
                  { value: 'figures', label: 'Every figure', badge: allFigures.length },
                  { value: 'action-plan', label: 'Action plan', badge: rec?.total ?? 0 },
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

              {view === 'action-plan' ? (
                rec ? (
                  <div className="flex min-w-0 flex-col gap-4">
                    <Section
                      title="Action plan"
                      description="The recommendation stage, carried here so the report and the thing it tells you to do are never more than one click apart."
                    >
                      <Inset className="text-md">
                        Actions are ordered by payback, fastest first — a manager can start with the
                        cheapest slice of the programme and begin recovering cost immediately, while
                        the slower capital work is still being approved.
                      </Inset>
                    </Section>

                    <KpiRow columns={4}>
                      <KpiTile
                        label="Actions"
                        value={int(rec.total)}
                        hint={`${int(rec.by_priority?.P1)} P1 · ${int(rec.by_priority?.P2)} P2 · ${int(rec.by_priority?.P3)} P3`}
                      />
                      <KpiTile
                        label="Monthly recovery"
                        value={rupees(estate?.monthly_recoverable_inr ?? null)}
                        hint="After the per-class recovery fraction"
                        tone="ok"
                      />
                      <KpiTile
                        label="Annual recovery"
                        value={rupeesCompact(estate?.annual_recoverable_inr ?? null)}
                        hint={energy(estate?.recoverable_kwh ?? null)}
                        tone="ok"
                      />
                      <KpiTile
                        label="Programme cost"
                        value={rupees(estate?.programme_cost_inr ?? null)}
                        hint={`Pays back in ${dec(estate?.payback_months ?? null, 1)} months`}
                      />
                    </KpiRow>

                    <Callout
                      tone={estate?.payback_verdict === 'viable' ? 'ok' : 'warn'}
                      title={`Estate programme payback is ${
                        estate?.payback_verdict?.replace(/_/g, ' ') ?? 'undetermined'
                      }`}
                    >
                      {rupees(estate?.programme_cost_inr ?? null)} of one-off programme cost returns{' '}
                      {rupees(estate?.annual_recoverable_inr ?? null)} a year and avoids{' '}
                      {co2Kg(estate?.annual_recoverable_co2_kg ?? null)}. Priorities were assigned
                      on {rec.priority_basis.replace(/_/g, ' ')}
                      {thresholds
                        ? `, with a payback under ${dec(thresholds.viable, 1)} months called viable and under ${dec(thresholds.marginal, 1)} months called marginal`
                        : ''}
                      .
                    </Callout>

                    {rec.forecast_basis_available ? null : (
                      <Callout tone="neutral" title="No forecast basis for these figures">
                        The forecast stage has not produced a demand basis for this dataset, so
                        payback periods are shown as undetermined rather than estimated. Re-run the
                        forecast stage to price these actions against projected demand.
                      </Callout>
                    )}

                    {shown.length === 0 ? (
                      <EmptyState
                        title="No actions were recommended"
                        description="The recommendation stage ran and found nothing worth funding. That is a legitimate finding — an estate with no anomalies and no waste has no programme to fund."
                      />
                    ) : (
                      <div className="space-y-2">
                        {shown.map((r, i) => (
                          <Card key={r.id} className="p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="num w-6 text-2xs text-[var(--ink-low)]">
                                {i + 1}
                              </span>
                              <Badge color={PRIORITY_COLOR[r.priority] ?? 'var(--ink-low)'}>
                                {r.priority}
                              </Badge>
                              <span className="font-medium text-md">{r.title}</span>
                              <Badge color={verdictColor(r.payback_verdict)}>
                                {r.payback_verdict.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                            <p className="mt-1 text-md text-[var(--ink-mid)]">{r.reason}</p>
                            <p className="mt-1 text-md">
                              <span className="text-[var(--ink-low)]">Do this: </span>
                              {r.action}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[var(--ink-low)]">
                              <span className="mono">{r.device_label}</span>
                              <span className="mono">
                                {r.building_code}
                                {r.floor_no ? ` · floor ${r.floor_no}` : ''}
                                {r.room_code ? ` · ${r.room_code}` : ''}
                              </span>
                              <span className="num">{dec(r.savings_kwh, 1)} kWh</span>
                              <span className="num">{rupees(r.savings_cost_inr)}</span>
                              <span className="num">{co2Kg(r.savings_co2_kg)}</span>
                              <span className="num">
                                {r.payback_months === null || r.payback_months === undefined
                                  ? 'payback undetermined'
                                  : `${dec(r.payback_months, 1)} month payback`}
                              </span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {ranked.length > shown.length ? (
                      <Inset className="text-md">
                        Showing the {shown.length} fastest-paying of {ranked.length} actions. The
                        full set of {int(rec.total)} is in the report body and in the stage output
                        itself — nothing has been dropped, only ordered and paged.
                      </Inset>
                    ) : null}

                    {rec.savings_inventory ? (
                      <Panel title="Where the recoverable energy comes from">
                        <p className="text-md">
                          {energy(rec.savings_inventory.grouped_recoverable_kwh)} is recoverable
                          once
                          {dec(rec.savings_inventory.groups, 0)} classes of excess are grouped;
                          grouping alone accounts for {energy(rec.savings_inventory.raw_excess_kwh)}{' '}
                          of ungrouped excess readings.
                          {rec.savings_inventory.note}
                        </p>
                      </Panel>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    title="The recommendation stage has not produced an action plan yet"
                    description="The report is assembled, but the actions behind it are missing. Run the recommendation stage to turn the anomalies and forecast into a costed programme."
                    action={
                      <Button variant="primary" onClick={() => selectView('read')}>
                        Back to the report
                      </Button>
                    }
                  />
                )
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
