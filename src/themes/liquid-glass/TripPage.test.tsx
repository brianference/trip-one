import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TripPage } from './TripPage'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: { remove: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> } = {
      remove: vi.fn(),
      setView: vi.fn(),
      fitBounds: vi.fn(),
    }
    mapMock.setView = vi.fn(() => mapMock)
    return mapMock
  }
  return {
    default: {
      map: vi.fn(createMapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
      polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
    },
  }
})

describe('Liquid Glass TripPage', () => {
  afterEach(() => vi.restoreAllMocks())

  function mockTripAndLocation(overrides: { itinerary?: unknown[]; tripLengthDays?: number | null } = {}) {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: (overrides.itinerary as never) ?? [],
      designStyle: 'liquid-glass',
      tripLengthDays: overrides.tripLengthDays ?? null,
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [
        { name: 'Belem Tower', category: 'tourist_attraction', source: 'places', lat: 38.69, lng: -9.21 },
        { name: 'Cafe A Brasileira', category: 'cafe', source: 'places', lat: 38.71, lng: -9.14 },
      ],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({
      data: { temperatureF: 68, condition: 'Sunny', isFallback: false },
      error: null,
      loading: false,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
  }

  it('renders a trip length control and persists a change', async () => {
    mockTripAndLocation()
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'liquid-glass',
      tripLengthDays: 3,
    })
    render(<TripPage tripId="t1" />)
    await waitFor(() => expect(screen.getByText(/lisbon, portugal/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/trip length/i), { target: { value: '3' } })

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const callArgs = updateSpy.mock.calls[0][1]
    expect(callArgs.tripLengthDays).toBe(3)
  })

  it('carries real coordinates and category through when adding a things-to-do suggestion', async () => {
    mockTripAndLocation()
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'liquid-glass',
      tripLengthDays: null,
    })
    render(<TripPage tripId="t1" />)
    await waitFor(() => expect(screen.getByText('Belem Tower')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: /^add$/i })[0])

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persistedItinerary = updateSpy.mock.calls[0][1].itinerary as Array<{
      text: string
      lat?: number
      lng?: number
      category?: string
    }>
    const belem = persistedItinerary?.find((i) => i.text === 'Belem Tower')
    expect(belem?.lat).toBe(38.69)
    expect(belem?.lng).toBe(-9.21)
    expect(belem?.category).toBe('tourist_attraction')
  })

  it('groups the itinerary display by day once a multi-day trip length is set', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'liquid-glass', tripLengthDays: null })
    mockTripAndLocation({
      tripLengthDays: 2,
      itinerary: [
        { time: '', text: 'Stop A', type: 'option', day: 1 },
        { time: '', text: 'Stop B', type: 'option', day: 2 },
      ],
    })
    render(<TripPage tripId="t1" />)
    await waitFor(() => expect(screen.getByText('Stop A')).toBeInTheDocument())
    // "Day 1"/"Day 2" appear both as map route tabs and itinerary day
    // headings when a multi-day trip length is set — assert on the heading
    // element specifically rather than any text match.
    expect(screen.getByRole('heading', { name: 'Day 1', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Day 2', level: 3 })).toBeInTheDocument()
  })

  it('shows day tabs above the map for a multi-day trip', async () => {
    mockTripAndLocation({ tripLengthDays: 2 })
    render(<TripPage tripId="t1" />)
    await waitFor(() => expect(screen.getByText(/lisbon, portugal/i)).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Day 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Day 2' })).toBeInTheDocument()
  })

  it('moving a stop down persists the new order without re-running smart clustering', async () => {
    mockTripAndLocation({
      itinerary: [
        { time: '', text: 'Stop A', type: 'option', day: 1 },
        { time: '', text: 'Stop B', type: 'option', day: 1 },
      ],
    })
    const updateSpy = vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'liquid-glass',
      tripLengthDays: null,
    })
    render(<TripPage tripId="t1" />)
    await waitFor(() => expect(screen.getByText('Stop A')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /move stop a later/i }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    const persisted = updateSpy.mock.calls[0][1].itinerary as Array<{ text: string }>
    expect(persisted.map((i) => i.text)).toEqual(['Stop B', 'Stop A'])
  })
})
