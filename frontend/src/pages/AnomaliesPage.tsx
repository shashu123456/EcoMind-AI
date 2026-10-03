import { Link, useNavigate } from '@tanstack/react-router';
import {
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
  Section,
  SeverityTag,
  type Column,
  type Severity,
} from '../lib/ui';
import { BarCompare, RankedBars } from '../lib/charts';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { co2Tonnes, dec, energy, int, pctValue, rupees } from '../lib/format';
import type {
  AnomalyBuildingRow,
  AnomalyClassRow,
  AnomalyDeviceRow,
  AnomalyResult,
  AnomalySeverityRow,
} from '../lib/api/types';

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'moderate', 'low', 'normal'];

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)',
  high: 'var(--sev-high)',
  moderate: 'var(--sev-moderate)',
  low: 'var(--sev-low)',
  normal: 'var(--sev-normal)',
};

const CLASS_NOTE: Record<string, string> = {
  sustained_overuse:
    'Consumption stayed above this building’s own hour-of-week median for a long unbroken run — a schedule or setpoint problem rather than a spike.',
  night_usage: 'Equipment drew power outside occupied hours.',
  weekend_anomaly:
    'Weekend behaviour diverges from the weekday pattern the building was sized for.',
  equipment_failure: 'A reading pattern consistent with a failed or failing asset.',
  meter_drift: 'The meter and the equipment it serves disagree, or the meter has stopped moving.',
  extreme_spike: 'A single reading far outside anything the surrounding hours show.',
  wrong_room_map:
    'The recorded room does not match the device — the mapping is wrong, not the consumption.',
};

export function AnomaliesPage() {
  const state = useStageOutput<AnomalyResult>('anomaly');
  const { datasetId } = useDatasetScope();
  const navigate = useNavigate();

  return (
    <PageFrame
      stage="anomaly"
      status={state.output ? 'done' : 'pending'}
      actions={
        datasetId ? (
          <Button
            variant="primary"
            onClick={() => void navigate({ to: '/forecast/$datasetId', params: { datasetId } })}
          >
            Continue to forecast
          </Button>
        ) : undefined
      }
    >
      <StageGate stage="anomaly" state={state} blockedBy={['model_selection']}>
        {(output) => {
          const severityColumns: readonly Column<AnomalySeverityRow>[] = [
            {
              key: 'severity',
              header: 'Severity',
              cell: (row) => <SeverityTag severity={row.severity as Severity} />,
            },
            {
              key: 'count',
              header: 'Readings',
              numeric: true,
              cell: (row) => <span className="num">{int(row.count)}</span>,
            },
            {
              key: 'share',
              header: 'Share of readings',
              numeric: true,
              cell: (row) => (
                <span className="num">
                  {pctValue((row.count / Math.max(1, output.total)) * 100, 1)}
                </span>
              ),
            },
            {
              key: 'excess_kwh',
              header: 'Excess kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.excess_kwh, 2)}</span>,
            },
            {
              key: 'excess_cost',
              header: 'Excess cost',
              numeric: true,
              cell: (row) => (
                <span className="num">
                  {rupees(
                    (row.excess_kwh / Math.max(1e-9, output.excess_kwh)) * output.excess_cost,
                  )}
                </span>
              ),
            },
          ];

          const classColumns: readonly Column<AnomalyClassRow>[] = [
            {
              key: 'anomaly_class',
              header: 'Class',
              cell: (row) => <span className="font-medium">{row.label}</span>,
            },
            {
              key: 'count',
              header: 'Readings',
              numeric: true,
              cell: (row) => <span className="num">{int(row.count)}</span>,
            },
            {
              key: 'excess_kwh',
              header: 'Excess kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.excess_kwh, 2)}</span>,
            },
            {
              key: 'excess_cost',
              header: 'Excess cost',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.excess_cost)}</span>,
            },
            {
              key: 'excess_per_reading',
              header: 'kWh per reading',
              numeric: true,
              cell: (row) => (
                <span className="num">{dec(row.excess_kwh / Math.max(1, row.count), 3)}</span>
              ),
            },
          ];

          const buildingColumns: readonly Column<AnomalyBuildingRow>[] = [
            {
              key: 'building_code',
              header: 'Building',
              cell: (row) => <span className="mono">{row.building_code}</span>,
            },
            {
              key: 'count',
              header: 'Readings',
              numeric: true,
              cell: (row) => <span className="num">{int(row.count)}</span>,
            },
            {
              key: 'excess_kwh',
              header: 'Excess kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.excess_kwh, 2)}</span>,
            },
            {
              key: 'excess_cost',
              header: 'Excess cost',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.excess_cost)}</span>,
            },
            {
              key: 'co2',
              header: 'Excess CO₂',
              numeric: true,
              cell: (row) => <span className="num">{co2Tonnes(row.excess_kwh * 0.5)}</span>,
            },
          ];

          const deviceColumns: readonly Column<AnomalyDeviceRow>[] = [
            {
              key: 'device_code',
              header: 'Device',
              cell: (row) => <span className="mono">{row.device_code}</span>,
            },
            {
              key: 'label',
              header: 'What it is',
              cell: (row) => <span className="text-md text-[var(--ink-mid)]">{row.label}</span>,
            },
            {
              key: 'count',
              header: 'Readings',
              numeric: true,
              cell: (row) => <span className="num">{int(row.count)}</span>,
            },
            {
              key: 'excess_kwh',
              header: 'Excess kWh',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.excess_kwh, 2)}</span>,
            },
          ];

          return (
            <div className="flex min-w-0 flex-col gap-4">
              <PageHero
                eyebrow="Energy above baseline"
                value={energy(output.excess_kwh)}
                verdict={`${int(output.total)} readings above baseline across ${int(output.devices_affected)} devices — ${rupees(output.excess_cost)} a month and ${co2Tonnes(output.excess_co2_kg)} of carbon`}
                tone={output.excess_cost > 0 ? 'warn' : 'ok'}
              />

              <div className="prose-muted max-w-3xl text-md">
                <p>
                  Every reading is compared against this building’s own median for that hour of the
                  week — not against a rule of thumb, and not against the campus average, which
                  would punish the buildings that are simply larger. A reading counts as anomalous
                  once it sits {dec(output.threshold, 1)} median absolute deviations above that
                  baseline.
                </p>
              </div>

              <KpiRow columns={5}>
                <KpiTile
                  label="Anomalous readings"
                  value={int(output.total)}
                  hint={`of ${int(output.readings_scanned)} scanned`}
                />
                <KpiTile
                  label="Detection rate"
                  value={pctValue(output.detection_rate_pct, 2)}
                  hint="Share of all readings flagged"
                  tone={output.detection_rate_pct > 10 ? 'warn' : 'neutral'}
                />
                <KpiTile
                  label="Excess energy"
                  value={energy(output.excess_kwh)}
                  hint="Above baseline, not total consumption"
                  tone="warn"
                />
                <KpiTile
                  label="Excess cost"
                  value={rupees(output.excess_cost)}
                  hint="At the blended tariff rate"
                  tone="warn"
                />
                <KpiTile
                  label="Excess carbon"
                  value={co2Tonnes(output.excess_co2_kg)}
                  hint="At 0.5 kg CO₂ per kWh"
                  tone="warn"
                />
              </KpiRow>

              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <BarCompare
                  title="Excess energy by building"
                  hint="The kWh above each building's own baseline, not their total consumption"
                  data={output.by_building.map((b) => ({
                    building: b.building_code,
                    excess_kwh: b.excess_kwh,
                  }))}
                  category="building"
                  series={[{ key: 'excess_kwh', label: 'Excess energy', unit: 'kWh' }]}
                  format={(v) => dec(v, 1)}
                  layout="vertical"
                  height={200}
                />
                <BarCompare
                  title="Anomalous readings by severity"
                  hint="Severity is how far above baseline the reading sat, not how large the absolute error is"
                  data={[...output.by_severity]
                    .sort(
                      (a, b) =>
                        SEVERITY_ORDER.indexOf(a.severity as Severity) -
                        SEVERITY_ORDER.indexOf(b.severity as Severity),
                    )
                    .map((r) => ({ severity: r.severity, count: r.count }))}
                  category="severity"
                  series={[{ key: 'count', label: 'Readings', unit: 'readings' }]}
                  format={(v) => int(v)}
                  colorBy="severity"
                  colorScale={SEVERITY_COLOR}
                  layout="vertical"
                  height={200}
                />
              </div>

              <Section
                title="What kind of anomaly"
                description="Each class is a different physical story, and they are not interchangeable: a schedule problem is free to fix, a failed meter is not."
              >
                <DataGrid
                  rows={output.by_class}
                  columns={classColumns}
                  rowKey={(row) => row.anomaly_class}
                  caption={`${output.by_class.length} classes present`}
                  empty="No anomalies were detected."
                />
                <div className="space-y-2">
                  {output.by_class.map((row) => (
                    <Inset key={row.anomaly_class} className="text-md">
                      <span className="font-medium">{row.label}</span>{' '}
                      <span className="text-[var(--ink-mid)]">
                        —{' '}
                        {CLASS_NOTE[row.anomaly_class] ??
                          'Not in the current playbook; investigate before sizing a fix.'}
                      </span>
                    </Inset>
                  ))}
                </div>
              </Section>

              <Section title="How severe">
                <DataGrid
                  rows={output.by_severity}
                  columns={severityColumns}
                  rowKey={(row) => row.severity}
                  caption={`${int(output.total)} readings · ${energy(output.excess_kwh)} excess`}
                />
              </Section>

              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
                <div className="flex min-w-0 flex-col gap-4">
                  <Section title="Worst buildings">
                    <DataGrid
                      rows={output.by_building}
                      columns={buildingColumns}
                      rowKey={(row) => row.building_code}
                      caption={`${output.by_building.length} buildings with findings`}
                    />
                  </Section>
                  <Section title="Worst devices">
                    <DataGrid
                      rows={output.top_devices}
                      columns={deviceColumns}
                      rowKey={(row) => row.device_code}
                      caption={`Top ${output.top_devices.length} of ${int(output.devices_affected)} affected devices`}
                    />
                  </Section>
                </div>
                <aside className="flex min-w-0 flex-col gap-4">
                  <Panel title="How the baseline works">
                    <DetailList>
                      <DetailRow label="Method">
                        <span className="mono">{output.baseline_method}</span>
                      </DetailRow>
                      <DetailRow label="Threshold">
                        <span className="mono">
                          {dec(output.threshold, 2)} median absolute deviations
                        </span>
                      </DetailRow>
                      <DetailRow label="Readings scanned">
                        <span className="num">{int(output.readings_scanned)}</span>
                      </DetailRow>
                      <DetailRow label="Analysed">
                        <span className="mono">{output.analysed_at}</span>
                      </DetailRow>
                      <DetailRow label="Took">
                        <span className="num">{int(output.elapsed_ms)} ms</span>
                      </DetailRow>
                    </DetailList>
                    <Callout tone="neutral" title="Why hour-of-week">
                      A campus that runs a lift at 08:00 on weekdays is not misbehaving, and a
                      median across all hours would call it an anomaly every morning. Comparing each
                      reading to the same hour on the same weekday keeps a busy Monday distinct from
                      a quiet Sunday.
                    </Callout>
                  </Panel>

                  <Panel title="Where the individual readings are">
                    <p className="text-md text-[var(--ink-mid)]">
                      This stage reports roll-ups, not a list of individual readings. Keeping{' '}
                      {int(output.total)} rows on screen would let a reader infer that each one is
                      worth acting on, when the recovery figure on the next page is what makes that
                      case.
                    </p>
                    <p className="mt-2 text-md text-[var(--ink-mid)]">
                      The specific readings behind each proposed action are cited by id on the
                      recommendations page.
                    </p>
                    {datasetId ? (
                      <Link
                        to="/recommendations/$datasetId"
                        params={{ datasetId }}
                        className="mt-3 inline-block text-md text-[var(--brand)] underline"
                      >
                        See the actions these readings support
                      </Link>
                    ) : null}
                  </Panel>

                  <Card className="p-4">
                    <span className="eyebrow">Readings above baseline</span>
                    <RankedBars
                      rows={output.by_class.map((c) => ({ label: c.label, value: c.count }))}
                      valueKey="value"
                      labelKey="label"
                      max={8}
                      format={(v) => int(v)}
                    />
                  </Card>
                </aside>
              </div>

              <Callout tone="warn" title="These are excess readings, not recoverable savings">
                {energy(output.excess_kwh)} is the energy each anomalous reading used above its own
                baseline. It is not money anyone will hand back — some of it is genuinely needed
                consumption that happens to fall outside the median. The next page applies a
                recovery fraction per class and tells you what is actually worth chasing.
              </Callout>
            </div>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}
