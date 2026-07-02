import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import * as client from '../../lib/api/client'

describe('SearchScreen', () => {
  afterEach(() => vi.useRealTimers())

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

  it('shows debounced autocomplete suggestions and creates a trip when one is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const autocompleteSpy = vi.spyOn(client, 'fetchAutocomplete').mockResolvedValue([
      { displayName: 'Dublin, Ireland', lat: 53.35, lng: -6.26 },
      { displayName: 'Dublin, Ohio, USA', lat: 40.1, lng: -83.11 },
    ])
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

    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'dublin' } })
    // debounced: should not fire immediately
    expect(autocompleteSpy).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(autocompleteSpy).toHaveBeenCalledWith('dublin')

    await waitFor(() => expect(screen.getByText('Dublin, Ohio, USA')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Dublin, Ohio, USA'))

    await waitFor(() => expect(client.fetchLocation).toHaveBeenCalledWith('Dublin, Ohio, USA'))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('dublin-ireland'))
  })
})
