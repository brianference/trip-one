import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripPlanPage } from './TripPlanPage'
import { useTripStore } from '../../../store/tripStore'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'
import * as client from '../../../lib/api/client'

const PHOTO_ERROR = 'This stop already has 6 photos. Remove one to add another.'
const STOP_ID = '5a0b1c2d-0000-4000-8000-000000000001'

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

vi.mock('../../photos/useTripPhotos', () => ({
  useTripPhotos: (): UseTripPhotosResult => ({
    byStop: new Map(),
    upload: vi.fn(),
    remove: vi.fn(),
    uploading: new Set(),
    error: PHOTO_ERROR,
  }),
}))

vi.mock('leaflet', () => {
  const map = () => {
    const m: Record<string, unknown> = { remove: vi.fn(), fitBounds: vi.fn(), getZoom: vi.fn(() => 13), on: vi.fn() }
    m.setView = vi.fn(() => m)
    return m
  }
  const layer = () => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis(), openPopup: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(), remove: vi.fn() })
  return {
    default: { map: vi.fn(map), tileLayer: vi.fn(layer), divIcon: vi.fn(() => ({})), marker: vi.fn(layer), polyline: vi.fn(layer) },
  }
})

/** Renders the Plan page for a one-stop Dublin trip whose photo state carries an error. */
function renderPlanPage() {
  outletContext = {
    trip: { id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'chronicle', tripLengthDays: 1 },
    location: { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, displayName: 'Dublin, Ireland', thingsToDo: [] },
  }
  return render(
    <MemoryRouter>
      <TripPlanPage />
    </MemoryRouter>,
  )
}

describe('TripPlanPage photo error', () => {
  afterEach(() => {
    // Unmount before resetting the store, so the reset doesn't re-render a live page outside act.
    cleanup()
    vi.restoreAllMocks()
    useTripStore.setState({ itinerary: [], focusPlace: null })
  })

  it('shows the photo error once on the page when no detail panel is open', () => {
    useTripStore.setState({ itinerary: [{ time: '09:00', text: 'Trinity College', type: 'fixed', id: STOP_ID, lat: 53.34, lng: -6.25 }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    renderPlanPage()
    expect(screen.getAllByRole('alert').filter((el) => el.textContent === PHOTO_ERROR)).toHaveLength(1)
  })

  it('announces the photo error exactly once while the stop detail panel (which shows it too) is open', async () => {
    useTripStore.setState({
      itinerary: [{ time: '09:00', text: 'Trinity College', type: 'fixed', id: STOP_ID, lat: 53.34, lng: -6.25 }],
      focusPlace: { name: 'Trinity College', lat: 53.34, lng: -6.25, nonce: 1 },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    // A partial detail: only what the pin already knew, which the panel still renders in full.
    vi.spyOn(client, 'fetchPlaceDetails').mockResolvedValue({
      placeId: '',
      name: 'Trinity College',
      address: null,
      phone: null,
      rating: null,
      reviewCount: null,
      priceLevel: null,
      website: null,
      mapsUrl: null,
      openNow: null,
      hours: [],
      summary: null,
      reviews: [],
      photoRefs: [],
      serves: [],
      types: [],
      partial: true,
    })
    renderPlanPage()
    await waitFor(() => expect(screen.getByRole('heading', { name: /your photos/i })).toBeInTheDocument())
    expect(screen.getAllByRole('alert').filter((el) => el.textContent === PHOTO_ERROR)).toHaveLength(1)
  })
})
