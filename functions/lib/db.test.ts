import { describe, it, expect } from 'vitest'
import {
  getLocationBySlug,
  upsertLocation,
  getPlaceDetailCache,
  upsertPlaceDetailCache,
  getInterestPlacesCache,
  upsertInterestPlacesCache,
  countRecentRequests,
  insertRequestLog,
  createTrip,
  getTrip,
  updateTrip,
  type Env,
} from './db'

/**
 * A statement-level fake of the D1 binding: it captures the SQL and bound args
 * of every prepared statement and returns queued `.first()` results. The real
 * SQL is validated separately against SQLite (see d1/schema.sql smoke checks);
 * these tests lock in this layer's JS contract — JSON is serialized on write
 * and parsed on read, ids/timestamps are generated for trips, and a partial
 * trip patch only touches the columns it names.
 */
interface Captured {
  sql: string
  args: unknown[]
}

function makeDB(firstResults: unknown[] = []): { env: Env; calls: Captured[] } {
  const calls: Captured[] = []
  const queue = [...firstResults]
  const db = {
    prepare(sql: string) {
      const cap: Captured = { sql, args: [] }
      const stmt = {
        bind(...args: unknown[]) {
          cap.args = args
          return stmt
        },
        async first() {
          calls.push(cap)
          return queue.length ? queue.shift() : null
        },
        async run() {
          calls.push(cap)
          return { success: true }
        },
        async all() {
          calls.push(cap)
          return { results: [] }
        },
      }
      return stmt
    },
  }
  return { env: { DB: db as unknown as Env['DB'], RATE_LIMIT_SALT: 'salt' }, calls }
}

describe('getLocationBySlug', () => {
  it('parses the JSON text columns back into objects', async () => {
    const { env } = makeDB([
      {
        slug: 'ely-minnesota',
        lat: 47.9,
        lng: -91.8,
        display_name: 'Ely, Minnesota',
        weather_baseline: '{"boundingBox":[1,2,3,4]}',
        things_to_do: '[{"name":"BWCA"}]',
        last_refreshed: '2026-07-18T00:00:00Z',
      },
    ])
    const row = await getLocationBySlug(env, 'ely-minnesota')
    expect(row?.things_to_do).toEqual([{ name: 'BWCA' }])
    expect(row?.weather_baseline).toEqual({ boundingBox: [1, 2, 3, 4] })
  })

  it('returns null when there is no row', async () => {
    const { env } = makeDB([])
    expect(await getLocationBySlug(env, 'nowhere')).toBeNull()
  })

  it('defaults things_to_do to [] when the column is null', async () => {
    const { env } = makeDB([
      { slug: 's', lat: 0, lng: 0, display_name: 'X', weather_baseline: null, things_to_do: null },
    ])
    const row = await getLocationBySlug(env, 's')
    expect(row?.things_to_do).toEqual([])
    expect(row?.weather_baseline).toBeNull()
  })
})

describe('upsertLocation', () => {
  it('serializes the JSON columns and upserts on the slug', async () => {
    const { env, calls } = makeDB()
    await upsertLocation(env, {
      slug: 'ely-minnesota',
      lat: 47.9,
      lng: -91.8,
      display_name: 'Ely, Minnesota',
      things_to_do: [{ name: 'BWCA' }],
      weather_baseline: { boundingBox: [1, 2, 3, 4] },
    })
    const call = calls[0]
    expect(call.sql).toContain('ON CONFLICT(slug) DO UPDATE')
    // things_to_do and weather_baseline are stored as JSON strings, not objects.
    expect(call.args).toContain('[{"name":"BWCA"}]')
    expect(call.args).toContain('{"boundingBox":[1,2,3,4]}')
  })
})

describe('place details cache', () => {
  it('parses detail JSON on read', async () => {
    const { env } = makeDB([{ place_id: 'p1', detail: '{"rating":4.5}', last_refreshed: 't' }])
    const row = await getPlaceDetailCache(env, 'p1')
    expect(row?.detail).toEqual({ rating: 4.5 })
  })

  it('serializes detail on write', async () => {
    const { env, calls } = makeDB()
    await upsertPlaceDetailCache(env, { place_id: 'p1', detail: { rating: 4.5 } })
    expect(calls[0].args).toContain('{"rating":4.5}')
    expect(calls[0].sql).toContain('ON CONFLICT(place_id) DO UPDATE')
  })
})

describe('interest places cache', () => {
  it('parses places and queries on read', async () => {
    const { env } = makeDB([
      { cache_key: 'k', places: '[{"name":"Guide"}]', queries: '["fishing guide"]', last_refreshed: 't' },
    ])
    const row = await getInterestPlacesCache(env, 'k')
    expect(row?.places).toEqual([{ name: 'Guide' }])
    expect(row?.queries).toEqual(['fishing guide'])
  })

  it('serializes places and queries on write', async () => {
    const { env, calls } = makeDB()
    await upsertInterestPlacesCache(env, { cache_key: 'k', places: [{ name: 'Guide' }], queries: ['fishing guide'] })
    expect(calls[0].args).toContain('[{"name":"Guide"}]')
    expect(calls[0].args).toContain('["fishing guide"]')
  })
})

describe('rate-limit helpers', () => {
  it('returns the COUNT from the query', async () => {
    const { env, calls } = makeDB([{ n: 3 }])
    expect(await countRecentRequests(env, 'h1', '2026-07-18T01:00:00Z')).toBe(3)
    expect(calls[0].sql).toContain('COUNT(*)')
    expect(calls[0].args).toEqual(['h1', '2026-07-18T01:00:00Z'])
  })

  it('defaults to 0 when the count row is missing', async () => {
    const { env } = makeDB([])
    expect(await countRecentRequests(env, 'h1', 't')).toBe(0)
  })

  it('inserts a request-log row', async () => {
    const { env, calls } = makeDB()
    await insertRequestLog(env, 'h1', 'location')
    expect(calls[0].sql).toContain('INSERT INTO request_log')
    expect(calls[0].args.slice(0, 2)).toEqual(['h1', 'location'])
  })
})

describe('trips', () => {
  it('generates an id and created_at, and returns the new trip', async () => {
    const { env, calls } = makeDB()
    const trip = await createTrip(env, { location_slug: 'ely-minnesota', itinerary: [], design_style: 'chronicle' })
    expect(trip.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(trip.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(trip.location_slug).toBe('ely-minnesota')
    // itinerary is serialized in the INSERT bindings.
    expect(calls[0].args).toContain('[]')
  })

  it('parses the itinerary JSON on read', async () => {
    const { env } = makeDB([
      {
        id: 't1',
        location_slug: 's',
        itinerary: '[{"day":1}]',
        design_style: 'chronicle',
        created_at: 't',
        trip_length_days: 3,
        start_date: null,
      },
    ])
    const trip = await getTrip(env, 't1')
    expect(trip?.itinerary).toEqual([{ day: 1 }])
    expect(trip?.trip_length_days).toBe(3)
  })

  it('updates only the columns named in the patch', async () => {
    const readBack = {
      id: 't1',
      location_slug: 's',
      itinerary: '[{"day":1}]',
      design_style: 'chronicle',
      created_at: 't',
      trip_length_days: null,
      start_date: null,
    }
    const { env, calls } = makeDB([readBack])
    await updateTrip(env, 't1', { itinerary: [{ day: 1 }] })
    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE trips'))
    expect(updateCall?.sql).toContain('itinerary = ?')
    expect(updateCall?.sql).not.toContain('design_style = ?')
    expect(updateCall?.sql).not.toContain('start_date = ?')
  })

  it('runs no UPDATE when the patch is empty, but still returns the row', async () => {
    const readBack = {
      id: 't1',
      location_slug: 's',
      itinerary: '[]',
      design_style: 'chronicle',
      created_at: 't',
      trip_length_days: null,
      start_date: null,
    }
    const { env, calls } = makeDB([readBack])
    const trip = await updateTrip(env, 't1', {})
    expect(calls.some((c) => c.sql.startsWith('UPDATE trips'))).toBe(false)
    expect(trip.id).toBe('t1')
  })

  it('throws if the trip vanishes before the read-back', async () => {
    const { env } = makeDB([]) // getTrip returns null
    await expect(updateTrip(env, 'gone', { design_style: 'bento' })).rejects.toThrow('not found')
  })
})
