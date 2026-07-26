import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './experiences'
import { fakeD1 } from '../lib/testD1'
import type { ThingToDo } from '../lib/mergeThingsToDo'
import {
  buildViatorDestinationsCacheKey,
  buildViatorExperiencesCacheKey,
  VIATOR_DEFAULT_CURRENCY,
} from '../lib/viator'

/** Builds an env whose rate-limit COUNT returns `recent`, with optional caches. */
function mkEnv(
  opts: {
    recent?: number
    viatorKey?: string | undefined
    destinations?: unknown[] | null
    destinationsRefreshed?: string
    cacheExperiences?: ThingToDo[] | null
    experiencesRefreshed?: string
    experiencesCacheKey?: string
    failDb?: boolean
  } = {},
) {
  const extraEnv: Record<string, unknown> = {
    VIATOR_PARTNER_ID: 'P00045135',
  }
  if ('viatorKey' in opts) {
    if (opts.viatorKey !== undefined) extraEnv.VIATOR_API_KEY = opts.viatorKey
  } else {
    extraEnv.VIATOR_API_KEY = 'viator-test-key'
  }

  const destKey = buildViatorDestinationsCacheKey()
  // partnerId is part of the key (rotating VIATOR_PARTNER_ID must not serve
  // 24h of URLs still tagged with the previous pid).
  const expKey =
    opts.experiencesCacheKey ??
    buildViatorExperiencesCacheKey('334', VIATOR_DEFAULT_CURRENCY, 'P00045135')

  return fakeD1({
    fail: opts.failDb,
    first: (sql) => {
      if (sql.includes('COUNT(*)')) return { n: opts.recent ?? 1 }
      if (sql.includes('FROM viator_destinations_cache')) {
        if (opts.destinations == null) return null
        return {
          cache_key: destKey,
          destinations: JSON.stringify(opts.destinations),
          last_refreshed: opts.destinationsRefreshed ?? new Date().toISOString(),
        }
      }
      if (sql.includes('FROM viator_experiences_cache')) {
        if (opts.cacheExperiences == null) return null
        return {
          cache_key: expKey,
          experiences: JSON.stringify(opts.cacheExperiences),
          last_refreshed: opts.experiencesRefreshed ?? new Date().toISOString(),
        }
      }
      return null
    },
    extraEnv,
  })
}

function post(body: unknown, env: ReturnType<typeof mkEnv>['env']) {
  return onRequestPost({
    env: env as never,
    request: new Request('https://x/api/experiences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.50',
      },
      body: JSON.stringify(body),
    }),
  })
}

/** Tokyo centre — pairs with destination id 334 in live-path mocks. */
const validBody = { lat: 35.68, lng: 139.76 }

const TOKYO_DEST = {
  destinationId: 334,
  name: 'Tokyo',
  type: 'CITY',
  center: { latitude: 35.68, longitude: 139.76 },
}

const cachedItem: ThingToDo = {
  name: 'Tokyo Sushi Class',
  category: 'experience',
  source: 'viator',
  lat: 35.68,
  lng: 139.76,
  productCode: 'SUSHI1',
  priceFrom: 89,
  currency: 'USD',
  durationMinutes: 120,
  bookingUrl: 'https://www.viator.com/tours/Tokyo/Sushi/d334-SUSHI1?pid=P00045135&medium=api',
}

describe('POST /api/experiences', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing lat/lng', async () => {
    const { env } = mkEnv()
    const res = await post({}, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 for an out-of-range latitude', async () => {
    const { env } = mkEnv()
    const res = await post({ lat: 200, lng: 2 }, env)
    expect(res.status).toBe(400)
  })

  it('returns 200 with an empty list when VIATOR_API_KEY is missing', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('must not call Viator without a key')
    })
    vi.stubGlobal('fetch', fetchMock)
    // Destinations not cached → miss path → rate limit → missing key → empty 200.
    const { env, calls } = mkEnv({ viatorKey: undefined, destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(calls.some((c) => c.sql.includes('COUNT(*)'))).toBe(true)
  })

  it('returns a cache hit without calling fetch and without consuming rate limit', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('must not call Viator on cache hit')
    })
    vi.stubGlobal('fetch', fetchMock)
    const { env, calls } = mkEnv({
      destinations: [TOKYO_DEST],
      cacheExperiences: [cachedItem],
      experiencesCacheKey: buildViatorExperiencesCacheKey('334', 'USD', 'P00045135'),
      recent: 0,
    })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { experiences: ThingToDo[]; cached?: boolean }
    expect(body.cached).toBe(true)
    expect(body.experiences).toEqual([cachedItem])
    expect(fetchMock).not.toHaveBeenCalled()
    // Cache-before-rate-limit: no COUNT(*) and no INSERT into request_log.
    expect(calls.some((c) => c.sql.includes('COUNT(*)'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO request_log'))).toBe(false)
  })

  it('rate-limits past the hourly cap on a cache miss', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('must not call Viator when rate-limited')
      }),
    )
    const { env } = mkEnv({ recent: 9999, destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(429)
  })

  it('returns live experiences and writes the cache on a miss', async () => {
    const localRef = 'LOC-tokyo-sushi'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/destinations')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ destinations: [TOKYO_DEST] }),
          }
        }
        if (url.includes('/products/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              products: [
                {
                  productCode: 'SUSHI1',
                  title: 'Tokyo Sushi Class',
                  productUrl: cachedItem.bookingUrl,
                  duration: { fixedDurationInMinutes: 120 },
                  pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
                },
              ],
              totalCount: 1,
            }),
          }
        }
        if (url.includes('/products/SUSHI1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              productCode: 'SUSHI1',
              title: 'Tokyo Sushi Class',
              productUrl: cachedItem.bookingUrl,
              duration: { fixedDurationInMinutes: 120 },
              pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
              logistics: { start: [{ location: { ref: localRef } }] },
            }),
          }
        }
        if (url.includes('/locations/bulk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              locations: [
                {
                  provider: 'TRIPADVISOR',
                  reference: localRef,
                  name: 'Tsukiji',
                  center: { latitude: 35.6654, longitude: 139.7707 },
                },
              ],
            }),
          }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const { env, calls } = mkEnv({ destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { experiences: ThingToDo[]; cached?: boolean }
    expect(body.cached).toBeUndefined()
    expect(body.experiences).toHaveLength(1)
    expect(body.experiences[0].name).toBe('Tokyo Sushi Class')
    expect(body.experiences[0].source).toBe('viator')
    expect(body.experiences[0].priceFrom).toBe(89)
    expect(body.experiences[0].durationMinutes).toBe(120)
    expect(calls.some((c) => c.sql.includes('INSERT INTO viator_destinations_cache'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO viator_experiences_cache'))).toBe(true)
  })

  it('returns empty when no destination is within range (honest rural gap)', async () => {
    // Ely coordinates, destinations only far away — no free-text Alaska/Finland path.
    const { env } = mkEnv({
      destinations: [
        {
          destinationId: 1,
          name: 'Juneau',
          type: 'CITY',
          center: { latitude: 58.3019, longitude: -134.4197 },
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('must not call Viator when no nearby destination')
      }),
    )
    const res = await post({ lat: 47.9032, lng: -91.8671 }, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
  })

  it('fails soft to an empty list when Viator fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { env } = mkEnv({ destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
  })

  it('does NOT write the experiences cache when upstream search fails (no permanent poison)', async () => {
    // DEFECT 1 regression: a single Viator 500/429 used to write [] into D1,
    // and every later request hit that empty row forever. Transient failure
    // must return 200 + [] without caching — same rule as interest-places.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/destinations')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ destinations: [TOKYO_DEST] }),
          }
        }
        if (url.includes('/products/search')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: 'internal error' }),
          }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const { env, calls } = mkEnv({ destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
    expect(calls.some((c) => c.sql.includes('INSERT INTO viator_experiences_cache'))).toBe(false)
  })

  it('DOES write the experiences cache when a successful search is genuinely empty', async () => {
    // DEFECT 1 regression (positive half): a real empty answer is stable and
    // should be cached so we do not re-hit products/search on every page view.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/destinations')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ destinations: [TOKYO_DEST] }),
          }
        }
        if (url.includes('/products/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ products: [], totalCount: 0 }),
          }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const { env, calls } = mkEnv({ destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
    const write = calls.find((c) => c.sql.includes('INSERT INTO viator_experiences_cache'))
    expect(write).toBeDefined()
    expect(write!.args).toContain('[]')
  })

  it('treats a stale experiences cache row as a miss (24h TTL)', async () => {
    // DEFECT 3 regression: without a TTL, prices/availability freeze forever
    // after one write. A row older than EXPERIENCES_CACHE_TTL_MS must re-fetch.
    const staleIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const localRef = 'LOC-tokyo-sushi'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/products/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            products: [
              {
                productCode: 'SUSHI1',
                title: 'Tokyo Sushi Class',
                productUrl: cachedItem.bookingUrl,
                duration: { fixedDurationInMinutes: 120 },
                pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
              },
            ],
            totalCount: 1,
          }),
        }
      }
      if (url.includes('/products/SUSHI1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productCode: 'SUSHI1',
            title: 'Tokyo Sushi Class',
            productUrl: cachedItem.bookingUrl,
            duration: { fixedDurationInMinutes: 120 },
            pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
            logistics: { start: [{ location: { ref: localRef } }] },
          }),
        }
      }
      if (url.includes('/locations/bulk')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            locations: [
              {
                provider: 'TRIPADVISOR',
                reference: localRef,
                name: 'Tsukiji',
                center: { latitude: 35.6654, longitude: 139.7707 },
              },
            ],
          }),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { env, calls } = mkEnv({
      destinations: [TOKYO_DEST],
      cacheExperiences: [cachedItem],
      experiencesRefreshed: staleIso,
      experiencesCacheKey: buildViatorExperiencesCacheKey('334', 'USD', 'P00045135'),
    })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { experiences: ThingToDo[]; cached?: boolean }
    // Not a cache hit — live path ran.
    expect(body.cached).toBeUndefined()
    expect(body.experiences).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalled()
    expect(calls.some((c) => c.sql.includes('INSERT INTO viator_experiences_cache'))).toBe(true)
  })

  it('does NOT write the experiences cache when /locations/bulk fails (enrichment outage)', async () => {
    // DEFECT 1 incomplete fix: search succeeded, every product was dropped at
    // !resolved because bulk returned non-200, and ok:true [] was cached for
    // 24h — silently disabled experiences for that destination for a day.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/destinations')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ destinations: [TOKYO_DEST] }),
          }
        }
        if (url.includes('/products/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              products: [
                {
                  productCode: 'SUSHI1',
                  title: 'Tokyo Sushi Class',
                  productUrl: cachedItem.bookingUrl,
                  duration: { fixedDurationInMinutes: 120 },
                  pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
                },
              ],
              totalCount: 1,
            }),
          }
        }
        if (url.includes('/products/SUSHI1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              productCode: 'SUSHI1',
              title: 'Tokyo Sushi Class',
              productUrl: cachedItem.bookingUrl,
              duration: { fixedDurationInMinutes: 120 },
              pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
              logistics: { start: [{ location: { ref: 'LOC-tokyo-sushi' } }] },
            }),
          }
        }
        if (url.includes('/locations/bulk')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ message: 'bulk unavailable' }),
          }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const { env, calls } = mkEnv({ destinations: null })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ experiences: [] })
    expect(calls.some((c) => c.sql.includes('INSERT INTO viator_experiences_cache'))).toBe(false)
  })

  it('treats a destinations cache row that fails Zod validation as a miss', async () => {
    // DEFECT 4: cast without re-validation let corrupt cached destinations
    // reach findNearestDestination. A failing row must be a cache miss so the
    // live path can re-fetch a trustworthy taxonomy.
    const localRef = 'LOC-tokyo-sushi'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/destinations')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ destinations: [TOKYO_DEST] }),
        }
      }
      if (url.includes('/products/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            products: [
              {
                productCode: 'SUSHI1',
                title: 'Tokyo Sushi Class',
                productUrl: cachedItem.bookingUrl,
                duration: { fixedDurationInMinutes: 120 },
                pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
              },
            ],
            totalCount: 1,
          }),
        }
      }
      if (url.includes('/products/SUSHI1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            productCode: 'SUSHI1',
            title: 'Tokyo Sushi Class',
            productUrl: cachedItem.bookingUrl,
            duration: { fixedDurationInMinutes: 120 },
            pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
            logistics: { start: [{ location: { ref: localRef } }] },
          }),
        }
      }
      if (url.includes('/locations/bulk')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            locations: [
              {
                provider: 'TRIPADVISOR',
                reference: localRef,
                name: 'Tsukiji',
                center: { latitude: 35.6654, longitude: 139.7707 },
              },
            ],
          }),
        }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { env } = mkEnv({
      destinations: [
        {
          destinationId: 1,
          name: 'Corrupt',
          // Invalid center type — Zod must reject; cast used to let this through.
          center: { latitude: 'not-a-number', longitude: 139.76 },
        },
      ],
    })
    const res = await post(validBody, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { experiences: ThingToDo[]; cached?: boolean }
    expect(body.cached).toBeUndefined()
    expect(body.experiences).toHaveLength(1)
    // Live destinations fetch ran because the corrupt cache row was a miss.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/destinations'))).toBe(true)
  })
})
