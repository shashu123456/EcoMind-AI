/**
 * Types mirroring the backend wire format exactly.
 *
 * Every name here was read off a live response, not invented. The API sends
 * snake_case and these types keep that spelling, so a field can be traced from
 * the JSON the server wrote to the component that reads it without a lookup
 * table. Where a payload is genuinely open-ended -- a data-quality rule's
 * `details` differs per rule, a report section's `figures` is whatever that
 * section measured -- the type says `Record<string, unknown>` and a helper
 * reads it, rather than pretending a fixed shape exists.
 */

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface HealthPayload {
  status: string;
  version?: string;
  database?: string;
  environment?: string;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  role?: string | null;
}

export interface AuthSession {
  access_token: string;
  token_type?: string;
  user: AuthUser;
}

/** `auth.ts` reads `AuthPayload`/`User`; both name the same two shapes. */
export type User = AuthUser;
export type AuthPayload = AuthSession;

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

/**
 * How a row is keyed. `asset` is one row per device per hour with building,
 * floor and room columns; `meter` is one row per meter with no room level.
 * The backend stores this as a free column, but only these two values are ever
 * produced, and a filter control that silently does nothing on an unknown value
 * is worse than a type error here.
 */
export type Granularity = 'asset' | 'meter';

export interface DatasetBadges {
  [key: string]: unknown;
}

export interface DatasetProvenance {
  origin?: string;
  license?: string;
  collection_method?: string;
  temporal_range?: string;
  geographic_scope?: string;
  version?: string;
  random_seed?: number;
  citation?: string;
  [key: string]: unknown;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  source_type: string;
  file_path?: string | null;
  file_size_bytes?: number | null;
  row_count: number;
  column_count: number;
  granularity: Granularity;
  is_active?: boolean | null;
  building_count?: number | null;
  floor_count?: number | null;
  room_count?: number | null;
  device_count?: number | null;
  hourly_row_count?: number | null;
  monthly_row_count?: number | null;
  defect_rate?: number | null;
  anomaly_rate?: number | null;
  badges?: DatasetBadges | null;
  provenance?: DatasetProvenance | null;
  doi?: string | null;
  source_url?: string | null;
  license?: string | null;
  notes?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DatasetListResponse {
  datasets: Dataset[];
}

export interface DatasetResponse {
  dataset: Dataset;
}

/**
 * One drill level, carrying only the values this dataset can actually resolve.
 *
 * A meter-level reference dataset returns building and device and nothing
 * between. The UI renders drill controls straight off this list, so a level
 * absent here is absent from the interface rather than offered as fiction.
 */
export interface DatasetHierarchyLevel {
  level: 'building_code' | 'floor_no' | 'room_code' | 'device_code';
  label: string;
  values: string[];
  drillable: boolean;
}

export interface DatasetHierarchyBuilding {
  code: string;
  name: string;
  building_type: string | null;
  gross_area_sqm: number | null;
  commissioned_year: number | null;
  rated_kw: number | null;
  floors: {
    floor_no: string;
    label: string | null;
    floor_type: string | null;
    area_sqm: number | null;
  }[];
}

export interface HierarchyDevice {
  code: string;
  name: string;
  category: string;
  rated_kw: number | null;
  is_critical: boolean;
  is_meter: boolean;
}

export interface HierarchyRoom {
  code: string;
  name: string;
  room_type: string | null;
  area_sqm: number | null;
  occupancy_capacity: number | null;
  devices: HierarchyDevice[];
}

export interface HierarchyFloor {
  floor_no: string;
  label: string | null;
  floor_type: string | null;
  area_sqm: number | null;
  rooms: HierarchyRoom[];
  devices: HierarchyDevice[];
}

export interface HierarchyBuildingNode {
  code: string;
  name: string;
  building_type: string | null;
  gross_area_sqm: number | null;
  commissioned_year: number | null;
  rated_kw: number | null;
  floors: HierarchyFloor[];
  devices: HierarchyDevice[];
}

export interface DatasetHierarchy {
  dataset_id: string;
  granularity: Granularity;
  levels: DatasetHierarchyLevel[];
  buildings: DatasetHierarchyBuilding[];
  /**
   * The estate, properly nested.
   *
   * `levels` answers "which codes exist"; `tree` answers "which rooms belong to
   * this building". A scope control built from the flat lists would offer every
   * room in the estate while a single building is selected, and would produce
   * scopes matching nothing.
   */
  tree: HierarchyBuildingNode[];
}

export interface PreviewColumn {
  name: string;
  data_type?: string;
  dtype?: string;
}

export interface DatasetPreviewResponse {
  rows: Record<string, unknown>[];
  columns: PreviewColumn[];
  row_count: number;
  column_count: number;
  start: number;
  limit: number;
  returned: number;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface SchemaColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  unique_count: number;
  null_count: number;
  sample_values: unknown[];
  statistics?: Record<string, unknown> | null;
  semantic_type?: string | null;
}

export interface SchemaDiscovery {
  columns: SchemaColumn[];
  discovered_at: number;
  source: string;
  warnings: string[];
  elapsed_ms: number;
  dropped_columns: string[];
}

export interface SchemaResponse {
  columns: SchemaColumn[];
}

export interface ImportColumn {
  name: string;
  dtype: string;
  null_count: number;
  unique_count: number;
  sample_values: unknown[];
}

export interface ImportProvenance extends DatasetProvenance {}

export interface ImportResult {
  id: string;
  name: string;
  source_type: string;
  granularity: Granularity;
  row_count: number;
  column_count: number;
  device_count: number;
  status: string;
  provenance: ImportProvenance;
  columns: ImportColumn[];
}

export interface LibraryResult {
  datasets: Dataset[];
}

// ---------------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------------

/**
 * Rule detail payloads are rule-specific: `completeness` reports null cells,
 * `validity_semantic_bounds` reports out-of-range counts per column, the
 * accuracy rules report outliers. A single interface here would be a fiction
 * that breaks on the first rule nobody modelled, so the shape stays open and
 * the helpers in `quality.ts` read the keys they know by name.
 */
export type RuleDetails = Record<string, unknown>;

export interface QualityRule {
  id: string;
  dataset_id: string;
  rule_name: string;
  rule_category: string;
  dimension: string;
  score: number;
  details: RuleDetails;
  severity: string;
  passed: boolean;
  ran_at: string;
}

export interface QualityByDimension {
  completeness?: number;
  validity?: number;
  consistency?: number;
  accuracy?: number;
  timeliness?: number;
  [key: string]: number | undefined;
}

export interface QualitySeverityCounts {
  info?: number;
  warning?: number;
  critical?: number;
  [key: string]: number | undefined;
}

export interface QualityResult {
  overall_score: number;
  results: QualityRule[];
  passed_count: number;
  failed_count: number;
  by_dimension: QualityByDimension;
  severity_counts: QualitySeverityCounts;
  summary: string;
  elapsed_ms: number;
  ran_at: string;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

export type StepStatus = 'done' | 'skipped' | 'failed' | string;

export interface TransformFieldChange {
  column_name: string;
  before_value: string;
  after_value: string;
  changed: boolean;
  unit_before?: string | null;
  unit_after?: string | null;
}

export interface TransformStep {
  step_key: string;
  order: number;
  label: string;
  purpose: string;
  status: StepStatus;
  affected_columns: string[];
  rows_changed: number;
  fields: TransformFieldChange[];
  note?: string | null;
  applied_at?: string | null;
}

export interface DerivedFeature {
  name: string;
  description: string;
  source_columns: string[];
  data_type: string;
  created_at?: string | null;
}

export interface TransformationResult {
  dataset_id: string;
  steps: TransformStep[];
  features: DerivedFeature[];
  rows_in: number;
  rows_out: number;
  columns_in: number;
  columns_out: number;
  applied_steps: string[];
  processed_file?: string | null;
  applied_at?: string | null;
  elapsed_ms: number;
  run_id?: string | null;
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

export interface CandidateMetrics {
  r2: number;
  rmse: number;
  mae: number;
  mape: number;
  explained_variance: number;
  training_seconds: number;
  training_rows: number;
}

export interface CandidateNormalised {
  r2: number;
  rmse: number;
  speed: number;
}

export interface ModelCandidate {
  id: string;
  algorithm: string;
  display_name: string;
  family: string;
  metrics: CandidateMetrics;
  composite_score: number;
  normalised: CandidateNormalised;
  selection_rank: number;
  is_selected: boolean;
  trained_at?: string | null;
  error?: string | null;
}

export interface DatasetCharacteristics {
  rows: number;
  feature_count: number;
  span_days: number;
  devices: number;
  buildings: number;
  target_mean: number;
  target_std: number;
  target_cv: number;
  missing_feature_rate: number;
  matrix_hash?: string | null;
  sampled: boolean;
  rows_available: number;
  sample_cap: number;
  target_column: string;
}

export interface SelectionWeights {
  r2: number;
  rmse: number;
  speed: number;
  [key: string]: number;
}

export interface ModelSelectionResult {
  run_id: string;
  dataset_id: string;
  selected_model_id: string;
  selected_algorithm: string;
  rationale: string;
  winning_criteria: string[];
  lost_criteria: string[];
  margin_over_second: number;
  near_tie: boolean;
  dataset_characteristics: DatasetCharacteristics;
  candidates: ModelCandidate[];
  target_column: string;
  feature_count: number;
  excluded_columns: string[];
  feature_importances: Record<string, number>;
  train_rows: number;
  test_rows: number;
  split_strategy: string;
  weights: SelectionWeights;
  decided_at: string;
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

export interface AnomalyClassRow {
  anomaly_class: string;
  label: string;
  count: number;
  excess_kwh: number;
  excess_cost: number;
}

export interface AnomalySeverityRow {
  severity: string;
  count: number;
  excess_kwh: number;
}

export interface AnomalyBuildingRow {
  building_code: string;
  count: number;
  excess_kwh: number;
  excess_cost: number;
}

export interface AnomalyDeviceRow {
  device_code: string;
  label: string;
  count: number;
  excess_kwh: number;
}

/** One anomaly row as the scoped endpoint returns it. */
export interface AnomalyItem {
  id: string;
  dataset_id: string;
  building_code: string | null;
  floor_no: string | null;
  room_code: string | null;
  device_code: string | null;
  device_label: string | null;
  device_category: string | null;
  detected_at: string | null;
  anomaly_class: string;
  class_label: string | null;
  severity: string;
  score: number | null;
  baseline_method: string | null;
  expected_kwh: number | null;
  actual_kwh: number | null;
  deviation_pct: number | null;
  excess_kwh: number | null;
  excess_cost: number | null;
  excess_co2_kg: number | null;
  priority_rank: number | null;
  evidence: string | null;
}

/**
 * A scoped page of anomalies plus facet counts.
 *
 * The facets obey the same building scope as `total`. When they did not, a
 * panel read "1,281 in Riverside" beside chips summing to the campus-wide
 * 2,227 -- the fix in `anomaly_service.page` exists because of that.
 */
export interface AnomalyPageResponse {
  dataset_id: string;
  anomalies: AnomalyItem[];
  total: number;
  page: number;
  page_size: number;
  severity_counts: Record<string, number>;
  class_counts: Record<string, number>;
  scope?: {
    building_code: string | null;
    severity: string | null;
    anomaly_class: string | null;
  } | null;
}

export interface AnomalyResult {
  run_id: string;
  dataset_id: string;
  total: number;
  devices_affected: number;
  readings_scanned: number;
  detection_rate_pct: number;
  excess_kwh: number;
  excess_cost: number;
  excess_co2_kg: number;
  by_class: AnomalyClassRow[];
  by_severity: AnomalySeverityRow[];
  by_building: AnomalyBuildingRow[];
  top_devices: AnomalyDeviceRow[];
  baseline_method: string;
  threshold: number;
  analysed_at: string;
  elapsed_ms: number;
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface HourlyPoint {
  timestamp: string;
  energy_kwh: number;
  lower_kwh: number;
  upper_kwh: number;
  power_kw: number;
  cost_inr: number;
  tariff_band: string;
}

export interface MonthlyPoint {
  month: string;
  energy_kwh: number;
  lower_kwh: number;
  upper_kwh: number;
  cost_inr: number;
  history_kwh?: number | null;
}

export interface MonthlyHistoryPoint {
  month: string;
  energy_kwh: number;
}

export interface Horizon {
  horizon: string;
  tier: 'short' | 'long' | string;
  label: string;
  total_kwh: number;
  total_cost_inr: number;
  peak_demand_kw: number;
  peak_demand_at?: string | null;
  co2_tonnes: number;
  band_width_pct: number | null;
  method: string;
  confidence_note: string;
}

export interface CostByBand {
  band: string;
  kwh: number;
  cost_inr: number;
}

export interface ForecastAggregates {
  total_kwh: number;
  avg_daily_kwh: number;
  peak_demand_kw: number;
  peak_demand_at?: string | null;
  p95_demand_kw: number;
  load_factor_pct: number;
  total_cost_inr: number;
  blended_rate_per_kwh: number;
  projected_bill_inr: number;
  standing_charge_inr: number;
  co2_tonnes: number;
  cost_by_band: CostByBand[];
}

export interface TariffBand {
  key: string;
  label: string;
  rate_per_kwh: number;
  start_hour: number;
  end_hour: number;
  weekend_rate_per_kwh?: number;
}

export interface Tariff {
  currency: string;
  currency_symbol: string;
  co2_kg_per_kwh: number;
  standing_charge_per_period: number;
  billing_period_days: number;
  bands: TariffBand[];
}

export interface ScopeTotal {
  building_code: string;
  device_code: string;
  total_kwh: number;
}

export interface CompareRow {
  building_code: string;
  building_name: string;
  total_kwh: number;
  total_cost_inr: number;
  peak_demand_kw: number;
  co2_tonnes: number;
  share_pct: number;
}

export interface CompareBlock {
  rows: CompareRow[];
  total: number;
}

export interface ForecastResult {
  run_id: string;
  dataset_id: string;
  model_id?: string | null;
  selected_algorithm: string;
  target_column: string;
  origin_timestamp: string;
  history_rows: number;
  history_hours: number;
  devices: string[];
  scope_totals: ScopeTotal[];
  exogenous_assumption: string;
  mape_backtest: number;
  hourly: HourlyPoint[];
  monthly: MonthlyPoint[];
  monthly_history: MonthlyHistoryPoint[];
  horizons: Horizon[];
  aggregates: ForecastAggregates;
  tariff: Tariff;
  calibration_factor: number;
  generated_at: string;
  elapsed_ms: number;
  compare?: CompareBlock | null;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export type Priority = 'P1' | 'P2' | 'P3' | string;
export type PaybackVerdict = 'viable' | 'marginal' | 'not_viable' | 'unknown' | string;

export interface RecommendationItem {
  id: string;
  dataset_id: string;
  priority: Priority;
  category: string;
  title: string;
  reason: string;
  action: string;
  building_code: string;
  floor_no?: string | null;
  room_code?: string | null;
  device_code: string;
  device_label: string;
  savings_kwh: number;
  savings_cost_inr: number;
  savings_co2_kg: number;
  payback_months: number | null;
  payback_verdict: PaybackVerdict;
  anomaly_ids: string[];
  forecast_basis?: string | null;
  estimated_cost_inr?: number | null;
  status: string;
  confidence: number;
  created_at: string;
}

export interface ProgrammeBuilding {
  building_code: string;
  recommendations: number;
  devices_affected: number;
  p1_actions: number;
  recoverable_kwh: number;
  monthly_recoverable_inr: number;
  annual_recoverable_inr: number;
  programme_cost_inr: number;
  payback_months: number | null;
  payback_verdict: PaybackVerdict;
}

export interface ProgrammeEstate {
  recommendations: number;
  recoverable_kwh: number;
  monthly_recoverable_inr: number;
  annual_recoverable_inr: number;
  annual_recoverable_co2_kg: number;
  programme_cost_inr: number;
  payback_months: number | null;
  payback_verdict: PaybackVerdict;
}

export interface Programme {
  method: string;
  buildings: Record<string, ProgrammeBuilding>;
  estate: ProgrammeEstate;
}

export interface SavingsInventory {
  grouped_recoverable_kwh: number;
  raw_excess_kwh: number;
  note: string;
  groups: number;
}

export interface PaybackThresholds {
  viable: number;
  marginal: number;
  [key: string]: number;
}

export interface RecommendationResult {
  run_id: string;
  dataset_id: string;
  recommendations: RecommendationItem[];
  total: number;
  by_priority: Record<string, number>;
  total_savings_kwh: number;
  total_savings_inr: number;
  total_savings_co2_kg: number;
  co2_kg_per_kwh: number;
  priority_basis: string;
  payback_thresholds_months: PaybackThresholds;
  generated_at: string;
  programme: Programme;
  savings_inventory: SavingsInventory;
  forecast_basis_available: boolean;
  elapsed_ms: number;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * A section's figures are whatever that section measured -- `projected_30d_kwh`
 * on the consumption section, `data_quality_score` on the data-quality section.
 * The keys are open so a new section cannot fail typecheck for inventing a
 * field, and `figure()` reads them by name where a page needs one.
 */
export type ReportFigures = Record<string, number | string | null>;

export interface ReportSection {
  key: string;
  title: string;
  body: string;
  figures: ReportFigures;
  order: number;
}

export interface ReportOverallHealth {
  data_quality_score?: number | null;
  peak_demand_kw?: number | null;
  load_factor_pct?: number | null;
  anomaly_readings?: number | null;
}

export interface ReportSpend {
  projected_30d_inr?: number | null;
  projected_30d_kwh?: number | null;
  co2_tonnes?: number | null;
}

export interface ReportOpportunity {
  recommendations?: number | null;
  p1_actions?: number | null;
  annual_recoverable_inr?: number | null;
  payback_months?: number | null;
  payback_verdict?: string | null;
}

export interface ReportSummary {
  overall_health?: ReportOverallHealth;
  spend?: ReportSpend;
  opportunity?: ReportOpportunity;
  sections?: number | null;
}

export type ReportStatus = 'generating' | 'ready' | 'failed' | string;

export interface ReportResult {
  id: string;
  dataset_id: string;
  run_id: string;
  organization_name: string;
  title: string;
  format: string;
  status: ReportStatus;
  sections: ReportSection[];
  summary: ReportSummary;
  file_size_bytes?: number | null;
  generated_at: string;
  created_at?: string | null;
  elapsed_ms?: number | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Runs and traces
// ---------------------------------------------------------------------------

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | string;

export interface Run {
  id: string;
  dataset_id: string;
  status: RunStatus;
  current_stage: number;
  total_stages: number;
  /**
   * Stage keys completed so far, in pipeline order.
   *
   * The column is JSON and the API returns an array -- it was previously typed
   * as `number` here, which was wrong, and any caller that trusted the type got
   * a value that did not exist at runtime.
   */
  stages_completed: string[];
  trace_count: number;
  started_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  config?: Record<string, unknown> | null;
}

export interface RunListResponse {
  runs: Run[];
}

/**
 * A trace carries the full `output_snapshot` the stage wrote. That snapshot is
 * the only sanctioned source for a stage page's content: reading it here is
 * the same read `GET /workflows/{run_id}/stages/{stage_key}` performs, so the
 * page and the audit trail cannot disagree.
 */
export interface StageTrace {
  id: string;
  stage_key: string;
  stage_number: number;
  stage_name: string;
  status: string;
  input_snapshot?: Record<string, unknown> | null;
  output_snapshot?: Record<string, unknown> | null;
  decision?: string | null;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  error?: string | null;
}

export interface RunDetailResponse {
  run: Run;
  traces: StageTrace[];
}

export interface TraceListResponse {
  traces: StageTrace[];
}

/** The envelope every stage page reads, from the stage-output route. */
export interface StageOutputResponse {
  stage_key: string;
  stage_number: number;
  stage_name: string;
  status: string;
  output: Record<string, unknown> | null;
  decision?: string | null;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  error?: string | null;
}

export interface StageExecResponse {
  trace: StageTrace;
  output: Record<string, unknown> | null;
  decision?: string | null;
  confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------

export type StreamEventType =
  | 'run_started'
  | 'stage_started'
  | 'stage_completed'
  | 'stage_failed'
  | 'stage_blocked'
  | 'stage_skipped'
  | 'run_completed'
  | 'run_failed'
  | 'heartbeat';

export interface StreamEvent {
  type: StreamEventType | string;
  stage_key?: string;
  run_id?: string;
  message?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Stage output union
// ---------------------------------------------------------------------------

/**
 * Every stage's payload under one name. Pages narrow the union with their own
 * stage key, so a page that forgets to check cannot silently read a sibling
 * stage's fields.
 */
export type StageOutput =
  | LibraryResult
  | ImportResult
  | SchemaDiscovery
  | QualityResult
  | TransformationResult
  | ModelSelectionResult
  | AnomalyResult
  | ForecastResult
  | RecommendationResult
  | ReportResult;

export interface StageOutputMap {
  library: LibraryResult;
  import: ImportResult;
  schema: SchemaDiscovery;
  quality: QualityResult;
  transformation: TransformationResult;
  model_selection: ModelSelectionResult;
  anomaly: AnomalyResult;
  forecast: ForecastResult;
  recommendation: RecommendationResult;
  report: ReportResult;
}
