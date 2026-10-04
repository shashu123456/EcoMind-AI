/**
 * Number, currency and date formatting.
 *
 * Single source of truth for every value the user reads. Pages must never
 * hand-roll `toFixed` — a kWh figure and a rupee figure need the same
 * thousands grouping, the same rounding discipline, and the same "we don't
 * know" behaviour.
 */

const LOCALE = 'en-IN';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Coerce to a finite number, or null. */
export function num(v: unknown): number | null {
  if (isNum(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v.replace(/[,_\s]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Formatted integer, grouped. `1234.5` -> `"1,235"` */
export function int(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(n);
}

/** Formatted decimal, grouped, fixed digits. */
export function dec(v: unknown, digits = 2, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Energy with an automatically chosen unit. `12345` -> `"12.3 MWh"` */
/**
 * Energy given in kWh, scaled to the largest unit that keeps it readable.
 *
 * The input is always kWh -- every `*_kwh` field in this API is -- so the
 * conversion ladder is kWh -> MWh -> GWh and stops there. There is deliberately
 * no "kWh step" that divides by 1e3: a previous ladder included one, which
 * rendered 76,956 kWh as "76.96 kWh" and every figure between 1,000 and 1,000,000
 * kWh was wrong by a factor of a thousand on the anomaly, forecast and report
 * pages at once.
 */
export function energy(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${dec(n / 1e9, 2)} GWh`;
  if (abs >= 1e6) return `${dec(n / 1e6, 2)} MWh`;
  return `${dec(n, 1)} kWh`;
}

/** Energy in a fixed unit, for when a chart axis needs consistency. */
export function energyIn(v: unknown, unit: 'Wh' | 'kWh' | 'MWh' | 'GWh', fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  const divisor = { Wh: 1, kWh: 1, MWh: 1e3, GWh: 1e6 }[unit];
  const digits = unit === 'Wh' ? 0 : unit === 'GWh' ? 3 : 2;
  return `${dec(n / divisor, digits)} ${unit}`;
}

/** Rupees. `1234567` -> `"₹12,34,567"` (Indian grouping). */
export function rupees(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return `₹${new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
  }).format(n)}`;
}

/** Rupees with adaptive scale. `12345678` -> `"₹1.23 Cr"` */
const RUPEE_STEPS: Array<[number, string, number]> = [
  [1e7, 'Cr', 2],
  [1e5, 'L', 1],
];

export function rupeesCompact(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  const abs = Math.abs(n);
  for (const [threshold, suffix, digits] of RUPEE_STEPS) {
    if (abs >= threshold) return `₹${dec(n / threshold, digits)} ${suffix}`;
  }
  return `₹${int(n)}`;
}

/** Per-unit cost. */
export function rate(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return `₹${dec(n, 2)}/kWh`;
}

/**
 * Metric tonnes of CO2.
 *
 * Takes a value already in tonnes -- a stage field named `co2_tonnes`. For a
 * field named `co2_kg` use {@link co2Kg}, which converts first. Passing
 * kilograms here is the mistake that renders 461,733 kg as "461,733.64 t".
 */
export function co2Tonnes(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  if (Math.abs(n) >= 1) return `${dec(n, 2)} t`;
  return `${int(n * 1000)} kg`;
}

/**
 * Kilograms of CO2, rendered in whichever unit keeps it readable.
 *
 * The backend records carbon in kilograms on every `*_co2_kg` field, so this
 * is the formatter those fields need: below a tonne it stays in kg, above one
 * it converts rather than printing a five-digit number and hoping the reader
 * notices the unit.
 */
export function co2Kg(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  if (Math.abs(n) >= 1000) return `${dec(n / 1000, 2)} t`;
  return `${dec(n, 1)} kg`;
}

/** Percentage from a 0-1 fraction. `0.943` -> `"94.3%"` */
export function pct(v: unknown, digits = 1, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return `${dec(n * 100, digits)}%`;
}

/** Percentage from a value already in percent units. `94.3` -> `"94.3%"` */
export function pctValue(v: unknown, digits = 1, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return `${dec(n, digits)}%`;
}

/** A signed change, always explicit about direction. `0.041` -> `"+4.1%"` */
export function deltaPct(v: unknown, digits = 1, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  const sign = n > 0 ? '+' : '';
  return `${sign}${dec(n * 100, digits)}%`;
}

/** A signed absolute change. */
export function delta(v: unknown, digits = 0, fallback = '—'): string {
  const x = num(v);
  if (x === null) return fallback;
  const sign = x > 0 ? '+' : '';
  return `${sign}${dec(x, digits)}`;
}

/** Power in kW, with MW for large demand. */
export function power(v: unknown, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  if (Math.abs(n) >= 1000) return `${dec(n / 1000, 2)} MW`;
  return `${dec(n, 1)} kW`;
}

/** A quality score 0-100. */
export function score(v: unknown, digits = 1, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return dec(n, digits);
}

/** A 0-1 quality score expressed on the 0-100 scale. */
export function scoreFromFraction(v: unknown, digits = 1, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  return dec(n * 100, digits);
}

/** A signed score improvement, e.g. `"+31.3"`. */
export function scoreDelta(from: unknown, to: unknown, digits = 1, fallback = '—'): string {
  const a = num(from);
  const b = num(to);
  if (a === null || b === null) return fallback;
  return delta(b - a, digits);
}

// --- Dates ----------------------------------------------------------------

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** `"14 Jun 2026"` */
export function date(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** `"14 Jun, 14:00"` */
export function dateTime(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  )}`;
}

/** `"14 Jun 14:00"` — compact, for table cells. */
export function stamp(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} ${time}`;
}

/** `"14 Jun"` */
export function dayMonth(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** `"Jun 2026"` */
export function monthYear(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** `"14:00"` */
export function hourLabel(v: unknown, fallback = '—'): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** `"Jan, Feb, Mar"` for axis ticks. */
export function monthTicks(values: string[]): string[] {
  return values.map((v) => {
    const d = toDate(v);
    return d ? d.toLocaleDateString('en-GB', { month: 'short' }) : v;
  });
}

/** A human duration. `5400` -> `"1h 30m"` */
export function duration(seconds: unknown, fallback = '—'): string {
  const n = num(seconds);
  if (n === null) return fallback;
  if (n < 1) return `${dec(n * 1000, 0)}ms`;
  if (n < 60) return `${dec(n, 1)}s`;
  const mins = Math.floor(n / 60);
  const secs = Math.round(n % 60);
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

/** A count with a noun: `int` then label. `1 -> "1 anomaly"` */
export function count(v: unknown, singular: string, plural?: string, fallback = '—'): string {
  const n = num(v);
  if (n === null) return fallback;
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  return `${int(n)} ${word}`;
}

/** Truncate long identifiers for display. */
export function shortId(v: unknown, keep = 8, fallback = '—'): string {
  const s = typeof v === 'string' ? v : '';
  if (!s) return fallback;
  return s.length <= keep ? s : `${s.slice(0, keep)}…`;
}
