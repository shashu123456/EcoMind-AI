/**
 * Schema vocabulary.
 *
 * The backend records column names, data types and semantic types. It does not
 * ship a per-domain field catalogue, so every label the UI shows for a column
 * is derived here from the column's own name and semantic type. Nothing in this
 * file invents a field: an unknown column falls through to "signal".
 */

export type FieldFamily =
  | "meter"
  | "hvac"
  | "chiller"
  | "lighting"
  | "motor"
  | "process"
  | "compressor"
  | "conveyor"
  | "pump"
  | "coldchain"
  | "dock"
  | "generation"
  | "itload"
  | "thermal"
  | "humidity"
  | "voltage"
  | "current"
  | "powerfactor"
  | "emissions"
  | "cost"
  | "occupancy"
  | "production"
  | "signal";

export type FieldRole = "index" | "entity" | "context" | "target" | "signal";

/** Human label for a derived family. Real family names, no invented equipment. */
export const FAMILY_LABEL: Record<FieldFamily, string> = {
  meter: "meter",
  hvac: "hvac",
  chiller: "chiller",
  lighting: "lighting",
  motor: "motor",
  process: "process",
  compressor: "compressor",
  conveyor: "conveyor",
  pump: "pump",
  coldchain: "cold chain",
  dock: "dock",
  generation: "generation",
  itload: "it load",
  thermal: "thermal",
  humidity: "humidity",
  voltage: "voltage",
  current: "current",
  powerfactor: "power factor",
  emissions: "emissions",
  cost: "cost",
  occupancy: "occupancy",
  production: "production",
  signal: "signal",
};

const FAMILY_BY_TOKEN: { pattern: RegExp; family: FieldFamily }[] = [
  { pattern: /hvac|ahu|\brtu\b|\bvav\b|air_hand|supply_air/, family: "hvac" },
  { pattern: /chiller|chw|chilled|condenser|cooling_tower|\bcrac\b|inrow/, family: "chiller" },
  { pattern: /light|lamp|luminaire|led_|daylight|dimming/, family: "lighting" },
  { pattern: /compressor|compressed_air|air_pressure/, family: "compressor" },
  { pattern: /conveyor|sortation|sorter|\bbelt\b|\bagv\b|asrs/, family: "conveyor" },
  { pattern: /pump|pumping|borewell|chw_pump/, family: "pump" },
  { pattern: /cold_room|coldroom|freezer|reefer|cold_storage|blast/, family: "coldchain" },
  { pattern: /dock|loading_bay|loading_dock|shutter|bay_/, family: "dock" },
  { pattern: /solar|\bpv\b|genset|generator|turbine|wind_|renewable|export_|dg_/, family: "generation" },
  { pattern: /rack|server|\bit_|ups_|\bpdu\b|\bdc_|it_load|white_space|colocation/, family: "itload" },
  { pattern: /furnace|boiler|kiln|extruder|spindle|cnc|robot|mill_|press_|process_|reactor/, family: "process" },
  { pattern: /motor|vfd|drive_|\bmachine\b|motor_load|chiller_motor/, family: "motor" },
  { pattern: /humidity|\brh\b|moisture|dew_?point|relative_hum/, family: "humidity" },
  { pattern: /temperature|temp|_degc|_c$|setpoint|thermal|wet_bulb/, family: "thermal" },
  { pattern: /voltage|volt|_v$|line_v|v_rms|\bkvs\b/, family: "voltage" },
  { pattern: /current|amp_?|\bamp\b|_a$|i_rms/, family: "current" },
  { pattern: /power_factor|\bpf\b|cos_phi/, family: "powerfactor" },
  { pattern: /co2|carbon|emission|\bghg\b|footprint|_eq_co2/, family: "emissions" },
  { pattern: /cost|tariff|price|inr|spend|billing|charge|savings/, family: "cost" },
  { pattern: /occupanc|people|headcount|staff|visitor|patient|student|shopper|census|footfall/, family: "occupancy" },
  { pattern: /production|throughput|tonne|pallet|case_|units_|output|yield|volume|\bopd\b|meal|linen|parcel|sku/, family: "production" },
  { pattern: /demand|power|\bkw\b|kwh|energy|meter|grid|main_|utility|feeder|load/, family: "meter" },
];

/** Signal family implied by a real column name. Falls back to "signal". */
export const familyForColumn = (column?: string | null): FieldFamily => {
  if (!column) return "signal";
  const n = String(column).toLowerCase().replace(/\s+/g, "_");
  const hit = FAMILY_BY_TOKEN.find(entry => entry.pattern.test(n));
  return hit ? hit.family : "signal";
};

const ENTITY_PATTERN = /(_code|_id|_category|_type|_name|_no)$/;
const ENTITY_PREFIX = /^(building|site|zone|room|floor|device|meter|area|asset|department|dept|ward|bed|line|case_)/;
const CONTEXT_PATTERN = /occupanc|people|headcount|shift|staff|visitor|holiday|weekday|weekend|weather|schedule|tariff_window/;

/**
 * Role of a column inside the analysis. `semantic_type` comes from the backend
 * when it recorded one; the name is only used to disambiguate.
 */
export const roleForColumn = (column?: string | null, semanticType?: string | null): FieldRole => {
  const name = String(column ?? "").toLowerCase();
  const semantic = String(semanticType ?? "").toLowerCase();
  const both = `${name} ${semantic}`;

  if (/timestamp|datetime/.test(semantic) || /timestamp|datetime|_date$|_time$|_ts$/.test(name)) return "index";
  if (/target|label|dependent/.test(semantic)) return "target";
  if (/categor|dimension|entity|identifier/.test(semantic)) return "entity";
  if (CONTEXT_PATTERN.test(both)) return "context";
  if (/co2|carbon|emission|ghg/.test(name)) return "target";
  if (ENTITY_PATTERN.test(name) || ENTITY_PREFIX.test(name)) return "entity";
  return "signal";
};

/** Roles in the order the schema panel lists them. */
export const ROLE_ORDER: FieldRole[] = ["index", "entity", "context", "target", "signal"];

/** Short role name for a badge. */
export const ROLE_LABEL: Record<FieldRole, string> = {
  index: "index",
  entity: "entity",
  context: "context",
  target: "target",
  signal: "signal",
};

/** One sentence explaining what the role does to the data. */
export const ROLE_NOTE: Record<FieldRole, string> = {
  index: "time axis every row is aligned to",
  entity: "identifies an asset, room or meter",
  context: "operating conditions around the load",
  target: "the quantity EcoMind models and forecasts",
  signal: "a measured quantity used as a feature",
};
