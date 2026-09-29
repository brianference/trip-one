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
    expect((await res.json()).error).toBe('Something went wrong on our end. Please try again in a moment.')
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
    expect((await res.json()).error).toBe('Something went wrong on our end. Please try again in a moment.')
  })

  it('assigns stable ids to itinerary items that arrive without one, and getTrip returns them', async () => {
    // Stateful fake: the UPDATE's bound itinerary JSON becomes what the
    // subsequent internal getTrip (inside updateTrip) reads back, mirroring
    // a real D1 round-trip.
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (!sql.includes('FROM trips')) return null
        const update = calls.find((c) => c.sql.includes('UPDATE trips'))
        return { ...tripRow, itinerary: update ? (update.args[0] as string) : '[]' }
      },
    })
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({
        itinerary: [
          { time: '09:00', text: 'Ueno Park', type: 'option' },
          { time: '', text: 'Senso-ji', type: 'option', id: '11111111-1111-4111-8111-111111111111' },
        ],
      }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { itinerary: { id?: string; text: string }[] }
    expect(body.itinerary[0].id).toMatch(/^[0-9a-f-]{4,}-[0-9a-f-]{4,}/)
    // The id supplied by the client is kept, not replaced.
    expect(body.itinerary[1].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('rate-limits patches past the hourly cap (and does not update the trip)', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 500 } : null),
    })
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe(
      'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.',
    )
    expect(calls.some((c) => c.sql.includes('UPDATE trips'))).toBe(false)
  })
})
