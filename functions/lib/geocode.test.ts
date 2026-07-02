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

  it('maps all results to GeocodeResult shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { lat: '53.3498', lon: '-6.2603', display_name: 'Dublin, Ireland' },
          { lat: '40.0992', lon: '-83.1141', display_name: 'Dublin, Ohio, USA' },
        ],
      }),
    )
    const result = await autocompleteSearch('dublin')
    expect(result).toEqual([
      { lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Ireland' },
      { lat: 40.0992, lng: -83.1141, displayName: 'Dublin, Ohio, USA' },
    ])
  })

  it('returns an empty array when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await autocompleteSearch('asdfghjkl')).toEqual([])
  })
})
