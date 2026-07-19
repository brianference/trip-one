import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocode, autocompleteSearch } from './geocode'

describe('geocode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns lat/lng/displayName for the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '53.3498', lon: '-6.2603', display_name: 'Dublin, Ireland' }],
      }),
    )
    const result = await geocode('Dublin, Ireland')
    expect(result).toEqual({ lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Ireland' })
  })

  it('returns null when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await geocode('asdfghjkl')).toBeNull()
  })
})

describe('autocompleteSearch', () => {
  afterEach(() => vi.restoreAllMocks())

  /** Shapes a Photon feature the way the real API returns one. */
  function feature(name: string, lat: number, lng: number, props: Record<string, string> = {}) {
    return { geometry: { coordinates: [lng, lat] }, properties: { name, ...props } }
  }

  function stubPhoton(features: unknown[]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features }) }))
  }

  it('maps Photon features to GeocodeResult shape with a readable label', async () => {
    stubPhoton([
      feature('Dublin', 53.3498, -6.2603, { type: 'city', state: 'Leinster', country: 'Ireland' }),
      feature('Dublin', 40.0992, -83.1141, { type: 'city', state: 'Ohio', country: 'United States' }),
    ])
    expect(await autocompleteSearch('dublin')).toEqual([
      { lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Leinster, Ireland' },
      { lat: 40.0992, lng: -83.1141, displayName: 'Dublin, Ohio, United States' },
    ])
  })

  it('returns an empty array when nothing is found', async () => {
    stubPhoton([])
    expect(await autocompleteSearch('asdfghjkl')).toEqual([])
  })

  // The reason this moved off Nominatim: a traveller typing a few letters means
  // a destination, so somewhere you can base a trip must outrank a building or
  // a street that happens to share the text.
  it('ranks a city above a building and a street', async () => {
    stubPhoton([
      feature('Dublin Castle', 53.343, -6.267, { type: 'house', city: 'Dublin', country: 'Ireland' }),
      feature('Dublin Road', 54.0, -6.0, { type: 'street', country: 'Ireland' }),
      feature('Dublin', 53.3498, -6.2603, { type: 'city', country: 'Ireland' }),
    ])
    const result = await autocompleteSearch('dubl')
    expect(result[0].displayName).toBe('Dublin, Ireland')
  })

  it('drops duplicate labels, keeping the best-ranked one', async () => {
    stubPhoton([
      feature('Dublin', 53.3, -6.2, { type: 'house', country: 'Ireland' }),
      feature('Dublin', 53.3498, -6.2603, { type: 'city', country: 'Ireland' }),
    ])
    const result = await autocompleteSearch('dublin')
    expect(result).toHaveLength(1)
  })

  it('skips features with no coordinates or no name', async () => {
    stubPhoton([
      { geometry: { coordinates: undefined }, properties: { name: 'Nowhere', type: 'city' } },
      { geometry: { coordinates: [-6.26, 53.35] }, properties: { type: 'city' } },
      feature('Dublin', 53.3498, -6.2603, { type: 'city', country: 'Ireland' }),
    ])
    expect(await autocompleteSearch('dublin')).toEqual([
      { lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Ireland' },
    ])
  })

  it('returns an empty list when the upstream call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
    expect(await autocompleteSearch('dublin')).toEqual([])
  })
})
