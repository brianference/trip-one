import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { mergePreservingUnmentionedDays } from './useItineraryActions'
import type { ItineraryItem } from '../../../lib/validation/schemas'
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
  })

  it('adds real nearby suggestions when growing the trip length past the current pace', async () => {
    resetStore([{ time: '', text: 'Stop A', type: 'option' }])
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    const { result } = renderHook(() => useItineraryActions('t1'))
    await act(async () => {
      await result.current.setTripLength(1, [
        { name: 'Belem Tower', category: 'tourist_attraction', source: 'places', rating: 4.8 },
        { name: 'Alfama Walk', category: 'attraction', source: 'tripadvisor', rating: 4.5 },
      ])
    })
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string }>
    expect(persisted.map((i) => i.text)).toContain('Belem Tower')
    expect(persisted.map((i) => i.text)).toContain('Alfama Walk')
    expect(updateSpy.mock.calls[0][1].tripLengthDays).toBe(1)
  })

  it('applyPlan maps grounded indices to real places, carrying coords/category and the AI day/order', async () => {
    resetStore([{ time: '', text: 'Old plan', type: 'option' }], 2)
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'chronicle',
    })
    const places = [
      { name: 'Belem Tower', category: 'tourist_attraction', source: 'places' as const, lat: 38.69, lng: -9.21 },
      { name: 'War Museum', category: 'museum', source: 'places' as const, lat: 38.71, lng: -9.13 },
      { name: 'Time Out Market', category: 'restaurant', source: 'places' as const, lat: 38.71, lng: -9.14 },
    ]
    const { result } = renderHook(() => useItineraryActions('t1'))
    act(() => {
      // day 1 = [market(2), tower(0)], day 2 = [museum(1)] — AI order preserved, no re-clustering
      result.current.applyPlan([{ day: 1, placeIndexes: [2, 0] }, { day: 2, placeIndexes: [1] }], places, 2)
    })
    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string; day?: number; lat?: number; category?: string }>
    expect(persisted.map((i) => i.text)).toEqual(['Time Out Market', 'Belem Tower', 'War Museum'])
    expect(persisted.map((i) => i.day)).toEqual([1, 1, 2])
    expect(persisted[1].lat).toBe(38.69)
    expect(persisted[1].category).toBe('tourist_attraction')
    expect(updateSpy.mock.calls[0][1].tripLengthDays).toBe(2)
    // old itinerary was fully replaced, not appended
    expect(persisted.map((i) => i.text)).not.toContain('Old plan')
  })
})

// A chat edit is scoped to the days it mentions. Applying the model's reply
// wholesale replaced the itinerary and silently deleted every other day's
// stops — data loss on a saved trip, triggered by a request to ADD something.
describe('mergePreservingUnmentionedDays', () => {
  const item = (day: number, text: string): ItineraryItem => ({ time: '', text, type: 'fixed', day })

  it('keeps days the revision never mentions', () => {
    const existing = [item(1, 'Fushimi Inari'), item(2, 'Kiyomizu-dera'), item(3, 'Kinkaku-ji')]
    // The model answered about day 2 only.
    const planned = [item(2, 'Kiyomizu-dera'), item(2, 'Ramen Sen no Kaze')]
    const merged = mergePreservingUnmentionedDays(existing, planned, [{ day: 2, placeIndexes: [0, 1] }])

    expect(merged.map((i) => i.text)).toEqual([
      'Fushimi Inari',
      'Kiyomizu-dera',
      'Ramen Sen no Kaze',
      'Kinkaku-ji',
    ])
  })

  // The distinction that makes the merge safe: present-but-empty is a real
  // instruction ("clear day 3"), absent is not.
  it('honours an explicit clear of a day', () => {
    const existing = [item(1, 'Fushimi Inari'), item(3, 'Kinkaku-ji')]
    const merged = mergePreservingUnmentionedDays(existing, [], [{ day: 3, placeIndexes: [] }])
    expect(merged.map((i) => i.text)).toEqual(['Fushimi Inari'])
  })

  it('replaces the stops of a day that IS mentioned', () => {
    const existing = [item(1, 'Old stop A'), item(1, 'Old stop B'), item(2, 'Untouched')]
    const planned = [item(1, 'New stop')]
    const merged = mergePreservingUnmentionedDays(existing, planned, [{ day: 1, placeIndexes: [0] }])
    expect(merged.map((i) => i.text)).toEqual(['New stop', 'Untouched'])
  })

  it('returns days in order', () => {
    const existing = [item(3, 'Day three'), item(1, 'Day one')]
    const planned = [item(2, 'Day two')]
    const merged = mergePreservingUnmentionedDays(existing, planned, [{ day: 2, placeIndexes: [0] }])
    expect(merged.map((i) => i.day)).toEqual([1, 2, 3])
  })
})
