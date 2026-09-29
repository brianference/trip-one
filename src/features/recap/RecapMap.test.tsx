import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import L from 'leaflet'
import { RecapMap } from './RecapMap'
import type { RecapStop } from './buildRecap'

vi.mock('leaflet', () => {
  const createPolylineMock = () => {
    const polylineMock: { addTo: ReturnType<typeof vi.fn>; setLatLngs: ReturnType<typeof vi.fn> } = {
      addTo: vi.fn(),
      setLatLngs: vi.fn(),
    }
    polylineMock.addTo = vi.fn(() => polylineMock)
    polylineMock.setLatLngs = vi.fn(() => polylineMock)
    return polylineMock
  }

  const createMarkerMock = () => {
    const markerMock: { addTo: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } = {
      addTo: vi.fn(),
      on: vi.fn(),
    }
    markerMock.addTo = vi.fn(() => markerMock)
    markerMock.on = vi.fn(() => markerMock)
    return markerMock
  }

  const createMapMock = () => {
    const mapMock: {
      remove: ReturnType<typeof vi.fn>
      setView: ReturnType<typeof vi.fn>
      getZoom: ReturnType<typeof vi.fn>
    } = {
      remove: vi.fn(),
      setView: vi.fn(),
      getZoom: vi.fn(() => 12),
    }
    mapMock.setView = vi.fn(() => mapMock)
    return mapMock
  }

  return {
    default: {
      map: vi.fn(createMapMock),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      divIcon: vi.fn((opts: { html?: string | HTMLElement }) => ({ __mockDivIcon: true, html: opts?.html })),
      marker: vi.fn(createMarkerMock),
      polyline: vi.fn(createPolylineMock),
    },
  }
})

/** A stop factory so each test only spells out what it cares about. */
function stop(overrides: Partial<RecapStop>): RecapStop {
  return {
    stopId: 's1',
    day: 1,
    order: 1,
    text: 'A stop',
    lat: 35.66,
    lng: 139.7,
    photos: [],
    ...overrides,
  }
}

const threeStops: RecapStop[] = [
  stop({ stopId: 'a', order: 1, text: 'Shibuya Crossing', lat: 35.66, lng: 139.7 }),
  stop({ stopId: 'b', order: 2, text: 'Ueno Park', lat: 35.7, lng: 139.77 }),
  stop({ stopId: 'c', order: 3, text: 'Senso-ji', lat: 35.72, lng: 139.8 }),
]

/** Controllable requestAnimationFrame stand-in: queues callbacks and runs them on demand with a chosen timestamp. */
function stubRaf() {
  let nextId = 1
  const queue = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  const rafSpy = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId
    nextId += 1
    queue.set(id, cb)
    return id
  })
  const cafSpy = vi.fn((id: number) => {
    cancelled.push(id)
    queue.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', rafSpy)
  vi.stubGlobal('cancelAnimationFrame', cafSpy)
  return {
    rafSpy,
    cafSpy,
    cancelled,
    /** Runs every currently-queued frame callback with the given timestamp, then clears the queue. */
    flush(now: number) {
      const callbacks = [...queue.values()]
      queue.clear()
      act(() => {
        for (const cb of callbacks) cb(now)
      })
    },
    pendingCount() {
      return queue.size
    },
  }
}

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

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RecapMap', () => {
  it('renders without throwing for an empty route', () => {
    expect(() =>
      render(<RecapMap route={[]} activeStopId={null} onStopSelect={vi.fn()} />),
    ).not.toThrow()
    expect(vi.mocked(L).marker).not.toHaveBeenCalled()
    expect(vi.mocked(L).polyline).not.toHaveBeenCalled()
  })

  it('renders without throwing for a single-stop route (no legs to animate)', () => {
    expect(() =>
      render(<RecapMap route={[threeStops[0]]} activeStopId={null} onStopSelect={vi.fn()} />),
    ).not.toThrow()
    expect(vi.mocked(L).marker).toHaveBeenCalledTimes(1)
    // A single stop has no leg, so no traveled/full-route polyline is drawn.
    expect(vi.mocked(L).polyline).not.toHaveBeenCalled()
  })

  it('builds one numbered marker per stop with an accessible "Stop N: {name}" name', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    const divIconMock = vi.mocked(L).divIcon
    expect(divIconMock).toHaveBeenCalledTimes(3)

    const labels = divIconMock.mock.calls.map((call) => {
      const html = call[0]?.html
      expect(html).toBeInstanceOf(HTMLElement)
      return (html as HTMLElement).getAttribute('aria-label')
    })
    expect(labels).toEqual(['Stop 1: Shibuya Crossing', 'Stop 2: Ueno Park', 'Stop 3: Senso-ji'])
  })

  it('draws a dashed full route connecting every stop in order', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    const polylineMock = vi.mocked(L).polyline
    // First polyline call is the dashed full route.
    expect(polylineMock).toHaveBeenCalledWith(
      [
        [35.66, 139.7],
        [35.7, 139.77],
        [35.72, 139.8],
      ],
      expect.objectContaining({ dashArray: expect.any(String) }),
    )
  })

  it('draws a second, solid polyline for the traveled line', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    const polylineMock = vi.mocked(L).polyline
    expect(polylineMock).toHaveBeenCalledTimes(2)
    const [, [, traveledOptions]] = polylineMock.mock.calls
    expect(traveledOptions).not.toHaveProperty('dashArray')
  })

  it('excludes stops without coordinates from the route', () => {
    const withGap: RecapStop[] = [
      stop({ stopId: 'a', order: 1, lat: 35.66, lng: 139.7 }),
      stop({ stopId: 'b', order: 2, lat: null, lng: null }),
      stop({ stopId: 'c', order: 3, lat: 35.72, lng: 139.8 }),
    ]
    render(<RecapMap route={withGap} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(vi.mocked(L).marker).toHaveBeenCalledTimes(2)
  })

  it('clicking a marker calls onStopSelect with that stop id', () => {
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)
    const markerMock = vi.mocked(L).marker
    const secondMarkerInstance = markerMock.mock.results[1].value as { on: ReturnType<typeof vi.fn> }
    const clickHandler = secondMarkerInstance.on.mock.calls.find((call) => call[0] === 'click')?.[1]
    expect(clickHandler).toBeTypeOf('function')
    act(() => {
      clickHandler()
    })
    expect(onStopSelect).toHaveBeenCalledWith('b')
  })

  it('renders real Play/Pause and speed buttons', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /slow/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /normal/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /fast/i })).toBeInstanceOf(HTMLButtonElement)
  })

  it('pans to the active stop with setView({ animate: false }) when activeStopId is set externally', () => {
    render(<RecapMap route={threeStops} activeStopId="b" onStopSelect={vi.fn()} />)
    const mapInstance = vi.mocked(L).map.mock.results[0].value as { setView: ReturnType<typeof vi.fn> }
    expect(mapInstance.setView).toHaveBeenCalledWith([35.7, 139.77], expect.any(Number), { animate: false })
  })

  it('animates the traveled line leg by leg via requestAnimationFrame when Play is pressed', () => {
    const raf = stubRaf()
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(raf.rafSpy).toHaveBeenCalled()

    // First frame establishes the animation's start timestamp and reveals
    // only a partial leg (progress is always 0 on the very first tick).
    raf.flush(1000)
    const polylineMock = vi.mocked(L).polyline
    const traveledInstance = polylineMock.mock.results[1].value as { setLatLngs: ReturnType<typeof vi.fn> }
    expect(traveledInstance.setLatLngs).toHaveBeenCalled()
    expect(onStopSelect).not.toHaveBeenCalled()

    // A frame at start + the normal-speed 2500ms leg duration completes the leg.
    raf.flush(1000 + 2500)
    expect(onStopSelect).toHaveBeenCalledWith('b')
  })

  it('cancels the animation frame on Pause', () => {
    const raf = stubRaf()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(raf.pendingCount()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    expect(raf.cafSpy).toHaveBeenCalled()
  })

  it('cancels the animation frame on unmount mid-animation', () => {
    const raf = stubRaf()
    const { unmount } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(raf.pendingCount()).toBe(1)
    unmount()
    expect(raf.cafSpy).toHaveBeenCalled()
  })

  it('draws the full traveled line at once and steps stop to stop with no animation under prefers-reduced-motion', () => {
    stubMatchMedia(true)
    const raf = stubRaf()
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    // A single queued frame completes the whole leg immediately (no easing steps).
    raf.flush(0)
    expect(onStopSelect).toHaveBeenCalledWith('b')

    const polylineMock = vi.mocked(L).polyline
    const traveledInstance = polylineMock.mock.results[1].value as { setLatLngs: ReturnType<typeof vi.fn> }
    const lastCall = traveledInstance.setLatLngs.mock.calls.at(-1)?.[0] as [number, number][]
    // Full leg drawn straight to the endpoint, not a partial sub-segment.
    expect(lastCall.at(-1)).toEqual([35.7, 139.77])
  })
})
