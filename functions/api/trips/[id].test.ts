import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet, onRequestPatch } from './[id]'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_LIMIT_SALT: 's' }
const trip = { id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento', created_at: '2026-01-01' }

describe('GET /api/trips/:id', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the trip when found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [trip] }))
    const res = await onRequestGet({ env, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('abc-123')
  })

  it('returns 404 when not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const res = await onRequestGet({ env, params: { id: 'missing' } } as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 when Supabase throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Supabase down')))
    const res = await onRequestGet({ env, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal error')
  })
})

describe('PATCH /api/trips/:id', () => {
  afterEach(() => vi.restoreAllMocks())

  it('updates the itinerary and design_style', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ ...trip, design_style: 'chronicle' }] }),
    )
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).design_style).toBe('chronicle')
  })

  it('rejects an invalid patch body', async () => {
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ invalid_field: 'value' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Supabase down')))
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal error')
  })
})
