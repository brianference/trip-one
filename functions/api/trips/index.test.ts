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

  it('defaults design_style to liquid-glass when none is sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'liquid-glass', created_at: '2026-01-01' }],
    })
    vi.stubGlobal('fetch', fetchMock)
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    await onRequestPost({ env, request } as never)
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(sentBody.design_style).toBe('liquid-glass')
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
