import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import { LocalInfoScreen } from './LocalInfoScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: { remove: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn> } = {
      remove: vi.fn(),
      setView: vi.fn(),
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
    },
  }
})

describe('Chronicle theme', () => {
  it('SearchScreen creates a trip and navigates', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't2', locationSlug: 'kyoto-japan', itinerary: [], designStyle: 'chronicle' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Kyoto, Japan' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('kyoto-japan'))
  })

  it('OverviewScreen renders the location as a day-one chapter heading', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't2', locationSlug: 'kyoto-japan', itinerary: [], designStyle: 'chronicle' })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureF: 64, condition: 'Clear', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t2']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent(/Kyoto, Japan/i))
  })

  it('ItineraryScreen renders items as timeline entries with a type dot', () => {
    useTripStore.setState({
      tripId: 't2',
      locationSlug: 'kyoto-japan',
      itinerary: [{ time: '09:00', text: 'Fushimi Inari', type: 'option' }],
      designStyle: 'chronicle',
    })
    render(<ItineraryScreen />)
    expect(screen.getByText('Fushimi Inari')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-dot-option')).toBeInTheDocument()
  })

  it('ThingsToDoScreen lists cached results', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [{ name: 'Fushimi Inari Shrine', category: 'attraction', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="kyoto-japan" />)
    await waitFor(() => expect(screen.getByText('Fushimi Inari Shrine')).toBeInTheDocument())
  })

  it('LocalInfoScreen shows the exchange rate and transit/phrasebook links', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 157.3 }) }))
    render(<LocalInfoScreen locationSlug="kyoto-japan" />)
    await waitFor(() => expect(screen.getByText(/157\.3/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
  })
})
