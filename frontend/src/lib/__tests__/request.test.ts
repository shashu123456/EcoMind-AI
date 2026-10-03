import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  API_BASE,
  ApiError,
  clearSession,
  errorMessage,
  getToken,
  getUser,
  isAuthenticated,
  qs,
  request,
  setToken,
  setUser,
  streamUrl,
} from '../api/client';

// --- environment stubs -----------------------------------------------------

function stubStorage(): { clear: () => void } {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as unknown as Storage;
  return {
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (k: string) =>
        headers[k.toLowerCase()] ??
        (k.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function textResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => 'text/plain' },
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

const store = stubStorage();
const assign = vi.fn();
const realWindow = (globalThis as Record<string, unknown>).window;
const realFetch = globalThis.fetch;

beforeEach(() => {
  store.clear();
  assign.mockClear();
  (globalThis as Record<string, unknown>).window = { location: { assign } };
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  (globalThis as Record<string, unknown>).window = realWindow;
  globalThis.fetch = realFetch;
});

function lastInit(): Headers {
  return vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers as Headers;
}

function lastUrl(): string {
  return vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
}

// --- query strings ---------------------------------------------------------

describe('qs', () => {
  it('returns an empty string when nothing survives', () => {
    expect(qs({})).toBe('');
    expect(qs({ a: null, b: undefined, c: '' })).toBe('');
  });

  it('drops empty values and encodes the rest', () => {
    expect(qs({ page: 2, severity: null, severity_high: true, q: '' })).toBe(
      '?page=2&severity_high=true',
    );
  });

  it('encodes characters that would otherwise split the query', () => {
    expect(qs({ room_code: 'B1-0 4' })).toBe('?room_code=B1-0+4');
    expect(qs({ q: 'a&b=c' })).toBe('?q=a%26b%3Dc');
  });
});

// --- session ---------------------------------------------------------------

describe('session storage', () => {
  it('round-trips the token and user', () => {
    setToken('tok-1');
    setUser({ email: 'a@b.c' });
    expect(getToken()).toBe('tok-1');
    expect(getUser()?.email).toBe('a@b.c');
    expect(isAuthenticated()).toBe(true);
  });

  it('reports no session when storage is empty', () => {
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('clears both keys together', () => {
    setToken('tok-1');
    setUser({ email: 'a@b.c' });
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});

// --- request ---------------------------------------------------------------

describe('request', () => {
  it('prefixes the versioned base path and asks for JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, { id: 'd1' }));
    const out = await request<{ id: string }>('/datasets/d1');
    expect(lastUrl()).toBe(`${API_BASE}/datasets/d1`);
    expect(lastInit().get('Accept')).toBe('application/json');
    expect(out).toEqual({ id: 'd1' });
  });

  it('serialises a JSON body and sets its content type', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));
    await request('/datasets/d1/synthetic', { method: 'POST', body: { name: 'Aurora', seed: 7 } });
    expect(lastInit().get('Content-Type')).toBe('application/json');
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body).toBe(
      JSON.stringify({ name: 'Aurora', seed: 7 }),
    );
  });

  it('leaves FormData bodies alone so the browser sets the multipart boundary', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));
    const form = new FormData();
    await request('/datasets/upload', { method: 'POST', body: form });
    expect(lastInit().get('Content-Type')).toBeNull();
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body).toBe(form);
  });

  it('attaches the bearer token when one is stored', async () => {
    setToken('tok-123');
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));
    await request('/datasets');
    expect(lastInit().get('Authorization')).toBe('Bearer tok-123');
  });

  it('omits the token on anonymous calls', async () => {
    setToken('tok-123');
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(200, {}));
    await request('/auth/login', { method: 'POST', body: {}, anonymous: true });
    expect(lastInit().get('Authorization')).toBeNull();
  });

  it('returns undefined for 204 rather than trying to parse a body', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(204, null));
    await expect(request('/datasets/d1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('returns text when the response is not JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(textResponse(200, 'ok'));
    await expect(request('/datasets/d1/download')).resolves.toBe('ok');
  });

  it('surfaces the backend detail message on failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse(422, { detail: 'Row count exceeds max_rows' }),
    );
    await expect(request('/datasets/upload')).rejects.toThrow('Row count exceeds max_rows');
  });

  it('falls back to the payload message, then to the status code', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse(500, { message: 'Rule engine crashed' }),
    );
    await expect(request('/datasets')).rejects.toThrow('Rule engine crashed');

    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(500, {}));
    await expect(request('/datasets')).rejects.toThrow('500');
  });

  it('throws ApiError carrying the status and payload', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(404, { detail: 'No such dataset' }));
    const err = await request('/datasets/nope').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).payload.detail).toBe('No such dataset');
  });

  it('clears the session and sends the user to /login on 401', async () => {
    setToken('stale');
    setUser({ email: 'a@b.c' });
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(401, { detail: 'Token expired' }));
    await expect(request('/datasets')).rejects.toThrow('Token expired');
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not bounce to /login when the login call itself is rejected', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(401, { detail: 'Wrong password' }));
    await expect(
      request('/auth/login', { method: 'POST', body: {}, anonymous: true }),
    ).rejects.toThrow('Wrong password');
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not bounce on a 403 raised by the authorisation check on an auth route', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(403, { detail: 'forbidden' }));
    await expect(request('/auth/me')).rejects.toThrow('forbidden');
    expect(assign).not.toHaveBeenCalled();
  });

  it('explains an unreachable backend instead of leaking the network error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('fetch failed'));
    const err = await request('/datasets').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toMatch(/backend is running/i);
  });
});

// --- stream url ------------------------------------------------------------

describe('streamUrl', () => {
  it('passes the token as a query parameter because EventSource cannot set headers', () => {
    setToken('tok-abc');
    expect(streamUrl('/quality/d1/stream')).toBe(`${API_BASE}/quality/d1/stream?token=tok-abc`);
  });

  it('omits the parameter when there is no token', () => {
    expect(streamUrl('/workflows/r1/stream')).toBe(`${API_BASE}/workflows/r1/stream`);
  });

  it('honours an explicit token override', () => {
    expect(streamUrl('/quality/d1/stream', 'other')).toBe(
      `${API_BASE}/quality/d1/stream?token=other`,
    );
  });
});

// --- error messages --------------------------------------------------------

describe('errorMessage', () => {
  it('prefers the message on an ApiError', () => {
    expect(errorMessage(new ApiError(500, 'Rule engine crashed'))).toBe('Rule engine crashed');
  });

  it('falls back for a plain error and for a non-error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('boom', 'Try again')).toBe('Try again');
    expect(errorMessage(undefined, 'Try again')).toBe('Try again');
  });

  it('uses its own default fallback', () => {
    expect(errorMessage(null)).toBe('Something went wrong.');
  });
});
