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
  upload: (file: File, name?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    return api.upload<BackendDataset>("/datasets", form);
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
  preview: (id: string) => api.get<Record<string, unknown>>(`/datasets/${id}/preview`),
  reportPdfUrl: (runId: string) => `${BASE}/workflows/${runId}/report.pdf`,
};

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
