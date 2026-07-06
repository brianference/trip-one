import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces } from './places'

describe('places searchPlaces', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps results into the shared ThingToDo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ name: 'Guinness Storehouse', types: ['tourist_attraction'], rating: 4.5, vicinity: 'St James Gate' }],
        }),
      }),
    )
    const results = await searchPlaces(53.35, -6.26, 'test-key')
    expect(results).toEqual([
      {
        name: 'Guinness Storehouse',
        category: 'tourist_attraction',
        source: 'places',
        rating: 4.5,
        address: 'St James Gate',
      },
    ])
  })

  it('returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await searchPlaces(0, 0, 'k')).toEqual([])
  })

  it('captures per-item lat/lng from the geometry.location field when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              name: 'Shibuya Crossing',
              types: ['tourist_attraction'],
              rating: 4.7,
              vicinity: 'Shibuya',
              geometry: { location: { lat: 35.6595, lng: 139.7005 } },
            },
          ],
        }),
      }),
    )
    const results = await searchPlaces(35.66, 139.7, 'test-key')
    expect(results).toEqual([
      {
        name: 'Shibuya Crossing',
        category: 'tourist_attraction',
        source: 'places',
        rating: 4.7,
        address: 'Shibuya',
        lat: 35.6595,
        lng: 139.7005,
      },
    ])
  })
})
