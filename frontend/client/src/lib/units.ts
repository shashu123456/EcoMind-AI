/**
 * Unit vocabulary. The backend records the column it modelled (energy_kwh,
 * power_kw, ...) but not a display unit, so the frontend maps one token to one
 * unit. Every view reads the unit from here instead of hard-coding it: a model
 * trained on energy_kwh has error in kWh, not kW.
 */
const UNIT_BY_TOKEN: { pattern: RegExp; unit: string }[] = [
  { pattern: /kwh|energy_kwh|_kwh$/, unit: "kWh" },
  { pattern: /demand_kw|power_kw|max_kw|_kw$|^kw$/, unit: "kW" },
  { pattern: /kva|apparent/, unit: "kVA" },
  { pattern: /cost|tariff|inr|spend|price/, unit: "INR" },
  { pattern: /co2|carbon|emission/, unit: "kgCO2" },
  { pattern: /temperature|temp|_c$/, unit: "\u00b0C" },
  { pattern: /humidity|rh$/, unit: "%RH" },
  { pattern: /voltage|_v$/, unit: "V" },
  { pattern: /current|_a$/, unit: "A" },
  { pattern: /power_factor|_pf$/, unit: "ratio" },
  { pattern: /occupancy|people|headcount/, unit: "people" },
  { pattern: /timestamp|datetime|_date$|_time$/, unit: "" },
];

/** Best-effort display unit for a recorded column name. "" when unknown. */
export const unitForColumn = (column?: string | null): string => {
  if (!column) return "";
  const c = String(column).toLowerCase();
  if (/timestamp|datetime|_date$|_time$/.test(c)) return "";
  const hit = UNIT_BY_TOKEN.find(entry => entry.pattern.test(c));
  return hit ? hit.unit : "";
};

/** Canonical display forms for the units the backend reports directly. */
export const displayUnit = (unit?: string | null): string => {
  if (!unit) return "";
  const u = String(unit);
  if (/^inr$/i.test(u)) return "\u20b9";
  if (/^kgco2$/i.test(u)) return "kgCO\u2082";
  if (/^tco2$/i.test(u)) return "tCO\u2082";
  return u;
};
