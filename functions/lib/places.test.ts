import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces, textSearchPlaces } from './places'

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
        adultVenue: false,
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

  it('queries attractions, restaurants, and cafes, merges them, and captures place_id (so meals and coffee can be scheduled)', async () => {
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
      // third call = cafe type (dedicated coffee shops)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ place_id: 'p3', name: 'Third Wave Coffee', types: ['cafe', 'store'], rating: 4.8 }] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchPlaces(40.4, -3.7, 'k')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toContain('type=tourist_attraction')
    expect(fetchMock.mock.calls[1][0]).toContain('type=restaurant')
    expect(fetchMock.mock.calls[2][0]).toContain('type=cafe')
    expect(results.map((r) => r.name)).toEqual(['Museum', 'Cafe Rico', 'Third Wave Coffee'])
    expect(results.find((r) => r.name === 'Cafe Rico')?.category).toBe('restaurant')
    expect(results.find((r) => r.name === 'Third Wave Coffee')?.category).toBe('cafe')
    expect(results.find((r) => r.name === 'Museum')?.placeId).toBe('p1')
  })

  it('categorizes restaurant-search results as food even when a food type is not first', async () => {
    const fetchMock = vi
      .fn()
      // tourist_attraction search: keep types[0] as-is (a hotel stays lodging)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ place_id: 'h', name: 'Grand Hotel', types: ['lodging', 'restaurant'] }] }),
      })
      // restaurant search: promote the food type even though 'bar' is first
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ place_id: 'j', name: "Joe's Stone Crab", types: ['bar', 'restaurant', 'point_of_interest'] }] }),
      })
      // cafe search: none here
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const results = await searchPlaces(25.77, -80.13, 'k')
    expect(results.find((r) => r.name === 'Grand Hotel')?.category).toBe('lodging')
    expect(results.find((r) => r.name === "Joe's Stone Crab")?.category).toBe('restaurant')
  })

  it('drops hotels that surface in the restaurant search (they are not meal stops)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) }) // attraction search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { place_id: 'h', name: 'Grand Hotel Majestic', types: ['restaurant', 'lodging'] },
            { place_id: 'r', name: 'Trattoria Rossa', types: ['restaurant'] },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) }) // cafe search
    vi.stubGlobal('fetch', fetchMock)
    const results = await searchPlaces(44.5, 11.3, 'k')
    expect(results.map((r) => r.name)).toEqual(['Trattoria Rossa'])
  })

  it('dedupes a place that appears in both type searches (keeps one)', async () => {
    const dup = { ok: true, json: async () => ({ results: [{ place_id: 'p9', name: 'Central Market', types: ['restaurant'] }] }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(dup))
    const results = await searchPlaces(40.4, -3.7, 'k')
    expect(results.filter((r) => r.name === 'Central Market')).toHaveLength(1)
  })

  it('text-searches for a specific kind of place and maps real results (with formatted_address)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            place_id: 's1',
            name: 'Sushi Saito',
            types: ['restaurant', 'food', 'point_of_interest'],
            rating: 4.9,
            formatted_address: '1-1 Roppongi, Tokyo',
            geometry: { location: { lat: 35.66, lng: 139.73 } },
          },
          { place_id: 'h1', name: 'Hotel Sushi Bar', types: ['lodging', 'restaurant'] },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const results = await textSearchPlaces('sushi restaurant', 35.68, 139.76, 'k')
    expect(fetchMock.mock.calls[0][0]).toContain('/textsearch/json')
    expect(fetchMock.mock.calls[0][0]).toContain('query=sushi%20restaurant')
    // The lodging result is dropped; the real sushi place is mapped as food.
    expect(results.map((r) => r.name)).toEqual(['Sushi Saito'])
    expect(results[0]).toMatchObject({ category: 'restaurant', source: 'places', rating: 4.9, address: '1-1 Roppongi, Tokyo', lat: 35.66, lng: 139.73, placeId: 's1' })
  })

  it('text search returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await textSearchPlaces('ramen', 0, 0, 'k')).toEqual([])
  })

  it('drops text-search results outside the trip vicinity (bias, not filter, returns far-flung matches)', async () => {
    // Searching "aquarium" near Corfu (39.62, 19.92): Google's text search
    // biases but still returns globally-famous aquariums with no local match.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { place_id: 'c', name: 'Corfu Aquarium', types: ['aquarium'], geometry: { location: { lat: 39.59, lng: 19.91 } } },
            { place_id: 'f', name: 'The Florida Aquarium', types: ['aquarium'], geometry: { location: { lat: 27.94, lng: -82.44 } } },
            { place_id: 'v', name: 'Greater Cleveland Aquarium', types: ['aquarium'], geometry: { location: { lat: 41.49, lng: -81.7 } } },
          ],
        }),
      }),
    )
    const results = await textSearchPlaces('aquarium', 39.62, 19.92, 'k')
    expect(results.map((r) => r.name)).toEqual(['Corfu Aquarium'])
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
        adultVenue: false,
        source: 'places',
        rating: 4.7,
        address: 'Shibuya',
        lat: 35.6595,
        lng: 139.7005,
      },
    ])
  })
})
