import { useMemo } from 'react';
import { BarCompare } from '../lib/charts';
import { Callout, KpiRow, KpiTile } from '../lib/ui';
import { useDatasetScope } from '../lib/ActiveDatasetContext';
import { dec, energy, int } from '../lib/format';
import type { HierarchyBuildingNode, ScopeTotal } from '../lib/api/types';

/**
 * Per-device forecast attribution.
 *
 * The forecasting engine walks every device independently -- `_DeviceWalk` in
 * `forecast_service.py` -- and the stage returns `scope_totals`, one projected
 * total per device. Nothing on the page rendered it: the device list appeared
 * only as a count inside a "what this assumes" disclosure, so a 102-device
 * campus produced exactly one aggregate chart and the per-device intelligence
 * was invisible.
 *
 * That is the wrong end of the aggregation to stop at. An estate total tells a
 * manager they have a bill; it does not tell them which AHU, which chiller, or
 * which lighting circuit to send someone to. The per-device split is where a
 * forecast becomes a work order, and the backend already had it.
 *
 * Two views, because they answer different questions:
 *   - by building: which part of the estate carries the load
 *   - by device:   which single thing dominates it
 *
 * Devices are named from the estate hierarchy rather than by raw code, because
 * "HVAC-A101" means nothing to a facilities manager and "Rooftop AHU" does.
 */
export function DeviceForecast({
  rows,
  buildings,
}: {
  rows: readonly ScopeTotal[];
  buildings: readonly HierarchyBuildingNode[];
}) {
  const { filter } = useDatasetScope();
  const scopedBuilding = filter.building ?? null;
  const scopedDevice = filter.device ?? null;

  // Flatten the tree once: device code -> the human name that belongs to it.
  const named = useMemo(() => {
    const out = new Map<string, string>();
    const walk = (list: HierarchyBuildingNode['devices'] = []) => {
      for (const d of list) {
        if (!d.name || d.name === d.code) continue;
        const cat = d.category ? d.category.replace(/_/g, ' ') : '';
        out.set(d.code, cat ? `${d.name} — ${cat}` : d.name);
      }
    };
    for (const b of buildings) {
      walk(b.devices);
      for (const f of b.floors) {
        walk(f.devices);
        for (const r of f.rooms) walk(r.devices);
      }
    }
    return out;
  }, [buildings]);

  /**
   * Apply the scope.
   *
   * `scope_totals` carries `building_code` and `device_code` per row, so this
   * filter is exact rather than approximate -- unlike the anomaly aggregates,
   * which cannot be re-summed client-side because the underlying rows are not
   * in the payload. Filtering here is therefore arithmetic, not estimation.
   *
   * Both totals and shares are computed *after* the filter, so a building
   * selected in the scope bar reads 100% of a scope that is itself that
   * building, which is the honest answer.
   */
  const enriched = useMemo(
    () =>
      rows
        .filter((r) => r.total_kwh > 0)
        .filter((r) => (scopedBuilding ? r.building_code === scopedBuilding : true))
        .filter((r) => (scopedDevice ? r.device_code === scopedDevice : true))
        .map((r) => ({
          ...r,
          label: named.get(r.device_code) ?? r.device_code,
        })),
    [rows, named, scopedBuilding, scopedDevice],
  );

  const total = enriched.reduce((s, r) => s + r.total_kwh, 0);
  if (enriched.length === 0 || total <= 0) return null;

  // A long tail is the normal case in a real estate, so the "top" view is
  // capped rather than drawing 102 bars nobody can read or compare. The count
  // of what was withheld is stated, because silently truncating a chart is how
  // people end up trusting an incomplete picture.
  //
  // There is deliberately no building roll-up here. `compare.rows` already
  // carries per-building energy, cost, peak and carbon, and the page renders it
  // as "Forecast share by building". Summing scope_totals by building produces
  // the same two numbers (verified: 1,310,245.2 vs 1,310,245.24 for BLD-A), so
  // drawing it twice would put two identical charts on one screen.
  const TOP_N = 15;
  const byDevice = [...enriched].sort((a, b) => b.total_kwh - a.total_kwh);
  const shown = byDevice.slice(0, TOP_N);
  const hiddenKwh = byDevice.slice(TOP_N).reduce((s, r) => s + r.total_kwh, 0);

  return (
    <div className="flex flex-col gap-4">
      <KpiRow columns={4}>
        <KpiTile label="Devices forecast" value={int(enriched.length)} hint="Walked individually" />
        <KpiTile
          label="Projected energy"
          value={energy(total)}
          hint="Across every device"
          tone="ok"
        />
        <KpiTile
          label="Largest single device"
          value={energy(shown[0].total_kwh)}
          hint={shown[0].label}
        />
        <KpiTile
          label="That device's share"
          value={`${dec((shown[0].total_kwh / total) * 100, 1)}%`}
          hint={scopedBuilding ? `Of ${scopedBuilding} only` : 'Of projected campus energy'}
        />
      </KpiRow>
      <BarCompare
        title="Projected energy by device"
        hint="The devices that will account for the coming month, largest first"
        data={shown.map((r) => ({
          device_code: r.device_code,
          label: r.label,
          total_kwh: r.total_kwh,
        }))}
        category="label"
        series={[{ key: 'total_kwh', label: 'Projected kWh', unit: 'kWh' }]}
        format={(v) => energy(v)}
        layout="vertical"
        height={Math.max(220, shown.length * 26)}
      />

      {hiddenKwh > 0 && (
        <Callout
          tone="neutral"
          title={`${byDevice.length - TOP_N} further devices are not plotted`}
        >
          The chart shows the top {TOP_N} of {byDevice.length} devices. They account for{' '}
          {energy(total - hiddenKwh)} of {energy(total)}; the remaining {energy(hiddenKwh)} sits
          with the long tail below them.
        </Callout>
      )}
    </div>
  );
}
