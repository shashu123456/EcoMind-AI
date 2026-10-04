import { describe, it, expect } from 'vitest';
import {
  aggregateBy,
  countsBy,
  decimate,
  extentOf,
  mean,
  niceDomain,
  niceStep,
  numeric,
  ticks,
  total,
} from '../charts/scale';

type Row = Record<string, unknown>;

function series(n: number, fn: (i: number) => number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ t: i, kwh: fn(i) }));
}

describe('decimate', () => {
  it('passes a short series straight through', () => {
    const rows = series(10, (i) => i);
    expect(decimate(rows, 't', 50, ['kwh'])).toEqual(rows);
  });

  it('does not mutate or alias the input', () => {
    const rows = series(10, (i) => i);
    const out = decimate(rows, 't', 50, ['kwh']);
    expect(out).not.toBe(rows);
  });

  it('never returns more points than asked for', () => {
    const rows = series(120_960, (i) => i % 7);
    expect(decimate(rows, 't', 400, ['kwh']).length).toBeLessThanOrEqual(400);
  });

  it('conserves the total, so a decimated area chart still shows real consumption', () => {
    const rows = series(5000, (i) => (i % 13) + 1);
    const out = decimate(rows, 't', 100, ['kwh']);
    expect(total(out, 'kwh')).toBeCloseTo(total(rows, 'kwh'), 6);
  });

  it('keeps a peak that stride sampling would drop', () => {
    // 5,040 points, one 500 kWh reading at index 100, decimated to 100 points.
    // A stride lands on every 51st row and never touches index 100.
    const rows = series(5040, () => 1);
    rows[100] = { t: 100, kwh: 500 };

    const strided = decimate(rows, 't', 100);
    expect(Math.max(...strided.map((r) => r.kwh as number))).toBe(1);

    const bucketed = decimate(rows, 't', 100, ['kwh']);
    expect(Math.max(...bucketed.map((r) => r.kwh as number))).toBeGreaterThanOrEqual(500);
  });

  it('labels each bucket with its last sample so the x-axis reads as a period', () => {
    const rows = series(10, () => 1);
    const out = decimate(rows, 't', 2, ['kwh']);
    expect(out[0].t).toBe(4);
    expect(out[1].t).toBe(9);
  });

  it('stride-samples when no value key is given', () => {
    const rows = series(100, (i) => i);
    const out = decimate(rows, 't', 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0].t).toBe(0);
  });

  it('is a no-op when the budget is not positive', () => {
    const rows = series(100, (i) => i);
    expect(decimate(rows, 't', 0, ['kwh'])).toHaveLength(100);
  });

  it('tolerates an empty series', () => {
    expect(decimate([], 't', 10, ['kwh'])).toEqual([]);
  });
});

describe('aggregateBy', () => {
  const rows: Row[] = [
    { building: 'Aurora', kwh: 10, cost: 3 },
    { building: 'Aurora', kwh: 20, cost: 7 },
    { building: 'Northgate', kwh: 5, cost: 2 },
  ];

  it('sums by default', () => {
    const out = aggregateBy(rows, 'building', ['kwh', 'cost']);
    expect(out[0]).toEqual({ building: 'Aurora', kwh: 30, cost: 10 });
    expect(out[1]).toEqual({ building: 'Northgate', kwh: 5, cost: 2 });
  });

  it('averages when asked', () => {
    expect(aggregateBy(rows, 'building', ['kwh'], 'mean')[0].kwh).toBe(15);
  });

  it('keeps the extremes for peak and trough views', () => {
    expect(aggregateBy(rows, 'building', ['kwh'], 'max')[0].kwh).toBe(20);
    expect(aggregateBy(rows, 'building', ['kwh'], 'min')[0].kwh).toBe(10);
  });

  it('keeps the first and last reading for a period', () => {
    expect(aggregateBy(rows, 'building', ['kwh'], 'first')[0].kwh).toBe(10);
    expect(aggregateBy(rows, 'building', ['kwh'], 'last')[0].kwh).toBe(20);
  });

  it('returns null for a group with no numeric readings instead of zero', () => {
    const missing: Row[] = [{ building: 'Aurora', kwh: null }, { building: 'Aurora' }];
    expect(aggregateBy(missing, 'building', ['kwh'])[0].kwh).toBeNull();
  });

  it('ignores values that are not numbers', () => {
    const dirty: Row[] = [
      { building: 'Aurora', kwh: 'n/a' },
      { building: 'Aurora', kwh: 4 },
      { building: 'Aurora', kwh: Number.NaN },
    ];
    expect(aggregateBy(dirty, 'building', ['kwh'])[0].kwh).toBe(4);
  });

  it('returns nothing for no rows', () => {
    expect(aggregateBy([], 'building', ['kwh'])).toEqual([]);
  });
});

describe('numeric', () => {
  it('accepts numbers and numeric strings', () => {
    expect(numeric(4)).toBe(4);
    expect(numeric('4.5')).toBe(4.5);
  });

  it('rejects everything else', () => {
    for (const v of [null, undefined, '', '  ', 'abc', Number.NaN, Infinity, {}, []]) {
      expect(numeric(v)).toBeNull();
    }
  });
});

describe('extentOf', () => {
  it('spans every requested key', () => {
    const rows = [
      { kwh: 3, cost: 90 },
      { kwh: 30, cost: 2 },
    ];
    expect(extentOf(rows, ['kwh', 'cost'])).toEqual([2, 90]);
  });

  it('falls back to auto when nothing is numeric', () => {
    expect(extentOf([{ kwh: null }], ['kwh'])).toEqual(['auto', 'auto']);
    expect(extentOf([], ['kwh'])).toEqual(['auto', 'auto']);
  });
});

describe('niceDomain', () => {
  it('pads outward rather than starting at zero', () => {
    const [lo, hi] = niceDomain([10, 20]);
    expect(lo).toBeLessThan(10);
    expect(hi).toBeGreaterThan(20);
  });

  it('never truncates the data range, even when the data starts at zero', () => {
    // A 4% pad is applied in both directions: anchoring the axis at zero would
    // imply zero is a meaningful reading, which it is not for consumption.
    const [lo, hi] = niceDomain([0, 20]);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(20);
  });

  it('gives a flat non-zero series headroom so the line is visible', () => {
    const [lo, hi] = niceDomain([7, 7]);
    expect(lo).toBeLessThan(7);
    expect(hi).toBeGreaterThan(7);
  });

  it('expands a flat zero series', () => {
    expect(niceDomain([0, 0])).toEqual([0, 1]);
  });

  it('leaves an auto domain alone', () => {
    expect(niceDomain(['auto', 'auto'])).toEqual(['auto', 'auto']);
  });
});

describe('niceStep and ticks', () => {
  it('rounds to a readable step', () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(23)).toBe(25);
    expect(niceStep(700)).toBe(1000);
  });

  it('guards against a non-positive rough step', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
  });

  it('produces evenly spaced ticks inside the domain', () => {
    const out = ticks(0, 100, 5);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[out.length - 1]).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(1);
  });

  it('degrades to a single tick for a degenerate domain', () => {
    expect(ticks(5, 5)).toEqual([5]);
    expect(ticks(10, 2)).toEqual([10]);
  });
});

describe('total and mean', () => {
  const rows = series(100, (i) => i);

  it('sums a field, skipping nulls', () => {
    expect(total(rows, 'kwh')).toBe(4950);
    expect(total([{ kwh: 1 }, { kwh: null }, { kwh: 2 }], 'kwh')).toBe(3);
  });

  it('sums an empty series to zero rather than NaN', () => {
    expect(total([], 'kwh')).toBe(0);
  });

  it('averages only the numeric readings', () => {
    expect(mean(rows, 'kwh')).toBeCloseTo(49.5, 6);
    expect(mean([{ kwh: 2 }, { kwh: null }, { kwh: 4 }], 'kwh')).toBe(3);
  });

  it('returns null when nothing is numeric, so callers can show an em dash', () => {
    expect(mean([], 'kwh')).toBeNull();
    expect(mean([{ kwh: 'n/a' }], 'kwh')).toBeNull();
  });
});

describe('countsBy', () => {
  it('counts a categorical field, highest first', () => {
    const rows = [
      { severity: 'critical' },
      { severity: 'low' },
      { severity: 'critical' },
      { severity: 'moderate' },
      { severity: 'critical' },
    ];
    expect(countsBy(rows, 'severity')).toEqual([
      { label: 'critical', value: 3 },
      { label: 'low', value: 1 },
      { label: 'moderate', value: 1 },
    ]);
  });

  it('honours the limit', () => {
    const rows = [{ c: 'a' }, { c: 'b' }, { c: 'c' }];
    expect(countsBy(rows, 'c', 2)).toHaveLength(2);
  });

  it('labels a missing value rather than dropping the row', () => {
    expect(countsBy([{ c: null }], 'c')).toEqual([{ label: 'Unknown', value: 1 }]);
  });
});
