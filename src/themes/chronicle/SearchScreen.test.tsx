import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import * as client from '../../lib/api/client'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'

describe('Chronicle SearchScreen', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates a trip with the chronicle design style and navigates to it', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'kyoto-japan',
      lat: 35.01,
      lng: 135.77,
      displayName: 'Kyoto, Japan',
      thingsToDo: [],
    })
    const createSpy = vi
      .spyOn(client, 'createTrip')
      .mockResolvedValue({ id: 't2', locationSlug: 'kyoto-japan', itinerary: [], designStyle: 'chronicle' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Kyoto, Japan' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith('kyoto-japan', 'chronicle'))
  })

  it('selecting an autocomplete suggestion creates a trip for that location', async () => {
    vi.spyOn(client, 'fetchAutocomplete').mockResolvedValue([
      { displayName: 'Lisbon, Portugal', lat: 38.7, lng: -9.1 },
    ])
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [],
    })
    const createSpy = vi
      .spyOn(client, 'createTrip')
      .mockResolvedValue({ id: 't3', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle' })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Lis' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /lisbon, portugal/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /lisbon, portugal/i }))
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith('lisbon-portugal', 'chronicle'))
  })

  it('shows an error message when trip creation fails', async () => {
    vi.spyOn(client, 'fetchLocation').mockRejectedValue(new Error('location not found'))
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Nowhereville' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/location not found/i))
  })

  it('links to both real demo trips', () => {
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /explore yellowstone/i })).toHaveAttribute('href', `/trip/${DEMO_TRIP_IDS.yellowstone}`)
    expect(screen.getByRole('link', { name: /explore tokyo/i })).toHaveAttribute('href', `/trip/${DEMO_TRIP_IDS.tokyo}`)
  })

  it('renders the feature grid and hero content', () => {
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /somewhere new, ready in a minute/i })).toBeInTheDocument()
    expect(screen.getByText('Live weather')).toBeInTheDocument()
    expect(screen.getByText('A real trip page')).toBeInTheDocument()
  })
})
