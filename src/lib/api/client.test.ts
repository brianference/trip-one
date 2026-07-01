import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchLocation, createTrip, getTrip, updateTrip } from './client'

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetchLocation calls /api/location with the query and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: 'dublin-ireland', lat: 53.35, lng: -6.26, displayName: 'Dublin, Ireland', thingsToDo: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchLocation('Dublin, Ireland')
    expect(fetchMock).toHaveBeenCalledWith('/api/location?q=Dublin%2C%20Ireland')
    expect(result.slug).toBe('dublin-ireland')
  })

  it('fetchLocation throws with the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'not found' }) }))
    await expect(fetchLocation('nowhere')).rejects.toThrow('not found')
  })

  it('createTrip posts the location slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const trip = await createTrip('dublin-ireland')
    expect(trip.id).toBe('t1')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })

  it('getTrip fetches by id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento' }),
      }),
    )
    const trip = await getTrip('t1')
    expect(trip.locationSlug).toBe('dublin-ireland')
  })

  it('updateTrip patches by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'chronicle' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const trip = await updateTrip('t1', { designStyle: 'chronicle' })
    expect(trip.designStyle).toBe('chronicle')
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })
})
