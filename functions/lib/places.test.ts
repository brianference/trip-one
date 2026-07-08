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

  it('queries both attractions and restaurants, merges them, and captures place_id (so meals can be scheduled)', async () => {
    const fetchMock = vi
      .fn()
      // first call = tourist_attraction type
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ place_id: 'p1', name: 'Museum', types: ['museum'], rating: 4.5 }] }),
      })
      // second call = restaurant type
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ place_id: 'p2', name: 'Cafe Rico', types: ['restaurant'], rating: 4.7 }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchPlaces(40.4, -3.7, 'k')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('type=tourist_attraction')
    expect(fetchMock.mock.calls[1][0]).toContain('type=restaurant')
    expect(results.map((r) => r.name)).toEqual(['Museum', 'Cafe Rico'])
    expect(results.find((r) => r.name === 'Cafe Rico')?.category).toBe('restaurant')
    expect(results.find((r) => r.name === 'Museum')?.placeId).toBe('p1')
  })

  it('promotes a food type to the category even when it is not first in the types array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ place_id: 'p', name: "Joe's Stone Crab", types: ['bar', 'restaurant', 'point_of_interest'] }] }),
      }),
    )
    const results = await searchPlaces(25.77, -80.13, 'k')
    expect(results[0].category).toBe('restaurant')
  })

  it('dedupes a place that appears in both type searches (keeps one)', async () => {
    const dup = { ok: true, json: async () => ({ results: [{ place_id: 'p9', name: 'Central Market', types: ['restaurant'] }] }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(dup))
    const results = await searchPlaces(40.4, -3.7, 'k')
    expect(results.filter((r) => r.name === 'Central Market')).toHaveLength(1)
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
