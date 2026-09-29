import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { RecapStop } from './buildRecap'
import type { RecapPayload } from './types'
import { useTripStore } from '../../store/tripStore'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'

/** The route the (stubbed) map last received. */
let mapRoute: RecapStop[] = []
vi.mock('./RecapMap', () => ({
  RecapMap: (props: { route: RecapStop[] }) => {
    mapRoute = props.route
    return <div data-testid="recap-map" />
  },
}))

let outletContext: unknown
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

import { RecapPublicPage, RECAP_INACTIVE_MESSAGE } from './RecapPublicPage'
import { TripRecapPage } from './TripRecapPage'

/** Synthetic unit-test values (never rendered in the product). */
const TRIP_ID = '11111111-2222-4333-8444-555555555555'
const STOP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STOP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345'

const publicPayload: RecapPayload = {
  title: 'Autumn in Oslo',
  displayName: 'Oslo, Norway',
  startDate: '2026-09-01',
  tripLengthDays: 2,
  stops: [
    { stopId: STOP_A, day: 1, text: 'Vigeland Park', lat: 59.927, lng: 10.7, category: null },
    { stopId: STOP_B, day: 2, text: 'Oslo Opera House', lat: 59.907, lng: 10.753, category: null },
  ],
  photos: [{ id: 'p1', stopId: STOP_B, width: 1600, height: 1200, createdAt: '2026-09-02T10:00:00Z' }],
}

/** Stubs fetch with one JSON response per URL suffix. */
function stubFetch(routes: Record<string, { status: number; body: unknown }>) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const match = Object.entries(routes).find(([suffix]) => url.endsWith(suffix))
    if (!match) throw new Error(`unexpected fetch ${url}`)
    const [, { status, body }] = match
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Renders the public route at /recap/:token. */
function renderPublic(token = TOKEN) {
  return render(
    <MemoryRouter initialEntries={[`/recap/${token}`]}>
      <Routes>
        <Route path="/recap/:token" element={<RecapPublicPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mapRoute = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('RecapPublicPage', () => {
  it('loads the recap by token and serves photos through the token, never a trip URL', async () => {
    const fetchMock = stubFetch({ [`/api/recap/${TOKEN}`]: { status: 200, body: publicPayload } })
    const { container } = renderPublic()
    expect(await screen.findByRole('heading', { level: 1, name: 'Autumn in Oslo' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/recap/${TOKEN}`)
    for (const img of screen.getAllByRole('img')) {
      expect(img.getAttribute('src')).toBe(`/api/recap/${TOKEN}/photos/p1`)
    }
    expect(container.innerHTML).not.toContain('/trip/')
    await waitFor(() => expect(document.title).toBe('Autumn in Oslo recap — Trip One'))
    // The public view has no Share button and no owner-only hint.
    expect(screen.queryByRole('button', { name: 'Share recap' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Plan your next trip with us' })).toHaveAttribute('href', '/')
  })

  it('shows the inactive-link message on 404, still with the next-trip link', async () => {
    stubFetch({ [`/api/recap/${TOKEN}`]: { status: 404, body: { error: 'This recap link isn’t active anymore.' } } })
    renderPublic()
    // While loading, the title is the plain fallback, never "Trip recap recap".
    expect(document.title).toBe('Trip recap — Trip One')
    expect(await screen.findByRole('alert')).toHaveTextContent(RECAP_INACTIVE_MESSAGE)
    expect(RECAP_INACTIVE_MESSAGE).toBe('This recap link isn’t active anymore.')
    expect(document.title).toBe('Trip recap — Trip One')
    expect(screen.getByRole('link', { name: 'Plan your next trip with us' })).toHaveAttribute('href', '/')
  })

  it("shows the server's own text for other failures (rate limit)", async () => {
    const message = 'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
    stubFetch({ [`/api/recap/${TOKEN}`]: { status: 429, body: { error: message } } })
    renderPublic()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })
})

describe('TripRecapPage', () => {
  /** Sets up the trip context + store the way TripShell does, with the given trip id. */
  function renderOwner(tripId: string) {
    outletContext = {
      trip: { id: tripId, locationSlug: 'oslo-norway', itinerary: [], designStyle: 'chronicle', title: null },
      location: { slug: 'oslo-norway', lat: 59.9, lng: 10.75, displayName: 'Oslo, Norway', thingsToDo: [] },
    }
    useTripStore.setState({
      itinerary: [
        { id: STOP_A, time: '', text: 'Vigeland Park', type: 'option', day: 1, lat: 59.927, lng: 10.7 },
        // No day: defaults to day 1, like the server and buildRecap.
        { id: STOP_B, time: '', text: 'Oslo Opera House', type: 'option', lat: 59.907, lng: 10.753 },
      ],
      startDate: '2026-09-01',
      tripLengthDays: 2,
    })
    return render(
      <MemoryRouter>
        <TripRecapPage />
      </MemoryRouter>,
    )
  }

  it('builds the recap from the live trip and its photo list, with owner photo URLs and a Share button', async () => {
    stubFetch({
      [`/api/trips/${TRIP_ID}/photos`]: {
        status: 200,
        body: { photos: [{ id: 'p1', stopId: STOP_A, width: 1600, height: 1200, createdAt: '2026-09-01T10:00:00Z' }] },
      },
      [`/api/trips/${TRIP_ID}/invites`]: { status: 200, body: { invites: [] } },
    })
    renderOwner(TRIP_ID)
    expect(await screen.findByRole('heading', { level: 1, name: 'Oslo, Norway trip' })).toBeInTheDocument()
    expect(mapRoute.map((stop) => [stop.stopId, stop.day, stop.order])).toEqual([
      [STOP_A, 1, 1],
      [STOP_B, 1, 2],
    ])
    // The slide and the day-list thumbnail both load from the owner photo route.
    const images = screen.getAllByRole('img', { name: 'Vigeland Park, day 1' })
    expect(images).toHaveLength(2)
    for (const img of images) expect(img).toHaveAttribute('src', `/api/trips/${TRIP_ID}/photos/p1`)
    expect(screen.getByRole('button', { name: 'Share recap' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Invite people to add photos' })).toBeInTheDocument()
  })

  it('shows no Share button on a demo trip (the server refuses demo recap links)', async () => {
    stubFetch({ [`/api/trips/${DEMO_TRIP_IDS.tokyo}/photos`]: { status: 200, body: { photos: [] } } })
    renderOwner(DEMO_TRIP_IDS.tokyo)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share recap' })).toBeNull()
    expect(screen.getByText('No photos yet. Add photos to your stops on the Plan page.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Invite people to add photos' })).toBeNull()
  })
})
