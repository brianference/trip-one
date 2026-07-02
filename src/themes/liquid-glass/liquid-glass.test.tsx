import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { ThingsToDoScreen } from './ThingsToDoScreen'
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

describe('Liquid Glass theme', () => {
  it('SearchScreen creates a trip and navigates', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't4', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'liquid-glass' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Lisbon, Portugal' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('lisbon-portugal'))
  })

  it('remove-item tap targets are at least 44px per the mobile-optimization requirement', () => {
    useTripStore.setState({ tripId: 't4', locationSlug: 'lisbon-portugal', itinerary: [{ time: '09:00', text: 'Belem Tower', type: 'option' }], designStyle: 'liquid-glass' })
    render(<ItineraryScreen />)
    const removeButton = screen.getByLabelText(/remove belem tower/i)
    expect(removeButton.className).toContain('lg-tap-target')
  })

  it('OverviewScreen renders the location with weather in a glass card', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't4', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'liquid-glass' })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureF: 72, condition: 'Sunny', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t4']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent(/Lisbon, Portugal/i))
    expect(screen.getByText('Sunny')).toBeInTheDocument()
  })

  it('ItineraryScreen renders items with remove buttons marked as tap targets', () => {
    useTripStore.setState({
      tripId: 't4',
      locationSlug: 'lisbon-portugal',
      itinerary: [{ time: '09:00', text: 'Belem Tower', type: 'option' }],
      designStyle: 'liquid-glass',
    })
    render(<ItineraryScreen />)
    expect(screen.getByText('Belem Tower')).toBeInTheDocument()
    const removeButton = screen.getByLabelText(/Remove Belem Tower/i)
    expect(removeButton).toHaveClass('lg-tap-target')
  })

  it('ItineraryScreen input fields are tap targets', () => {
    useTripStore.setState({
      tripId: 't4',
      locationSlug: 'lisbon-portugal',
      itinerary: [],
      designStyle: 'liquid-glass',
    })
    render(<ItineraryScreen />)
    const timeInput = screen.getByLabelText(/time/i)
    const textInput = screen.getByLabelText(/what/i)
    const addButton = screen.getByRole('button', { name: /add stop/i })
    expect(timeInput).toHaveClass('lg-tap-target')
    expect(textInput).toHaveClass('lg-tap-target')
    expect(addButton).toHaveClass('lg-tap-target')
  })

  it('ThingsToDoScreen lists cached results with add buttons', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [{ name: 'Pasteis de Nata', category: 'food', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="lisbon-portugal" />)
    await waitFor(() => expect(screen.getByText('Pasteis de Nata')).toBeInTheDocument())
    expect(screen.getByText('(food)')).toBeInTheDocument()
    const addButton = screen.getByRole('button', { name: /add/i })
    expect(addButton).toHaveClass('lg-tap-target')
  })
})
