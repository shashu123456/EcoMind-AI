import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
import { BarCompare, DemandCurve, ForecastBand, HeatmapGrid, SeasonalityBars } from '../lib/charts';
import { DeviceForecast } from './DeviceForecast';
import { StageGate } from '../app/StageGate';
import { PageFrame, PageHero } from '../app/PageFrame';
import { useStageOutput } from '../lib/stageOutput';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import {
  co2Tonnes,
  date,
  dec,
  energy,
  hourLabel,
  int,
  power,
  rate,
  rupees,
  stamp,
} from '../lib/format';
import type { ForecastResult, Horizon } from '../lib/api/types';

type View = 'next-week' | 'next-year' | 'buildings';

const VIEW_OPTIONS = [
  { value: 'next-week', label: 'Next 7 days' },
  { value: 'next-year', label: 'Next 12 months' },
  { value: 'buildings', label: 'By building' },
] as const;

const TIER_TONE: Record<string, 'ok' | 'warn' | 'critical'> = {
  short: 'ok',
  long: 'warn',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

function loadProfile(rows: readonly { timestamp: string; energy_kwh: number }[]): {
  cells: { row: string; column: string; value: number }[];
  peak: { hour: string; day: string; value: number };
} {
  const sums = new Map<string, { total: number; count: number }>();
  for (const p of rows) {
    const d = new Date(p.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const day = WEEKDAYS[(d.getDay() + 6) % 7];
    const hour = HOURS[d.getHours()];
    const key = `${hour}|${day}`;
    const cur = sums.get(key) ?? { total: 0, count: 0 };
    cur.total += p.energy_kwh ?? 0;
    cur.count += 1;
    sums.set(key, cur);
  }
  const cells: { row: string; column: string; value: number }[] = [];
  let peak = { hour: '00', day: 'Mon', value: 0 };
  for (const hour of HOURS) {
    for (const day of WEEKDAYS) {
      const agg = sums.get(`${hour}|${day}`);
      const value = agg && agg.count ? agg.total / agg.count : 0;
      cells.push({ row: hour, column: day, value });
      if (value > peak.value) peak = { hour, day, value };
    }
  }
  return { cells, peak };
}

function bandTone(pct: number | null): 'ok' | 'warn' | 'critical' {
  if (pct === null) return 'warn';
  if (pct <= 50) return 'ok';
  if (pct <= 120) return 'warn';
  return 'critical';
}

export function ForecastPage() {
  const state = useStageOutput<ForecastResult>('forecast');
  const { datasetId, buildings } = useDatasetScope();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('next-week');

  return (
    <PageFrame
      stage="forecast"
      status={state.output ? 'done' : 'pending'}
      actions={
        datasetId ? (
          <Button
            variant="primary"
            onClick={() =>
              void navigate({
                to: '/report/$datasetId',
                params: { datasetId },
                hash: 'action-plan',
              })
            }
          >
            Continue to the action plan
          </Button>
        ) : undefined
      }
    >
      <StageGate stage="forecast" state={state} blockedBy={['anomaly']}>
        {(output) => {
          const { horizons, aggregates, tariff, monthly, hourly } = output;
          const compare = output.compare ?? { rows: [], total: 0 };
          const short = horizons.filter((h) => h.tier === 'short');
          const long = horizons.find((h) => h.tier === 'long');
          const thirty = horizons.find((h) => h.horizon === '30d') ?? horizons[horizons.length - 1];
          const week = hourly.slice(0, 24 * 7);
          const year = hourly;
          const profile = loadProfile(year);

          const horizonColumns: readonly Column<Horizon>[] = [
            {
              key: 'label',
              header: 'Horizon',
              cell: (row) => <span className="font-medium">{row.label}</span>,
            },
            {
              key: 'tier',
              header: 'Confidence',
              cell: (row) => (
                <Badge color={`var(--${TIER_TONE[row.tier] ?? 'neutral'})`}>
                  {row.tier === 'short' ? 'measured' : 'extrapolated'}
                </Badge>
              ),
            },
            {
              key: 'total_kwh',
              header: 'Energy',
              numeric: true,
              cell: (row) => <span className="num">{energy(row.total_kwh)}</span>,
            },
            {
              key: 'total_cost_inr',
              header: 'Cost',
              numeric: true,
              cell: (row) => <span className="num">{rupees(row.total_cost_inr)}</span>,
            },
            {
              key: 'peak_demand_kw',
              header: 'Peak kW',
              numeric: true,
              cell: (row) => <span className="num">{dec(row.peak_demand_kw, 2)}</span>,
            },
            {
              key: 'co2_tonnes',
              header: 'CO₂',
              numeric: true,
              cell: (row) => <span className="num">{co2Tonnes(row.co2_tonnes)}</span>,
            },
            {
              key: 'band_width_pct',
              header: 'Band width',
              numeric: true,
              cell: (row) =>
                row.band_width_pct === null ? (
                  <span className="text-[var(--ink-low)]">not measured</span>
                ) : (
                  <span className="num">{dec(row.band_width_pct, 1)}%</span>
                ),
            },
            {
              key: 'method',
              header: 'Method',
              cell: (row) => <span className="mono text-2xs">{row.method}</span>,
            },
          ];

          return (
            <div className="flex min-w-0 flex-col gap-4">
              <PageHero
                eyebrow="Next 30 days"
                value={rupees(thirty?.total_cost_inr ?? 0)}
                verdict={`${energy(thirty?.total_kwh ?? 0)} and ${co2Tonnes(thirty?.co2_tonnes ?? 0)} of carbon, peaking at ${power(thirty?.peak_demand_kw ?? 0)}`}
              />

              <div className="prose-muted max-w-3xl text-md">
                <p>
                  Forecasted from {stamp(output.origin_timestamp)} using{' '}
                  {output.selected_algorithm.replace(/_/g, ' ')}, against {int(output.history_rows)}{' '}
                  historical rows covering {int(output.history_hours)} hours. Measured error on a
                  backtest of the same length was{' '}
                  <span className="text-[var(--ink)]">{dec(output.mape_backtest, 2)}%</span> mean
                  absolute percentage error.
                </p>
              </div>

              <Callout tone="info" title="Read the band before the number">
                A forecast with no error bar is a guess wearing a suit. The short-horizon rows below
                carry a band measured from how wrong this model actually was at that lead time, and
                it widens fast — {dec(short[0]?.band_width_pct ?? 0, 0)}% at 24 hours,{' '}
                {dec(short[1]?.band_width_pct ?? 0, 0)}% at a week,{' '}
                {dec(thirty?.band_width_pct ?? 0, 0)}% at a month. At a month the band spans most of
                the answer. Treat the 30-day total as an order of magnitude, not a figure to budget
                from.
              </Callout>

              <KpiRow columns={5}>
                <KpiTile
                  label="Daily average"
                  value={energy(aggregates.avg_daily_kwh)}
                  hint={`${dec(aggregates.load_factor_pct, 1)}% load factor — peak against average`}
                />
                <KpiTile
                  label="Peak demand"
                  value={power(aggregates.peak_demand_kw)}
                  hint={`${stamp(aggregates.peak_demand_at)} · p95 ${power(aggregates.p95_demand_kw)}`}
                  tone="info"
                />
                <KpiTile
                  label="Blended rate"
                  value={rate(aggregates.blended_rate_per_kwh)}
                  hint="Weighted across the three tariff bands"
                />
                <KpiTile
                  label="Projected bill"
                  value={rupees(aggregates.projected_bill_inr)}
                  hint={`includes ${rupees(aggregates.standing_charge_inr)} standing charge per ${tariff.billing_period_days} days`}
                />
                <KpiTile
                  label="Backtest error"
                  value={dec(output.mape_backtest, 2)}
                  unit="% MAPE"
                  tone={output.mape_backtest > 25 ? 'warn' : 'ok'}
                  hint="Measured on held-out history, not assumed"
                />
              </KpiRow>

              <Section
                title="Four horizons, four different levels of trust"
                description="The platform answers two questions at once — what happens this week, and what happens this year. Only the first is measured."
              >
                <DataGrid
                  rows={horizons}
                  columns={horizonColumns}
                  rowKey={(row) => row.horizon}
                  caption={`Origin ${stamp(output.origin_timestamp)} · calibration factor ${dec(output.calibration_factor, 2)}`}
                />
                <div className="space-y-2">
                  {horizons.map((h) => (
                    <Inset key={h.horizon} className="text-md">
                      <span className="font-medium">{h.label}</span>{' '}
                      <span className="text-[var(--ink-mid)]">— {h.confidence_note}</span>
                    </Inset>
                  ))}
                </div>
              </Section>

              <Tabs
                value={view}
                onChange={(next) => setView(next as View)}
                tabs={VIEW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />

              {view === 'next-week' ? (
                <ForecastBand
                  title="Hourly forecast with the measured band"
                  hint={`Lower and upper are the ${dec(output.mape_backtest, 1)}% backtest error applied to this lead time. Cost follows the tariff band in force at each hour.`}
                  data={week.map((p) => ({
                    t: hourLabel(p.timestamp),
                    low: p.lower_kwh,
                    mid: p.energy_kwh,
                    high: p.upper_kwh,
                    kw: p.power_kw,
                  }))}
                  x="t"
                  lowKey="low"
                  midKey="mid"
                  highKey="high"
                  unit="kWh"
                  height={280}
                />
              ) : null}

              {view === 'next-year' ? (
                <ForecastBand
                  title="The next month of hourly forecast, band and all"
                  hint="The same band at a longer lead. Where the band swallows the line, the line is not the information."
                  data={year.map((p) => ({
                    t: hourLabel(p.timestamp),
                    low: p.lower_kwh,
                    mid: p.energy_kwh,
                    high: p.upper_kwh,
                  }))}
                  x="t"
                  lowKey="low"
                  midKey="mid"
                  highKey="high"
                  unit="kWh"
                  height={300}
                />
              ) : null}

              {view === 'buildings' ? (
                <div className="flex flex-col gap-4">
                  <DeviceForecast rows={output.scope_totals ?? []} buildings={buildings} />
                  <BarCompare
                    title="Forecast share by building"
                    hint="Share of the coming month, against each building's share of history"
                    data={compare.rows.map((r) => ({
                      building_code: r.building_code,
                      total_kwh: r.total_kwh,
                      share_pct: r.share_pct,
                    }))}
                    category="building_code"
                    series={[
                      { key: 'total_kwh', label: 'Forecast kWh', unit: 'kWh' },
                      { key: 'share_pct', label: 'Share of forecast %', unit: '%' },
                    ]}
                    format={(v, series) => (series.key === 'share_pct' ? dec(v, 1) : energy(v))}
                    layout="vertical"
                    height={220}
                  />
                  <DemandCurve
                    title="Load duration curve"
                    hint={`${int(output.history_hours)} forecast hours sorted from heaviest to lightest — the shape a capacity tariff would charge you on`}
                    data={year.map((p) => ({ demand: p.power_kw }))}
                    demandKey="demand"
                    unit="kW"
                    height={240}
                    annotations={[
                      { value: aggregates.peak_demand_kw, caption: 'peak' },
                      { value: aggregates.p95_demand_kw, caption: 'p95' },
                    ]}
                  />
                  {compare.rows.some((r) => r.share_pct > 70) ? (
                    <Callout tone="warn" title="Forecast share has drifted from history">
                      {compare.rows[0]?.building_code} takes{' '}
                      {dec(compare.rows[0]?.share_pct ?? 0, 1)}% of the forecast but a far smaller
                      share of history. With only {int(output.history_hours)} hours of context the
                      model is extrapolating, and the buildings whose profile was least distinctive
                      during the sample absorb the error. Do not use this split to allocate a
                      budget.
                    </Callout>
                  ) : null}
                </div>
              ) : null}

              <Section
                title="Load shape — when the estate actually works"
                description="Every forecast hour folded into hour-of-day against day-of-week. The dark ridge is the working week; the quiet columns are the weekends the estate has not learned to switch off."
              >
                <div className="flex flex-col gap-4">
                  <HeatmapGrid
                    title="Average demand by hour and day"
                    hint={`The heaviest cell is ${profile.peak.day} at ${profile.peak.hour}:00, averaging ${energy(profile.peak.value)}.`}
                    cells={profile.cells}
                    rowLabel="Hour"
                    columnLabel="Day"
                    rowOrder={HOURS}
                    columnOrder={WEEKDAYS}
                    unit="kWh"
                    format={(v) => dec(v, 1)}
                    height={520}
                  />
                  {output.monthly_history.length ? (
                    <SeasonalityBars
                      data={output.monthly_history.map((h) => ({
                        label: h.month,
                        value: h.energy_kwh,
                      }))}
                      labelKey="label"
                      valueKey="value"
                      unit="kWh"
                      title="What the year repeats"
                      hint="The monthly history behind the forecast — the seasonality the model is asked to extrapolate."
                      height={220}
                    />
                  ) : null}
                </div>
              </Section>

              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
                <div className="flex min-w-0 flex-col gap-4">
                  <Section
                    title="Month by month"
                    description="Billed totals, with the inherited uncertainty band. The historical month is what was actually measured."
                  >
                    <DataGrid
                      rows={monthly}
                      columns={[
                        {
                          key: 'month',
                          header: 'Month',
                          cell: (row) => <span className="mono">{row.month}</span>,
                        },
                        {
                          key: 'energy_kwh',
                          header: 'Energy',
                          numeric: true,
                          cell: (row) => <span className="num">{energy(row.energy_kwh)}</span>,
                        },
                        {
                          key: 'lower_kwh',
                          header: 'Lower kWh',
                          numeric: true,
                          cell: (row) => <span className="num">{dec(row.lower_kwh, 0)}</span>,
                        },
                        {
                          key: 'upper_kwh',
                          header: 'Upper kWh',
                          numeric: true,
                          cell: (row) => <span className="num">{dec(row.upper_kwh, 0)}</span>,
                        },
                        {
                          key: 'cost_inr',
                          header: 'Cost',
                          numeric: true,
                          cell: (row) => <span className="num">{rupees(row.cost_inr)}</span>,
                        },
                        {
                          key: 'history_kwh',
                          header: 'History kWh',
                          numeric: true,
                          cell: (row) =>
                            row.history_kwh === null ? (
                              <span className="text-[var(--ink-low)]">no history</span>
                            ) : (
                              <span className="num">{dec(row.history_kwh, 0)}</span>
                            ),
                        },
                      ]}
                      rowKey={(row) => row.month}
                      caption={`${int(monthly.length)} months · ${dec(output.calibration_factor, 2)} calibration applied to the trend`}
                    />
                  </Section>

                  <Section title="What it costs by time of day">
                    <DataGrid
                      rows={aggregates.cost_by_band}
                      columns={[
                        {
                          key: 'band',
                          header: 'Tariff band',
                          cell: (row) => <span className="font-medium">{row.band}</span>,
                        },
                        {
                          key: 'kwh',
                          header: 'kWh',
                          numeric: true,
                          cell: (row) => <span className="num">{dec(row.kwh, 0)}</span>,
                        },
                        {
                          key: 'cost_inr',
                          header: 'Cost',
                          numeric: true,
                          cell: (row) => <span className="num">{rupees(row.cost_inr)}</span>,
                        },
                        {
                          key: 'share',
                          header: 'Share of cost',
                          numeric: true,
                          cell: (row) => (
                            <span className="num">
                              {dec(
                                (row.cost_inr / Math.max(1e-9, aggregates.total_cost_inr)) * 100,
                                1,
                              )}
                              %
                            </span>
                          ),
                        },
                      ]}
                      rowKey={(row) => row.band}
                      caption={`Blended ${rate(aggregates.blended_rate_per_kwh)} across ${int(tariff.bands.length)} bands`}
                    />
                  </Section>
                </div>

                <aside className="flex min-w-0 flex-col gap-4">
                  <Panel title="The tariff it was priced against">
                    <DetailList>
                      {tariff.bands.map((b) => (
                        <DetailRow
                          key={b.key}
                          label={`${b.label} (${b.start_hour}–${b.end_hour}:00)`}
                        >
                          <span className="num">{rate(b.rate_per_kwh)}</span>
                        </DetailRow>
                      ))}
                      <DetailRow label="Standing charge">
                        <span className="num">
                          {rupees(tariff.standing_charge_per_period)} per{' '}
                          {tariff.billing_period_days} days
                        </span>
                      </DetailRow>
                      <DetailRow label="Carbon factor">
                        <span className="num">{dec(tariff.co2_kg_per_kwh, 3)} kg CO₂/kWh</span>
                      </DetailRow>
                    </DetailList>
                  </Panel>

                  <Panel title="How much trust each horizon has">
                    <div className="space-y-3">
                      {horizons.map((h) => (
                        <div key={h.horizon}>
                          <div className="flex items-baseline justify-between gap-2 text-md">
                            <span>{h.label}</span>
                            <span className="num">
                              {h.band_width_pct === null
                                ? 'no band'
                                : `${dec(h.band_width_pct, 0)}%`}
                            </span>
                          </div>
                          <ProgressBar
                            value={
                              h.band_width_pct === null ? 1 : Math.min(1, h.band_width_pct / 200)
                            }
                            tone={bandTone(h.band_width_pct)}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                    <Callout tone="neutral" title="Why the bar goes to 200%">
                      A measured 176% band is wider than the number it surrounds. That is not a
                      rendering trick — it is what a month of extrapolation from{' '}
                      {int(output.history_hours)} hours of history honestly supports.
                    </Callout>
                  </Panel>

                  <Panel title="Scope of the forecast">
                    <DetailList>
                      <DetailRow label="Target">
                        <span className="mono">{output.target_column}</span>
                      </DetailRow>
                      <DetailRow label="Devices">
                        <span className="num">{int(output.devices.length)}</span>
                      </DetailRow>
                      <DetailRow label="Origin">
                        <span className="mono">{stamp(output.origin_timestamp)}</span>
                      </DetailRow>
                      <DetailRow label="Generated">
                        <span className="mono">{stamp(output.generated_at)}</span>
                      </DetailRow>
                      <DetailRow label="Took">
                        <span className="num">{int(output.elapsed_ms)} ms</span>
                      </DetailRow>
                    </DetailList>
                    <Callout tone="neutral" title="What the forecast assumes">
                      {output.exogenous_assumption}
                    </Callout>
                  </Panel>

                  {long ? (
                    <Card className="p-4">
                      <span className="eyebrow">The year ahead</span>
                      <p className="mt-1 text-md text-[var(--ink-mid)]">
                        {long.label} is extrapolated, not forecast.
                      </p>
                      <div className="mt-2">
                        <span className="num text-xl font-semibold">{energy(long.total_kwh)}</span>
                        <span className="ml-2 text-md text-[var(--ink-mid)]">
                          {rupees(long.total_cost_inr)}
                        </span>
                      </div>
                      <p className="mt-2 text-md text-[var(--ink-low)]">{long.confidence_note}</p>
                    </Card>
                  ) : null}
                </aside>
              </div>

              <div className="prose-muted text-md">
                <p>
                  History ends at {stamp(output.origin_timestamp)} and covers{' '}
                  {int(output.history_hours)} hours back to{' '}
                  {date(output.monthly_history[0]?.month ?? '')}. The monthly band on rows with no
                  history is inherited from the short tier rather than measured — a twelve-month
                  figure derived from a month of data is an extrapolation wearing the same clothes
                  as a measurement, and it is labelled that way rather than hidden.
                </p>
              </div>

              {datasetId ? (
                <div className="text-md">
                  <Link
                    to="/report/$datasetId"
                    params={{ datasetId }}
                    hash="action-plan"
                    className="text-[var(--brand)] underline"
                  >
                    See what these numbers justify spending money on
                  </Link>
                </div>
              ) : null}
            </div>
          );
        }}
      </StageGate>
    </PageFrame>
  );
}
