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
  vi.useRealTimers()
})

describe('RecapMap', () => {
  it('renders without throwing for an empty route', () => {
    expect(() => render(<RecapMap route={[]} activeStopId={null} onStopSelect={vi.fn()} />)).not.toThrow()
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

  it('pins zoomAnimation:false on the underlying Leaflet map (guards a real production crash)', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(vi.mocked(L).map).toHaveBeenCalledWith(expect.anything(), { zoomAnimation: false })
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

  it('clicking a marker redraws the traveled line up through that stop (no stale line left behind)', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    const markerMock = vi.mocked(L).marker
    const thirdMarkerInstance = markerMock.mock.results[2].value as { on: ReturnType<typeof vi.fn> }
    const clickHandler = thirdMarkerInstance.on.mock.calls.find((call) => call[0] === 'click')?.[1]
    act(() => {
      clickHandler()
    })
    const polylineMock = vi.mocked(L).polyline
    const traveledInstance = polylineMock.mock.results[1].value as { setLatLngs: ReturnType<typeof vi.fn> }
    expect(traveledInstance.setLatLngs).toHaveBeenLastCalledWith([
      [35.66, 139.7],
      [35.7, 139.77],
      [35.72, 139.8],
    ])
  })

  it('pressing Enter on a marker selects it, the same as a click', () => {
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)
    const markerMock = vi.mocked(L).marker
    const secondMarkerInstance = markerMock.mock.results[1].value as { on: ReturnType<typeof vi.fn> }
    const keyHandler = secondMarkerInstance.on.mock.calls.find((call) => call[0] === 'keypress')?.[1]
    expect(keyHandler).toBeTypeOf('function')
    act(() => {
      keyHandler({ originalEvent: { key: 'Enter' } })
    })
    expect(onStopSelect).toHaveBeenCalledWith('b')
  })

  it('pressing Space on a marker selects it, the same as a click', () => {
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)
    const markerMock = vi.mocked(L).marker
    const thirdMarkerInstance = markerMock.mock.results[2].value as { on: ReturnType<typeof vi.fn> }
    const keyHandler = thirdMarkerInstance.on.mock.calls.find((call) => call[0] === 'keypress')?.[1]
    act(() => {
      keyHandler({ originalEvent: { key: ' ' } })
    })
    expect(onStopSelect).toHaveBeenCalledWith('c')
  })

  it('ignores an unrelated keypress on a marker', () => {
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)
    const markerMock = vi.mocked(L).marker
    const secondMarkerInstance = markerMock.mock.results[1].value as { on: ReturnType<typeof vi.fn> }
    const keyHandler = secondMarkerInstance.on.mock.calls.find((call) => call[0] === 'keypress')?.[1]
    act(() => {
      keyHandler({ originalEvent: { key: 'a' } })
    })
    expect(onStopSelect).not.toHaveBeenCalled()
  })

  it('renders real Play/Pause and speed buttons', () => {
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /slow/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /normal/i })).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByRole('button', { name: /fast/i })).toBeInstanceOf(HTMLButtonElement)
  })

  it('pans to the active stop on initial render with setView({ animate: false })', () => {
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

  it('under prefers-reduced-motion, draws each leg fully at once and advances one stop per speed interval on a timer, not all at once', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    const onStopSelect = vi.fn()
    render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /play/i }))

    const polylineMock = vi.mocked(L).polyline
    const traveledInstance = polylineMock.mock.results[1].value as { setLatLngs: ReturnType<typeof vi.fn> }
    // The first leg is drawn straight to its endpoint immediately — no growing sub-segments.
    const firstDraw = traveledInstance.setLatLngs.mock.calls.at(-1)?.[0] as [number, number][]
    expect(firstDraw.at(-1)).toEqual([35.7, 139.77])
    expect(onStopSelect).not.toHaveBeenCalled()

    // Advancing less than the interval must not yet advance to the next stop.
    act(() => {
      vi.advanceTimersByTime(2499)
    })
    expect(onStopSelect).not.toHaveBeenCalled()

    // Reaching the (mocked, normal-speed 2500ms) interval advances exactly one stop, not all of them at once.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onStopSelect).toHaveBeenCalledTimes(1)
    expect(onStopSelect).toHaveBeenLastCalledWith('b')

    // The second leg is likewise drawn immediately, then waits its own interval.
    const secondDraw = traveledInstance.setLatLngs.mock.calls.at(-1)?.[0] as [number, number][]
    expect(secondDraw.at(-1)).toEqual([35.72, 139.8])
    expect(onStopSelect).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(onStopSelect).toHaveBeenCalledTimes(2)
    expect(onStopSelect).toHaveBeenLastCalledWith('c')
  })

  it('starts playback automatically on mount when playing is true and there is more than one stop, and reports it via onPlayingChange', () => {
    const raf = stubRaf()
    const onPlayingChange = vi.fn()
    render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} playing onPlayingChange={onPlayingChange} />,
    )
    expect(raf.rafSpy).toHaveBeenCalled()
    // isPlaying is seeded false so the mount-time autostart is a real
    // false->true transition, not a same-value no-op that would silently
    // swallow the very first "playback started" report.
    expect(onPlayingChange).toHaveBeenCalledWith(true)
    // Effects run before render() returns in tests, so the button has
    // already settled to "Pause" by the time we can observe it here.
    expect(screen.getByRole('button', { name: /pause/i })).toBeInstanceOf(HTMLButtonElement)
  })

  it('does not autostart when playing is true but there is only one stop (no legs to animate)', () => {
    const raf = stubRaf()
    render(<RecapMap route={[threeStops[0]]} activeStopId={null} onStopSelect={vi.fn()} playing />)
    expect(raf.rafSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement)
  })

  it('an external activeStopId hop to exactly the next stop animates that single leg without touching isPlaying', () => {
    const raf = stubRaf()
    const onStopSelect = vi.fn()
    const onPlayingChange = vi.fn()
    const { rerender } = render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} onPlayingChange={onPlayingChange} />,
    )

    rerender(
      <RecapMap route={threeStops} activeStopId="b" onStopSelect={onStopSelect} onPlayingChange={onPlayingChange} />,
    )

    // Single leg animates via the same rAF mechanism Play uses, but isPlaying never flips.
    expect(raf.rafSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement)
    expect(onPlayingChange).not.toHaveBeenCalled()

    raf.flush(0)
    raf.flush(2500)
    expect(onStopSelect).toHaveBeenCalledWith('b')
    // It must not chain into animating further legs beyond the single requested hop.
    expect(raf.pendingCount()).toBe(0)
  })

  it('an external activeStopId matching the leg already animating during playback does not start a duplicate animation', () => {
    const raf = stubRaf()
    const onPlayingChange = vi.fn()
    const { rerender } = render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(raf.rafSpy).toHaveBeenCalledTimes(1)
    expect(onPlayingChange).toHaveBeenCalledWith(true)

    rerender(
      <RecapMap route={threeStops} activeStopId="b" onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />,
    )

    // Still just the one animation from Play — the external hop matched the
    // leg already in flight and did not start a second one.
    expect(raf.rafSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /pause/i })).toBeInstanceOf(HTMLButtonElement)
    expect(onPlayingChange).not.toHaveBeenCalledWith(false)
  })

  it('pressing Play during an external +1 hop cancels the hop cleanly: exactly one onStopSelect, none after unmount', () => {
    const raf = stubRaf()
    const onStopSelect = vi.fn()
    const { rerender, unmount } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    // The hop starts animating leg 0->1 on its own.
    rerender(<RecapMap route={threeStops} activeStopId="b" onStopSelect={onStopSelect} />)
    expect(raf.rafSpy).toHaveBeenCalledTimes(1)

    // Play is pressed mid-hop. Without the fix, this overwrites rafIdRef and
    // the hop's own frame becomes uncancellable.
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(raf.cafSpy).toHaveBeenCalled() // the hop's frame was cancelled...
    expect(raf.pendingCount()).toBe(1) // ...and exactly one (restarted) frame replaces it

    // Complete the restarted leg.
    raf.flush(0)
    raf.flush(2500)
    expect(onStopSelect).toHaveBeenCalledTimes(1)
    expect(onStopSelect).toHaveBeenCalledWith('b')

    // Playback chains into leg 1->2; unmount mid-flight and confirm nothing
    // further fires — a leaked hop frame would otherwise survive unmount
    // (cleanup only cancels whichever id is currently referenced).
    unmount()
    raf.flush(99999)
    expect(onStopSelect).toHaveBeenCalledTimes(1)
  })

  it('pressing Play during an external +1 hop under reduced motion cancels the hop cleanly: exactly one onStopSelect, none after unmount', () => {
    stubMatchMedia(true)
    vi.useFakeTimers()
    const onStopSelect = vi.fn()
    const { rerender, unmount } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    // The hop draws the full leg immediately and schedules a 2500ms timer.
    rerender(<RecapMap route={threeStops} activeStopId="b" onStopSelect={onStopSelect} />)

    // Play is pressed mid-hop. Without the fix, this schedules a second,
    // independent 2500ms timer alongside the hop's uncancelled one.
    fireEvent.click(screen.getByRole('button', { name: /play/i }))

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(onStopSelect).toHaveBeenCalledTimes(1)
    expect(onStopSelect).toHaveBeenCalledWith('b')

    // Playback chains into leg 1->2; unmount mid-flight and confirm nothing
    // further fires.
    unmount()
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(onStopSelect).toHaveBeenCalledTimes(1)
  })

  it('an external activeStopId jump to a non-adjacent stop snaps, stops any animation, and reports playback stopped', () => {
    const raf = stubRaf()
    const onPlayingChange = vi.fn()
    const { rerender } = render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /play/i })) // currentIndex still 0, animating leg 0

    rerender(
      <RecapMap route={threeStops} activeStopId="c" onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />,
    )

    expect(raf.cafSpy).toHaveBeenCalled() // the in-flight leg-0 animation was cancelled
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement) // no longer playing
    expect(onPlayingChange).toHaveBeenCalledWith(false)

    const polylineMock = vi.mocked(L).polyline
    const traveledInstance = polylineMock.mock.results[1].value as { setLatLngs: ReturnType<typeof vi.fn> }
    expect(traveledInstance.setLatLngs).toHaveBeenLastCalledWith([
      [35.66, 139.7],
      [35.7, 139.77],
      [35.72, 139.8],
    ])

    const mapInstance = vi.mocked(L).map.mock.results[0].value as { setView: ReturnType<typeof vi.fn> }
    expect(mapInstance.setView).toHaveBeenLastCalledWith([35.72, 139.8], expect.any(Number), { animate: false })
  })

  it('ignores an external activeStopId that is not on the plotted route', () => {
    const onStopSelect = vi.fn()
    const onPlayingChange = vi.fn()
    const { rerender } = render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} onPlayingChange={onPlayingChange} />,
    )

    const mapInstance = vi.mocked(L).map.mock.results[0].value as { setView: ReturnType<typeof vi.fn> }
    mapInstance.setView.mockClear()

    rerender(
      <RecapMap
        route={threeStops}
        activeStopId="not-a-real-stop"
        onStopSelect={onStopSelect}
        onPlayingChange={onPlayingChange}
      />,
    )

    expect(mapInstance.setView).not.toHaveBeenCalled()
    expect(onStopSelect).not.toHaveBeenCalled()
    expect(onPlayingChange).not.toHaveBeenCalled()
  })

  it('a content-equal new route array does not rebuild the map', () => {
    const { rerender } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(vi.mocked(L).map).toHaveBeenCalledTimes(1)
    const mapInstance = vi.mocked(L).map.mock.results[0].value as { remove: ReturnType<typeof vi.fn> }

    const equalButNewRoute: RecapStop[] = threeStops.map((s) => ({ ...s }))
    rerender(<RecapMap route={equalButNewRoute} activeStopId={null} onStopSelect={vi.fn()} />)

    expect(vi.mocked(L).map).toHaveBeenCalledTimes(1)
    expect(mapInstance.remove).not.toHaveBeenCalled()
  })

  it('a stop rename rebuilds the map and gives its marker the updated accessible name (same id/order/coordinates)', () => {
    const { rerender } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} />)
    expect(vi.mocked(L).map).toHaveBeenCalledTimes(1)
    expect(vi.mocked(L).divIcon).toHaveBeenCalledTimes(3)

    const renamedStops: RecapStop[] = [threeStops[0], { ...threeStops[1], text: 'Ueno Park (renamed)' }, threeStops[2]]
    rerender(<RecapMap route={renamedStops} activeStopId={null} onStopSelect={vi.fn()} />)

    // stopId/order/lat/lng are all unchanged — only `text` differs — but the
    // signature includes `text`, so this must still be a real rebuild:
    // markers render the name in their aria-label, and a stale one left over
    // from the old identity-only signature would silently keep the old name.
    expect(vi.mocked(L).map).toHaveBeenCalledTimes(2)
    expect(vi.mocked(L).divIcon).toHaveBeenCalledTimes(6)
    const latestLabels = vi.mocked(L).divIcon.mock.calls.slice(3).map((call) => {
      const html = call[0]?.html as HTMLElement
      return html.getAttribute('aria-label')
    })
    expect(latestLabels).toEqual(['Stop 1: Shibuya Crossing', 'Stop 2: Ueno Park (renamed)', 'Stop 3: Senso-ji'])
  })

  it('a real route content change rebuilds the map, stops playback, and reports it via onPlayingChange', () => {
    const onPlayingChange = vi.fn()
    const { rerender } = render(
      <RecapMap route={threeStops} activeStopId={null} onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />,
    )
    const firstMapInstance = vi.mocked(L).map.mock.results[0].value as { remove: ReturnType<typeof vi.fn> }

    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(onPlayingChange).toHaveBeenLastCalledWith(true)

    const editedStops: RecapStop[] = [
      stop({ stopId: 'a', order: 1, text: 'Shibuya Crossing (moved)', lat: 35.6, lng: 139.6 }),
      threeStops[1],
      threeStops[2],
    ]
    rerender(<RecapMap route={editedStops} activeStopId={null} onStopSelect={vi.fn()} onPlayingChange={onPlayingChange} />)

    expect(vi.mocked(L).map).toHaveBeenCalledTimes(2)
    expect(firstMapInstance.remove).toHaveBeenCalled()
    expect(onPlayingChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole('button', { name: /play/i })).toBeInstanceOf(HTMLButtonElement)
  })

  it('clamps the current index into range when a route rebuild shrinks the stop list', () => {
    const onStopSelect = vi.fn()
    const { rerender } = render(<RecapMap route={threeStops} activeStopId={null} onStopSelect={onStopSelect} />)

    const markerMock = vi.mocked(L).marker
    const thirdMarkerInstance = markerMock.mock.results[2].value as { on: ReturnType<typeof vi.fn> }
    const clickHandler = thirdMarkerInstance.on.mock.calls.find((call) => call[0] === 'click')?.[1]
    act(() => {
      clickHandler() // selects 'c' — currentIndex becomes 2
    })

    const twoStops: RecapStop[] = [threeStops[0], threeStops[1]]
    rerender(<RecapMap route={twoStops} activeStopId={null} onStopSelect={onStopSelect} />)

    // Index 2 no longer exists in a 2-stop route; it's clamped to the last
    // valid index (1 = 'b'), not left pointing past the end.
    const secondMapInstance = vi.mocked(L).map.mock.results[1].value as { setView: ReturnType<typeof vi.fn> }
    expect(secondMapInstance.setView).toHaveBeenCalledWith([35.7, 139.77], expect.any(Number), { animate: false })
  })
})
