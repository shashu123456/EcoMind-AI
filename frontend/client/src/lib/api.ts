/**
 * REST client for the EcoMind FastAPI backend (`/api/v1`).
 *
 * One place for base URL, bearer token, JSON handling and the error shape, so
 * every hook in the app talks to the recorded backend output the same way.
 * The token lives in localStorage (single-user analyst workspace); 401 clears
 * it so the UI can fall back to login.
 */

const BASE = "/api/v1";
const TOKEN_KEY = "ecomind_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown; query?: Record<string, string | number | undefined | null> } = {},
): Promise<T> {
  const { json, query, headers, ...rest } = init;
  let url = `${BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const token = getToken();
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined | null>) =>
    request<T>(path, { method: "GET", query }),
  post: <T>(path: string, json?: unknown, query?: Record<string, string | number | undefined | null>) =>
    request<T>(path, { method: "POST", json, query }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: "PUT", json }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};

/* ── Auth ─────────────────────────────────────────────────────────── */
export type AuthUser = { id: string; email: string; full_name: string; role: string };
export type AuthResponse = { access_token: string; user: AuthUser };

export const auth = {
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await api.post<AuthResponse>("/auth/login", { email, password });
    setToken(res.access_token);
    return res.user;
  },
  async register(email: string, password: string, full_name = ""): Promise<AuthUser> {
    const res = await api.post<AuthResponse>("/auth/register", { email, password, full_name });
    setToken(res.access_token);
    return res.user;
  },
  me: () => api.get<AuthUser>("/auth/me"),
  logout: () => setToken(null),
};

/* ── Datasets ─────────────────────────────────────────────────────── */
export type BackendDataset = {
  id: string;
  name: string;
  source_type?: string;
  source_name?: string;
  row_count?: number;
  column_count?: number;
  domain?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

export const datasets = {
  list: () => api.get<{ datasets: BackendDataset[] }>("/datasets"),
  get: (id: string) => api.get<BackendDataset>(`/datasets/${id}`),
  upload: async (file: File, name?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    // The backend route is POST /datasets/upload and returns { dataset }.
    const res = await api.upload<BackendDataset | { dataset: BackendDataset }>("/datasets/upload", form);
    return (res as { dataset?: BackendDataset }).dataset ?? (res as BackendDataset);
  },
  remove: (id: string) => api.del<{ ok: boolean }>(`/datasets/${id}`),
  refresh: (id: string) => api.post<BackendDataset>(`/datasets/${id}/refresh`),
};

/* ── Workflow ─────────────────────────────────────────────────────── */
export const workflow = {
  start: (dataset_id: string, params?: Record<string, unknown>) =>
    api.post<{ run_id: string; status: string }>("/workflows/start", { dataset_id, ...(params || {}) }),
  get: (runId: string) => api.get<Record<string, unknown>>(`/workflows/${runId}`),
  list: () => api.get<{ runs: Record<string, unknown>[] }>("/workflows"),
  stage: (runId: string, stageKey: string) =>
    api.get<Record<string, unknown>>(`/workflows/${runId}/stages/${stageKey}`),
  advance: (runId: string) => api.post<Record<string, unknown>>(`/workflows/${runId}/advance`),
  execStage: (runId: string, stageKey: string, params?: Record<string, unknown>) =>
    api.post<Record<string, unknown>>(`/workflows/${runId}/stages/${stageKey}/exec`, params || {}),
  abort: (runId: string) => api.post<Record<string, unknown>>(`/workflows/${runId}/abort`),
};

/* ── Domain reads (recorded stage outputs / dataset-scoped) ───────── */
export const domain = {
  schema: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/schema`),
  discoverSchema: (id: string) => api.post<Record<string, unknown>>(`/datasets/${id}/schema/discover`),
  dq: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/dq`),
  runDq: (id: string) => api.post<Record<string, unknown>>(`/datasets/${id}/dq/run`),
  baseline: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/baseline`),
  generateBaseline: (id: string) => api.post<Record<string, unknown>>(`/datasets/${id}/baseline`),
  baselineVersions: (id: string) =>
    api.get<{ versions: Record<string, unknown>[] }>(`/datasets/${id}/baseline/versions`),
  anomalyChart: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/anomalies/chart`),
  forecastChart: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/forecast/chart`),
  anomalies: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/anomalies`),
  anomalyStage: (id: string) =>
    api.get<Record<string, unknown>>(`/datasets/${id}/anomalies/stage`),
  preview: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/preview`),
  reportPdfUrl: (runId: string) => `${BASE}/workflows/${runId}/report.pdf`,
};

/* ── Recommendations (decision desk) ──────────────────────────────── */
export type RecCard = {
  id: string;
  priority: string;
  status: string;
  category: string;
  category_label: string;
  title: string;
  reason: string;
  action: string;
  device_code: string;
  device_label: string;
  building_code: string;
  floor_no?: string | null;
  room_code?: string | null;
  severity?: string | null;
  confidence?: number | null;
  savings_kwh: number;
  savings_cost_inr: number;
  savings_co2_kg: number;
  monthly_savings_inr?: number | null;
  estimated_cost_inr?: number | null;
  payback_months?: number | null;
  payback_verdict?: string;
  anomaly_count?: number | null;
  peak_hours?: string[];
  first_seen?: string | null;
  last_seen?: string | null;
  risk?: { level: string; note: string };
  assignment?: Record<string, string | null>;
  history?: { event: string; detail: string; at: string; by: string }[];
  forecast_basis?: string;
  created_at?: string | null;
};

export type RecSummary = {
  total: number;
  active: number;
  closed: number;
  by_priority: Record<string, number>;
  by_status: Record<string, number>;
  savings_kwh: number;
  savings_cost_inr: number;
  savings_co2_kg: number;
  critical: number;
  avg_confidence_pct: number | null;
  devices_affected: number;
  buildings_affected: number;
  implementation_cost_inr: number | null;
  avg_roi_pct: number | null;
  avg_payback_months: number | null;
  currency: string;
  currency_symbol: string;
};

export type RecListResponse = {
  status: "ready" | "empty";
  message?: string;
  summary: RecSummary;
  filtered?: number;
  recommendations: RecCard[];
  priority_matrix: { id: string; title: string; priority: string; impact_inr: number; effort_inr: number | null; confidence_pct: number; status: string }[];
  facets?: { priority: Record<string, number>; status: Record<string, number>; building: string[]; device: string[]; category: string[] };
  statuses: string[];
};

export type RecDetail = {
  recommendation: RecCard;
  problem: Record<string, unknown>;
  evidence: {
    anomalies: { id: string; timestamp: string | null; class: string; severity: string; deviation_pct: number | null; expected_kwh: number | null; actual_kwh: number | null; excess_kwh: number | null }[];
    anomaly_count: number;
    forecast_basis: string;
  };
  root_causes: { factor: string; occurrences: number | null; contribution_pct: number | null; effect: string; evidence: string }[];
  financials: Record<string, number | string | null>;
  energy: Record<string, number | null>;
  carbon: { co2_kg: number; kg_per_kwh: number };
  risk: { level: string; note: string };
  implementation: { steps: string[]; maintenance_action: string; rollback: string; affected_systems: string[] };
  assignment: Record<string, string | null>;
  history: { event: string; detail: string; at: string; by: string }[];
  timeline: { event: string; detail?: string; at: string | null; by?: string }[];
};

/* ── Forecast (prediction page) ───────────────────────────────────── */
export type ForecastPoint = {
  timestamp: string;
  energy_kwh: number;
  lower_kwh: number | null;
  upper_kwh: number | null;
  cost_inr: number | null;
  co2_kg: number | null;
  confidence: number | null;
  tariff_band: string;
  temperature_c: number | null;
};

export type ForecastDetail = {
  status: "ready" | "missing";
  message?: string;
  dataset_id: string;
  dataset_name?: string;
  target_column?: string | null;
  unit?: string;
  horizon?: string;
  horizon_label?: string;
  horizons?: { horizon: string; label: string; hours: number }[];
  forecast?: {
    id: string;
    horizon: string;
    tier: string;
    method: string;
    points: ForecastPoint[];
    history: { timestamp: string; observed_kwh: number; cost_inr: number; co2_kg: number; tariff_band: string }[];
    aggregates: Record<string, number | string | null | unknown>;
    peaks: Record<string, string | number | null>;
    generated_at: string | null;
    exogenous_assumption?: string | null;
    devices?: string[];
  };
  kpis?: {
    energy_kwh: number;
    cost_inr: number;
    carbon_kg: number;
    peak_kw: number | null;
    peak_at: string | null;
    avg_kw: number;
    window_start: string | null;
    window_end: string | null;
    horizon: string;
    horizon_label: string;
    confidence_pct: number | null;
    model_version: string | null;
    generated_at: string | null;
    version: number | null;
    band_width_pct: number | null;
  };
  model?: {
    id: string;
    algorithm: string;
    version: string | number;
    trained_at: string | null;
    training_rows: number | null;
    training_seconds: number | null;
    hyperparameters: Record<string, unknown>;
    metrics: Record<string, number | null>;
    feature_count: number | null;
    features: string[];
    artifact: string | null;
    artifact_source: string | null;
  } | null;
  quality?: Record<string, number | string | null>;
  features?: { feature: string; label: string; importance: number; importance_pct: number | null; direction: string | null; correlation: number | null; coefficient: number | null; group: string }[];
  history?: { version: number; id: string; generated_at: string | null; horizon: string; method: string; total_kwh: number | null; total_cost_inr: number | null; co2_tonnes: number | null; mape: number | null; status: string; run_id: string | null }[];
  generated_ms?: number | null;
  tariff?: Record<string, unknown>;
};

export const forecastApi = {
  detail: (datasetId: string, horizon: string) =>
    api.get<ForecastDetail>(`/datasets/${datasetId}/forecast`, { horizon }),
  generate: (datasetId: string, horizon: string) =>
    api.post<ForecastDetail>(`/datasets/${datasetId}/forecast`, { horizon }),
  history: (datasetId: string, horizon: string) =>
    api.get<{ versions: ForecastDetail["history"] }>(`/datasets/${datasetId}/forecast/history`, { horizon }),
  restore: (datasetId: string, forecastId: string) =>
    api.post<{ forecast_id: string }>(`/datasets/${datasetId}/forecast/restore`, { forecast_id: forecastId }),
};

export const recommendationsApi = {
  list: (datasetId: string, q?: Record<string, string | number | undefined | null>) =>
    api.get<RecListResponse>(`/datasets/${datasetId}/recommendations`, q),
  detail: (datasetId: string, recId: string) =>
    api.get<RecDetail>(`/datasets/${datasetId}/recommendations/${recId}`),
  setStatus: (datasetId: string, recId: string, status: string, note?: string) =>
    api.post<{ id: string; status: string }>(`/datasets/${datasetId}/recommendations/${recId}/status`, { status, note }),
  assign: (datasetId: string, recId: string, body: Record<string, unknown>) =>
    api.post<{ id: string; status: string }>(`/datasets/${datasetId}/recommendations/${recId}/assign`, body),
  simulate: (datasetId: string, recId: string, body: Record<string, unknown>) =>
    api.post<{ projected: Record<string, number | null>; baseline: Record<string, number>; method: string }>(
      `/datasets/${datasetId}/recommendations/${recId}/simulate`,
      body,
    ),
  exportUrl: (datasetId: string, format: "csv" | "json") =>
    `${BASE}/datasets/${datasetId}/recommendations/export/all?format=${format}`,
};

// Legacy alias kept so existing call sites compile before the route is renamed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type _Never = typeof domain;

/* ── Activity feed ────────────────────────────────────────────────── */
export type ActivityEvent = {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  user_id: string | null;
  created_at: string | null;
};

export const activity = {
  list: (opts?: { limit?: number; resource_type?: string; action?: string }) =>
    api.get<{ events: ActivityEvent[]; count: number }>("/activity", opts || {}),
};
