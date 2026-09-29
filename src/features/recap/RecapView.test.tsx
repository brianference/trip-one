import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RecapPayload } from './types'
import type { RecapStop } from './buildRecap'

/** The props RecapView last passed to the (stubbed) map, so tests can read and drive them. */
interface MapProps {
  route: RecapStop[]
  activeStopId: string | null
  onStopSelect: (stopId: string) => void
  playing?: boolean
  onPlayingChange?: (playing: boolean) => void
  pauseRequest?: number
}
let mapProps: MapProps | null = null

// Leaflet is covered by RecapMap's own suite; here the map is a stub that
// exposes its props, so the coordination between it and the slideshow is
// what gets tested.
vi.mock('./RecapMap', () => ({
  RecapMap: (props: MapProps) => {
    mapProps = props
    return <div data-testid="recap-map">map with {props.route.length} stops</div>
  },
}))

import { RecapView } from './RecapView'

/** Synthetic unit-test payload (never rendered in the product): 3 stops over 2 days, photos on stops a and c. */
const payload: RecapPayload = {
  title: null,
  displayName: 'Tokyo, Japan',
  startDate: '2026-09-05',
  tripLengthDays: 3,
  stops: [
    { stopId: 'a', day: 1, text: 'Shibuya Crossing', lat: 35.66, lng: 139.7, category: null },
    { stopId: 'b', day: 1, text: 'Ueno Park', lat: 35.71, lng: 139.77, category: null },
    { stopId: 'c', day: 2, text: 'Senso-ji', lat: 35.71, lng: 139.8, category: null },
  ],
  photos: [
    { id: 'p1', stopId: 'a', width: 1600, height: 1200, createdAt: '2026-09-05T10:00:00Z' },
    { id: 'p2', stopId: 'c', width: 1200, height: 1600, createdAt: '2026-09-06T10:00:00Z' },
  ],
}

/** Stubs `matchMedia` so only the reduced-motion query matches, and only when asked. */
function stubMatchMedia(reduceMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

/** Renders the view inside a router (the footer is a router link). */
function renderView(overrides: Partial<Parameters<typeof RecapView>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RecapView payload={payload} photoUrl={(id) => `/photos/${id}`} variant="owner" {...overrides} />
    </MemoryRouter>,
  )
}

/** The map props, asserting the stub has rendered. */
function map(): MapProps {
  if (!mapProps) throw new Error('map not rendered')
  return mapProps
}

beforeEach(() => {
  mapProps = null
  stubMatchMedia(false)
})
afterEach(() => vi.unstubAllGlobals())

describe('RecapView', () => {
  it('renders header, map, slideshow, day list and the next-trip footer, in that order', () => {
    renderView()
    const heading = screen.getByRole('heading', { level: 1, name: 'Tokyo, Japan trip' })
    expect(screen.getByText('Sep 5 – Sep 7, 2026')).toBeInTheDocument()
    const mapEl = screen.getByTestId('recap-map')
    const slideshow = screen.getByRole('region', { name: 'Photo slideshow' })
    const days = screen.getByRole('heading', { level: 2, name: 'Day by day' })
    const next = screen.getByRole('link', { name: 'Plan your next trip with us' })
    expect(next).toHaveAttribute('href', '/')

    const ordered = [heading, mapEl, slideshow, days, next]
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i - 1].compareDocumentPosition(ordered[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('uses the trip title when it has one', () => {
    renderView({ payload: { ...payload, title: 'Autumn in Tokyo' } })
    expect(screen.getByRole('heading', { level: 1, name: 'Autumn in Tokyo' })).toBeInTheDocument()
  })

  it('lists every stop under its day with its thumbnails', () => {
    renderView()
    const list = screen.getByRole('region', { name: 'Day by day' })
    expect(within(list).getByRole('heading', { level: 3, name: /^Day 1/ })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { level: 3, name: /^Day 2/ })).toBeInTheDocument()
    expect(within(list).getByText('Ueno Park')).toBeInTheDocument()
    const thumb = within(list).getByRole('img', { name: 'Senso-ji, day 2' })
    expect(thumb).toHaveAttribute('src', '/photos/p2')
  })

  it('passes the photoUrl function through to every image', () => {
    renderView({ photoUrl: (id) => `/api/recap/tok/photos/${id}` })
    for (const img of screen.getAllByRole('img')) {
      expect(img.getAttribute('src')).toMatch(/^\/api\/recap\/tok\/photos\/p[12]$/)
    }
  })

  it('autostarts the map walkthrough', () => {
    renderView()
    expect(map().playing).toBe(true)
  })

  it('does not autostart the map under reduced motion', () => {
    stubMatchMedia(true)
    renderView()
    expect(map().playing).toBe(false)
  })

  it('a slideshow move drives the map to that stop (the map follows along)', () => {
    renderView()
    expect(map().activeStopId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(map().activeStopId).toBe('c')
  })

  it("a map stop change moves the slideshow to that stop's first photo", () => {
    renderView()
    expect(screen.getByText('Day 1 · Stop 1 · Shibuya Crossing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Day 2 · Stop 3 · Senso-ji')).toBeInTheDocument()
    // The map selects stop a: the slideshow goes back to its photo.
    act(() => map().onStopSelect('a'))
    expect(screen.getByText('Day 1 · Stop 1 · Shibuya Crossing')).toBeInTheDocument()
    // A stop without photos leaves the slide alone.
    act(() => map().onStopSelect('b'))
    expect(screen.getByText('Day 1 · Stop 1 · Shibuya Crossing')).toBeInTheDocument()
  })

  it('one playback owner: starting the slideshow pauses the map, and the map playing pauses the slideshow', () => {
    renderView()
    const pauseBefore = map().pauseRequest
    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }))
    expect(screen.getByRole('button', { name: 'Pause slideshow' })).toBeInTheDocument()
    expect(map().pauseRequest).not.toBe(pauseBefore)

    // The map reports it started playing (its own Play button): the slideshow yields.
    act(() => map().onPlayingChange?.(true))
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeInTheDocument()
  })

  it('shows the add-photos hint for an owner with no photos, and no photo section for the public', () => {
    const noPhotos = { ...payload, photos: [] }
    const { unmount } = renderView({ payload: noPhotos })
    expect(screen.getByText('No photos yet. Add photos to your stops on the Plan page.')).toBeInTheDocument()
    unmount()
    renderView({ payload: noPhotos, variant: 'public' })
    expect(screen.queryByText(/No photos yet/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Photos' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Plan your next trip with us' })).toHaveAttribute('href', '/')
  })

  it('renders the owner header action next to the title', () => {
    renderView({ headerAction: <button type="button">Share recap</button> })
    expect(screen.getByRole('button', { name: 'Share recap' })).toBeInTheDocument()
  })
})
