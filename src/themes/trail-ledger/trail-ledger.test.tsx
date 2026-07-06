import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import { LocalInfoScreen } from './LocalInfoScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'
import * as loggerModule from '../../lib/logger'

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

describe('Trail Ledger theme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Test that OverviewScreen renders as a table row, not a card.
   */
  it('OverviewScreen renders as a table row, not a card', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't5',
      locationSlug: 'reykjavik-iceland',
      itinerary: [],
      designStyle: 'trail-ledger',
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'reykjavik-iceland',
      displayName: 'Reykjavik, Iceland',
      lat: 64.128,
      lng: -21.9426,
      thingsToDo: [],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({
      data: { temperatureF: 39, condition: 'Overcast', isFallback: false },
      error: null,
      loading: false,
    })

    render(
      <MemoryRouter initialEntries={['/trip/t5']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText('Reykjavik, Iceland')).toBeInTheDocument()
  })

  /**
   * Test that ItineraryScreen renders itinerary items as table rows.
   */
  it('ItineraryScreen renders itinerary items as table rows', () => {
    useTripStore.setState({
      tripId: 't5',
      locationSlug: 'reykjavik-iceland',
      itinerary: [{ time: '09:00', text: 'Blue Lagoon', type: 'option' }],
      designStyle: 'trail-ledger',
    })

    render(<ItineraryScreen />)

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
  })

  /**
   * Test that ThingsToDoScreen lists items in a table.
   */
  it('ThingsToDoScreen lists items in a table', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'reykjavik-iceland',
      lat: 64.128,
      lng: -21.9426,
      displayName: 'Reykjavik, Iceland',
      thingsToDo: [{ name: 'Blue Lagoon', category: 'geothermal', source: 'tripadvisor' }],
    })
    render(<ThingsToDoScreen locationSlug="reykjavik-iceland" />)
    await waitFor(() => expect(screen.getByText('Blue Lagoon')).toBeInTheDocument())
    expect(screen.getByText('geothermal')).toBeInTheDocument()
  })

  /**
   * Test that ThingsToDoScreen handles fetch errors without crashing and logs the error.
   */
  it('ThingsToDoScreen handles fetch errors without crashing', async () => {
    const loggerSpy = vi.spyOn(loggerModule.logger, 'error')
    vi.spyOn(client, 'fetchLocation').mockRejectedValue(new Error('network error'))
    render(<ThingsToDoScreen locationSlug="reykjavik-iceland" />)
    await waitFor(() => expect(loggerSpy).toHaveBeenCalledWith('failed to load things to do', expect.any(Error)))
    // Verify no crash or unhandled rejection
    expect(screen.queryByRole('table')).toBeInTheDocument()
  })

  it('LocalInfoScreen shows the exchange rate and transit/phrasebook links in a table', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'reykjavik-iceland',
      lat: 64.128,
      lng: -21.9426,
      displayName: 'Reykjavik, Iceland',
      thingsToDo: [],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { ISK: 138.2 } }) }))
    render(<LocalInfoScreen locationSlug="reykjavik-iceland" />)
    await waitFor(() => expect(screen.getByText(/138\.2/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
  })
})
