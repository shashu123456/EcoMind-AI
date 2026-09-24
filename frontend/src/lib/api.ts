const API_BASE = '/api/v1'

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('ecomind_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('ecomind_token')
    localStorage.removeItem('ecomind_user')
    if (!path.startsWith('/auth/') && !path.startsWith('/login')) {
      window.location.assign('/login')
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Contract types (API_CONTRACT.md §3 — verbatim field names) ──

export interface Provenance {
  origin: string
  license: string
  collection_method: string
  temporal_range: string
  geographic_scope: string
  version: string
  citation: string
}

export interface Dataset {
  id: string
  name: string
  description: string
  source_type: string
  file_path: string
  file_size_bytes: number
  row_count: number
  column_count: number
  status: string
  provenance: Provenance
  created_at: string
  updated_at: string
}

export interface ColumnMeta {
  name: string
  data_type?: string
  [key: string]: unknown
}

export interface PreviewPayload {
  columns: (string | ColumnMeta)[]
  rows: any[][]
  total_rows: number
  row_count: number
  column_count: number
  file_size_bytes?: number
  filename?: string
  missing_summary?: Record<string, number>
}

export interface SchemaColumn {
  name: string
  data_type: string
  inferred_type?: string
  role?: string
  nullable: boolean
  unique_count: number
  null_count: number
  null_rate?: number
  sample_values: any[]
  statistics?: Record<string, any>
  semantic_type: string
}

export interface SchemaResult {
  columns: SchemaColumn[]
  discovered_at?: string
  source?: string
  warnings?: string[]
  elapsed_ms?: number
}

export interface DQResult {
  id: string
  rule_name: string
  rule_category: string
  dimension: string
  score: number
  details: any
  severity: string
  passed: boolean
  ran_at: string
}

export interface DQResultPayload {
  overall_score: number
  results: DQResult[]
  by_dimension: Record<string, number>
  severity_counts: { info: number; warning: number; critical: number }
  ran_at?: string
  passed_count?: number
  failed_count?: number
  summary?: string
  elapsed_ms?: number
}

export interface Transformation {
  id: string
  operation: string
  params: any
  columns_affected: string[]
  rows_affected: number
  before_snapshot: any
  after_snapshot: any
  applied: boolean
  applied_at: string
}

export interface DiffSummary {
  rows_changed: number
  columns_changed: number
  nulls_before: number
  nulls_after: number
  mean_delta: number
  std_delta: number
}

export interface ApplyResult {
  transformation: Transformation
  diff_summary: DiffSummary
}

export interface Feature {
  id: string
  name: string
  feature_type: string
  source_columns: string[]
  description: string
  importance_score: number
  created_by: string
}

export interface ModelMetrics {
  r2: number
  rmse: number
  mae: number
  mape: number
  explained_variance?: number
}

export interface Model {
  id: string
  dataset_id: string
  name: string
  algorithm: string
  task_type: string
  version: string
  hyperparameters: Record<string, any>
  metrics: ModelMetrics
  feature_importances: Record<string, number>
  training_time_seconds: number
  training_rows: number
  model_path: string
  status: string
  is_active: boolean
  created_at: string
}

export interface PredictionPoint {
  timestamp: string
  predicted: number
  lower: number
  upper: number
  actual?: number | null
  confidence: number
}

export interface HorizonSummary {
  total_kwh: number
  peak_kw: number
  peak_time: string
  avg_kw: number
  co2_estimate_kg: number
  cost_estimate: number
}

export interface PredictResult {
  model: Model
  predictions: PredictionPoint[]
  metrics: ModelMetrics
  forecast_start: string
  forecast_end: string
  horizon_summary: HorizonSummary
}

export interface TopFeature {
  feature: string
  value: number
  shap_value: number
  impact: 'positive' | 'negative'
}

export interface Explanation {
  prediction_id: string
  model_id: string
  method: string
  feature_names: string[]
  shap_values: number[]
  base_value: number
  expected_value: number
  global_importance: Record<string, number>
  computation_time_ms: number
}

export interface ExplainResult {
  explanation: Explanation
  top_features: TopFeature[]
  narrative: string
  stability_index: number
}

export interface GlobalExplain {
  feature_names: string[]
  global_importance: number[]
  base_value: number
  stability_index: number
  computation_time_ms: number
}

export interface AnomalyContext {
  reading_value: number
  expected_value: number
  deviation_pct: number
  nearby_readings: number[]
}

export interface Anomaly {
  id: string
  timestamp: string
  asset_id: string
  anomaly_type: string
  severity: string
  score: number
  confidence: number
  is_confirmed: boolean
  description: string
  context: AnomalyContext
}

export interface AnomalyListPayload {
  anomalies: Anomaly[]
  total: number
  by_type?: Record<string, number>
  by_severity?: Record<string, number>
}

export interface DetectResult {
  anomalies: Anomaly[]
  detected_count: number
  total: number
  by_type: Record<string, number>
  by_severity: Record<string, number>
  precision?: number
  recall?: number
  elapsed_ms: number
}

export interface LeaderboardRow {
  model_id: string
  name: string
  algorithm: string
  scores: Record<string, number>
  total_score: number
  rank: number
}

export interface Benchmark {
  id: string
  dataset_id: string
  created_at: string
  methodology: string
  model_count: number
  best_model_id?: string
  metrics?: Record<string, number>
}

export interface BenchmarkList {
  benchmarks: Benchmark[]
}

export interface BenchmarkRun {
  benchmark: Benchmark
  leaderboard: LeaderboardRow[]
  winner: LeaderboardRow | null
}

export interface RecEvidence {
  anomaly_scores: any[]
  shap_top_features: any[]
  similar_cases: any[]
  basis: string
}

export interface Rec {
  id: string
  category: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  estimated_savings_kwh: number
  estimated_savings_percent: number
  confidence: number
  status: string
  supporting_evidence: RecEvidence
}

export interface RecList {
  recommendations: Rec[]
  by_category?: Record<string, number>
  total_savings_kwh?: number
  total_savings_percent?: number
  top_recommendation?: Rec
}

export interface Gate {
  trust_score: number
  verdict: string
  prediction_confidence: number | null
  dq_score: number | null
  model_relevance: number | null
  shap_stability: number | null
  factors: Record<string, number | null>
  reasoning: { explanation?: string; weights?: Record<string, number>; missing_factors?: string[] } | null
  created_at: string | null
  workflow_run_id?: string | null
}

export interface ConfidenceResponse {
  gate: Gate
}

export interface ComparisonMetrics {
  raw: ModelMetrics & { shap_stability?: number }
  processed: ModelMetrics & { shap_stability?: number }
}

export interface Comparison {
  metrics: ComparisonMetrics
  improvement: {
    r2_delta: number
    rmse_delta_pct: number
    mae_delta_pct: number
    mape_delta_pct: number
    shap_stability_delta: number
  }
  feature_count_raw: number
  feature_count_processed: number
  shap_divergence: number
  conclusion: string
}

export interface ChartRow {
  id: string
  comparison_type: string
  [key: string]: any
}

export interface ComparisonResponse {
  comparison: Comparison | null
}

export interface ComparisonRunResult {
  comparison: Comparison
  charts: ChartRow[]
}

export interface Run {
  id: string
  dataset_id: string
  status: string
  current_stage: number
  total_stages: number
  stages_completed: string[]
  started_at: string
  completed_at: string | null
  error_message: string | null
  config: any
}

export interface WorkflowList {
  runs: Run[]
}

export interface RunDetail {
  run: Run
  traces: Trace[]
}

export interface Trace {
  id: string
  stage_number: number
  stage_name: string
  status: string
  input_snapshot: any
  output_snapshot: any
  decision: string
  confidence: number | null
  started_at: string
  completed_at: string
  duration_ms: number
  error: string | null
}

export interface ExecResult {
  trace: Trace
  output: any
  decision: string
  confidence: number | null
}

export interface Report {
  id: string
  title: string
  report_type: string
  format: string
  file_size_bytes: number
  sections: any
  status: string
  generated_at: string
}

export interface ReportList {
  reports: Report[]
}

export interface GenerateResult {
  report: Report
  download_url: string
}

export interface RegistryEntry {
  id: string
  model_id: string
  dataset_id: string
  version: number
  status: string
  promoted_at: string | null
  deprecated_at: string | null
  performance_summary: any
  notes: string
  is_current: boolean
  created_at: string
}

// ── Auth ──
export const auth = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name: string) =>
    request<{ access_token: string; user: any }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, full_name: name }),
    }),
  me: () => request<any>('/auth/me'),
}

// ── Datasets ──
export const datasets = {
  list: () => request<{ datasets: Dataset[] }>('/datasets'),
  upload: (formData: FormData) =>
    fetch(`${API_BASE}/datasets/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('ecomind_token')}` },
      body: formData,
    }).then(r => r.json()),
  get: (id: string) => request<Dataset>(`/datasets/${id}`),
  preview: (id: string, limit = 100, start = 0) =>
    request<PreviewPayload>(`/datasets/${id}/preview?limit=${limit}&start=${start}`),
  refresh: (id: string) =>
    request<Dataset>(`/datasets/${id}/refresh`, { method: 'POST' }),
  content: (id: string, limit = 100, offset = 0, format: 'rows' | 'records' = 'rows') =>
    request<PreviewPayload>(`/datasets/${id}/content?limit=${limit}&offset=${offset}&format=${format}`),
  delete: (id: string) => request<void>(`/datasets/${id}`, { method: 'DELETE' }),
}

// ── Schema ──
export const schema = {
  get: (datasetId: string) => request<SchemaResult>(`/datasets/${datasetId}/schema`),
  discover: (datasetId: string, body?: { use_processed?: boolean }) =>
    request<SchemaResult>(`/datasets/${datasetId}/schema/discover`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
}

// ── Data Quality ──
export const dq = {
  get: (datasetId: string, latestOnly = false) =>
    request<DQResultPayload>(`/datasets/${datasetId}/dq?latest_only=${latestOnly}`),
  result: (datasetId: string, latestOnly = false) =>
    request<DQResultPayload>(`/datasets/${datasetId}/dq?latest_only=${latestOnly}`),
  run: (datasetId: string, body?: { use_processed?: boolean; scope?: 'all' | 'sample' }) =>
    request<DQResultPayload>(`/datasets/${datasetId}/dq/run`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
}

// ── Transformations ──
export const transformations = {
  list: (datasetId: string) => request<{ transformations: Transformation[] }>(`/datasets/${datasetId}/transformations`),
  apply: (datasetId: string, body: { operation: string; params: any }) =>
    request<ApplyResult>(`/datasets/${datasetId}/transformations/apply`, {
      method: 'POST', body: JSON.stringify(body),
    }),
}

// ── Features ──
export const features = {
  list: (datasetId: string) => request<{ features: Feature[] }>(`/datasets/${datasetId}/features`),
  engineer: (datasetId: string, body?: { auto?: boolean; features?: Array<{ name: string; expression: string }> }) =>
    request<{ features: Feature[]; messages: string[] }>(`/datasets/${datasetId}/features/engineer`, {
      method: 'POST', body: JSON.stringify(body || { auto: true }),
    }),
}

// ── Models ──
export const models = {
  list: () => request<{ models: Model[] }>('/models'),
  train: (body: any) =>
    request<{ model: Model }>('/models/train', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => request<Model>(`/models/${id}`),
}

// ── Predictions ──
export const predictions = {
  run: (body: any) =>
    request<PredictResult>('/predictions/predict', { method: 'POST', body: JSON.stringify(body) }),
  predict: (body: any) =>
    request<PredictResult>('/predictions/predict', { method: 'POST', body: JSON.stringify(body) }),
  list: (modelId: string) => request<{ predictions: PredictionPoint[] }>(`/predictions/${modelId}/predictions`),
}

// ── SHAP ──
export const explanations = {
  explain: (predictionId: string, body?: { method?: 'tree' | 'kernel' }) =>
    request<ExplainResult>(`/explanations/${predictionId}/explain`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
  global: (modelId: string, topN = 10) =>
    request<GlobalExplain>(`/explanations/${modelId}/global?top_n=${topN}`),
  get: (modelId: string, topN = 10) =>
    request<GlobalExplain>(`/explanations/${modelId}/global?top_n=${topN}`),
}

// ── Anomalies ──
export const anomalies = {
  list: (datasetId: string, limit?: number, severity?: string) =>
    request<AnomalyListPayload>(`/anomalies/${datasetId}/anomalies?limit=${limit || ''}&severity=${severity || ''}`),
  detect: (datasetId: string, body?: { method?: 'ensemble' | 'isolation_forest' | 'zscore' }) =>
    request<DetectResult>(`/anomalies/${datasetId}/detect`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
  confirm: (datasetId: string, anomalyId: string, body?: { is_confirmed?: boolean }) =>
    request<Anomaly>(`/anomalies/${datasetId}/anomalies/${anomalyId}`, {
      method: 'PATCH', body: JSON.stringify(body || { is_confirmed: true }),
    }),
}

// ── Benchmarks ──
export const benchmarks = {
  list: (datasetId: string) => request<BenchmarkList>(`/benchmarks/${datasetId}/benchmarks`),
  run: (datasetId: string, body?: { model_ids?: string[]; methodology?: string }) =>
    request<BenchmarkRun>(`/benchmarks/${datasetId}/benchmarks/run`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
}

// ── Recommendations ──
export const recommendations = {
  list: (datasetId: string) => request<RecList>(`/recommendations/${datasetId}/recommendations`),
  generate: (datasetId: string, body?: { top_k?: number }) =>
    request<RecList>(`/recommendations/${datasetId}/recommendations/generate`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
}

// ── Reports ──
export const reports = {
  list: () => request<ReportList>('/reports'),
  generate: (body: any) =>
    request<GenerateResult>('/reports/generate', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => request<Report>(`/reports/${id}`),
  download: (id: string) => `${API_BASE}/reports/${id}/download`,
  downloadUrl: (id: string) => `${API_BASE}/reports/${id}/download`,
}

// ── Workflows ──
export const workflows = {
  start: (body: any) =>
    request<any>('/workflows/start', { method: 'POST', body: JSON.stringify(body) }),
  list: (datasetId?: string) =>
    request<WorkflowList>(datasetId ? `/workflows?dataset_id=${datasetId}` : '/workflows'),
  get: (runId: string) => request<RunDetail>(`/workflows/${runId}`),
  exec: (runId: string, stageKey: string, params?: any) =>
    request<ExecResult>(`/workflows/${runId}/stages/${stageKey}/exec`, {
      method: 'POST', body: JSON.stringify(params || {}),
    }),
  advance: (runId: string) =>
    request<ExecResult>(`/workflows/${runId}/advance`, { method: 'POST' }),
  traces: (runId: string) => request<{ traces: Trace[] }>(`/workflows/${runId}/traces`),
  stream: streamWorkflow,
}

// ── AI ──
export const ai = {
  chat: (body: any) =>
    request<any>('/ai/chat', { method: 'POST', body: JSON.stringify(body) }),
  timeline: (datasetId: string) => request<{ stages: Trace[] }>(`/ai/${datasetId}/timeline`),
  confidence: (datasetId: string) => request<ConfidenceResponse>(`/ai/${datasetId}/confidence`),
  evaluate: (datasetId: string, overrides?: any) =>
    request<ConfidenceResponse>(`/ai/${datasetId}/confidence/evaluate`, {
      method: 'POST', body: JSON.stringify(overrides || {}),
    }),
  executive: (datasetId: string) => request<{ summary: any }>(`/ai/${datasetId}/executive`),
}

// ── Comparison ──
export const comparison = {
  get: (runId: string) => request<ComparisonResponse>(`/comparison/${runId}/raw-processed`),
  run: (runId: string, body?: { target_column?: string; algorithm?: string }) =>
    request<ComparisonRunResult>(`/comparison/${runId}/raw-processed/run`, {
      method: 'POST', body: JSON.stringify(body || {}),
    }),
  charts: (runId: string) => request<{ charts: ChartRow[] }>(`/comparison/${runId}/charts`),
}

// ── Registry ──
export const registry = {
  list: (datasetId?: string) =>
    request<{ models: RegistryEntry[] }>(datasetId ? `/registry?dataset_id=${datasetId}` : '/registry'),
  promote: (modelId: string) =>
    request<{ entry: RegistryEntry }>(`/registry/${modelId}/promote`, { method: 'POST' }),
  deprecate: (modelId: string) =>
    request<{ entry: RegistryEntry }>(`/registry/${modelId}/deprecate`, { method: 'POST' }),
}

// ── Health / system ──
export interface HealthPayload {
  status: string
  service: string
  uptime_s?: number
  system?: {
    cpu_percent: number
    memory_percent: number
    memory_used_mb: number
    memory_total_mb: number
    python_cpu_percent: number
    python_memory_mb: number
  }
}

export const health = {
  check: () => request<HealthPayload>('/health'),
}

// ── SSE Stream ──
export function streamWorkflow(runId: string, onEvent: (event: any) => void, onError?: () => void): EventSource {
  const token = localStorage.getItem('ecomind_token')
  const es = new EventSource(`${API_BASE}/workflows/${runId}/stream?token=${token}`)
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch {
      /* ignore malformed frames */
    }
  }
  es.onerror = () => {
    if (onError) onError()
    else es.close()
  }
  return es
}