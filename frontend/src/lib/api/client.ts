/**
 * The HTTP boundary.
 *
 * One place that knows about the API base, the bearer token, error shapes and
 * the fact that one 401 ends the session. Every endpoint module below builds on
 * this and nothing else touches `fetch`.
 */

export const API_BASE = '/api/v1';

const TOKEN_KEY = 'ecomind_token';
const USER_KEY = 'ecomind_user';

export interface ApiErrorPayload {
  detail?: string;
  message?: string;
  [key: string]: unknown;
}

/** An error that carries the server's own wording, for Callouts. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;

  constructor(status: number, message: string, payload: ApiErrorPayload = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export interface StoredUser {
  id?: string;
  email: string;
  full_name?: string;
  role?: string;
}

export function getUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: StoredUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function clearSession(): void {
  setToken(null);
  setUser(null);
}

function messageFrom(payload: ApiErrorPayload, status: number): string {
  if (typeof payload.detail === 'string' && payload.detail) return payload.detail;
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  return `Request failed (HTTP ${status})`;
}

/** Build a query string, dropping empty values so URLs stay readable in logs. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

async function readPayload(res: Response): Promise<ApiErrorPayload> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text) as ApiErrorPayload;
  } catch {
    return { detail: text };
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the 401 redirect — used by the login call itself. */
  anonymous?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, headers, ...rest } = options;
  const token = getToken();

  const finalHeaders = new Headers();
  finalHeaders.set('Accept', 'application/json');
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (token && !anonymous) finalHeaders.set('Authorization', `Bearer ${token}`);
  if (headers) new Headers(headers).forEach((value, key) => finalHeaders.set(key, value));

  const init: RequestInit = {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the EcoMind service. Check that the backend is running.');
  }

  if (res.status === 401 || res.status === 403) {
    clearSession();
    if (!anonymous && !path.startsWith('/auth/')) {
      window.location.assign('/login');
    }
  }

  if (!res.ok) {
    const payload = await readPayload(res);
    throw new ApiError(res.status, messageFrom(payload, res.status), payload);
  }

  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

/**
 * Download a binary artefact. A plain <a download> cannot carry the bearer
 * token, so this fetches, then hands the browser a blob URL.
 */
export async function downloadFile(path: string, fallbackName = 'download'): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const payload = await readPayload(res);
    throw new ApiError(res.status, messageFrom(payload, res.status), payload);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match?.[1] ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * SSE URL. EventSource cannot set headers, so the token travels as a query
 * parameter — the same compromise the backend's stream routes already accept.
 */
export function streamUrl(path: string, token?: string | null): string {
  const t = token ?? getToken();
  return `${API_BASE}${path}${qs({ token: t ?? undefined })}`;
}

/**
 * Subscribe to a run's event stream.
 *
 * Generic over the decoded frame so each endpoint can declare its own event
 * shape without a cast at the call site. The type is a claim about the server,
 * not a guarantee: a frame that does not match is delivered anyway, so handlers
 * must read defensively.
 *
 * Returns an unsubscribe function. Callers must not assume frames arrive in
 * order or at all — `sseStatusPatch` treats a dropped frame as "no change" and
 * the run status endpoint remains the source of truth.
 */
export function subscribe<T = unknown>(
  path: string,
  onEvent: (event: T) => void,
  onError?: (message: string) => void,
): () => void {
  let source: EventSource | null = null;
  try {
    source = new EventSource(streamUrl(path));
  } catch {
    onError?.('This browser cannot open a progress stream.');
    return () => undefined;
  }

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as T);
    } catch {
      /* malformed frame — ignore rather than tear down the stream */
    }
  };
  source.onerror = () => {
    // The browser retries automatically. Report once so a page can fall back
    // to polling, but leave the source open.
    onError?.('Progress stream interrupted. Falling back to status polling.');
  };

  return () => {
    source?.close();
    source = null;
  };
}

/** Normalises anything thrown by a fetch into a displayable sentence. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
