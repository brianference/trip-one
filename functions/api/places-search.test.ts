import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './places-search'
import { fakeD1 } from '../lib/testD1'

/** Builds an env whose rate-limit COUNT returns `recent`, with the given API keys. */
function mkEnv(opts: { recent?: number; google?: string | undefined; tripadvisor?: string } = {}) {
  const extraEnv: Record<string, unknown> = { GOOGLE_PLACES_API_KEY: 'google' in opts ? opts.google : 'gp' }
  if (opts.tripadvisor) extraEnv.TRIPADVISOR_API_KEY = opts.tripadvisor
  return fakeD1({
    first: (sql) => (sql.includes('COUNT(*)') ? { n: opts.recent ?? 1 } : null),
    extraEnv,
  }).env
}

function req(url: string) {
  return new Request(url, { headers: { 'CF-Connecting-IP': '203.0.113.9' } })
}

describe('GET /api/places-search', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns real matching places for a valid query', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/textsearch/json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [{ place_id: 's1', name: 'Sushi Saito', types: ['restaurant'], rating: 4.9, geometry: { location: { lat: 35.6, lng: 139.7 } } }] }),
        })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({ env: mkEnv(), request: req('https://x/api/places-search?q=sushi&lat=35.68&lng=139.76') } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).places[0].name).toBe('Sushi Saito')
  })

  it('falls back to Tripadvisor when Google returns few results', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      const u = String(url)
      if (u.includes('/textsearch/json')) return Promise.resolve({ ok: true, json: async () => ({ results: [] }) })
      if (u.includes('tripadvisor.com') && u.includes('/location/search')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [{ location_id: '42', name: 'Space Expo' }] }) })
      }
      if (u.includes('tripadvisor.com') && u.includes('/location/42/details')) {
        return Promise.resolve({ ok: true, json: async () => ({ latitude: '52.24', longitude: '4.47', rating: '4.1', category: { name: 'museum' } }) })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({
      env: mkEnv({ tripadvisor: 'ta' }),
      request: req('https://x/api/places-search?q=space%20museum&lat=52.1&lng=5.2'),
    } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).places.map((p: { name: string }) => p.name)).toContain('Space Expo')
  })

  it('rejects a missing query', async () => {
    const res = await onRequestGet({ env: mkEnv(), request: req('https://x/api/places-search?lat=1&lng=2') } as never)
    expect(res.status).toBe(400)
  })

  it('rejects an out-of-range latitude', async () => {
    const res = await onRequestGet({ env: mkEnv(), request: req('https://x/api/places-search?q=sushi&lat=200&lng=2') } as never)
    expect(res.status).toBe(400)
  })

  it('500s when the API key is not configured', async () => {
    const res = await onRequestGet({ env: mkEnv({ google: undefined }), request: req('https://x/api/places-search?q=sushi&lat=1&lng=2') } as never)
    expect(res.status).toBe(500)
  })

  it('rate-limits past the hourly cap', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('must not call Google when rate-limited')
    })
    const res = await onRequestGet({ env: mkEnv({ recent: 9999 }), request: req('https://x/api/places-search?q=sushi&lat=1&lng=2') } as never)
    expect(res.status).toBe(429)
  })
})
