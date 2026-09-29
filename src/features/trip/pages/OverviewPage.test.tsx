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
    // Appears in both the under-map day list and the "Up next" preview.
    expect(screen.getAllByText('Breakfast').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /see full itinerary/i })).toHaveAttribute('href', '/trip/t1/itinerary')
    expect(screen.getByRole('link', { name: /browse all things to do/i })).toHaveAttribute('href', '/trip/t1/things-to-do')
    expect(screen.getByRole('link', { name: /weather & info/i })).toHaveAttribute('href', '/trip/t1/weather')

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

  describe('recap entry (fixed clock)', () => {
    /** Synthetic unit-test trip: 3 days from Sep 1 2026, with one stop that has two photos. */
    function renderTrip(startDate: string | null) {
      outletContext = {
        trip: { id: 't1', locationSlug: 'oslo-norway', itinerary: [], designStyle: 'chronicle', tripLengthDays: 3 },
        location: { slug: 'oslo-norway', lat: 59.9, lng: 10.75, displayName: 'Oslo, Norway', thingsToDo: [] },
      }
      useTripStore.setState({
        itinerary: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', time: '', text: 'Vigeland Park', type: 'option', day: 1 }],
        tripLengthDays: 3,
        startDate,
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => ({
          ok: true,
          json: async () =>
            url.endsWith('/api/trips/t1/photos')
              ? {
                  photos: [
                    { id: 'p1', stopId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', width: 10, height: 10, createdAt: '2026-09-01' },
                    { id: 'p2', stopId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', width: 10, height: 10, createdAt: '2026-09-02' },
                    // A photo whose stop was deleted: not in the recap, so not counted.
                    { id: 'p3', stopId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', width: 10, height: 10, createdAt: '2026-09-02' },
                  ],
                }
              : {},
        })),
      )
      render(
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>,
      )
    }

    afterEach(() => vi.useRealTimers())

    it('a trip whose last day is before today shows "Your trip is over" with a link to the recap', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 4, 9, 0))
      renderTrip('2026-09-01')
      expect(screen.getByRole('heading', { name: 'Your trip is over' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'See your trip recap' })).toHaveAttribute('href', '/trip/t1/recap')
      expect(screen.queryByRole('link', { name: /photos? so far/ })).toBeNull()
    })

    it('a trip still ahead (or under way) shows only the smaller "Recap (N photos so far)" entry', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 3, 9, 0))
      renderTrip('2026-09-01')
      expect(screen.queryByRole('heading', { name: 'Your trip is over' })).toBeNull()
      const entry = await screen.findByRole('link', { name: 'Recap (2 photos so far)' })
      expect(entry).toHaveAttribute('href', '/trip/t1/recap')
    })

    it('a trip with no start date shows the smaller entry', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2030, 0, 1))
      renderTrip(null)
      expect(screen.queryByRole('heading', { name: 'Your trip is over' })).toBeNull()
      expect(await screen.findByRole('link', { name: /^Recap \(/ })).toHaveAttribute('href', '/trip/t1/recap')
    })
  })
})
