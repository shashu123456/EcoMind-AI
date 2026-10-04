import { Inset, Panel, SeverityTag, toDataSeverity } from '../../lib/ui';
import { dec, int } from '../../lib/format';
import type { AnomalyResult } from '../../lib/api/types';

/** `meter_drift` -> `Meter Drift`. The backend ships ids, not labels. */
function titleCase(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * What this scan cannot see, in the same place as what it found.
 *
 * The scan publishes `severity_bands`, the deviation each band demands, and
 * the classes its own gating rules make unreachable. Without them on screen the
 * page reads two ways and only one is true: either nothing serious is
 * happening, or nothing serious is being looked for. A "Critical: 0" row with
 * no explanation invites the first, and a facilities manager who believes it is
 * the more expensive mistake.
 *
 * Renders nothing when the snapshot predates these fields, rather than an empty
 * shell — a panel titled "no limits" would itself be a claim, and an old
 * snapshot cannot support one.
 */
export function DetectorLimits({ output }: { output: AnomalyResult }) {
  const bands = output.severity_bands ?? [];
  const unreachable = output.unreachable_classes ?? [];
  if (bands.length === 0 && unreachable.length === 0) return null;

  const detectionSigma = output.sigma_floor_for_detection;
  const criticalBand = bands.find((b) => b.severity === 'critical');
  // Whether the top band is empty depends on the estate, not on the design: a
  // steady meter never produces one, an erratic one produces hundreds. The copy
  // has to read this run rather than assert a general truth that is not true
  // of the screen it is on.
  const topBandCount =
    output.by_severity.find((r) => r.severity === criticalBand?.severity)?.count ?? 0;

  return (
    <Panel title="What this scan cannot see">
      {bands.length > 0 ? (
        <div className="prose-muted text-md">
          <p>
            Severity is a normalised deviation, not an absolute one: a reading scores its distance
            from baseline as a fraction of{' '}
            <span className="mono">{dec(output.z_saturate ?? 10, 0)}&nbsp;&sigma;</span>. That is
            what makes the bands comparable across a steady meter and a noisy one — and it is where
            the top of the ramp comes from.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {bands.map((band) => (
              <li key={band.severity} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <SeverityTag severity={toDataSeverity(band.severity)} />
                  <span className="text-[var(--ink-mid)]">
                    needs <span className="mono">{dec(band.sigma_floor, 1)}&nbsp;&sigma;</span>
                  </span>
                </span>
                <span className="mono text-[var(--ink-faint)]">
                  score &ge; {dec(band.score_floor, 2)}
                </span>
              </li>
            ))}
          </ul>
          {criticalBand && detectionSigma !== undefined ? (
            <p className="mt-3">
              A reading has to clear{' '}
              <span className="mono">{dec(detectionSigma, 1)}&nbsp;&sigma;</span> to be examined at
              all; the top band wants{' '}
              <span className="mono">{dec(criticalBand.sigma_floor, 1)}&nbsp;&sigma;</span>.{' '}
              {topBandCount === 0 ? (
                <>
                  Nothing on this dataset got there. That says more about how far hourly energy
                  moves from its own typical week than about the estate.
                </>
              ) : (
                <>
                  {int(topBandCount)} readings did — a genuinely erratic stretch against the
                  device&rsquo;s own history, not a campus-wide pattern.
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {unreachable.length > 0 ? (
        <div className="mt-4">
          <span className="eyebrow">Classes this detector cannot produce</span>
          <div className="mt-2 flex flex-col gap-2">
            {unreachable.map((item) => (
              <Inset key={item.anomaly_class} className="text-md">
                <span className="font-medium">{titleCase(item.anomaly_class)}</span>{' '}
                <span className="text-[var(--ink-mid)]">— {item.reason}</span>
              </Inset>
            ))}
          </div>
          <p className="mt-2 text-md text-[var(--ink-mid)]">
            These are limits of the current scanner, not of your data. Anything matching them would
            not appear above whatever your meter last reported.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
