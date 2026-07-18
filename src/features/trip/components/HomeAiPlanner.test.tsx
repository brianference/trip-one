import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomeAiPlanner } from './HomeAiPlanner'
import * as client from '../../../lib/api/client'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

function renderPlanner() {
  return render(
    <MemoryRouter>
      <HomeAiPlanner />
    </MemoryRouter>,
  )
}

describe('HomeAiPlanner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    navigateMock.mockReset()
  })

  it('turns one sentence into a real trip and opens its itinerary', async () => {
    const intentSpy = vi.spyOn(client, 'extractTripIntent').mockResolvedValue({
      destination: 'San Diego',
      days: 4,
      interests: 'family with kids, lots of stops',
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'san-diego-california',
      lat: 32.7,
      lng: -117.1,
      displayName: 'San Diego, California',
      thingsToDo: [
        { name: 'Balboa Park', category: 'park', source: 'places', rating: 4.8, lat: 32.73, lng: -117.14 },
        { name: 'Birch Aquarium', category: 'aquarium', source: 'places', rating: 4.7, lat: 32.87, lng: -117.25 },
      ],
    })
    const createSpy = vi
      .spyOn(client, 'createTrip')
      .mockResolvedValue({ id: 'trip-1', locationSlug: 'san-diego-california', itinerary: [], designStyle: 'chronicle' })
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue({ days: [{ day: 1, placeIndexes: [0] }], message: 'ok' })
    const updateSpy = vi
      .spyOn(client, 'updateTrip')
      .mockResolvedValue({ id: 'trip-1', locationSlug: 'san-diego-california', itinerary: [], designStyle: 'chronicle' })

    renderPlanner()
    fireEvent.change(screen.getByPlaceholderText(/San Diego/i), {
      target: { value: 'A fun 4-day San Diego trip with kids' },
    })
    fireEvent.click(screen.getByRole('button', { name: /plan my trip/i }))

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/trip/trip-1'))
    expect(intentSpy).toHaveBeenCalledWith('A fun 4-day San Diego trip with kids')
    expect(createSpy).toHaveBeenCalledWith('san-diego-california', 'chronicle')
    // the interests phrase (not the raw sentence) and the extracted day count drive the plan
    expect(genSpy).toHaveBeenCalledWith('family with kids, lots of stops', 4, expect.any(Array), expect.any(Object))
    // the built itinerary is persisted with the day count before navigating
    expect(updateSpy).toHaveBeenCalledWith('trip-1', expect.objectContaining({ tripLengthDays: 4 }))
  })

  it('asks for a place when the request names none', async () => {
    vi.spyOn(client, 'extractTripIntent').mockResolvedValue({ destination: null, days: null, interests: 'relaxing' })
    const fetchSpy = vi.spyOn(client, 'fetchLocation')

    renderPlanner()
    fireEvent.change(screen.getByPlaceholderText(/San Diego/i), { target: { value: 'somewhere relaxing' } })
    fireEvent.click(screen.getByRole('button', { name: /plan my trip/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/where you.*d like to go/i))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('defaults to 3 days when the request omits a length', async () => {
    vi.spyOn(client, 'extractTripIntent').mockResolvedValue({ destination: 'Lisbon', days: null, interests: 'food' })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'lisbon-portugal',
      lat: 38.7,
      lng: -9.1,
      displayName: 'Lisbon, Portugal',
      thingsToDo: [{ name: 'Belem Tower', category: 'tourist_attraction', source: 'places', rating: 4.6 }],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({ id: 't', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle' })
    const genSpy = vi.spyOn(client, 'generatePlan').mockResolvedValue({ days: [{ day: 1, placeIndexes: [0] }], message: 'ok' })
    vi.spyOn(client, 'updateTrip').mockResolvedValue({ id: 't', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle' })

    renderPlanner()
    fireEvent.change(screen.getByPlaceholderText(/San Diego/i), { target: { value: 'Lisbon food trip' } })
    fireEvent.click(screen.getByRole('button', { name: /plan my trip/i }))

    await waitFor(() => expect(genSpy).toHaveBeenCalledWith('food', 3, expect.any(Array), expect.any(Object)))
  })

  it('shows an error and does not navigate when planning fails', async () => {
    vi.spyOn(client, 'extractTripIntent').mockRejectedValue(new Error('AI planner unavailable, try again'))

    renderPlanner()
    fireEvent.change(screen.getByPlaceholderText(/San Diego/i), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /plan my trip/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/unavailable/i))
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
