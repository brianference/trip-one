import { describe, it, expect } from 'vitest'
import { onRequestGet, onRequestPatch } from './[id]'
import { fakeD1 } from '../../lib/testD1'

/** A trips row shaped as D1 returns it (itinerary as JSON TEXT). */
const tripRow = {
  id: 'abc-123',
  location_slug: 'dublin-ireland',
  itinerary: '[]',
  design_style: 'bento',
  created_at: '2026-01-01',
  trip_length_days: null,
  start_date: null,
}

describe('GET /api/trips/:id', () => {
  it('returns the trip when found', async () => {
    const { env } = fakeD1({ first: (sql) => (sql.includes('FROM trips') ? tripRow : null) })
    const res = await onRequestGet({ env, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('abc-123')
  })

  it('returns 404 when not found', async () => {
    const { env } = fakeD1({ first: () => null })
    const res = await onRequestGet({ env, params: { id: 'missing' } } as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 when the database throws', async () => {
    const { env } = fakeD1({ fail: true })
    const res = await onRequestGet({ env, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('internal error')
  })
})

describe('PATCH /api/trips/:id', () => {
  it('updates the itinerary and design_style', async () => {
    const { env } = fakeD1({
      first: (sql) => (sql.includes('FROM trips') ? { ...tripRow, design_style: 'chronicle' } : null),
    })
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).design_style).toBe('chronicle')
  })

  it('rejects an invalid patch body', async () => {
    const { env } = fakeD1()
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ invalid_field: 'value' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(400)
  })

  it('returns 500 when the database throws', async () => {
    const { env } = fakeD1({ fail: true })
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('internal error')
  })
})
