import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './index'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_LIMIT_SALT: 's' }

describe('POST /api/trips', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates a trip with a valid location_slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento', created_at: '2026-01-01' }],
      }),
    )
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('abc-123')
  })

  it('defaults design_style to chronicle when none is sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'chronicle', created_at: '2026-01-01' }],
    })
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    await onRequestPost({ env, request } as never)
    // The first fetch may be the rate-limit bookkeeping — find the create call.
    const createCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rest/v1/trips'))
    const sentBody = JSON.parse(String(createCall![1].body))
    expect(sentBody.design_style).toBe('chronicle')
  })

  it('rate-limits trip creation past the hourly cap (and does not create a trip)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/rest/v1/request_log')) {
          return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/500' }), json: async () => [] })
        }
        throw new Error('must not create a trip when rate-limited')
      }),
    )
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(429)
  })

  it('rejects a missing location_slug', async () => {
    const request = new Request('https://x/api/trips', { method: 'POST', body: JSON.stringify({}) })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Supabase down')))
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal error')
  })
})
