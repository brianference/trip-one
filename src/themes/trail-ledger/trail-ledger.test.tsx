import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OverviewScreen } from './OverviewScreen'
import { ItineraryScreen } from './ItineraryScreen'
import { useTripStore } from '../../store/tripStore'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

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
      data: { temperatureC: 4, condition: 'Overcast', isFallback: false },
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
})
