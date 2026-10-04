// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetectorLimits } from '../../pages/anomaly/DetectorLimits';
import type { AnomalyResult } from '../api/types';

/**
 * The panel that tells a reader what the detector cannot see.
 *
 * Both copy branches are real states, verified against two completed runs on
 * this product: one dataset where `critical` was 0 and one where it was 220.
 * A panel that asserted only one of them would be lying to half its readers,
 * and the "no findings must mean all is well" reading is the expensive one to
 * get wrong.
 */

const BANDS = [
  { severity: 'critical', score_floor: 0.9, sigma_floor: 9 },
  { severity: 'high', score_floor: 0.75, sigma_floor: 7.5 },
  { severity: 'moderate', score_floor: 0.6, sigma_floor: 6 },
];

const UNREACHABLE = [
  { anomaly_class: 'equipment_failure', reason: 'Only flags the upper tail.' },
  { anomaly_class: 'meter_drift', reason: 'Clearing the floor implies a ratio far above 1.25.' },
];

function makeOutput(over: Partial<AnomalyResult> = {}): AnomalyResult {
  return {
    run_id: 'r1',
    dataset_id: 'd1',
    total: 5539,
    devices_affected: 90,
    readings_scanned: 220466,
    detection_rate_pct: 2.51,
    excess_kwh: 1726235.45,
    excess_cost: 12000,
    excess_co2_kg: 863117.7,
    by_class: [],
    by_severity: [
      { severity: 'critical', count: 0, excess_kwh: 0 },
      { severity: 'high', count: 3049, excess_kwh: 12154491 },
      { severity: 'moderate', count: 522, excess_kwh: 417414 },
      { severity: 'low', count: 1748, excess_kwh: 855557 },
    ],
    by_building: [],
    top_devices: [],
    baseline_method: 'median_hour_of_week',
    threshold: 0.6,
    analysed_at: '2026-10-04T00:00:00+00:00',
    elapsed_ms: 9000,
    severity_bands: BANDS,
    z_saturate: 10,
    sigma_floor_for_detection: 6,
    unreachable_classes: UNREACHABLE,
    ...over,
  };
}

describe('DetectorLimits', () => {
  it('renders nothing when the snapshot predates the calibration fields', () => {
    // An old snapshot cannot support a claim about limits. An empty panel
    // headed "no limits" would be exactly such a claim.
    const { container } = render(
      <DetectorLimits
        output={makeOutput({ severity_bands: undefined, unreachable_classes: undefined })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the deviation each band demands, so a zero is explainable', () => {
    render(<DetectorLimits output={makeOutput()} />);
    expect(screen.getByText('What this scan cannot see')).toBeInTheDocument();
    // 9.0σ, 7.5σ and 6.0σ — the deviation behind each severity. The top and
    // bottom ones also appear in the closing sentence, hence getAllBy.
    for (const sigma of [/9\.0/, /7\.5/, /6\.0/]) {
      expect(screen.getAllByText(sigma).length, String(sigma)).toBeGreaterThan(0);
    }
  });

  it('says the empty top band is a property of the scale, not a clean estate', () => {
    render(<DetectorLimits output={makeOutput()} />);
    expect(screen.getByText(/Nothing on this dataset got there/)).toBeInTheDocument();
  });

  it('reads the run rather than asserting a general truth when the band is populated', () => {
    render(
      <DetectorLimits
        output={makeOutput({
          by_severity: [{ severity: 'critical', count: 220, excess_kwh: 1726235 }],
        })}
      />,
    );
    expect(screen.queryByText(/Nothing on this dataset got there/)).not.toBeInTheDocument();
    expect(screen.getByText(/220 readings did/)).toBeInTheDocument();
  });

  it('lists the classes the scanner cannot produce, each with its reason', () => {
    render(<DetectorLimits output={makeOutput()} />);
    expect(screen.getByText('Equipment Failure')).toBeInTheDocument();
    expect(screen.getByText('Meter Drift')).toBeInTheDocument();
    expect(screen.getByText(/Only flags the upper tail\./)).toBeInTheDocument();
    expect(screen.getByText(/far above 1\.25/)).toBeInTheDocument();
  });

  it('marks the top band as outside the ramp rather than colouring it as high', () => {
    // The band row is the one place a reader would otherwise assume the ramp
    // covers everything the classifier can emit.
    render(<DetectorLimits output={makeOutput()} />);
    expect(screen.getAllByTitle(/three-step severity ramp/).length).toBeGreaterThan(0);
  });

  it('still renders the unreachable classes when the band calibration is absent', () => {
    render(<DetectorLimits output={makeOutput({ severity_bands: undefined })} />);
    expect(screen.getByText('Equipment Failure')).toBeInTheDocument();
    expect(screen.queryByText('What this scan cannot see')).not.toBeNull();
  });
});
