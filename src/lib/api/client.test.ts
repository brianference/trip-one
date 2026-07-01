import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchLocation, createTrip, getTrip, updateTrip, forkTrip } from './client'

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

  it('forkTrip creates a new trip copying the source location and itinerary', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/trips/demo-1') && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'demo-1', location_slug: 'tokyo-demo', itinerary: [{ time: '08:00', text: 'X', type: 'fixed' }], design_style: 'bento' }),
        })
      }
      if (String(url) === '/api/trips' && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'new-trip', location_slug: 'tokyo-demo', itinerary: [], design_style: 'bento' }),
        })
      }
      if (String(url).endsWith('/api/trips/new-trip') && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'new-trip', location_slug: 'tokyo-demo', itinerary: [{ time: '08:00', text: 'X', type: 'fixed' }], design_style: 'bento' }),
        })
      }
      throw new Error(`unexpected call to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const forked = await forkTrip('demo-1')
    expect(forked.id).toBe('new-trip')
    expect(forked.itinerary).toEqual([{ time: '08:00', text: 'X', type: 'fixed' }])
    // the new trip is a distinct row (source stays 'demo-1', untouched) and its
    // itinerary/design were copied over via a PATCH, not baked into the POST
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1]?.method).toBe('PATCH')
  })
})
