import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WeatherPage } from './WeatherPage'
import { useTripStore } from '../../../store/tripStore'

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

function mockContext() {
  outletContext = {
    trip: { id: 't1', locationSlug: 'reykjavik-iceland', itinerary: [], designStyle: 'chronicle', tripLengthDays: 3 },
    location: { slug: 'reykjavik-iceland', lat: 64.1, lng: -21.9, displayName: 'Reykjavik, Iceland', thingsToDo: [] },
  }
  useTripStore.setState({ itinerary: [], tripLengthDays: 3 })
}

describe('WeatherPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows current conditions, a multi-day forecast, and folds in local info', async () => {
    mockContext()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        // The daily forecast request asks for the `daily=` fields.
        if (typeof url === 'string' && url.includes('daily=')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              daily: {
                time: ['2026-07-09', '2026-07-10'],
                temperature_2m_max: [55, 58],
                temperature_2m_min: [44, 46],
                weather_code: [3, 61],
                precipitation_probability_max: [20, 70],
              },
            }),
          })
        }
        return Promise.resolve({ ok: true, json: async () => ({ current: { temperature_2m: 52, weather_code: 3 }, rate: 140 }) })
      }),
    )

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /weather in reykjavik/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/52°F/)).toBeInTheDocument())
    // forecast strip rendered a day
    await waitFor(() => expect(screen.getByText(/70% precip/i)).toBeInTheDocument())
    // rain packing tip derived from the 70% day
    expect(screen.getByText(/pack a rain layer/i)).toBeInTheDocument()
    // local info section present (transit link from LocalInfoCard)
    expect(screen.getByRole('link', { name: /getting around/i })).toBeInTheDocument()
  })

  it('requests a 5-day forecast regardless of trip length', () => {
    mockContext()
    useTripStore.setState({ itinerary: [], tripLengthDays: 9 })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 52, weather_code: 3 } }) })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>,
    )

    const dailyCall = fetchMock.mock.calls.find(([url]) => typeof url === 'string' && url.includes('daily='))
    expect(dailyCall?.[0]).toContain('forecast_days=5')
  })
})
