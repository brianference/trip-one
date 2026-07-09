import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { useTripStore } from './store/tripStore'
import * as client from './lib/api/client'

vi.mock('leaflet', () => {
  const createMapMock = () => {
    const mapMock: { remove: ReturnType<typeof vi.fn>; setView: ReturnType<typeof vi.fn>; fitBounds: ReturnType<typeof vi.fn> } = {
      remove: vi.fn(),
      setView: vi.fn(),
      fitBounds: vi.fn(),
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
      polyline: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
    },
  }
})

/** Navigates the app's BrowserRouter by updating the jsdom location before render. */
function navigateTo(path: string) {
  window.history.pushState({}, '', path)
}

function mockTripAndLocation() {
  vi.spyOn(client, 'getTrip').mockResolvedValue({
    id: 't1',
    locationSlug: 'dublin-ireland',
    itinerary: [{ time: '09:00', text: 'Guinness Storehouse', type: 'option' }],
    designStyle: 'chronicle',
    tripLengthDays: null,
  })
  vi.spyOn(client, 'fetchLocation').mockResolvedValue({
    slug: 'dublin-ireland',
    lat: 53.35,
    lng: -6.26,
    displayName: 'Dublin, Ireland',
    thingsToDo: [],
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
}

// Chronicle is the app's only theme now — every trip route renders through
// it via real nested routes regardless of a trip's stored design_style
// (a leftover API field, no longer read for rendering decisions). There is
// no theme switcher anymore.
describe('App', () => {
  beforeEach(() => {
    useTripStore.setState({ tripId: null, locationSlug: null, itinerary: [], designStyle: 'chronicle', tripLengthDays: null })
    navigateTo('/')
  })

  afterEach(() => vi.restoreAllMocks())

  it('renders the Chronicle landing page at the root route, with no theme switcher', () => {
    render(<App />)
    expect(screen.getByLabelText(/where to/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/design/i)).not.toBeInTheDocument()
  })

  it('renders the Overview page at /trip/:id', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dublin, Ireland' })).toBeInTheDocument())
  })

  it('renders the Itinerary page at /trip/:id/itinerary', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1/itinerary')
    render(<App />)
    await waitFor(() => expect(screen.getByText('Guinness Storehouse')).toBeInTheDocument())
  })

  it('renders the Map page at /trip/:id/map', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1/map')
    render(<App />)
    await waitFor(() => expect(screen.getByLabelText(/map of dublin/i)).toBeInTheDocument())
  })

  it('renders the Things to Do page at /trip/:id/things-to-do', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1/things-to-do')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /things to do nearby/i })).toBeInTheDocument())
  })

  it('renders the Weather page at /trip/:id/weather with local info folded in', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1/weather')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /weather in/i })).toBeInTheDocument())
    // The still-useful local info (transit link) lives on the weather page now.
    expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument()
    // Dublin is English-speaking, so there's no phrasebook (and never a Google Translate link).
    expect(screen.queryByText(/phrasebook/i)).not.toBeInTheDocument()
  })

  it('keeps the old /local-info link working as a weather alias', async () => {
    mockTripAndLocation()
    navigateTo('/trip/t1/local-info')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /weather in/i })).toBeInTheDocument())
  })
})
