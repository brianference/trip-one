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
   * The stop currently highlighted. Read on mount and whenever it changes
   * from outside (e.g. a slideshow elsewhere on the page moving to a new
   * photo's stop) to pan/snap the map there. This component also calls
   * `onStopSelect` — from its own playback reaching a new stop, or a marker
   * click — so a parent can mirror the change back into this prop and keep
   * the two in sync; it does not require that round trip to keep animating
   * on its own.
   */
  activeStopId: string | null
  /** Called with a stop's id whenever the current stop changes. */
  onStopSelect: (stopId: string) => void
  /** Whether the walkthrough starts playing immediately on mount. Defaults to false. */
  playing?: boolean
  /** Initial leg duration in milliseconds. Defaults to `legDurationMs('normal')`. Play/speed buttons take over from here. */
  speedMs?: number
}

/** Solid "traveled" line color — distinct from the dashed full-route line so progress reads at a glance. */
const TRAVELED_LINE_COLOR = '#1f7a5c'
/** Dashed full-route line color, matching MapView's existing route line. */
const FULL_ROUTE_LINE_COLOR = '#5ba3ff'

/** Zoom level used when panning to a stop that has no map yet (first render before any user zoom interaction). */
const DEFAULT_ZOOM = 13

/**
 * Builds a numbered marker icon. The number is the stop's 1-based trip
 * order (matching `RecapStop.order`), and the icon's own DOM element (not an
 * adjacent list) carries `role="img"` and `aria-label="Stop N: {name}"` —
 * this is the actual element Leaflet inserts into the map pane, so it is
 * what a screen reader traversing the live map encounters, unlike a
 * same-named list rendered elsewhere on the page that has no spatial or
 * interactive relationship to the pin itself.
 *
 * @param order - the stop's 1-based order
 * @param name - the stop's display text
 */
function buildStopIcon(order: number, name: string): L.DivIcon {
  const el = document.createElement('div')
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Stop ${order}: ${name}`)
  el.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;' +
    `background:${TRAVELED_LINE_COLOR};color:#fff;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);` +
    'font-family:ui-monospace,monospace;font-size:12px;font-weight:700;'
  el.textContent = String(order)
  return L.divIcon({ className: 'trip-one-recap-marker', html: el, iconSize: [26, 26], iconAnchor: [13, 13] })
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
export function RecapMap({ route, activeStopId, onStopSelect, playing = false, speedMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const fullRoutePolylineRef = useRef<L.Polyline | null>(null)
  const traveledPolylineRef = useRef<L.Polyline | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const rafIdRef = useRef<number | null>(null)

  const stops = plottedStops(route)
  const stopsRef = useRef(stops)
  stopsRef.current = stops

  // The last stop index the traveled line has fully reached. Independent of
  // the `activeStopId` prop so playback can advance frame by frame without
  // waiting on a parent to feed the prop back in; an externally-changed
  // `activeStopId` snaps this to match (see the effect below).
  const initialIndex = Math.max(
    0,
    stops.findIndex((stop) => stop.stopId === activeStopId),
  )
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  const [isPlaying, setIsPlaying] = useState(playing)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const [speed, setSpeed] = useState<number>(speedMs ?? legDurationMs('normal'))
  const speedRef = useRef(speed)
  speedRef.current = speed

  const onStopSelectRef = useRef(onStopSelect)
  onStopSelectRef.current = onStopSelect

  /** Redraws the traveled polyline up through `throughIndex` (fully reached stops), with no in-progress leg. */
  function drawTraveledThrough(throughIndex: number) {
    const points = stops.slice(0, throughIndex + 1).map((stop): L.LatLngTuple => [stop.lat, stop.lng])
    traveledPolylineRef.current?.setLatLngs(points)
  }

  /** Cancels any in-flight animation frame. */
  function stopAnimating() {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }

  /** Animates one leg (fromIndex -> fromIndex + 1), then advances and, if still playing, starts the next leg. */
  function animateLeg(fromIndex: number) {
    const currentStops = stopsRef.current
    if (fromIndex >= currentStops.length - 1) {
      setIsPlaying(false)
      return
    }
    const a = currentStops[fromIndex]
    const b = currentStops[fromIndex + 1]
    const legPoints = interpolateLeg(a, b, SUBSEGMENTS_PER_LEG)
    const beforeLeg = currentStops.slice(0, fromIndex + 1).map((stop): L.LatLngTuple => [stop.lat, stop.lng])
    const reducedMotion = prefersReducedMotion()
    const duration = speedRef.current
    let startTime: number | null = null

    const frame = (now: number) => {
      if (startTime === null) startTime = now
      const rawT = reducedMotion ? 1 : duration > 0 ? Math.min(1, (now - startTime) / duration) : 1
      const eased = reducedMotion ? 1 : easeInOutCubic(rawT)
      const revealCount = Math.max(1, Math.round(eased * SUBSEGMENTS_PER_LEG))
      const legTuples = legPoints.slice(0, revealCount + 1).map((point): L.LatLngTuple => [point.lat, point.lng])
      traveledPolylineRef.current?.setLatLngs([...beforeLeg, ...legTuples])

      if (rawT < 1) {
        rafIdRef.current = requestAnimationFrame(frame)
        return
      }

      rafIdRef.current = null
      const nextIndex = fromIndex + 1
      setCurrentIndex(nextIndex)
      mapRef.current?.setView([b.lat, b.lng], mapRef.current.getZoom(), { animate: false })
      onStopSelectRef.current(b.stopId)
      if (isPlayingRef.current) {
        animateLeg(nextIndex)
      }
    }

    rafIdRef.current = requestAnimationFrame(frame)
  }

  // Build the map once. Markers, the dashed full route and the initial
  // traveled line are (re)built whenever the plotted stops change.
  useEffect(() => {
    if (!containerRef.current) return
    const map = createBaseMap(containerRef.current)
    mapRef.current = map
    markersRef.current = new Map()

    const currentStops = stopsRef.current
    for (const [index, s] of currentStops.entries()) {
      const marker = L.marker([s.lat, s.lng], { icon: buildStopIcon(s.order, s.text) })
        .addTo(map)
        .on('click', () => {
          stopAnimating()
          setIsPlaying(false)
          setCurrentIndex(index)
          map.setView([s.lat, s.lng], map.getZoom(), { animate: false })
          onStopSelectRef.current(s.stopId)
        })
      markersRef.current.set(s.stopId, marker)
    }

    if (currentStops.length > 1) {
      fullRoutePolylineRef.current = L.polyline(
        currentStops.map((s): L.LatLngTuple => [s.lat, s.lng]),
        { color: FULL_ROUTE_LINE_COLOR, weight: 3, dashArray: '8, 10', opacity: 0.7 },
      ).addTo(map)
      traveledPolylineRef.current = L.polyline([], { color: TRAVELED_LINE_COLOR, weight: 4, opacity: 0.95 }).addTo(map)
    } else {
      fullRoutePolylineRef.current = null
      traveledPolylineRef.current = null
    }

    if (currentStops.length > 0) {
      const startIndex = Math.min(currentIndexRef.current, currentStops.length - 1)
      drawTraveledThrough(startIndex)
      const startStop = currentStops[startIndex]
      map.setView([startStop.lat, startStop.lng], DEFAULT_ZOOM, { animate: false })
    }

    return () => {
      stopAnimating()
      map.remove()
      mapRef.current = null
      fullRoutePolylineRef.current = null
      traveledPolylineRef.current = null
    }
    // Deliberately keyed on `route` only: playback/index state is excluded
    // so play/pause never tears the map down, and helper functions read the
    // latest values via refs rather than needing to be listed here.
  }, [route])

  // React to an externally-changed activeStopId (e.g. a slideshow elsewhere
  // on the page): snap the traveled line and pan to it, pausing playback.
  useEffect(() => {
    if (activeStopId === null) return
    const targetIndex = stops.findIndex((stop) => stop.stopId === activeStopId)
    if (targetIndex === -1 || targetIndex === currentIndexRef.current) return
    stopAnimating()
    setIsPlaying(false)
    setCurrentIndex(targetIndex)
    const target = stops[targetIndex]
    drawTraveledThrough(targetIndex)
    mapRef.current?.setView([target.lat, target.lng], mapRef.current.getZoom(), { animate: false })
    // Deliberately keyed on `activeStopId` only: `stops` is derived fresh
    // from `route` every render, and a `route` change is handled entirely
    // by the map-rebuild effect above.
  }, [activeStopId])

  /** Toggles playback. Starting from the last stop restarts from the first. */
  function togglePlaying() {
    if (isPlaying) {
      stopAnimating()
      setIsPlaying(false)
      return
    }
    if (stops.length < 2) return
    const startIndex = currentIndexRef.current >= stops.length - 1 ? 0 : currentIndexRef.current
    setCurrentIndex(startIndex)
    setIsPlaying(true)
    isPlayingRef.current = true
    drawTraveledThrough(startIndex)
    animateLeg(startIndex)
  }

  /** Changes the leg duration for subsequent legs; the leg in progress keeps its original duration. */
  function selectSpeed(next: WalkthroughSpeed) {
    setSpeed(legDurationMs(next))
  }

  return (
    <div className="chronicle-recap-map">
      <div ref={containerRef} aria-label="Trip walkthrough map" style={{ height: '360px', width: '100%' }} />
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
