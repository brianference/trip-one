import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useItineraryActions } from './useItineraryActions'
import { useTripStore } from '../../../store/tripStore'
import * as client from '../../../lib/api/client'

function resetStore(itinerary: unknown[] = [], tripLengthDays: number | null = null) {
  useTripStore.setState({
    tripId: 't1',
    locationSlug: 'lisbon-portugal',
    itinerary: itinerary as never,
    tripLengthDays,
  })
}

describe('useItineraryActions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds a stop with geocoded coordinates when a location is given', async () => {
    resetStore()
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'eiffel-tower',
      lat: 48.8584,
      lng: 2.2945,
      displayName: 'Eiffel Tower',
      thingsToDo: [],
    })
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })

    const { result } = renderHook(() => useItineraryActions('t1'))
    await act(async () => {
      await result.current.addStop({ time: '10:00', text: 'Visit tower', locationText: 'Eiffel Tower' })
    })

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string; lat?: number; lng?: number }>
    const added = persisted.find((i) => i.text === 'Visit tower')
    expect(added?.lat).toBe(48.8584)
    expect(added?.lng).toBe(2.2945)
  })

  it('still adds the stop when geocoding fails, without coordinates', async () => {
    resetStore()
    vi.spyOn(client, 'fetchLocation').mockRejectedValue(new Error('not found'))
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })

    const { result } = renderHook(() => useItineraryActions('t1'))
    await act(async () => {
      await result.current.addStop({ time: '10:00', text: 'Visit somewhere', locationText: 'gibberish' })
    })

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string; lat?: number }>
    expect(persisted.find((i) => i.text === 'Visit somewhere')?.lat).toBeUndefined()
  })

  it('carries real coordinates/category through when adding a things-to-do suggestion', async () => {
    resetStore()
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    const { result } = renderHook(() => useItineraryActions('t1'))
    act(() => {
      result.current.addFromThingToDo({ name: 'Belem Tower', category: 'tourist_attraction', source: 'places', lat: 38.69, lng: -9.21 })
    })
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string; lat?: number; category?: string }>
    const belem = persisted.find((i) => i.text === 'Belem Tower')
    expect(belem?.lat).toBe(38.69)
    expect(belem?.category).toBe('tourist_attraction')
  })

  it('removes a stop by index', async () => {
    resetStore([
      { time: '09:00', text: 'Keep me', type: 'option' },
      { time: '10:00', text: 'Remove me', type: 'option' },
    ])
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    const { result } = renderHook(() => useItineraryActions('t1'))
    act(() => result.current.removeStop(1))
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string }>
    expect(persisted.map((i) => i.text)).toEqual(['Keep me'])
  })

  it('moves a stop without re-running smart clustering', async () => {
    resetStore([
      { time: '09:00', text: 'Stop A', type: 'option', day: 1 },
      { time: '10:00', text: 'Stop B', type: 'option', day: 1 },
    ])
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    const { result } = renderHook(() => useItineraryActions('t1'))
    const entries = result.current.itinerary.map((item, index) => ({ item, index }))
    act(() => result.current.moveStop(entries, 0, 1))
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string }>
    expect(persisted.map((i) => i.text)).toEqual(['Stop B', 'Stop A'])
  })

  it('persists a trip length change and re-clusters from scratch', async () => {
    resetStore([{ time: '', text: 'Stop A', type: 'option', day: 5 }], 5)
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
      tripLengthDays: 1,
    })
    const { result } = renderHook(() => useItineraryActions('t1'))
    await act(async () => {
      await result.current.setTripLength(1)
    })
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy.mock.calls[0][1].tripLengthDays).toBe(1)
  })
})
