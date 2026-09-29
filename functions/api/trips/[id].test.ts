// @vitest-environment node
//
// The DELETE cases sign a real session JWT, which needs Web Crypto's `subtle`;
// jsdom does not reliably expose it (see functions/lib/auth/auth.test.ts).
import { describe, it, expect } from 'vitest'
import { onRequestGet, onRequestPatch, onRequestDelete } from './[id]'
import { fakeD1, fakeR2 } from '../../lib/testD1'
import { signToken } from '../../lib/auth/jwt'
import { photoRow, TRIP_ID, PNG_BYTES } from '../../lib/testPhotos'

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
    expect(body.itinerary[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
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

describe('DELETE /api/trips/:id', () => {
  const JWT_SECRET = 'test-secret-for-trip-delete'
  const OWNER_ID = 'user-1'
  const userRow = {
    id: OWNER_ID,
    email: 'owner@example.com',
    password_hash: 'x',
    display_name: null,
    created_at: '2026-01-01',
    token_version: 0,
    email_verified: 1,
  }
  const photos = [photoRow(), photoRow({ id: '9f000000-0000-4000-8000-000000000002' })]

  /**
   * An owner-authenticated DELETE against a trip with two photos. R2 deletes
   * are logged into the same `calls` list as SQL so the test can check order.
   */
  async function setup({ owned = true, r2Fails = false } = {}) {
    const r2 = fakeR2(r2Fails)
    for (const p of photos) r2.objects.set(p.r2_key, { bytes: new Uint8Array(PNG_BYTES), contentType: 'image/png' })
    const d1 = fakeD1({
      first: (sql, args) => {
        if (sql.includes('FROM users')) return userRow
        if (sql.includes('SELECT id FROM trips')) return owned && args[0] === TRIP_ID && args[1] === OWNER_ID ? { id: TRIP_ID } : null
        return null
      },
      all: (sql, args) => (sql.includes('FROM trip_photos') ? photos.filter((p) => p.trip_id === args[0]) : []),
      run: (sql) => (sql.startsWith('DELETE FROM trips') ? (owned ? 1 : 0) : undefined),
      extraEnv: { JWT_SECRET, PHOTOS: r2.bucket },
    })
    const realDelete = r2.bucket.delete.bind(r2.bucket)
    r2.bucket.delete = async (keys: string | string[]) => {
      d1.calls.push({ sql: 'R2 DELETE', args: Array.isArray(keys) ? keys : [keys] })
      return realDelete(keys)
    }
    const token = await signToken(OWNER_ID, 0, JWT_SECRET)
    const request = new Request(`https://x/api/trips/${TRIP_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const res = await onRequestDelete({ env: d1.env, request, params: { id: TRIP_ID } } as never)
    return { res, calls: d1.calls, r2 }
  }

  it('deletes the trip’s R2 photos, then its photo rows, recap links, invites and members, then the trip', async () => {
    const { res, calls, r2 } = await setup()
    expect(res.status).toBe(200)
    expect(r2.objects.size).toBe(0)

    const indexOf = (prefix: string) => calls.findIndex((c) => c.sql.startsWith(prefix))
    const r2Delete = indexOf('R2 DELETE')
    const photoRows = indexOf('DELETE FROM trip_photos')
    const recapLinks = indexOf('DELETE FROM trip_recap_links')
    const invites = indexOf('DELETE FROM trip_invites WHERE trip_id = ?')
    const members = indexOf('DELETE FROM trip_members WHERE trip_id = ?')
    const trip = indexOf('DELETE FROM trips')
    expect(calls[r2Delete].args.slice().sort()).toEqual(photos.map((p) => p.r2_key).sort())
    expect([r2Delete, photoRows, recapLinks, invites, members, trip].every((i) => i >= 0)).toBe(true)
    expect(r2Delete).toBeLessThan(photoRows)
    expect(photoRows).toBeLessThan(trip)
    expect(recapLinks).toBeLessThan(trip)
    // trip_invites and trip_members reference trips(id); D1 enforces that, so they go first.
    expect(invites).toBeLessThan(trip)
    expect(members).toBeLessThan(trip)
    expect(calls[photoRows].args).toEqual([TRIP_ID])
    expect(calls[recapLinks].args).toEqual([TRIP_ID])
    expect(calls[invites].args).toEqual([TRIP_ID])
    expect(calls[members].args).toEqual([TRIP_ID])
    expect(calls[trip].args).toEqual([TRIP_ID, OWNER_ID])
  })

  it('touches no photos or links when the trip is not the caller’s, and answers 404', async () => {
    const { res, calls, r2 } = await setup({ owned: false })
    expect(res.status).toBe(404)
    expect(r2.objects.size).toBe(photos.length)
    expect(calls.some((c) => c.sql.startsWith('DELETE') || c.sql === 'R2 DELETE')).toBe(false)
  })

  it('keeps the trip and its rows when the R2 delete fails, and answers 500', async () => {
    const { res, calls } = await setup({ r2Fails: true })
    expect(res.status).toBe(500)
    expect(calls.some((c) => c.sql.startsWith('DELETE'))).toBe(false)
  })
})
