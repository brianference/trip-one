import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CATEGORY_COLORS, DEFAULT_MARKER_COLOR, DEFAULT_MARKER_ICON, iconForCategory } from './categoryLegend'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  category: string
  /** Google place_id, when known, so a marker click can open rich detail. */
  placeId?: string
}

interface Props {
  lat: number
  lng: number
  label: string
  /**
   * Optional extra pins to render alongside the main location marker (e.g.
   * things-to-do items that have their own coordinates), color-coded by
   * `category`. Purely additive — omitting this prop keeps the original
   * single-marker behavior unchanged.
   */
  markers?: MapMarker[]
  /**
   * [south, north, west, east] from the geocoder. When present and larger
   * than a small point-radius, the map fits this real extent instead of
   * using a fixed zoom level — so a country or island shows its actual
   * shape rather than a tight, arbitrary crop around its center point.
   */
  boundingBox?: [number, number, number, number]
  /**
   * An ordered sequence of real stops (e.g. one day's itinerary items that
   * have coordinates) to connect with a dashed route line, in visit order.
   * Purely additive — omitting this prop draws no route.
   */
  route?: { lat: number; lng: number }[]
  /** Map height in pixels. Defaults to 300 (a compact embedded card); the dedicated Map page uses a taller value. */
  height?: number
  /**
   * Called when an extra marker is clicked, so the page can open the place
   * detail panel. Held in a ref internally, so passing a fresh function each
   * render does NOT tear down and rebuild the Leaflet map.
   */
  onSelectMarker?: (marker: MapMarker) => void
  /**
   * A place to pan/zoom to and highlight (its popup opens) — set when the user
   * taps a stop or an added-place chip in the chat. The `nonce` makes repeated
   * taps on the same place re-trigger. Panning does NOT rebuild the map.
   */
  focusLatLng?: { lat: number; lng: number; nonce: number } | null
}

// Below this size (in degrees), a bounding box is treated as effectively a
// point (e.g. a single address) and the fixed default zoom is used instead —
// fitBounds on a near-zero-size box zooms in far too tight to be useful.
const MIN_BOUNDS_SPAN_DEGREES = 0.05

/**
 * Build a self-contained divIcon: a colored teardrop with a category glyph
 * centered on it. Leaflet's default marker icon requests
 * marker-icon.png/marker-shadow.png relative to the current page path; under
 * this app's SPA catch-all routing those 404 and silently resolve to
 * index.html, so the browser tries to render HTML as an image and shows a
 * broken-image icon. This avoids that entirely by never depending on external
 * image assets. The glyph makes pins distinguishable beyond color alone.
 */
function buildPinIcon(color: string, glyph: string): L.DivIcon {
  return L.divIcon({
    className: 'trip-one-map-marker',
    html:
      `<div style="position:relative;width:28px;height:36px;">` +
      `<span style="position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50% 50% 50% 0;` +
      `background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);transform:rotate(-45deg);"></span>` +
      `<span style="position:absolute;left:0;top:3px;width:28px;height:24px;display:flex;align-items:center;` +
      `justify-content:center;font-size:14px;line-height:1;">${glyph}</span>` +
      `</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  })
}

/**
 * Create a DOM element with textContent (not innerHTML) to prevent XSS —
 * Leaflet's bindPopup renders HTML by default, so a text node is used for
 * any label that may ultimately come from user/upstream data.
 */
function buildPopupEl(text: string): HTMLDivElement {
  const popupEl = document.createElement('div')
  popupEl.textContent = text
  return popupEl
}

export function MapView({ lat, lng, label, markers, boundingBox, route, height = 300, onSelectMarker, focusLatLng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Keep the latest select handler in a ref so marker clicks always call the
  // current one WITHOUT adding it to the effect deps (which would rebuild the
  // whole map on every parent render).
  const onSelectRef = useRef(onSelectMarker)
  onSelectRef.current = onSelectMarker
  // The live map + its markers-by-coordinate, so a focus request can pan and
  // open the right popup without rebuilding the map.
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current) return
    // zoomAnimation:false — the earlier fix only disabled animation on the
    // initial fitBounds call, but a live audit found the same
    // _onZoomTransitionEnd crash still reachable via the map's own +/- zoom
    // control buttons (Leaflet's default zoomAnimation uses a CSS
    // transition keyed to internal pane state that goes stale if the
    // container is ever resized/recreated mid-transition). Disabling zoom
    // animation entirely removes every code path that can reach that
    // handler, not just the one this app's own code triggers.
    const map = L.map(containerRef.current, { zoomAnimation: false }).setView([lat, lng], 12)
    mapRef.current = map
    markersRef.current = new Map()
    // CartoDB's free Voyager tiles (no API key required) render cleaner
    // typography and a lighter, less visually noisy basemap than raw OSM
    // tiles, while still crediting OpenStreetMap as the underlying data.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)

    const icon = buildPinIcon(DEFAULT_MARKER_COLOR, DEFAULT_MARKER_ICON)
    L.marker([lat, lng], { icon }).addTo(map).bindPopup(buildPopupEl(label))

    for (const marker of markers ?? []) {
      const color = CATEGORY_COLORS[marker.category] ?? DEFAULT_MARKER_COLOR
      const markerIcon = buildPinIcon(color, iconForCategory(marker.category))
      const m = L.marker([marker.lat, marker.lng], { icon: markerIcon })
        .addTo(map)
        .bindPopup(buildPopupEl(`${marker.label} (${marker.category})`))
        .on('click', () => onSelectRef.current?.(marker))
      markersRef.current.set(`${marker.lat.toFixed(5)},${marker.lng.toFixed(5)}`, m)
    }

    if (route && route.length > 1) {
      L.polyline(
        route.map((stop) => [stop.lat, stop.lng]),
        { color: '#5ba3ff', weight: 3, dashArray: '8, 10', opacity: 0.85 },
      ).addTo(map)
    }

    // Zoom priority: a selected day's route is the most specific, relevant
    // thing to show zoomed in on (that's what "show me my itinerary on the
    // map" means) — fit tightly to just those stops. Failing that, fit to
    // every plotted marker plus the main pin so nearby things-to-do aren't
    // scattered outside the visible frame. Only fall back to the location's
    // whole bounding box (its real shape, e.g. a country/island) when there
    // are no real stops yet to zoom in on.
    if (route && route.length > 1) {
      map.fitBounds(route.map((stop) => [stop.lat, stop.lng]))
    } else if (markers && markers.length > 0) {
      map.fitBounds([[lat, lng], ...markers.map((marker) => [marker.lat, marker.lng] as [number, number])])
    } else if (boundingBox) {
      const [south, north, west, east] = boundingBox
      if (north - south > MIN_BOUNDS_SPAN_DEGREES || east - west > MIN_BOUNDS_SPAN_DEGREES) {
        map.fitBounds([
          [south, west],
          [north, east],
        ])
      }
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, label, markers, boundingBox, route])

  // Pan to and highlight a focused place (from a stop or chat-chip tap) without
  // rebuilding the map. Runs after the build effect, so a focus set alongside a
  // marker change still wins.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusLatLng) return
    map.setView([focusLatLng.lat, focusLatLng.lng], Math.max(map.getZoom(), 15), { animate: false })
    markersRef.current.get(`${focusLatLng.lat.toFixed(5)},${focusLatLng.lng.toFixed(5)}`)?.openPopup()
  }, [focusLatLng])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: `${height}px`, width: '100%' }} />
}
