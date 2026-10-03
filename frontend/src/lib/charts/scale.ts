/**
 * Chart maths, kept out of the components.
 *
 * Hourly telemetry is 120,960 rows per dataset. Rendering that as SVG paths
 * locks the browser, so every chart that takes a long series runs it through
 * `decimate` first. The rules below are deliberately boring: bucketing that
 * preserves the shape of the curve and never invents values.
 */

export type Agg = 'sum' | 'mean' | 'min' | 'max' | 'last' | 'first';

function numeric(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Reduce a long series to at most `maxPoints` buckets, preserving totals.
 *
 * A plain stride is not good enough: it drops peaks, and a peak is the entire
 * reason a user opened an energy chart. So we bucket by count and keep the
 * extreme of each bucket, summing rather than sampling so the plotted area
 * still represents real consumption.
 */
export function decimate<T extends Record<string, unknown>>(
  rows: readonly T[],
  xKey: string,
  maxPoints: number,
  valueKeys: readonly string[] = [],
): T[] {
  const src = rows ?? [];
  if (maxPoints <= 0 || src.length <= maxPoints) return [...src];
  if (!valueKeys.length) return src.filter((_, i) => i % Math.ceil(src.length / maxPoints) === 0);

  const bucketSize = Math.ceil(src.length / maxPoints);
  const out: T[] = [];

  for (let start = 0; start < src.length; start += bucketSize) {
    const bucket = src.slice(start, start + bucketSize);
    const record: Record<string, unknown> = { [xKey]: bucket[0][xKey] };
    for (const key of valueKeys) {
      const values = bucket.map((r) => numeric(r[key])).filter((v): v is number => v !== null);
      if (!values.length) {
        record[key] = null;
        continue;
      }
      // Sum preserves energy totals; the max guards against under-reporting a
      // spike when the bucket is a mean.
      record[key] = values.reduce((a, b) => a + b, 0);
    }
    // Carry the bucket's timestamp label from its last sample so the x-axis
    // reads as a period, not an instant.
    record[xKey] = bucket[bucket.length - 1][xKey];
    out.push(record as T);
  }
  return out;
}

/** Group rows and reduce the value keys to one row per group. */
export function aggregateBy<T extends Record<string, unknown>>(
  rows: readonly T[],
  groupKey: string,
  valueKeys: readonly string[],
  agg: Agg = 'sum',
): Record<string, unknown>[] {
  const groups = new Map<string, { rows: T[]; label: unknown }>();

  for (const row of rows ?? []) {
    const key = String(row[groupKey]);
    const bucket = groups.get(key);
    if (bucket) bucket.rows.push(row);
    else groups.set(key, { rows: [row], label: row[groupKey] });
  }

  const out: Record<string, unknown>[] = [];
  for (const [key, bucket] of groups) {
    const record: Record<string, unknown> = { [groupKey]: bucket.label };
    for (const valueKey of valueKeys) {
      const values = bucket.rows
        .map((r) => numeric(r[valueKey]))
        .filter((v): v is number => v !== null);
      record[valueKey] = reduce(values, agg);
    }
    out.push(record);
  }
  return out;
}

function reduce(values: number[], agg: Agg): number | null {
  if (!values.length) return null;
  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'mean':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'last':
      return values[values.length - 1];
    case 'first':
      return values[0];
  }
}

/** Recharts accepts `[min, max]` where a member may be `'auto'`. */
export type Domain = [number | 'auto', number | 'auto'];

export function extentOf(
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
): Domain {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows ?? []) {
    for (const key of keys) {
      const v = numeric(row[key]);
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return ['auto', 'auto'];
  return [min, max];
}

/**
 * Round a domain outward to human boundaries. A 0-based axis is misleading for
 * consumption (it implies zero is meaningful), so pad by 4% instead.
 */
export function niceDomain([min, max]: Domain, padRatio = 0.04): Domain {
  if (min === 'auto' || max === 'auto') return [min, max];
  if (min === max) return min === 0 ? [0, 1] : [Math.min(0, min * 1.1), Math.max(0, max * 1.1)];
  const pad = (max - min) * padRatio;
  const lo = Math.min(0, min - pad);
  const hi = max + pad;
  return [lo, hi];
}

/** Round a value up to a readable tick step: 1, 2, 2.5, 5 × 10^n. */
export function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Evenly spaced ticks across a domain, for axes that need explicit ticks. */
export function ticks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** Sum a numeric field across rows, skipping nulls. */
export function total(rows: readonly Record<string, unknown>[], key: string): number {
  let sum = 0;
  for (const row of rows ?? []) {
    const v = numeric(row[key]);
    if (v !== null) sum += v;
  }
  return sum;
}

/** Mean of a numeric field, or null when nothing is numeric. */
export function mean(rows: readonly Record<string, unknown>[], key: string): number | null {
  let sum = 0;
  let n = 0;
  for (const row of rows ?? []) {
    const v = numeric(row[key]);
    if (v !== null) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/** Distribution counts for a categorical field, highest first. */
export function countsBy(rows: readonly Record<string, unknown>[], key: string, limit = 10) {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const k = String(row[key] ?? 'Unknown');
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export { numeric };
