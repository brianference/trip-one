import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './location'
import { logger } from '../../src/lib/logger'
import { fakeD1, type FakeD1Config } from '../lib/testD1'

const API_KEYS = { TRIPADVISOR_API_KEY: 'ta-key', GOOGLE_PLACES_API_KEY: 'gp-key' }

function req(url: string, ip = '203.0.113.5') {
  return new Request(url, { headers: { 'CF-Connecting-IP': ip } })
}

/** A D1 env whose location lookup returns `cachedRow` (a D1-shaped row or null) and COUNT returns `recent`. */
function locEnv(cachedRow: Record<string, unknown> | null, recent = 1, extra: Partial<FakeD1Config> = {}) {
  return fakeD1({
    first: (sql) => {
      if (sql.includes('FROM locations')) return cachedRow
      if (sql.includes('COUNT(*)')) return { n: recent }
      return null
    },
    extraEnv: API_KEYS,
    ...extra,
  }).env
}

/** A D1-shaped cached location row: things_to_do stored as JSON TEXT, as D1 returns it. */
function cachedLocation(slug: string, thingsToDo: unknown[], extra: Record<string, unknown> = {}) {
  return {
    slug,
    lat: 0,
    lng: 0,
    display_name: slug,
    weather_baseline: null,
    things_to_do: JSON.stringify(thingsToDo),
    last_refreshed: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

/** A fetch mock covering ONLY the external APIs (the DB no longer goes through fetch). */
function externalFetch(googleResults: unknown[] = []) {
  return vi.fn((url: string) => {
    if (url.includes('nominatim.openstreetmap.org')) {
      return Promise.resolve({ ok: true, json: async () => [{ lat: '10', lon: '20', display_name: 'Somewhere' }] })
    }
    if (url.includes('tripadvisor.com')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    if (url.includes('googleapis.com')) return Promise.resolve({ ok: true, json: async () => ({ results: googleResults }) })
    throw new Error(`unexpected fetch to ${url}`)
  })
}

describe('GET /api/location', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing query', async () => {
    const res = await onRequestGet({ env: locEnv(null), request: req('https://x/api/location') } as never)
    expect(res.status).toBe(400)
  })

  it('returns the cached payload on a cache hit without calling external APIs', async () => {
    const fetchMock = externalFetch()
    vi.stubGlobal('fetch', fetchMock)
    const env = locEnv(
      cachedLocation('dublin-ireland', [
        { name: 'Trinity College', category: 'attraction', source: 'tripadvisor' },
        { name: 'The Ivy', category: 'restaurant', source: 'places', lat: 53.34, lng: -6.26 },
      ]),
    )
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Dublin') } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).slug).toBe('dublin-ireland')
    // Nothing external is called on a cache hit.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes instead of trusting a cached row with zero things-to-do', async () => {
    const fetchMock = externalFetch()
    vi.stubGlobal('fetch', fetchMock)
    const env = locEnv(cachedLocation('yellowstone-demo', []))
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Yellowstone') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('refreshes a cached row whose places-sourced entries predate per-item coordinate capture', async () => {
    const fetchMock = externalFetch()
    vi.stubGlobal('fetch', fetchMock)
    // Real, non-empty things-to-do, but the places entry has no lat/lng.
    const env = locEnv(
      cachedLocation('barcelona-spain', [{ name: 'Casa Batlló', category: 'tourist_attraction', source: 'places' }]),
    )
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Barcelona') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('refreshes a cached row that has no restaurant so meals can be scheduled', async () => {
    const fetchMock = externalFetch()
    vi.stubGlobal('fetch', fetchMock)
    const env = locEnv(
      cachedLocation('rome-italy', [
        { name: 'Colosseum', category: 'tourist_attraction', source: 'places', lat: 41.89, lng: 12.49 },
      ]),
    )
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Rome') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('refreshes a cached row whose place names are mojibake, and drops corrupt names from the fresh result', async () => {
    const fetchMock = externalFetch([
      { name: 'Family Li Imperial Cuisine', types: ['restaurant'], place_id: 'a', geometry: { location: { lat: 39.91, lng: 116.42 } } },
      { name: '天\uDC9D厅', types: ['restaurant'], place_id: 'b', geometry: { location: { lat: 39.88, lng: 116.4 } } },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const env = locEnv(
      cachedLocation('beijing-china', [
        { name: '交泰殿', category: 'tourist_attraction', source: 'places', lat: 39.92, lng: 116.39 },
        { name: '故宫\uDC8D物院', category: 'restaurant', source: 'places', lat: 39.91, lng: 116.39 },
      ]),
    )
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Beijing') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
    const names = (await res.json()).thingsToDo.map((t: { name: string }) => t.name)
    expect(names).toContain('Family Li Imperial Cuisine')
    expect(names.some((n: string) => [...n].some((c) => c.charCodeAt(0) >= 0xdc00 && c.charCodeAt(0) <= 0xdfff))).toBe(false)
  })

  it('does not refresh a cached row whose places-sourced entries already have coordinates', async () => {
    const fetchMock = externalFetch()
    vi.stubGlobal('fetch', fetchMock)
    const env = locEnv(
      cachedLocation('prague-czechia', [
        { name: 'Charles Bridge', category: 'tourist_attraction', source: 'places', lat: 50.09, lng: 14.41 },
        { name: 'Lokal', category: 'restaurant', source: 'places', lat: 50.09, lng: 14.42 },
      ]),
    )
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Prague') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 429 when the rate limit is exceeded on a cache miss', async () => {
    vi.stubGlobal('fetch', externalFetch())
    // Cache miss (null) + 250 recent requests, over the 200/hr cap.
    const env = locEnv(null, 250)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Nowhereville') } as never)
    expect(res.status).toBe(429)
  })

  it('returns 500 with a clean error body and logs when the database lookup fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const env = fakeD1({ fail: true, extraEnv: API_KEYS }).env
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Dublin') } as never)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBeDefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})
