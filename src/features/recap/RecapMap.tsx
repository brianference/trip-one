import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { buildCartoTileUrl } from '../map/MapView'
import type { RecapStop } from './buildRecap'
import { SUBSEGMENTS_PER_LEG, easeInOutCubic, interpolateLeg, legDurationMs, type WalkthroughSpeed } from './animateRoute'

/**
 * A `RecapStop` narrowed to the coordinates the walkthrough needs, after
 * filtering out any stop missing lat/lng (defensive: `buildRecap`'s `route`
 * already only contains coordinate-bearing stops, but a caller assembling
 * `Recap` by hand — the owner recap page in Task 12 builds one client-side
 * with none of the server's validation — could still pass one through).
 */
interface PlottedStop extends RecapStop {
  lat: number
  lng: number
}

interface Props {
  /** Stops with coordinates, in itinerary order (`Recap['route']`). */
  route: RecapStop[]
  /**
   * The stop currently highlighted, driven from outside this component (e.g.
   * a slideshow elsewhere on the page moving to a new photo's stop). A stop
   * id that isn't on the plotted route (no coordinates, or unknown) is
   * ignored entirely. Otherwise:
   *  - if it's exactly the stop after the current one, the map animates
   *    that single leg (respecting reduced motion) and does NOT change
   *    whether playback is "on" — this is also what lets an external mirror
   *    of this component's own `onStopSelect` events track it without
   *    starting a second, overlapping animation of the same leg;
   *  - for any other target (backward, or skipping more than one stop), the
   *    map snaps straight there, stops any in-flight animation, and reports
   *    playback as stopped via `onPlayingChange`.
   */
  activeStopId: string | null
  /** Called with a stop's id whenever the current stop changes — from playback, a marker click/keypress, or an external `activeStopId` hop. */
  onStopSelect: (stopId: string) => void
  /** Whether the walkthrough starts playing immediately on mount. Defaults to false. Mount-only: the Play/Pause button owns playback state after that. */
  playing?: boolean
  /** Initial leg duration in milliseconds. Defaults to `legDurationMs('normal')`. The speed buttons take over from here. */
  speedMs?: number
  /** Called whenever playback starts or stops, whatever the cause — the Play/Pause button, reaching the route's end, a marker selection, or an external `activeStopId` snap — so a parent (e.g. Task 12's slideshow) can mirror the map's playback state without polling it. */
  onPlayingChange?: (playing: boolean) => void
  /**
   * A pause request counter. Every change to this value after mount stops
   * playback where it is (no snap, no move, the current stop is kept) and
   * reports it via `onPlayingChange` if playback was running. The value
   * itself carries no meaning, only its change does; the value present on
   * mount never pauses. This is how a parent that owns a second playback
   * (Task 12's slideshow autoplay) makes the map yield without moving it,
   * which `activeStopId` cannot do: an `activeStopId` equal to the current
   * stop, or the one being animated toward, is deliberately a no-op.
   */
  pauseRequest?: number
}

/** Zoom level used when panning to a stop that has no map yet (first render before any user zoom interaction). */
const DEFAULT_ZOOM = 13

/**
 * Builds a numbered marker icon. The number is the stop's 1-based trip
 * order (matching `RecapStop.order`), and the icon's own DOM element (not an
 * adjacent list) carries `role="img"` and `aria-label="Stop N: {name}"` —
 * this is the actual element Leaflet inserts into the map pane, so it is
 * what a screen reader traversing the live map encounters, unlike a
 * same-named list rendered elsewhere on the page that has no spatial or
 * interactive relationship to the pin itself. Its `trip-one-recap-marker`
 * class carries the visual circle styling (chronicle.css); the outer
 * `L.divIcon` wrapper Leaflet creates only needs its own class for
 * identification, not for styling.
 *
 * @param order - the stop's 1-based order
 * @param name - the stop's display text
 */
function buildStopIcon(order: number, name: string): L.DivIcon {
  const el = document.createElement('div')
  el.className = 'trip-one-recap-marker'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Stop ${order}: ${name}`)
  el.textContent = String(order)
  return L.divIcon({ className: 'trip-one-recap-marker-icon', html: el, iconSize: [26, 26], iconAnchor: [13, 13] })
}

/** Builds the base Leaflet map on `el`, reusing MapView's CARTO tile setup and the `zoomAnimation:false` crash fix. */
function createBaseMap(el: HTMLElement): L.Map {
  // zoomAnimation:false avoids a real Leaflet crash in `_onZoomTransitionEnd`
  // reachable via the built-in zoom controls (see MapView.tsx for the full
  // history of this fix) — required here too since this map has its own
  // zoom controls.
  const map = L.map(el, { zoomAnimation: false }).setView([0, 0], DEFAULT_ZOOM)
  L.tileLayer(buildCartoTileUrl(import.meta.env.VITE_CARTO_BASEMAP_KEY), {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map)
  return map
}

/** Narrows `route` to stops with real coordinates, preserving order. */
function plottedStops(route: RecapStop[]): PlottedStop[] {
  return route.filter((stop): stop is PlottedStop => stop.lat !== null && stop.lng !== null)
}

/**
 * A stable signature over everything a rebuild needs to reflect: each
 * stop's identity, order and position (stopId/order/lat/lng), plus its
 * displayed text — markers render both `order` (the number) and `text` (the
 * "Stop N: {name}" accessible name), so a rename or renumber with unchanged
 * coordinates must still trigger a real rebuild or the markers go stale.
 * The map-rebuild effect keys on this string rather than the `route` array's
 * own identity so a parent re-render that passes a content-equal but
 * freshly-allocated array (a common React pattern) does not tear the map
 * down and reset playback — only an actual change to one of these fields
 * does. (A heuristic join, not a strict serialization: a stop `text`
 * containing the `|`/`:` delimiters could in principle collide, but the
 * worst case is a missed or extra rebuild, not a wrong route.)
 */
function routeSignatureOf(stops: PlottedStop[]): string {
  return stops.map((stop) => `${stop.stopId}:${stop.order}:${stop.lat}:${stop.lng}:${stop.text}`).join('|')
}

/** Whether the user's OS/browser prefers reduced motion, re-checked on each call (not cached) since it can change mid-session. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

/**
 * Animates the trip's stops in itinerary order on a Leaflet map: numbered
 * markers, a dashed full route, and a solid "traveled" line that grows leg
 * by leg as playback advances. Modelled on the Tokyo One walkthrough map.
 *
 * Renders nothing map-wise (no crash) for a route with 0 or 1 plotted stops
 * — there are no legs to animate, so only the marker (if any) is drawn.
 */
export function RecapMap({
  route,
  activeStopId,
  onStopSelect,
  playing = false,
  speedMs,
  onPlayingChange,
  pauseRequest,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const fullRoutePolylineRef = useRef<L.Polyline | null>(null)
  const traveledPolylineRef = useRef<L.Polyline | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const rafIdRef = useRef<number | null>(null)
  const timerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Whether the map-rebuild effect has already run once — distinguishes the initial mount (seed state as given) from a later real rebuild (reset playback, clamp position). */
  const hasBuiltOnceRef = useRef(false)

  const stops = plottedStops(route)
  const stopsRef = useRef(stops)
  stopsRef.current = stops
  const routeSignature = routeSignatureOf(stops)

  // The last stop index the traveled line has fully reached.
  const initialIndex = Math.max(
    0,
    stops.findIndex((stop) => stop.stopId === activeStopId),
  )
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  // Always seeded false, even when `playing` is true: `setPlaying` only
  // reports `onPlayingChange` on an actual transition, so seeding this true
  // would make the mount-time autostart a false->false no-op and silently
  // swallow the very first "playback started" report. The autostart effect
  // below calls `startPlayback`, which makes the real, reported transition —
  // the button may show "Play" for the first commit and settle to "Pause"
  // once that effect runs, which happens before `render()` returns in tests.
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const [speed, setSpeed] = useState<number>(speedMs ?? legDurationMs('normal'))
  const speedRef = useRef(speed)
  speedRef.current = speed

  const onStopSelectRef = useRef(onStopSelect)
  onStopSelectRef.current = onStopSelect
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange

  /** Redraws the traveled polyline up through `throughIndex` (fully reached stops), with no in-progress leg. */
  function drawTraveledThrough(throughIndex: number) {
    const points = stopsRef.current.slice(0, throughIndex + 1).map((stop): L.LatLngTuple => [stop.lat, stop.lng])
    traveledPolylineRef.current?.setLatLngs(points)
  }

  /** Cancels any in-flight animation frame or reduced-motion timer. */
  function stopAnimating() {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current)
      timerIdRef.current = null
    }
  }

  /** Sets `isPlaying` and reports the change via `onPlayingChange` — but only when it's an actual transition, so callers can call this unconditionally. */
  function setPlaying(next: boolean) {
    if (isPlayingRef.current === next) return
    isPlayingRef.current = next
    setIsPlaying(next)
    onPlayingChangeRef.current?.(next)
  }

  /**
   * Animates one leg (fromIndex -> fromIndex + 1). `chain` controls whether
   * reaching the end automatically starts the next leg when playback is
   * running: true for the continuous Play loop, false for a single
   * externally-requested hop (an `activeStopId` change to exactly the next
   * stop), which must animate only that one leg and never touch `isPlaying`.
   */
  function animateLeg(fromIndex: number, chain: boolean) {
    const currentStops = stopsRef.current
    if (fromIndex >= currentStops.length - 1) {
      if (chain) setPlaying(false)
      return
    }
    const a = currentStops[fromIndex]
    const b = currentStops[fromIndex + 1]
    const beforeLeg = currentStops.slice(0, fromIndex + 1).map((stop): L.LatLngTuple => [stop.lat, stop.lng])
    const duration = speedRef.current

    const completeLeg = () => {
      const nextIndex = fromIndex + 1
      setCurrentIndex(nextIndex)
      currentIndexRef.current = nextIndex
      mapRef.current?.setView([b.lat, b.lng], mapRef.current.getZoom(), { animate: false })
      onStopSelectRef.current(b.stopId)
      if (chain && isPlayingRef.current) {
        animateLeg(nextIndex, true)
      }
    }

    if (prefersReducedMotion()) {
      // Draw the whole leg immediately — no growing sub-segments — then
      // advance one stop per `duration` ms on a plain timer instead of an
      // rAF-driven easing loop. That is the "no animation" a
      // prefers-reduced-motion user asked for, while keeping the same
      // per-stop pacing an accompanying slideshow (Task 12) can rely on.
      traveledPolylineRef.current?.setLatLngs([...beforeLeg, [b.lat, b.lng]])
      timerIdRef.current = setTimeout(() => {
        timerIdRef.current = null
        completeLeg()
      }, duration)
      return
    }

    const legPoints = interpolateLeg(a, b, SUBSEGMENTS_PER_LEG)
    let startTime: number | null = null
    const frame = (now: number) => {
      if (startTime === null) startTime = now
      const rawT = duration > 0 ? Math.min(1, (now - startTime) / duration) : 1
      const eased = easeInOutCubic(rawT)
      const revealCount = Math.max(1, Math.round(eased * SUBSEGMENTS_PER_LEG))
      const legTuples = legPoints.slice(0, revealCount + 1).map((point): L.LatLngTuple => [point.lat, point.lng])
      traveledPolylineRef.current?.setLatLngs([...beforeLeg, ...legTuples])

      if (rawT < 1) {
        rafIdRef.current = requestAnimationFrame(frame)
        return
      }

      rafIdRef.current = null
      completeLeg()
    }

    rafIdRef.current = requestAnimationFrame(frame)
  }

  /**
   * Starts continuous playback from `fromIndex`. Always cancels any
   * in-flight animation first — Play can be pressed while an external
   * `activeStopId` hop (see the effect below) is already mid-leg toward
   * `fromIndex + 1`, and without this the hop's own rAF/timer id would be
   * overwritten by this call's, leaving the hop's loop uncancellable: it
   * would keep running, complete the same leg a second time (a duplicate
   * `onStopSelect`), and could still fire after unmount since cleanup only
   * cancels whichever id is currently referenced.
   *
   * Deliberately RESTARTS the current leg from `fromIndex` rather than
   * resuming from the hop's in-progress position: `animateLeg` has no
   * cross-call progress state to resume from (each call's `startTime` and
   * revealed sub-segments live only in that call's closure), and threading
   * "resume from N% of this leg" through would add real complexity for a
   * leg that takes at most a few seconds — a full restart is visually a
   * minor, one-time blip, not a jump. `drawTraveledThrough(fromIndex)`
   * erases whatever partial progress the cancelled hop had drawn before the
   * fresh `animateLeg` call redraws it from the start.
   */
  function startPlayback(fromIndex: number) {
    stopAnimating()
    setCurrentIndex(fromIndex)
    currentIndexRef.current = fromIndex
    setPlaying(true)
    drawTraveledThrough(fromIndex)
    animateLeg(fromIndex, true)
  }

  /**
   * Selects a stop directly — a marker click or its Enter/Space keyboard
   * equivalent: stops any animation, redraws the traveled line straight up
   * to it (so a click backward or sideways doesn't leave a stale line drawn
   * past the new position), pans, and reports the new stop plus (if
   * playback was running) that it stopped.
   */
  function selectStop(index: number, target: PlottedStop) {
    stopAnimating()
    setPlaying(false)
    setCurrentIndex(index)
    currentIndexRef.current = index
    drawTraveledThrough(index)
    mapRef.current?.setView([target.lat, target.lng], mapRef.current.getZoom(), { animate: false })
    onStopSelectRef.current(target.stopId)
  }

  // Build (or rebuild) the map, markers and lines whenever the plotted
  // route's actual content changes (see routeSignatureOf) — not on every
  // render, and not just because the parent passed a new array reference.
  useEffect(() => {
    if (!containerRef.current) return
    stopAnimating()
    const map = createBaseMap(containerRef.current)
    mapRef.current = map
    markersRef.current = new Map()

    const currentStops = stopsRef.current
    for (const [index, s] of currentStops.entries()) {
      const marker = L.marker([s.lat, s.lng], { icon: buildStopIcon(s.order, s.text) }).addTo(map)
      marker.on('click', () => selectStop(index, s))
      // Leaflet's interactive layers (markers included) dispatch a real
      // 'keypress' event from their focused icon element, so Enter/Space
      // reach the marker the same way a mouse click does — this is what
      // makes markers actually operable from the keyboard, not just
      // focusable.
      marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
        const key = e.originalEvent?.key
        if (key === 'Enter' || key === ' ') selectStop(index, s)
      })
      markersRef.current.set(s.stopId, marker)
    }

    if (currentStops.length > 1) {
      fullRoutePolylineRef.current = L.polyline(
        currentStops.map((s): L.LatLngTuple => [s.lat, s.lng]),
        { className: 'trip-one-recap-route', weight: 3, dashArray: '8, 10', opacity: 0.85 },
      ).addTo(map)
      traveledPolylineRef.current = L.polyline([], { className: 'trip-one-recap-traveled', weight: 4, opacity: 0.95 }).addTo(
        map,
      )
    } else {
      fullRoutePolylineRef.current = null
      traveledPolylineRef.current = null
    }

    const isRealRebuild = hasBuiltOnceRef.current
    hasBuiltOnceRef.current = true

    if (currentStops.length > 0) {
      const startIndex = Math.min(Math.max(currentIndexRef.current, 0), currentStops.length - 1)
      if (isRealRebuild) {
        // The trip's stops actually changed under us (not the initial
        // mount). Playback can't safely continue mid-air across a rebuilt
        // route, so it's stopped and the position is clamped into range
        // rather than assumed to still point at anything meaningful.
        setCurrentIndex(startIndex)
        currentIndexRef.current = startIndex
        setPlaying(false)
      }
      drawTraveledThrough(startIndex)
      map.setView([currentStops[startIndex].lat, currentStops[startIndex].lng], DEFAULT_ZOOM, { animate: false })
    }

    return () => {
      stopAnimating()
      map.remove()
      mapRef.current = null
      fullRoutePolylineRef.current = null
      traveledPolylineRef.current = null
    }
  }, [routeSignature])

  // Start playback on mount if requested. Deliberately mount-only: `playing`
  // is documented as an initial value, not a live control — the Play/Pause
  // button owns playback state from here on.
  useEffect(() => {
    if (playing && stopsRef.current.length > 1) {
      startPlayback(currentIndexRef.current)
    }
    // Mount-only by design; see the comment above.
  }, [])

  // React to an externally-changed activeStopId (e.g. a slideshow elsewhere
  // on the page). See the Props JSDoc for the full contract.
  useEffect(() => {
    if (activeStopId === null) return
    const currentStops = stopsRef.current
    const targetIndex = currentStops.findIndex((stop) => stop.stopId === activeStopId)
    if (targetIndex === -1) return // not on the plotted route: ignored, by design
    if (targetIndex === currentIndexRef.current) return // already there

    if (targetIndex === currentIndexRef.current + 1) {
      const isAnimating = rafIdRef.current !== null || timerIdRef.current !== null
      // Already animating toward exactly this leg (e.g. this component's own
      // playback, whose progress an external mirror is echoing back) — avoid
      // starting a second, overlapping animation of the same leg.
      if (!isAnimating) animateLeg(currentIndexRef.current, false)
      return
    }

    // Any other target (backward, or skipping more than one stop): snap
    // straight there and stop whatever was animating.
    stopAnimating()
    setCurrentIndex(targetIndex)
    currentIndexRef.current = targetIndex
    drawTraveledThrough(targetIndex)
    const target = currentStops[targetIndex]
    mapRef.current?.setView([target.lat, target.lng], mapRef.current.getZoom(), { animate: false })
    setPlaying(false)
    // Deliberately keyed on `activeStopId` only: `stopsRef`/`currentIndexRef`
    // are always read fresh, and a `route` content change is handled
    // entirely by the map-rebuild effect above.
  }, [activeStopId])

  // A parent's pause request (see the Props JSDoc): stop in place. The ref
  // starts at the mount value so only a later change pauses, never the
  // initial render, which would otherwise cancel a `playing` autostart.
  const lastPauseRequestRef = useRef(pauseRequest)
  useEffect(() => {
    if (pauseRequest === lastPauseRequestRef.current) return
    lastPauseRequestRef.current = pauseRequest
    stopAnimating()
    setPlaying(false)
  }, [pauseRequest])

  /** Toggles playback. Starting from the last stop restarts from the first. */
  function togglePlaying() {
    if (isPlaying) {
      stopAnimating()
      setPlaying(false)
      return
    }
    if (stops.length < 2) return
    const startIndex = currentIndexRef.current >= stops.length - 1 ? 0 : currentIndexRef.current
    startPlayback(startIndex)
  }

  /** Changes the leg duration for subsequent legs; the leg in progress keeps its original duration. */
  function selectSpeed(next: WalkthroughSpeed) {
    setSpeed(legDurationMs(next))
  }

  return (
    <div className="chronicle-recap-map">
      <div ref={containerRef} role="region" aria-label="Trip walkthrough map" className="chronicle-recap-map-canvas" />
      <div className="chronicle-recap-map-controls">
        <button
          type="button"
          className="chronicle-recap-map-btn"
          onClick={togglePlaying}
          disabled={stops.length < 2}
          aria-pressed={isPlaying}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="chronicle-recap-map-btn"
          onClick={() => selectSpeed('slow')}
          aria-pressed={speed === legDurationMs('slow')}
        >
          Slow
        </button>
        <button
          type="button"
          className="chronicle-recap-map-btn"
          onClick={() => selectSpeed('normal')}
          aria-pressed={speed === legDurationMs('normal')}
        >
          Normal
        </button>
        <button
          type="button"
          className="chronicle-recap-map-btn"
          onClick={() => selectSpeed('fast')}
          aria-pressed={speed === legDurationMs('fast')}
        >
          Fast
        </button>
      </div>
    </div>
  )
}
