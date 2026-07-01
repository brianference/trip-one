import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import * as client from '../../lib/api/client'

describe('SearchScreen', () => {
  it('creates a trip and navigates on submit', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [],
      designStyle: 'bento',
    })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Dublin, Ireland' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('dublin-ireland'))
  })

  it('shows an error message when the search fails', async () => {
    vi.spyOn(client, 'fetchLocation').mockRejectedValue(new Error('location not found'))
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Nowhereland' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/location not found/i))
  })
})
