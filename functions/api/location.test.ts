import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './location'
import { logger } from '../../src/lib/logger'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  RATE_LIMIT_SALT: 'salt',
  TRIPADVISOR_API_KEY: 'ta-key',
  GOOGLE_PLACES_API_KEY: 'gp-key',
}

function req(url: string, ip = '203.0.113.5') {
  return new Request(url, { headers: { 'CF-Connecting-IP': ip } })
}

describe('GET /api/location', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing query', async () => {
    const res = await onRequestGet({ env, request: req('https://x/api/location') } as never)
    expect(res.status).toBe(400)
  })

  it('returns the cached payload on a cache hit without calling external APIs', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              slug: 'dublin-ireland',
              lat: 53.35,
              lng: -6.26,
              display_name: 'Dublin, Ireland',
              things_to_do: [
                { name: 'Trinity College', category: 'attraction', source: 'tripadvisor' },
                { name: 'The Ivy', category: 'restaurant', source: 'places', lat: 53.34, lng: -6.26 },
              ],
            },
          ],
        })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Dublin') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toBe('dublin-ireland')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('tripadvisor'))).toBe(false)
  })

  it('refreshes instead of trusting a cached row with zero things-to-do', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/locations') && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { slug: 'yellowstone-demo', lat: 44.6, lng: -110.5, display_name: 'Yellowstone', things_to_do: [] },
          ],
        })
      }
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      if (url.includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/1' }), json: async () => [] })
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '44.6', lon: '-110.5', display_name: 'Yellowstone National Park, USA' }],
        })
      }
      if (url.includes('tripadvisor.com')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.includes('googleapis.com')) return Promise.resolve({ ok: true, json: async () => ({ results: [] }) })
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Yellowstone') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('refreshes a cached row whose places-sourced entries predate per-item coordinate capture', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/locations') && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              slug: 'barcelona-spain',
              lat: 41.38,
              lng: 2.17,
              display_name: 'Barcelona, Spain',
              // Real, non-empty things-to-do — but the places-sourced entry
              // has no lat/lng, meaning it was cached before coordinate
              // capture existed. This should still trigger a refresh.
              things_to_do: [{ name: 'Casa Batlló', category: 'tourist_attraction', source: 'places' }],
            },
          ],
        })
      }
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      if (url.includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/1' }), json: async () => [] })
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '41.38', lon: '2.17', display_name: 'Barcelona, Spain' }],
        })
      }
      if (url.includes('tripadvisor.com')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.includes('googleapis.com')) return Promise.resolve({ ok: true, json: async () => ({ results: [] }) })
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Barcelona') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('refreshes a cached row that has no restaurant (predates the restaurant search) so meals can be scheduled', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/locations') && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              slug: 'rome-italy',
              lat: 41.9,
              lng: 12.5,
              display_name: 'Rome, Italy',
              // Attractions only, all with coords — but no restaurant, so it
              // predates the restaurant search and should refresh.
              things_to_do: [{ name: 'Colosseum', category: 'tourist_attraction', source: 'places', lat: 41.89, lng: 12.49 }],
            },
          ],
        })
      }
      if (url.includes('/rest/v1/locations')) return Promise.resolve({ ok: true, json: async () => ({}) })
      if (url.includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/1' }), json: async () => [] })
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return Promise.resolve({ ok: true, json: async () => [{ lat: '41.9', lon: '12.5', display_name: 'Rome, Italy' }] })
      }
      if (url.includes('tripadvisor.com')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (url.includes('googleapis.com')) return Promise.resolve({ ok: true, json: async () => ({ results: [] }) })
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Rome') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(true)
  })

  it('does not refresh a cached row whose places-sourced entries already have coordinates', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              slug: 'prague-czechia',
              lat: 50.08,
              lng: 14.44,
              display_name: 'Prague, Czechia',
              things_to_do: [
                { name: 'Charles Bridge', category: 'tourist_attraction', source: 'places', lat: 50.09, lng: 14.41 },
                { name: 'Lokal', category: 'restaurant', source: 'places', lat: 50.09, lng: 14.42 },
              ],
            },
          ],
        })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Prague') } as never)
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('nominatim.openstreetmap.org'))).toBe(false)
  })

  it('returns 429 when the rate limit is exceeded on a cache miss', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/rest/v1/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/25' }), json: async () => [] })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Nowhereville') } as never)
    expect(res.status).toBe(429)
  })

  it('returns 500 with a clean error body and logs when the Supabase lookup fails', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Dublin') } as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})
