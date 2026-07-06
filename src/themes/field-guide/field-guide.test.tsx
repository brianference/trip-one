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

describe('Field Guide theme', () => {
  it('SearchScreen creates a trip and navigates', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'yellowstone-demo',
      lat: 44.6,
      lng: -110.5,
      displayName: 'Yellowstone',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't3', locationSlug: 'yellowstone-demo', itinerary: [], designStyle: 'field-guide' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Yellowstone' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('yellowstone-demo'))
  })

  it('OverviewScreen renders the map hero with an overlay card', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't3', locationSlug: 'yellowstone-demo', itinerary: [], designStyle: 'field-guide' })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'yellowstone-demo',
      lat: 44.6,
      lng: -110.5,
      displayName: 'Yellowstone',
      thingsToDo: [],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureF: 50, condition: 'Clear', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t3']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('field-guide-overlay-card')).toHaveTextContent(/Yellowstone/i))
  })

  it('ItineraryScreen renders items as postcard entries', () => {
    useTripStore.setState({
      tripId: 't3',
      locationSlug: 'yellowstone-demo',
      itinerary: [{ time: '09:00', text: 'Old Faithful', type: 'option' }],
      designStyle: 'field-guide',
    })
    render(<ItineraryScreen />)
    expect(screen.getByText('Old Faithful')).toBeInTheDocument()
    expect(screen.getByLabelText(/Remove Old Faithful/i)).toBeInTheDocument()
  })

  it('ThingsToDoScreen renders results as postcard entries', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'yellowstone-demo',
      lat: 44.6,
      lng: -110.5,
      displayName: 'Yellowstone',
      thingsToDo: [{ name: 'Old Faithful', category: 'attraction', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="yellowstone-demo" />)
    await waitFor(() => expect(screen.getByText('Old Faithful')).toBeInTheDocument())
  })

  it('LocalInfoScreen shows the exchange rate and transit/phrasebook links', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'yellowstone-demo',
      lat: 44.6,
      lng: -110.5,
      displayName: 'Yellowstone, United States',
      thingsToDo: [],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 1 }) }))
    render(<LocalInfoScreen locationSlug="yellowstone-demo" />)
    await waitFor(() => expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
  })
})
