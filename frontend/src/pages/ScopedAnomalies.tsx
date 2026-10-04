import { useQuery } from '@tanstack/react-query';
import { datasets } from '../lib/api';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { Callout, KpiRow, KpiTile, LoadingState } from '../lib/ui';
import { co2Kg, dec, energy, int, rupees } from '../lib/format';

/**
 * Anomalies inside the current scope.
 *
 * The stage output reports the campus as a whole. Once the scope bar can name a
 * building, the first question is what that building alone is doing, and
 * answering it from the campus aggregates would be arithmetic fiction: the
 * payload carries `by_building` roll-ups but not the rows behind them, so a
 * client-side filter cannot reproduce totals, excess energy or excess cost.
 *
 * This reads the scoped endpoint instead, which filters where the rows are.
 *
 * It sits beside the stage figures rather than replacing them. The campus total
 * is still the right number for a report; this is the number for the person
 * standing in front of Riverside Office asking what to open first.
 */
const SEVERITY_TONE: Record<string, 'ok' | 'warn' | 'critical' | 'neutral'> = {
  critical: 'critical',
  high: 'critical',
  moderate: 'warn',
  low: 'neutral',
};

export function ScopedAnomalies() {
  const { datasetId, filter, dataset } = useDatasetScope();
  const building = filter.building ?? null;

  const query = useQuery({
    queryKey: ['anomalies-scope', datasetId, building],
    queryFn: () =>
      datasets.getAnomalies(datasetId as string, { building_code: building, page_size: 200 }),
    enabled: Boolean(datasetId),
    staleTime: 60_000,
  });

  // Only render when the scope is actually narrowed. With no building chosen
  // this would restate the stage figures the page already shows.
  if (!datasetId || !building) return null;

  if (query.isPending) {
    return (
      <div className="py-6">
        <LoadingState label={`Counting anomalies in ${building}`} lines={3} />
      </div>
    );
  }
  if (query.isError || !query.data) return null;

  const { anomalies, total, severity_counts: severityCounts } = query.data;

  const sum = (pick: (a: (typeof anomalies)[number]) => number | null) =>
    anomalies.reduce((s, a) => s + (pick(a) ?? 0), 0);

  const excessKwh = sum((a) => a.excess_kwh);
  const excessCost = sum((a) => a.excess_cost);
  const excessCo2 = sum((a) => a.excess_co2_kg);
  /**
   * Distinct devices among the rows actually fetched.
   *
   * This is deliberately not described as the building's device count. Above
   * the page size it is a count of the worst 200 findings, and calling it
   * "across N devices" would read as the estate-wide figure.
   */
  const devices = new Set(anomalies.map((a) => a.device_code).filter(Boolean)).size;

  const buildingName = query.data.scope?.building_code ?? building;
  const levels = (['critical', 'high', 'moderate', 'low'] as const).filter(
    (s) => (severityCounts[s] ?? 0) > 0,
  );

  // `total` is the filtered count from the server; `anomalies.length` is how
  // many of those were actually fetched. They differ above the page size, and
  // the KPIs below are sums over what was fetched -- so say so rather than
  // implying the sums cover everything.
  const partial = total > anomalies.length;

  return (
    <div className="flex flex-col gap-4">
      <KpiRow columns={4}>
        <KpiTile label="Anomalies in scope" value={int(total)} hint={buildingName} tone="warn" />
        <KpiTile label="Excess energy" value={energy(excessKwh)} hint="Above its own baseline" />
        <KpiTile label="Excess cost" value={rupees(excessCost)} hint="At the blended tariff" />
        <KpiTile label="Excess carbon" value={co2Kg(excessCo2)} hint="At 0.5 kg CO2 per kWh" />
      </KpiRow>

      {levels.length > 0 && (
        // KpiRow takes a fixed column count, so clamp rather than passing a
        // variable the layout cannot honour.
        <KpiRow columns={Math.min(6, Math.max(2, levels.length)) as 2 | 3 | 4 | 5 | 6}>
          {levels.map((s) => (
            <KpiTile
              key={s}
              label={`${s[0].toUpperCase()}${s.slice(1)}`}
              value={int(severityCounts[s] ?? 0)}
              hint={
                total > 0 ? dec(((severityCounts[s] ?? 0) / total) * 100, 1) + '% of scope' : '—'
              }
              tone={SEVERITY_TONE[s]}
            />
          ))}
        </KpiRow>
      )}

      <Callout
        tone={total === 0 ? 'ok' : 'warn'}
        title={
          total === 0
            ? `${buildingName} has nothing flagged`
            : partial
              ? `${buildingName}: ${int(total)} findings, ${int(devices)} devices in the worst ${int(anomalies.length)}`
              : `${buildingName}: ${int(total)} findings across ${int(devices)} devices`
        }
      >
        {total === 0
          ? 'Nothing in this building sits far enough above its own hour-of-week median to count. Widen the scope to compare it against the rest of the estate.'
          : partial
            ? `Totals above cover the ${int(anomalies.length)} most severe of ${int(total)} findings; the remainder are below the page size. Each is measured against this building's own median for that hour of the week, so a larger estate is not penalised for being larger.`
            : `Every reading here is compared against ${buildingName}'s own median for that hour of the week — not against a rule of thumb, and not against the campus average, which would punish the buildings that are simply larger.`}
      </Callout>
    </div>
  );
}
