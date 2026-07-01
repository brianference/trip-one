import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import * as client from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

describe('ThingsToDoScreen', () => {
  it('shows cached things-to-do for the trip location', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor' }],
    })
    render(
      <MemoryRouter initialEntries={['/trip/t1/things-to-do']}>
        <Routes>
          <Route path="/trip/:id/things-to-do" element={<ThingsToDoScreen locationSlug="dublin-ireland" />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Trinity College')).toBeInTheDocument())
  })

  it('adds a selected item to the itinerary store', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor' }],
    })
    render(
      <MemoryRouter initialEntries={['/trip/t1/things-to-do']}>
        <Routes>
          <Route path="/trip/:id/things-to-do" element={<ThingsToDoScreen locationSlug="dublin-ireland" />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Trinity College')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add to itinerary/i }))
    expect(useTripStore.getState().itinerary).toHaveLength(1)
  })
})
