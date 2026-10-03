import { num } from './format';
import type { RuleDetails } from './api/types';

/**
 * Readers for the seven data-quality rules.
 *
 * A rule's `details` is whatever that rule measured, so it cannot be one
 * interface — six new rules and this file is fiction. What can be uniform is
 * the *reading*: each helper below pulls one rule's known keys out of the open
 * object, coerces them defensively, and returns the shape the page wants. A
 * key that is missing or the wrong type comes back as `null`, and the page
 * says "not reported" rather than rendering a zero that would read as a
 * measurement.
 *
 * Nothing here computes a score. The score was decided in the backend; this
 * file only makes the evidence legible.
 */

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export interface Fact<T> {
  /** Present and usable. */
  value: T | null;
  /** True when the rule did not report this key at all. */
  missing: boolean;
}

function fact<T>(value: T | null): Fact<T> {
  return { value, missing: value === null };
}

/** `completeness` — missing cells. */
export function completenessFacts(details: RuleDetails) {
  const d = record(details);
  const perColumn = record(d.per_column);
  return {
    nullCells: num(d.null_cells),
    totalCells: num(d.total_cells),
    globalRate: num(d.global_null_rate),
    columnsWithGaps: (Array.isArray(d.columns_with_gaps) ? d.columns_with_gaps : []).map(String),
    perColumn: Object.entries(perColumn)
      .map(([column, count]) => ({ column, count: num(count) ?? 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

/** `validity_semantic_bounds` — physically impossible readings. */
export function boundsFacts(details: RuleDetails) {
  const d = record(details);
  const out = record(d.out_of_range);
  const bounds = record(d.bounds);
  return {
    totalChecked: num(d.total_checked),
    passing: num(d.passing),
    outOfRange: Object.entries(out)
      .map(([column, count]) => ({ column, count: num(count) ?? 0 }))
      .sort((a, b) => b.count - a.count),
    bounds,
  };
}

/**
 * The number of violating cells, or null when the rule reported nothing to
 * count.
 *
 * This is the number the pass badge has to agree with. A rule tagged
 * `critical` that reports 378 out-of-range readings and still says `passed`
 * tells a facilities manager the opposite of what it looks like, so the page
 * recomputes pass/fail from this rather than trusting the flag alone.
 */
export function violationCount(details: RuleDetails): Fact<number> {
  const d = record(details);
  const out = d.out_of_range;
  if (out && typeof out === 'object' && !Array.isArray(out)) {
    return fact(
      Object.values(out as Record<string, unknown>).reduce<number>(
        (acc, v) => acc + (num(v) ?? 0),
        0,
      ),
    );
  }
  if (Array.isArray(d.columns_with_gaps)) return fact(d.columns_with_gaps.length);
  return fact<number>(null);
}

/** `consistency_duplicates` — repeated keys. */
export function duplicateFacts(details: RuleDetails) {
  const d = record(details);
  return {
    duplicates: num(d.duplicates ?? d.duplicate_rows ?? d.duplicate_count),
    total: num(d.total ?? d.total_rows ?? d.checked),
    keys: (Array.isArray(d.key_columns) ? d.key_columns : []).map(String),
  };
}

/** `consistency_monotonic_timestamps` — time moving backwards. */
export function monotonicFacts(details: RuleDetails) {
  const d = record(details);
  return {
    nonMonotonicRows: num(d.non_monotonic_rows),
    seriesChecked: num(d.series_checked),
    grain: str(d.grain),
  };
}

/** `accuracy_outliers_iqr` — statistical outliers. */
export function outlierFacts(details: RuleDetails) {
  const d = record(details);
  const checked = d.checked_columns;
  return {
    checkedColumns: (Array.isArray(checked) ? checked : []).map(String),
    outlierCount: num(d.outlier_count),
    outlierRate: num(d.outlier_rate),
  };
}

/** `accuracy_zscore` — extreme points against the target's own scale. */
export function zscoreFacts(details: RuleDetails) {
  const d = record(details);
  return {
    targetColumn: str(d.target_column),
    extremePoints: num(d.extreme_points),
    threshold: num(d.threshold),
    method: str(d.method),
  };
}

/** `timeliness_temporal_gaps` — missing hours. */
export function gapFacts(details: RuleDetails) {
  const d = record(details);
  return {
    medianIntervalSeconds: num(d.median_interval_seconds),
    missedIntervals: num(d.missed_intervals),
    timeRangeSeconds: num(d.time_range_seconds),
  };
}

/**
 * One line per key in a rule's details, for the evidence drawer. Unknown keys
 * are shown rather than dropped — a reader who finds a key the page does not
 * explain should be able to see it and ask.
 */
export function detailRows(details: RuleDetails): { key: string; value: string }[] {
  return Object.entries(details).map(([key, value]) => ({
    key,
    value: renderValue(value),
  }));
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean' || typeof value === 'string') return String(value);
  if (Array.isArray(value)) return value.map(renderValue).join(', ');
  return JSON.stringify(value);
}
