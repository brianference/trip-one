import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  searchViatorExperiences,
  durationMinutesFromProduct,
  findNearestDestination,
  fetchViatorDestinations,
  resolveExperienceCoordinates,
  extractLocationRefs,
  parseViatorDestinationsList,
  buildViatorExperiencesCacheKey,
  resolveViatorApiBase,
  VIATOR_MAX_DESTINATION_KM,
  VIATOR_RESULT_LIMIT,
  VIATOR_SEARCH_OVERFETCH,
  VIATOR_MAX_DETAIL_CALLS,
  VIATOR_API_BASE,
  VIATOR_ACCEPT_HEADER,
  type ViatorDestination,
} from './viator'
import { distanceKm } from './places'
import { logger } from '../../src/lib/logger'

/** Sandbox Partner API base — only sandbox keys authenticate here. */
const SANDBOX_API_BASE = 'https://api.sandbox.viator.com/partner'

/** Ely, Minnesota — free-text search returned Alaska and Finland for this pin. */
const ELY_LAT = 47.9032
const ELY_LNG = -91.8671

/** Juneau, Alaska — must NOT match as nearest destination for Ely. */
const JUNEAU_LAT = 58.3019
const JUNEAU_LNG = -134.4197

/** Rovaniemi, Finland — same anti-case as Juneau for Ely. */
const ROVANIEMI_LAT = 66.5039
const ROVANIEMI_LNG = 25.7294

/** A local product pin near Ely (real coords for the experience itself). */
const LOCAL_LAT = 47.91
const LOCAL_LNG = -91.85

const LOCAL_REF = 'LOC-local-ely-start'
const MISSING_REF = 'LOC-missing-no-center'
/** Itinerary POI ref — the productive path measured on Tokyo products. */
const POI_REF = 'LOC-itinerary-poi'
/** Meeting-point start ref — usually GOOGLE and coordinate-less in production. */
const START_REF = 'LOC-logistics-start'

const BOOKING_URL =
  'https://www.viator.com/tours/Ely/Canoe-Day-Trip/d123-ABC123?mcid=42383&pid=P00045135&medium=api&api_version=2.0'

const DEST_ELY: ViatorDestination = {
  destinationId: 12345,
  name: 'Ely',
  type: 'CITY',
  center: { latitude: 47.903, longitude: -91.867 },
}

const DEST_JUNEAU: ViatorDestination = {
  destinationId: 99901,
  name: 'Juneau',
  type: 'CITY',
  center: { latitude: JUNEAU_LAT, longitude: JUNEAU_LNG },
}

const DEST_ROVANIEMI: ViatorDestination = {
  destinationId: 99902,
  name: 'Rovaniemi',
  type: 'CITY',
  center: { latitude: ROVANIEMI_LAT, longitude: ROVANIEMI_LNG },
}

function productSummary(overrides: Record<string, unknown> = {}) {
  return {
    productCode: 'ABC123',
    title: 'Boundary Waters Canoe Day Trip',
    description: 'A real day paddle out of Ely.',
    productUrl: BOOKING_URL,
    duration: { fixedDurationInMinutes: 360 },
    pricing: { summary: { fromPrice: 149 }, currency: 'USD' },
    reviews: { totalReviews: 42, combinedAverageRating: 4.8 },
    flags: ['FREE_CANCELLATION'],
    ...overrides,
  }
}

function productDetail(overrides: Record<string, unknown> = {}) {
  return {
    productCode: 'ABC123',
    title: 'Boundary Waters Canoe Day Trip',
    productUrl: BOOKING_URL,
    duration: { fixedDurationInMinutes: 360 },
    pricing: { summary: { fromPrice: 149 }, currency: 'USD' },
    reviews: { totalReviews: 42, combinedAverageRating: 4.8 },
    flags: ['FREE_CANCELLATION'],
    logistics: { start: [{ location: { ref: LOCAL_REF } }] },
    ...overrides,
  }
}

function locationsBulk(entries: Array<{ reference: string; lat?: number; lng?: number; name?: string }>) {
  return {
    locations: entries.map((e) => {
      const row: Record<string, unknown> = {
        provider: e.lat != null ? 'TRIPADVISOR' : 'GOOGLE',
        reference: e.reference,
      }
      if (e.name) row.name = e.name
      if (e.lat != null && e.lng != null) {
        row.center = { latitude: e.lat, longitude: e.lng }
      } else {
        row.providerReference = 'ChIJ-fake'
      }
      return row
    }),
  }
}

/**
 * Routes destinations, products/search, product detail, and locations/bulk.
 * Location refs are always resolved via a single bulk call in the happy path.
 */
function mockViatorFetch(opts: {
  destinations?: unknown
  destinationsStatus?: number
  search?: unknown
  searchStatus?: number
  locations?: unknown
  locationsStatus?: number
  detailByCode?: Record<string, unknown>
}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.includes('/destinations') && method === 'GET') {
      const status = opts.destinationsStatus ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => opts.destinations ?? { destinations: [] },
      }
    }

    if (url.includes('/products/search') && method === 'POST') {
      const status = opts.searchStatus ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => opts.search ?? { products: [], totalCount: 0 },
      }
    }

    if (url.includes('/locations/bulk') && method === 'POST') {
      const status = opts.locationsStatus ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => opts.locations ?? { locations: [] },
      }
    }

    const detailMatch = url.match(/\/products\/([^/?]+)$/)
    if (detailMatch && method === 'GET') {
      const code = decodeURIComponent(detailMatch[1])
      const body = opts.detailByCode?.[code]
      if (!body) return { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => body }
    }

    throw new Error(`unexpected fetch to ${url} (${method})`)
  })
}

describe('findNearestDestination', () => {
  it('picks the nearest destination within range', () => {
    const nearest = findNearestDestination([DEST_ELY, DEST_JUNEAU, DEST_ROVANIEMI], ELY_LAT, ELY_LNG)
    expect(nearest?.destinationId).toBe(DEST_ELY.destinationId)
    expect(nearest?.name).toBe('Ely')
  })

  it('returns null beyond the threshold (Ely must not match Juneau or Rovaniemi)', () => {
    // The live free-text failure: canoe search for Ely returned Alaska and Finland.
    // Destination-anchoring makes that structurally impossible when no local
    // destination is within VIATOR_MAX_DESTINATION_KM.
    expect(distanceKm(ELY_LAT, ELY_LNG, JUNEAU_LAT, JUNEAU_LNG)).toBeGreaterThan(VIATOR_MAX_DESTINATION_KM)
    expect(distanceKm(ELY_LAT, ELY_LNG, ROVANIEMI_LAT, ROVANIEMI_LNG)).toBeGreaterThan(
      VIATOR_MAX_DESTINATION_KM,
    )
    expect(distanceKm(ELY_LAT, ELY_LNG, JUNEAU_LAT, JUNEAU_LNG)).toBeGreaterThan(2000)

    const nearest = findNearestDestination([DEST_JUNEAU, DEST_ROVANIEMI], ELY_LAT, ELY_LNG)
    expect(nearest).toBeNull()
  })

  it('prefers CITY over a broad region when distances are comparable', () => {
    const region: ViatorDestination = {
      destinationId: 1,
      name: 'Minnesota Northwoods',
      type: 'REGION',
      center: { latitude: 47.9, longitude: -91.86 },
    }
    const city: ViatorDestination = {
      destinationId: 2,
      name: 'Ely',
      type: 'CITY',
      center: { latitude: 47.91, longitude: -91.87 },
    }
    const nearest = findNearestDestination([region, city], ELY_LAT, ELY_LNG)
    expect(nearest?.destinationId).toBe(2)
    expect(nearest?.type).toBe('CITY')
  })

  it('skips destinations with non-finite centers so a NaN pin never beats a real city', () => {
    // DEFECT 4: NaN > VIATOR_MAX_DESTINATION_KM is false, so a corrupt center
    // survived the range guard, sorted first, and beat real Juneau.
    const corruptNaN: ViatorDestination = {
      destinationId: 1,
      name: 'Corrupt NaN',
      type: 'CITY',
      center: { latitude: Number.NaN, longitude: Number.NaN },
    }
    const corruptOutOfRange: ViatorDestination = {
      destinationId: 2,
      name: 'Corrupt OOR',
      type: 'CITY',
      center: { latitude: 999, longitude: -134.4197 },
    }
    const nearest = findNearestDestination(
      [corruptNaN, corruptOutOfRange, DEST_JUNEAU],
      JUNEAU_LAT,
      JUNEAU_LNG,
    )
    expect(nearest?.destinationId).toBe(DEST_JUNEAU.destinationId)
    expect(nearest?.name).toBe('Juneau')
  })

  it('returns null when every destination has an invalid center', () => {
    const onlyCorrupt: ViatorDestination = {
      destinationId: 1,
      name: 'Broken',
      type: 'CITY',
      center: { latitude: Number.NaN, longitude: -91.867 },
    }
    expect(findNearestDestination([onlyCorrupt], ELY_LAT, ELY_LNG)).toBeNull()
  })
})

describe('parseViatorDestinationsList', () => {
  it('accepts a valid destinations array', () => {
    const list = parseViatorDestinationsList([DEST_ELY, DEST_JUNEAU])
    expect(list).toHaveLength(2)
    expect(list?.[0].name).toBe('Ely')
  })

  it('rejects a corrupt payload (treat as cache miss)', () => {
    // DEFECT 4: D1 used to cast without re-validation.
    expect(
      parseViatorDestinationsList([
        { destinationId: 1, name: 'Bad', center: { latitude: 'nope', longitude: 1 } },
      ]),
    ).toBeNull()
    expect(parseViatorDestinationsList({ not: 'an array' })).toBeNull()
    expect(parseViatorDestinationsList(null)).toBeNull()
  })
})

describe('buildViatorExperiencesCacheKey', () => {
  it('includes partnerId so rotating pid does not serve stale affiliate URLs', () => {
    const withPid = buildViatorExperiencesCacheKey('334', 'USD', 'P00045135')
    const otherPid = buildViatorExperiencesCacheKey('334', 'USD', 'P99999999')
    const noPid = buildViatorExperiencesCacheKey('334', 'USD')
    expect(withPid).toContain('P00045135')
    expect(withPid).not.toBe(otherPid)
    expect(withPid).not.toBe(noPid)
  })
})

describe('durationMinutesFromProduct', () => {
  it('uses fixed duration when present', () => {
    expect(durationMinutesFromProduct({ fixedDurationInMinutes: 180 })).toBe(180)
  })

  it('uses the UPPER bound of a variable duration range', () => {
    // Day plans budget for the worst case, not the best.
    expect(
      durationMinutesFromProduct({
        variableDurationFromMinutes: 60,
        variableDurationToMinutes: 240,
      }),
    ).toBe(240)
  })

  it('returns undefined when duration is absent (never fabricates)', () => {
    expect(durationMinutesFromProduct(undefined)).toBeUndefined()
    expect(durationMinutesFromProduct({})).toBeUndefined()
  })
})

describe('resolveViatorApiBase', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the production default when the override is absent or blank', () => {
    expect(resolveViatorApiBase(undefined)).toBe(VIATOR_API_BASE)
    expect(resolveViatorApiBase('')).toBe(VIATOR_API_BASE)
    expect(resolveViatorApiBase('   ')).toBe(VIATOR_API_BASE)
    // Production constant itself must stay the live partner host.
    expect(VIATOR_API_BASE).toBe('https://api.viator.com/partner')
  })

  it('accepts an https sandbox base and strips a trailing slash', () => {
    expect(resolveViatorApiBase(SANDBOX_API_BASE)).toBe(SANDBOX_API_BASE)
    expect(resolveViatorApiBase(`${SANDBOX_API_BASE}/`)).toBe(SANDBOX_API_BASE)
    expect(resolveViatorApiBase(`${SANDBOX_API_BASE}///`)).toBe(SANDBOX_API_BASE)
  })

  it('falls back to production for http:// or garbage without throwing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    expect(resolveViatorApiBase('http://api.sandbox.viator.com/partner')).toBe(VIATOR_API_BASE)
    expect(resolveViatorApiBase('not a url')).toBe(VIATOR_API_BASE)
    expect(resolveViatorApiBase('ftp://evil.example/partner')).toBe(VIATOR_API_BASE)
    expect(warn).toHaveBeenCalled()
    // Never log anything that looks like an API key from base resolution.
    for (const call of warn.mock.calls) {
      const payload = JSON.stringify(call)
      expect(payload).not.toMatch(/exp-api-key|VIATOR_API_KEY|test-key/i)
    }
  })
})

describe('fetchViatorDestinations', () => {
  afterEach(() => vi.restoreAllMocks())

  it('parses a destinations wrapper payload', async () => {
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({ destinations: { destinations: [DEST_ELY] } }),
    )
    const list = await fetchViatorDestinations('k')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Ely')
  })

  it('returns [] on non-200 without throwing', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', mockViatorFetch({ destinationsStatus: 503 }))
    await expect(fetchViatorDestinations('k')).resolves.toEqual([])
  })

  it('uses the production base when apiBase is omitted', async () => {
    const fetchMock = mockViatorFetch({ destinations: { destinations: [DEST_ELY] } })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViatorDestinations('k')
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${VIATOR_API_BASE}/destinations`)
  })

  it('uses a supplied sandbox base for /destinations', async () => {
    const fetchMock = mockViatorFetch({ destinations: { destinations: [DEST_ELY] } })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViatorDestinations('k', SANDBOX_API_BASE)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${SANDBOX_API_BASE}/destinations`)
  })
})

describe('searchViatorExperiences', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps a normal search to ThingToDo[] with real prices and durations', async () => {
    const fetchMock = mockViatorFetch({
      search: { products: [productSummary()], totalCount: 1 },
      detailByCode: { ABC123: productDetail() },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG, name: 'Ely put-in' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'test-key',
      partnerId: 'P00045135',
      currency: 'USD',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0]).toEqual({
      name: 'Boundary Waters Canoe Day Trip',
      category: 'experience',
      source: 'viator',
      lat: LOCAL_LAT,
      lng: LOCAL_LNG,
      address: 'Ely put-in',
      productCode: 'ABC123',
      priceFrom: 149,
      currency: 'USD',
      durationMinutes: 360,
      bookingUrl: BOOKING_URL,
      freeCancellation: true,
      rating: 4.8,
      numReviews: 42,
    })

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.filter((u) => u.includes('/products/search'))).toHaveLength(1)
    expect(urls.filter((u) => u.includes('/products/ABC123'))).toHaveLength(1)
    expect(urls.filter((u) => u.includes('/locations/bulk'))).toHaveLength(1)
    // Request must use production base + versioned Accept (checked via URL host).
    expect(urls[0].startsWith(VIATOR_API_BASE)).toBe(true)
    // Absent apiBase must hit production on every search-path endpoint.
    expect(urls).toContain(`${VIATOR_API_BASE}/products/search`)
    expect(urls).toContain(`${VIATOR_API_BASE}/products/ABC123`)
    expect(urls).toContain(`${VIATOR_API_BASE}/locations/bulk`)
  })

  it('uses a supplied sandbox base for search, product detail, and locations/bulk', async () => {
    // Sandbox keys only work against api.sandbox.viator.com — every live call
    // in one search must share that host (not a mix of sandbox + production).
    const fetchMock = mockViatorFetch({
      search: { products: [productSummary()], totalCount: 1 },
      detailByCode: { ABC123: productDetail() },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG, name: 'Ely put-in' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'sandbox-key',
      partnerId: 'P00045135',
      currency: 'USD',
      apiBase: `${SANDBOX_API_BASE}/`, // trailing slash must normalize away
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain(`${SANDBOX_API_BASE}/products/search`)
    expect(urls).toContain(`${SANDBOX_API_BASE}/products/ABC123`)
    expect(urls).toContain(`${SANDBOX_API_BASE}/locations/bulk`)
    // No production host mixed in when a sandbox base is supplied.
    expect(urls.every((u) => u.startsWith(SANDBOX_API_BASE))).toBe(true)
    expect(urls.some((u) => u.startsWith(VIATOR_API_BASE + '/'))).toBe(false)
  })

  it('falls back to the production base when apiBase is blank or non-https', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const fetchMock = mockViatorFetch({
      search: { products: [productSummary()], totalCount: 1 },
      detailByCode: { ABC123: productDetail() },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    // Blank override → production (no throw).
    await expect(
      searchViatorExperiences({
        destinationId: '12345',
        apiKey: 'k',
        apiBase: '   ',
      }),
    ).resolves.toMatchObject({ ok: true })

    let urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain(`${VIATOR_API_BASE}/products/search`)

    fetchMock.mockClear()

    // Malformed / http override → production (no throw).
    await expect(
      searchViatorExperiences({
        destinationId: '12345',
        apiKey: 'k',
        apiBase: 'http://not-https.example/partner',
      }),
    ).resolves.toMatchObject({ ok: true })

    urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain(`${VIATOR_API_BASE}/products/search`)
    expect(urls).toContain(`${VIATOR_API_BASE}/products/ABC123`)
    expect(urls).toContain(`${VIATOR_API_BASE}/locations/bulk`)
  })

  it('batches location refs into ONE /locations/bulk call, not N', async () => {
    const products = [
      productSummary({ productCode: 'P1', title: 'Tour A' }),
      productSummary({ productCode: 'P2', title: 'Tour B' }),
      productSummary({ productCode: 'P3', title: 'Tour C' }),
    ]
    const fetchMock = mockViatorFetch({
      search: { products, totalCount: 3 },
      detailByCode: {
        P1: productDetail({ productCode: 'P1', title: 'Tour A', logistics: { start: [{ location: { ref: 'LOC-1' } }] } }),
        P2: productDetail({ productCode: 'P2', title: 'Tour B', logistics: { start: [{ location: { ref: 'LOC-2' } }] } }),
        P3: productDetail({ productCode: 'P3', title: 'Tour C', logistics: { start: [{ location: { ref: 'LOC-3' } }] } }),
      },
      locations: locationsBulk([
        { reference: 'LOC-1', lat: LOCAL_LAT, lng: LOCAL_LNG },
        { reference: 'LOC-2', lat: LOCAL_LAT + 0.01, lng: LOCAL_LNG },
        { reference: 'LOC-3', lat: LOCAL_LAT - 0.01, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(3)
    const bulkCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))
    expect(bulkCalls).toHaveLength(1)
    const body = JSON.parse(String(bulkCalls[0][1]?.body))
    expect(body.locations).toEqual(['LOC-1', 'LOC-2', 'LOC-3'])
  })

  it('drops a product whose location ref does not resolve (never centre-pins)', async () => {
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({
            productCode: 'NOGEO',
            title: 'Ghost Tour With No Pin',
          }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        NOGEO: productDetail({
          productCode: 'NOGEO',
          title: 'Ghost Tour With No Pin',
          logistics: { start: [{ location: { ref: MISSING_REF } }] },
        }),
      },
      // GOOGLE provider without center — drop, do not fabricate destination centre.
      locations: locationsBulk([{ reference: MISSING_REF }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'test-key',
    })
    // Successful search that maps to zero keepable products is still ok:true.
    expect(result).toEqual({ ok: true, experiences: [] })
  })

  it('uses the UPPER bound for a variable-duration product', async () => {
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({
            duration: {
              variableDurationFromMinutes: 90,
              variableDurationToMinutes: 300,
            },
          }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({
          duration: {
            variableDurationFromMinutes: 90,
            variableDurationToMinutes: 300,
          },
        }),
      },
      locations: locationsBulk([{ reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0].durationMinutes).toBe(300)
  })

  it('returns ok:false on non-200 upstream without throwing', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', mockViatorFetch({ searchStatus: 503, search: { message: 'down' } }))
    await expect(searchViatorExperiences({ destinationId: '1', apiKey: 'k' })).resolves.toEqual({
      ok: false,
    })
  })

  it('returns ok:false on malformed JSON without throwing', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      })),
    )
    await expect(searchViatorExperiences({ destinationId: '1', apiKey: 'k' })).resolves.toEqual({
      ok: false,
    })
  })

  it('returns ok:false on wrong response shape without throwing', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        search: { products: [{ notAProduct: true }], totalCount: 1 },
      }),
    )
    await expect(searchViatorExperiences({ destinationId: '1', apiKey: 'k' })).resolves.toEqual({
      ok: false,
    })
  })

  it('returns ok:false when fetch itself throws', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(searchViatorExperiences({ destinationId: '1', apiKey: 'k' })).resolves.toEqual({
      ok: false,
    })
  })

  it('returns ok:true with [] when search succeeds with zero products', async () => {
    // Genuine empty is a stable answer (cacheable); must not look like a failure.
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({ search: { products: [], totalCount: 0 } }),
    )
    await expect(searchViatorExperiences({ destinationId: '1', apiKey: 'k' })).resolves.toEqual({
      ok: true,
      experiences: [],
    })
  })

  it('returns ok:false when every product detail fails (enrichment outage, not empty inventory)', async () => {
    // DEFECT 1 incomplete fix: search ok + all details null dropped every
    // product at !resolved and returned ok:true [] — cached for 24h.
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        search: {
          products: [productSummary({ productCode: 'D1' }), productSummary({ productCode: 'D2' })],
          totalCount: 2,
        },
        // No detailByCode entries → every detail is 404/null.
        detailByCode: {},
      }),
    )
    await expect(
      searchViatorExperiences({ destinationId: '12345', apiKey: 'k' }),
    ).resolves.toEqual({ ok: false })
  })

  it('returns ok:false when /locations/bulk fails after a successful search', async () => {
    // DEFECT 1 incomplete fix: bulk non-200 emptied coords, every product was
    // dropped, and ok:true [] was cached for 24h — silently disabled experiences.
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        search: { products: [productSummary()], totalCount: 1 },
        detailByCode: { ABC123: productDetail() },
        locationsStatus: 503,
      }),
    )
    await expect(
      searchViatorExperiences({ destinationId: '12345', apiKey: 'k' }),
    ).resolves.toEqual({ ok: false })
  })

  it('omits both price and currency when pricing.currency is absent (never infer)', async () => {
    // DEFECT 2: when the API omitted pricing.currency, we stamped the requested
    // currency. An IDR-scale amount rendered with a USD badge (up to 100x error).
    // Spec: if a field is absent, omit it — never default to a plausible value.
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({
            pricing: { summary: { fromPrice: 1_500_000 } },
          }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({
          pricing: { summary: { fromPrice: 1_500_000 } },
        }),
      },
      locations: locationsBulk([{ reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
      currency: 'USD',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0].priceFrom).toBeUndefined()
    expect(result.experiences[0].currency).toBeUndefined()
  })

  it('prefers search pricing over detail pricing and never mixes sources', async () => {
    // DEFECT 3: /products/search is called WITH currency; fetchProductDetail
    // sends none. Preferring detail clobbered the correctly-denominated search
    // price with an amount in an unspecified (or different) currency.
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({
            pricing: { summary: { fromPrice: 89 }, currency: 'USD' },
          }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({
          // Detail amount looks like a local-currency figure; must not win.
          pricing: { summary: { fromPrice: 1_500_000 }, currency: 'IDR' },
        }),
      },
      locations: locationsBulk([{ reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
      currency: 'USD',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences[0].priceFrom).toBe(89)
    expect(result.experiences[0].currency).toBe('USD')
  })

  it('sends exp-api-key, Accept-Language, and Accept with ;version=2.0 on every request', async () => {
    // DEFECT 5: Accept was never asserted. Setting VIATOR_ACCEPT_HEADER to
    // 'application/json' (dropping ;version=2.0) still passed the suite, yet
    // production returns 400 INVALID_HEADER_VALUE without the version token.
    const fetchMock = mockViatorFetch({
      search: { products: [productSummary()], totalCount: 1 },
      detailByCode: { ABC123: productDetail() },
      locations: locationsBulk([{ reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'test-key-headers',
      currency: 'USD',
    })

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined
      const headers = init?.headers as Record<string, string>
      expect(headers).toBeDefined()
      expect(headers['exp-api-key']).toBe('test-key-headers')
      expect(headers['Accept-Language']).toBe('en-US')
      expect(headers['Accept']).toBe(VIATOR_ACCEPT_HEADER)
      expect(headers['Accept']).toContain(';version=2.0')
    }
  })

  it('appends affiliate params when productUrl has no pid and partnerId is set', async () => {
    // Production search results are CONFIRMED pre-tagged with pid/mcid; this
    // path is defensive only for a bare productUrl that would earn nothing.
    const bareUrl = 'https://www.viator.com/tours/Ely/Canoe-Day-Trip/d123-ABC123'
    const fetchMock = mockViatorFetch({
      search: {
        products: [productSummary({ productUrl: bareUrl })],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({ productUrl: bareUrl }),
      },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
      partnerId: 'P00045135',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    const booking = new URL(result.experiences[0].bookingUrl!)
    expect(booking.searchParams.get('pid')).toBe('P00045135')
    expect(booking.searchParams.get('mcid')).toBe('42383')
    expect(booking.searchParams.get('medium')).toBe('api')
    expect(booking.searchParams.get('api_version')).toBe('2.0')
    // Path preserved — do not hand-assemble from productCode.
    expect(booking.pathname).toBe('/tours/Ely/Canoe-Day-Trip/d123-ABC123')
  })

  it('never overwrites a pid the API already set on productUrl', async () => {
    const preTagged =
      'https://www.viator.com/tours/Ely/Canoe/d123-ABC123?pid=API-PID&mcid=99999&medium=api'
    const fetchMock = mockViatorFetch({
      search: {
        products: [productSummary({ productUrl: preTagged })],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({ productUrl: preTagged }),
      },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
      partnerId: 'P00045135',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences[0].bookingUrl).toBe(preTagged)
  })

  it('leaves an unparseable productUrl as returned', async () => {
    const notAUrl = 'not a valid url at all'
    const fetchMock = mockViatorFetch({
      search: {
        products: [productSummary({ productUrl: notAUrl })],
        totalCount: 1,
      },
      detailByCode: {
        ABC123: productDetail({ productUrl: notAUrl }),
      },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'k',
      partnerId: 'P00045135',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences[0].bookingUrl).toBe(notAUrl)
  })

  it(`returns at most ${VIATOR_RESULT_LIMIT} results`, async () => {
    const products = Array.from({ length: VIATOR_RESULT_LIMIT + 5 }, (_, i) =>
      productSummary({
        productCode: `P${i}`,
        title: `Local Experience ${i}`,
      }),
    )
    const detailByCode: Record<string, unknown> = {}
    for (let i = 0; i < products.length; i += 1) {
      detailByCode[`P${i}`] = productDetail({
        productCode: `P${i}`,
        title: `Local Experience ${i}`,
      })
    }
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        search: { products, totalCount: products.length },
        detailByCode,
        locations: locationsBulk([{ reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG }]),
      }),
    )
    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences.length).toBe(VIATOR_RESULT_LIMIT)
  })

  it('over-fetches summaries and backfills when top ranks have no resolvable coords', async () => {
    // Live Tokyo defect: top 8 had only 4 with any pinnable ref. Fetching
    // exactly RESULT_LIMIT permanently lost the other half. Over-fetch
    // summaries, detail deeper, keep ranked survivors with real centers.
    const unpinnableCount = VIATOR_RESULT_LIMIT
    const pinnableCount = VIATOR_RESULT_LIMIT
    const products = [
      ...Array.from({ length: unpinnableCount }, (_, i) =>
        productSummary({
          productCode: `DROP${i}`,
          title: `Unpinnable Rank ${i}`,
        }),
      ),
      ...Array.from({ length: pinnableCount }, (_, i) =>
        productSummary({
          productCode: `KEEP${i}`,
          title: `Pinnable Rank ${i}`,
        }),
      ),
    ]
    const detailByCode: Record<string, unknown> = {}
    const bulkEntries: Array<{ reference: string; lat?: number; lng?: number }> = []
    for (let i = 0; i < unpinnableCount; i += 1) {
      const ref = `LOC-drop-${i}`
      detailByCode[`DROP${i}`] = productDetail({
        productCode: `DROP${i}`,
        title: `Unpinnable Rank ${i}`,
        logistics: { start: [{ location: { ref } }] },
      })
      // GOOGLE-style: reference present, no center (never fabricate a pin).
      bulkEntries.push({ reference: ref })
    }
    for (let i = 0; i < pinnableCount; i += 1) {
      const ref = `LOC-keep-${i}`
      detailByCode[`KEEP${i}`] = productDetail({
        productCode: `KEEP${i}`,
        title: `Pinnable Rank ${i}`,
        logistics: { start: [{ location: { ref } }] },
      })
      bulkEntries.push({
        reference: ref,
        lat: LOCAL_LAT + i * 0.001,
        lng: LOCAL_LNG,
      })
    }

    const fetchMock = mockViatorFetch({
      search: { products, totalCount: products.length },
      detailByCode,
      locations: locationsBulk(bulkEntries),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(VIATOR_RESULT_LIMIT)
    expect(result.experiences.map((e) => e.productCode)).toEqual(
      Array.from({ length: VIATOR_RESULT_LIMIT }, (_, i) => `KEEP${i}`),
    )
    // Ranking order of survivors preserved (KEEP0 before KEEP1 …).
    expect(result.experiences.map((e) => e.name)).toEqual(
      Array.from({ length: VIATOR_RESULT_LIMIT }, (_, i) => `Pinnable Rank ${i}`),
    )

    // Search asked for the over-fetch pool, not just RESULT_LIMIT.
    const searchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/products/search'))
    expect(searchCall).toBeDefined()
    const searchBody = JSON.parse(String(searchCall![1]?.body))
    expect(searchBody.pagination.count).toBe(VIATOR_SEARCH_OVERFETCH)
    expect(VIATOR_SEARCH_OVERFETCH).toBeGreaterThan(VIATOR_RESULT_LIMIT)
  })

  it('stops detail calls at VIATOR_MAX_DETAIL_CALLS when nothing resolves (ok:true, fewer/zero)', async () => {
    // Cap exists so a destination where nothing pins cannot burn unbounded
    // detail quota. Fewer than RESULT_LIMIT (including zero) remains ok:true.
    const poolSize = VIATOR_MAX_DETAIL_CALLS + 5
    const products = Array.from({ length: poolSize }, (_, i) =>
      productSummary({
        productCode: `NONE${i}`,
        title: `No Pin ${i}`,
      }),
    )
    const detailByCode: Record<string, unknown> = {}
    const bulkEntries: Array<{ reference: string }> = []
    for (let i = 0; i < poolSize; i += 1) {
      const ref = `LOC-none-${i}`
      detailByCode[`NONE${i}`] = productDetail({
        productCode: `NONE${i}`,
        title: `No Pin ${i}`,
        logistics: { start: [{ location: { ref } }] },
      })
      bulkEntries.push({ reference: ref })
    }

    const fetchMock = mockViatorFetch({
      search: { products, totalCount: poolSize },
      detailByCode,
      locations: locationsBulk(bulkEntries),
    })
    vi.stubGlobal('fetch', fetchMock)
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {})

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result).toEqual({ ok: true, experiences: [] })

    const detailCalls = fetchMock.mock.calls.filter((c) => {
      const url = String(c[0])
      return /\/products\/[^/?]+$/.test(url) && !url.includes('/products/search')
    })
    expect(detailCalls).toHaveLength(VIATOR_MAX_DETAIL_CALLS)
    // Still exactly one bulk, even after examining the capped pool.
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))).toHaveLength(
      1,
    )
    expect(
      info.mock.calls.some(
        (c) => c[0] === 'viator detail cap hit' && (c[1] as { kept?: number })?.kept === 0,
      ),
    ).toBe(true)
  })

  it('still uses exactly ONE /locations/bulk call when examining more products than RESULT_LIMIT', async () => {
    // Ordering problem: refs come from detail, survivors are known only after
    // bulk. Collect refs from the detailed pool → one bulk → select survivors.
    // Must not regress to one bulk call per product.
    const products = Array.from({ length: VIATOR_RESULT_LIMIT + 6 }, (_, i) =>
      productSummary({
        productCode: `B${i}`,
        title: `Bulk Tour ${i}`,
      }),
    )
    const detailByCode: Record<string, unknown> = {}
    const bulkEntries: Array<{ reference: string; lat: number; lng: number }> = []
    for (let i = 0; i < products.length; i += 1) {
      const ref = `LOC-bulk-${i}`
      detailByCode[`B${i}`] = productDetail({
        productCode: `B${i}`,
        title: `Bulk Tour ${i}`,
        logistics: { start: [{ location: { ref } }] },
      })
      bulkEntries.push({ reference: ref, lat: LOCAL_LAT + i * 0.001, lng: LOCAL_LNG })
    }

    const fetchMock = mockViatorFetch({
      search: { products, totalCount: products.length },
      detailByCode,
      locations: locationsBulk(bulkEntries),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(VIATOR_RESULT_LIMIT)

    const bulkCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))
    expect(bulkCalls).toHaveLength(1)
    const body = JSON.parse(String(bulkCalls[0][1]?.body))
    // All refs from the detailed candidates, not one call per survivor.
    expect(body.locations.length).toBe(products.length)
  })

  it('preserves ranking order of coordinate survivors after backfill drops', async () => {
    // Mix: drop, keep, drop, keep, keep — survivors must stay in search order.
    const specs: Array<{ code: string; title: string; pin: boolean }> = [
      { code: 'R0', title: 'Rank 0 drop', pin: false },
      { code: 'R1', title: 'Rank 1 keep', pin: true },
      { code: 'R2', title: 'Rank 2 drop', pin: false },
      { code: 'R3', title: 'Rank 3 keep', pin: true },
      { code: 'R4', title: 'Rank 4 keep', pin: true },
      { code: 'R5', title: 'Rank 5 drop', pin: false },
      { code: 'R6', title: 'Rank 6 keep', pin: true },
    ]
    const products = specs.map((s) => productSummary({ productCode: s.code, title: s.title }))
    const detailByCode: Record<string, unknown> = {}
    const bulkEntries: Array<{ reference: string; lat?: number; lng?: number }> = []
    for (const s of specs) {
      const ref = `LOC-${s.code}`
      detailByCode[s.code] = productDetail({
        productCode: s.code,
        title: s.title,
        logistics: { start: [{ location: { ref } }] },
      })
      if (s.pin) {
        bulkEntries.push({ reference: ref, lat: LOCAL_LAT, lng: LOCAL_LNG })
      } else {
        bulkEntries.push({ reference: ref })
      }
    }

    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        search: { products, totalCount: products.length },
        detailByCode,
        locations: locationsBulk(bulkEntries),
      }),
    )

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences.map((e) => e.productCode)).toEqual(['R1', 'R3', 'R4', 'R6'])
    expect(result.experiences.map((e) => e.name)).toEqual([
      'Rank 1 keep',
      'Rank 3 keep',
      'Rank 4 keep',
      'Rank 6 keep',
    ])
  })

  it('never pins a GOOGLE-provider location that has no center', async () => {
    // Measured: GOOGLE entries never have center (0 of 15) and often no name.
    // Drop rule stays — never fabricate coords or use destination centre.
    const googleRef = 'LOC-google-no-center'
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({ productCode: 'G1', title: 'Google-only Pin Tour' }),
          productSummary({ productCode: 'T1', title: 'Tripadvisor Pin Tour' }),
        ],
        totalCount: 2,
      },
      detailByCode: {
        G1: productDetail({
          productCode: 'G1',
          title: 'Google-only Pin Tour',
          logistics: { start: [{ location: { ref: googleRef } }] },
        }),
        T1: productDetail({
          productCode: 'T1',
          title: 'Tripadvisor Pin Tour',
          logistics: { start: [{ location: { ref: LOCAL_REF } }] },
        }),
      },
      locations: {
        locations: [
          {
            provider: 'GOOGLE',
            reference: googleRef,
            providerReference: 'ChIJ-fake-no-center',
            // no center, no name — must not become a pin
          },
          {
            provider: 'TRIPADVISOR',
            reference: LOCAL_REF,
            name: 'Real put-in',
            center: { latitude: LOCAL_LAT, longitude: LOCAL_LNG },
          },
        ],
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0].productCode).toBe('T1')
    expect(result.experiences[0].lat).toBe(LOCAL_LAT)
    expect(result.experiences[0].lng).toBe(LOCAL_LNG)
    // GOOGLE product must not appear with a fabricated or destination pin.
    expect(result.experiences.some((e) => e.productCode === 'G1')).toBe(false)
  })

  it('pins an experience whose ONLY resolvable ref is itinerary itineraryItems POI', async () => {
    // REGRESSION: Tokyo kept 0/8 because extractLocationRefs ignored
    // itinerary.itineraryItems[].pointOfInterestLocation.location.ref
    // (11/15 resolved with coords) and only read GOOGLE meeting points (0/5).
    const poiLat = 35.6852
    const poiLng = 139.7528
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({
            productCode: 'TKY-POI',
            title: 'Tokyo Sushi Class at Real Venue',
          }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        'TKY-POI': productDetail({
          productCode: 'TKY-POI',
          title: 'Tokyo Sushi Class at Real Venue',
          // No logistics.start / activityInfo / root POI — only the productive path.
          logistics: undefined,
          itinerary: {
            itineraryItems: [
              {
                pointOfInterestLocation: {
                  location: { ref: POI_REF },
                },
              },
            ],
          },
        }),
      },
      locations: locationsBulk([
        { reference: POI_REF, lat: poiLat, lng: poiLng, name: 'Tsukiji Outer Market' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0].productCode).toBe('TKY-POI')
    expect(result.experiences[0].lat).toBe(poiLat)
    expect(result.experiences[0].lng).toBe(poiLng)
    expect(result.experiences[0].address).toBe('Tsukiji Outer Market')
    // Still exactly one bulk call for the whole search.
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))).toHaveLength(
      1,
    )
  })

  it('prefers itinerary POI over logistics.start when both resolve', async () => {
    // Priority: first ref that bulk-resolves wins; POI is collected first so
    // the pin is where the experience happens, not the GOOGLE meeting point.
    const poiLat = 35.71
    const poiLng = 139.81
    const startLat = 35.68
    const startLng = 139.76
    const fetchMock = mockViatorFetch({
      search: {
        products: [productSummary({ productCode: 'BOTH', title: 'POI Wins Over Meet' })],
        totalCount: 1,
      },
      detailByCode: {
        BOTH: productDetail({
          productCode: 'BOTH',
          title: 'POI Wins Over Meet',
          logistics: { start: [{ location: { ref: START_REF } }] },
          itinerary: {
            itineraryItems: [
              {
                pointOfInterestLocation: {
                  location: { ref: POI_REF },
                },
              },
            ],
          },
        }),
      },
      locations: locationsBulk([
        { reference: START_REF, lat: startLat, lng: startLng, name: 'Hotel lobby' },
        { reference: POI_REF, lat: poiLat, lng: poiLng, name: 'Temple grounds' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.experiences).toHaveLength(1)
    expect(result.experiences[0].lat).toBe(poiLat)
    expect(result.experiences[0].lng).toBe(poiLng)
    expect(result.experiences[0].address).toBe('Temple grounds')
    // Bulk body must include both refs, POI before start (priority order).
    const bulkCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))
    expect(bulkCalls).toHaveLength(1)
    const body = JSON.parse(String(bulkCalls[0][1]?.body)) as { locations: string[] }
    expect(body.locations.indexOf(POI_REF)).toBeLessThan(body.locations.indexOf(START_REF))
  })

  it('still drops a product with only GOOGLE-style unresolvable refs', async () => {
    // Coordinate rule unchanged: GOOGLE meeting points without center → drop.
    const googleStart = 'LOC-google-start'
    const googleEnd = 'LOC-google-end'
    const googleActivity = 'LOC-google-activity'
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({ productCode: 'G-ONLY', title: 'Meet-only Unpinnable Tour' }),
        ],
        totalCount: 1,
      },
      detailByCode: {
        'G-ONLY': productDetail({
          productCode: 'G-ONLY',
          title: 'Meet-only Unpinnable Tour',
          logistics: {
            start: [{ location: { ref: googleStart } }],
            end: [{ location: { ref: googleEnd } }],
          },
          itinerary: {
            activityInfo: { location: { ref: googleActivity } },
          },
        }),
      },
      locations: locationsBulk([
        { reference: googleStart },
        { reference: googleEnd },
        { reference: googleActivity },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result).toEqual({ ok: true, experiences: [] })
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))).toHaveLength(
      1,
    )
  })

  it('tolerates malformed or missing itinerary/logistics without throwing', async () => {
    // Bad branches yield no refs (product dropped), never a throw or 500.
    const fetchMock = mockViatorFetch({
      search: {
        products: [
          productSummary({ productCode: 'BAD-SHAPE', title: 'Broken Detail Branches' }),
          productSummary({ productCode: 'OK-POI', title: 'Sibling With POI' }),
        ],
        totalCount: 2,
      },
      detailByCode: {
        'BAD-SHAPE': productDetail({
          productCode: 'BAD-SHAPE',
          title: 'Broken Detail Branches',
          // Differently shaped branches must not crash parse or extract.
          logistics: { start: 'not-an-array', end: null, travelerPickup: 42 },
          itinerary: {
            itineraryItems: 'nope',
            pointsOfInterest: { location: { ref: 'LOC-wrong' } },
            activityInfo: 'also-bad',
          },
          productOptions: 'not-array',
        }),
        'OK-POI': productDetail({
          productCode: 'OK-POI',
          title: 'Sibling With POI',
          logistics: undefined,
          itinerary: {
            itineraryItems: [
              { pointOfInterestLocation: { location: { ref: POI_REF } } },
            ],
          },
        }),
      },
      locations: locationsBulk([
        { reference: POI_REF, lat: LOCAL_LAT, lng: LOCAL_LNG, name: 'Real pin' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchViatorExperiences({ destinationId: '12345', apiKey: 'k' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Malformed product dropped; sibling with real POI still pins.
    expect(result.experiences.map((e) => e.productCode)).toEqual(['OK-POI'])
    // Still exactly ONE /locations/bulk call for the whole search.
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations/bulk'))).toHaveLength(
      1,
    )
  })
})

describe('extractLocationRefs', () => {
  it('returns refs in measured priority order and dedupes', () => {
    const refs = extractLocationRefs({
      itinerary: {
        itineraryItems: [
          { pointOfInterestLocation: { location: { ref: 'LOC-poi-1' } } },
          { pointOfInterestLocation: { location: { ref: 'LOC-poi-2' } } },
        ],
        pointsOfInterest: [{ location: { ref: 'LOC-poi-alt' } }],
        activityInfo: { location: { ref: 'LOC-activity' } },
      },
      logistics: {
        travelerPickup: { locations: [{ location: { ref: 'LOC-pickup' } }] },
        start: [{ location: { ref: 'LOC-start' } }],
        end: [{ location: { ref: 'LOC-end' } }],
      },
      productOptions: [
        {
          logistics: {
            start: [{ location: { ref: 'LOC-opt-start' } }],
            end: [{ location: { ref: 'LOC-opt-end' } }],
          },
        },
      ],
    })
    expect(refs).toEqual([
      'LOC-poi-1',
      'LOC-poi-2',
      'LOC-poi-alt',
      'LOC-pickup',
      'LOC-start',
      'LOC-end',
      'LOC-activity',
      'LOC-opt-start',
      'LOC-opt-end',
    ])
  })

  it('dedupes preserving first (higher priority) occurrence', () => {
    const shared = 'LOC-same'
    const refs = extractLocationRefs({
      itinerary: {
        itineraryItems: [{ pointOfInterestLocation: { location: { ref: shared } } }],
      },
      logistics: {
        start: [{ location: { ref: shared } }],
      },
    })
    expect(refs).toEqual([shared])
  })

  it('returns [] for missing itinerary and logistics without throwing', () => {
    expect(() => extractLocationRefs({})).not.toThrow()
    expect(extractLocationRefs({})).toEqual([])
    expect(
      extractLocationRefs({
        logistics: undefined,
        itinerary: undefined,
        productOptions: undefined,
      }),
    ).toEqual([])
  })

  it('does not read root pointOfInterestLocation (absent in real payloads)', () => {
    // Old bug: only root + start + activityInfo were read; root never exists.
    expect(
      extractLocationRefs({
        pointOfInterestLocation: { location: { ref: 'LOC-root-never' } },
        logistics: { start: [{ location: { ref: 'LOC-start-only' } }] },
      }),
    ).toEqual(['LOC-start-only'])
  })
})

describe('resolveExperienceCoordinates', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns only refs that resolve with a real center', async () => {
    vi.stubGlobal(
      'fetch',
      mockViatorFetch({
        locations: locationsBulk([
          { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG, name: 'Dock' },
          { reference: MISSING_REF },
        ]),
      }),
    )
    const result = await resolveExperienceCoordinates([LOCAL_REF, MISSING_REF], 'k')
    expect(result.ok).toBe(true)
    expect(result.coords.has(LOCAL_REF)).toBe(true)
    expect(result.coords.has(MISSING_REF)).toBe(false)
    expect(result.coords.get(LOCAL_REF)?.lat).toBe(LOCAL_LAT)
  })

  it('returns ok:false when bulk is non-200', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', mockViatorFetch({ locationsStatus: 500 }))
    const result = await resolveExperienceCoordinates([LOCAL_REF], 'k')
    expect(result.ok).toBe(false)
    expect(result.coords.size).toBe(0)
  })

  it('uses a supplied sandbox base for /locations/bulk', async () => {
    const fetchMock = mockViatorFetch({
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)
    await resolveExperienceCoordinates([LOCAL_REF], 'k', SANDBOX_API_BASE)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${SANDBOX_API_BASE}/locations/bulk`)
  })
})

describe('VIATOR_API_BASE on all four endpoints', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hits sandbox for destinations, search, product detail, and locations/bulk', async () => {
    // Explicit end-to-end: every live Partner path must use the supplied base.
    const fetchMock = mockViatorFetch({
      destinations: { destinations: [DEST_ELY] },
      search: { products: [productSummary()], totalCount: 1 },
      detailByCode: { ABC123: productDetail() },
      locations: locationsBulk([
        { reference: LOCAL_REF, lat: LOCAL_LAT, lng: LOCAL_LNG },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchViatorDestinations('sandbox-key', SANDBOX_API_BASE)
    await searchViatorExperiences({
      destinationId: '12345',
      apiKey: 'sandbox-key',
      apiBase: SANDBOX_API_BASE,
    })

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain(`${SANDBOX_API_BASE}/destinations`)
    expect(urls).toContain(`${SANDBOX_API_BASE}/products/search`)
    expect(urls).toContain(`${SANDBOX_API_BASE}/products/ABC123`)
    expect(urls).toContain(`${SANDBOX_API_BASE}/locations/bulk`)
    expect(urls.every((u) => u.startsWith(SANDBOX_API_BASE))).toBe(true)
  })
})
