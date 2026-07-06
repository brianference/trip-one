import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { useTripStore, type DesignStyle } from './store/tripStore'
import * as client from './lib/api/client'
import * as forecastHook from './features/weather/useForecast'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: { remove: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn> } = {
      remove: vi.fn(),
      setView: vi.fn(),
    }
    mapMock.setView = vi.fn(() => mapMock)
    return mapMock
  }

  return {
    default: {
      map: vi.fn(createMapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      divIcon: vi.fn(() => ({})),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
    },
  }
})

/** Navigates the app's BrowserRouter by updating the jsdom location before render. */
function navigateTo(path: string) {
  window.history.pushState({}, '', path)
}

// Liquid Glass and Chronicle now render one unified page rather than a
// standalone itinerary-only screen, so their markers target a class that's
// present somewhere in that unified page rather than an itinerary-specific
// wrapper that no longer exists.
const ITINERARY_MARKER_BY_THEME: Record<DesignStyle, string> = {
  bento: 'bento-itinerary',
  chronicle: 'chronicle-chapter',
  'field-guide': 'field-guide-postcards',
  'liquid-glass': 'lg-glass-card',
  'trail-ledger': 'tl-ledger',
}

describe('App', () => {
  beforeEach(() => {
    useTripStore.setState({ tripId: null, locationSlug: null, itinerary: [], designStyle: 'bento' })
    navigateTo('/')
  })

  it('renders the search screen at the root route', () => {
    render(<App />)
    expect(screen.getByLabelText(/where to/i)).toBeInTheDocument()
  })

  it.each(Object.entries(ITINERARY_MARKER_BY_THEME))(
    'renders the %s theme at /trip/:id/itinerary',
    async (style, marker) => {
      useTripStore.setState({
        tripId: 't1',
        locationSlug: 'dublin-ireland',
        itinerary: [{ time: '09:00', text: 'Guinness Storehouse', type: 'option' }],
        designStyle: style as DesignStyle,
      })
      // Liquid Glass and Chronicle render one unified page that fetches the
      // trip/location itself (rather than trusting only pre-set store
      // state, like the other themes' standalone Itinerary screen does).
      vi.spyOn(client, 'getTrip').mockResolvedValue({
        id: 't1',
        locationSlug: 'dublin-ireland',
        itinerary: [{ time: '09:00', text: 'Guinness Storehouse', type: 'option' }],
        designStyle: style as DesignStyle,
      })
      vi.spyOn(client, 'fetchLocation').mockResolvedValue({
        slug: 'dublin-ireland',
        lat: 53.35,
        lng: -6.26,
        displayName: 'Dublin, Ireland',
        thingsToDo: [],
      })
      navigateTo('/trip/t1/itinerary')
      const { container } = render(<App />)
      await waitFor(() => expect(container.querySelector(`.${marker}`)).toBeInTheDocument())
      // Some themes split item text across sibling text nodes rather than a
      // single element, so assert on rendered text content directly instead
      // of `getByText`, which only matches a single node's own text.
      expect(container.textContent).toContain('Guinness Storehouse')
    },
  )

  it.each(Object.keys(ITINERARY_MARKER_BY_THEME) as DesignStyle[])(
    'renders the %s theme LocalInfoScreen at /trip/:id/local-info',
    async (style) => {
      useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: style })
      vi.spyOn(client, 'getTrip').mockResolvedValue({
        id: 't1',
        locationSlug: 'dublin-ireland',
        itinerary: [],
        designStyle: style,
      })
      vi.spyOn(client, 'fetchLocation').mockResolvedValue({
        slug: 'dublin-ireland',
        lat: 53.35,
        lng: -6.26,
        displayName: 'Dublin, Ireland',
        thingsToDo: [],
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
      navigateTo('/trip/t1/local-info')
      render(<App />)
      await waitFor(() => expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument())
      expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
      vi.unstubAllGlobals()
    },
  )

  it('renders the ThemeSwitcher alongside the matching theme Overview at /trip/:id', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'trail-ledger' })
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [],
      designStyle: 'trail-ledger',
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [],
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({
      data: { temperatureF: 57, condition: 'Overcast', isFallback: false },
      error: null,
      loading: false,
    })
    navigateTo('/trip/t1')
    render(<App />)
    expect(screen.getByLabelText(/design/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('cell', { name: 'Dublin, Ireland' })).toBeInTheDocument())
  })

  it('switching the ThemeSwitcher swaps the rendered Overview screen for a sibling theme', async () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    vi.spyOn(client, 'getTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [],
      designStyle: 'bento',
    })
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [],
    })
    vi.spyOn(client, 'updateTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [],
      designStyle: 'chronicle',
    })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({
      data: { temperatureF: 57, condition: 'Overcast', isFallback: false },
      error: null,
      loading: false,
    })
    navigateTo('/trip/t1')
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelector('.bento-grid')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/design/i), { target: { value: 'chronicle' } })

    await waitFor(() => expect(container.querySelector('.chronicle-chapter')).toBeInTheDocument())
    expect(container.querySelector('.bento-grid')).not.toBeInTheDocument()
    expect(client.updateTrip).toHaveBeenCalledWith('t1', { designStyle: 'chronicle' })
  })
})
