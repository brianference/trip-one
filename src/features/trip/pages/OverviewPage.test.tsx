import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OverviewPage } from './OverviewPage'
import { useTripStore } from '../../../store/tripStore'

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

describe('OverviewPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows real quick stats computed from store/location data, and a Next up preview with a jump link', async () => {
    outletContext = {
      trip: { id: 't1', locationSlug: 'lisbon-portugal', itinerary: [], designStyle: 'chronicle', tripLengthDays: 3 },
      location: {
        slug: 'lisbon-portugal',
        lat: 38.7,
        lng: -9.1,
        displayName: 'Lisbon, Portugal',
        thingsToDo: [{ name: 'Belem Tower', category: 'tourist_attraction', source: 'places' }],
      },
    }
    useTripStore.setState({
      itinerary: [{ time: '09:00', text: 'Breakfast', type: 'option' }],
      tripLengthDays: 3,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ current: { temperature_2m: 68, weather_code: 0 }, rate: 0.92 }),
      }),
    )

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Lisbon, Portugal' })).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '1 stop planned')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === '1 nearby suggestion')).toBeInTheDocument()
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see full itinerary/i })).toHaveAttribute('href', '/trip/t1/itinerary')
    expect(screen.getByRole('link', { name: /browse all things to do/i })).toHaveAttribute('href', '/trip/t1/things-to-do')
    expect(screen.getByRole('link', { name: /full info/i })).toHaveAttribute('href', '/trip/t1/local-info')

    await waitFor(() => expect(screen.getByText(/68°F/)).toBeInTheDocument())
  })

  it('shows a plan-your-itinerary prompt when there are no stops yet', () => {
    outletContext = {
      trip: { id: 't1', locationSlug: 'oslo-norway', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
      location: { slug: 'oslo-norway', lat: 59.9, lng: 10.75, displayName: 'Oslo, Norway', thingsToDo: [] },
    }
    useTripStore.setState({ itinerary: [], tripLengthDays: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/no stops yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /plan your itinerary/i })).toBeInTheDocument()
  })
})
