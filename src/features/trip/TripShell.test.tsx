import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TripShell } from './TripShell'
import { OverviewPage } from './pages/OverviewPage'
import { ItineraryPage } from './pages/ItineraryPage'
import * as client from '../../lib/api/client'

function renderShell(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/trip/:id" element={<TripShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="itinerary" element={<ItineraryPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('TripShell', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows a loading state, then the active page once the trip loads', async () => {
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    renderShell('/trip/t1')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lisbon, Portugal' })).toBeInTheDocument())
  })

  it('navigates to a real route when a nav link is clicked, without refetching the trip', async () => {
    const getTripSpy = vi.spyOn(client, 'getTrip').mockResolvedValue({
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    renderShell('/trip/t1')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lisbon, Portugal' })).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('link', { name: /itinerary/i })[0])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Itinerary' })).toBeInTheDocument())
    expect(getTripSpy).toHaveBeenCalledTimes(1)
  })
})
