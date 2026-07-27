import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTripData } from './useTripData'
import { useTripStore } from '../../../store/tripStore'
import * as client from '../../../lib/api/client'

describe('useTripData', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads the trip and its location, exposing both once resolved', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
      tripLengthDays: null,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [],
    })
    vi.spyOn(client, 'fetchExperiences').mockResolvedValue([])

    const { result } = renderHook(() => useTripData('t1'))
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.trip?.id).toBe('t1')
    expect(result.current.location?.displayName).toBe('Lisbon, Portugal')
  })

  it('rehydrates the shared store from the fetched trip', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't2',
      locationSlug: 'oslo-norway',
      itinerary: [{ time: '09:00', text: 'Vigeland Park', type: 'option' }],
      designStyle: 'chronicle',
      tripLengthDays: 3,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'oslo-norway',
      lat: 59.9,
      lng: 10.75,
      displayName: 'Oslo, Norway',
      thingsToDo: [],
    })
    vi.spyOn(client, 'fetchExperiences').mockResolvedValue([])

    renderHook(() => useTripData('t2'))

    await waitFor(() => expect(useTripStore.getState().tripId).toBe('t2'))
    expect(useTripStore.getState().itinerary).toEqual([{ time: '09:00', text: 'Vigeland Park', type: 'option' }])
    expect(useTripStore.getState().tripLengthDays).toBe(3)
  })

  it('leaves trip/location null and stops loading when the fetch fails', async () => {
    vi.spyOn(client, 'getTrip').mockRejectedValue(new Error('not found'))
    const { result } = renderHook(() => useTripData('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.trip).toBeNull()
    expect(result.current.location).toBeNull()
  })

  it('sets error=true when the trip fetch fails (so the shell can show a real error state)', async () => {
    vi.spyOn(client, 'getTrip').mockRejectedValue(new Error('not found'))
    const { result } = renderHook(() => useTripData('missing'))
    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('does NOT set error when only the location fetch fails (trip is still usable)', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'oslo-norway',
      itinerary: [],
      designStyle: 'chronicle',
      tripLengthDays: null,
    })
    vi.spyOn(client, 'fetchLocation').mockRejectedValue(new Error('geocode down'))
    const { result } = renderHook(() => useTripData('t1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.trip?.id).toBe('t1')
    expect(result.current.error).toBe(false)
  })

  it('merges experiences into thingsToDo on load even when nearby places are empty', async () => {
    // Trip opened via POST /api/trips (or any path that skipped the planner)
    // must still surface bookable experiences. Experiences are independent of
    // Places — zero things_to_do must not hide them.
    const experience = {
      name: 'Tokyo Sushi Making Class',
      category: 'experience',
      source: 'viator' as const,
      rating: 4.9,
      priceFrom: 89,
      currency: 'USD',
      durationMinutes: 120,
      productCode: 'TKY-SUSHI',
      bookingUrl: 'https://www.viator.com/tours/Tokyo/Sushi/d334-x',
    }
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 'tokyo-direct',
      locationSlug: 'tokyo-japan',
      itinerary: [],
      designStyle: 'chronicle',
      tripLengthDays: 3,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'tokyo-japan',
      lat: 35.68,
      lng: 139.76,
      displayName: 'Tokyo, Japan',
      thingsToDo: [],
    })
    const expSpy = vi.spyOn(client, 'fetchExperiences').mockResolvedValue([experience])

    const { result } = renderHook(() => useTripData('tokyo-direct'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(expSpy).toHaveBeenCalledWith(35.68, 139.76)
    expect(result.current.location?.thingsToDo).toEqual([experience])
    expect(result.current.location?.thingsToDo.some((t) => t.source === 'viator')).toBe(true)
  })

  it('cleans legacy duplicate stops once on load and persists the healed row', async () => {
    // Same three pairs that drifted into the live Tokyo demo itinerary.
    const legacyItinerary = [
      { time: '10:00', text: 'Odaiba Beach', type: 'option' as const, day: 2 },
      { time: '11:00', text: 'Odaiba Marine Park', type: 'option' as const, day: 2 },
      { time: '14:00', text: 'Isshiki Beach', type: 'option' as const, day: 3 },
      { time: '09:00', text: 'Odaiba Beach', type: 'option' as const, day: 5 },
      { time: '15:00', text: 'Odaiba Marine Park', type: 'option' as const, day: 5 },
      { time: '16:00', text: 'Isshiki Beach', type: 'option' as const, day: 6 },
    ]
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 'tokyo-legacy',
      locationSlug: 'tokyo-japan',
      itinerary: legacyItinerary,
      designStyle: 'chronicle',
      tripLengthDays: 7,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'tokyo-japan',
      lat: 35.68,
      lng: 139.76,
      displayName: 'Tokyo, Japan',
      thingsToDo: [],
    })
    vi.spyOn(client, 'fetchExperiences').mockResolvedValue([])
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 'tokyo-legacy',
      locationSlug: 'tokyo-japan',
      itinerary: [],
      designStyle: 'chronicle',
      tripLengthDays: 7,
    })

    const { result } = renderHook(() => useTripData('tokyo-legacy'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const storeItinerary = useTripStore.getState().itinerary
    expect(storeItinerary).toHaveLength(3)
    expect(storeItinerary.map((i) => i.text)).toEqual([
      'Odaiba Beach',
      'Odaiba Marine Park',
      'Isshiki Beach',
    ])
    expect(storeItinerary[0]).toMatchObject({ time: '10:00', day: 2 })
    expect(result.current.trip?.itinerary).toHaveLength(3)

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string }>
    expect(persisted.map((i) => i.text)).toEqual([
      'Odaiba Beach',
      'Odaiba Marine Park',
      'Isshiki Beach',
    ])
  })

  it('does not persist when the loaded itinerary already has unique stop names', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 'clean-trip',
      locationSlug: 'lisbon-portugal',
      itinerary: [{ time: '09:00', text: 'Belem Tower', type: 'option' }],
      designStyle: 'chronicle',
      tripLengthDays: 2,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [],
    })
    vi.spyOn(client, 'fetchExperiences').mockResolvedValue([])
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 'clean-trip',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })

    const { result } = renderHook(() => useTripData('clean-trip'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(useTripStore.getState().itinerary).toHaveLength(1)
    // Self-heal only writes when dups were dropped — clean rows must not PATCH.
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
