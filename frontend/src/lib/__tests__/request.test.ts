import { describe, it, expect, vi, beforeEach } from 'vitest'
import { request } from '../api'

function stubStorage(): Record<string, any> {
  const store: Record<string, any> = {}
  store.clear = () => Object.keys(store).forEach(k => { if (k !== 'clear') delete store[k] })
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: store.clear,
  }
  return store
}

function mockFetch() {
  const fn = vi.fn()
  ;(globalThis as any).fetch = fn
  return fn
}

function stubWindowLocation() {
  const assign = vi.fn()
  ;(globalThis as any).window = { location: { assign } }
  return assign
}

const makeRes = (status: number, body?: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  statusText: '',
  json: async () => {
    if (body === undefined) throw new SyntaxError('Unexpected end of input')
    return body
  },
})

describe('api request()', () => {
  const store = stubStorage()
  const assign = stubWindowLocation()

  beforeEach(() => {
    store.clear()
    assign.mockClear()
  })

  it('GETs with /api/v1 prefix and returns parsed JSON', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValue(makeRes(200, { id: 'd1' }))
    const out = await request<{ id: string }>('/datasets/d1')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/datasets/d1', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
    expect(out).toEqual({ id: 'd1' })
  })

  it('attaches Bearer token when present', async () => {
    store['ecomind_token'] = 'tok123'
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValue(makeRes(200, {}))
    await request('/datasets')
    const opts = fetchMock.mock.calls[0][1]
    expect(opts.headers.Authorization).toBe('Bearer tok123')
  })

  it('throws Error with body detail on non-2xx', async () => {
    mockFetch().mockResolvedValue(makeRes(500, { detail: 'boom' }))
    await expect(request('/datasets')).rejects.toThrow('boom')
  })

  it('throws HTTP fallback when error body has no detail', async () => {
    mockFetch().mockResolvedValue(makeRes(500, undefined))
    await expect(request('/datasets')).rejects.toThrow('HTTP 500')
  })

  it('clears token and redirects to /login on 401', async () => {
    store['ecomind_token'] = 'old'
    store['ecomind_user'] = '{}'
    mockFetch().mockResolvedValue(makeRes(401, { detail: 'Unauthorized' }))
    await expect(request('/datasets')).rejects.toThrow('Unauthorized')
    expect(store['ecomind_token']).toBeUndefined()
    expect(store['ecomind_user']).toBeUndefined()
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('does not redirect on auth-route 403', async () => {
    mockFetch().mockResolvedValue(makeRes(403, { detail: 'forbidden' }))
    await expect(request('/auth/login')).rejects.toThrow('forbidden')
    expect(assign).not.toHaveBeenCalled()
  })
})