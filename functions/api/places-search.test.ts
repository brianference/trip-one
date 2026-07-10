import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './places-search'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_LIMIT_SALT: 's', GOOGLE_PLACES_API_KEY: 'gp' }

function req(url: string) {
  return new Request(url, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })
}

describe('GET /api/places-search', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns real matching places for a valid query', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/1' }), json: async () => [] })
      }
      if (String(url).includes('/textsearch/json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [{ place_id: 's1', name: 'Sushi Saito', types: ['restaurant'], rating: 4.9, geometry: { location: { lat: 35.6, lng: 139.7 } } }] }),
        })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({ env, request: req('https://x/api/places-search?q=sushi&lat=35.68&lng=139.76') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.places[0].name).toBe('Sushi Saito')
  })

  it('rejects a missing query', async () => {
    const res = await onRequestGet({ env, request: req('https://x/api/places-search?lat=1&lng=2') } as never)
    expect(res.status).toBe(400)
  })

  it('rejects an out-of-range latitude', async () => {
    const res = await onRequestGet({ env, request: req('https://x/api/places-search?q=sushi&lat=200&lng=2') } as never)
    expect(res.status).toBe(400)
  })

  it('500s when the API key is not configured', async () => {
    const res = await onRequestGet({ env: { ...env, GOOGLE_PLACES_API_KEY: undefined }, request: req('https://x/api/places-search?q=sushi&lat=1&lng=2') } as never)
    expect(res.status).toBe(500)
  })

  it('rate-limits past the hourly cap', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/9999' }), json: async () => [] })
      }
      throw new Error('must not call Google when rate-limited')
    })
    const res = await onRequestGet({ env, request: req('https://x/api/places-search?q=sushi&lat=1&lng=2') } as never)
    expect(res.status).toBe(429)
  })
})
