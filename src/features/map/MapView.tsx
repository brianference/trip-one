import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  category: string
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
}

// A small, fixed palette for common things-to-do categories. Anything not
// listed here (there's no bounded category vocabulary upstream) falls back
// to DEFAULT_MARKER_COLOR, which also matches the original single-marker red.
const CATEGORY_COLORS: Record<string, string> = {
  attraction: '#e2492f',
  tourist_attraction: '#5ba3ff',
  point_of_interest: '#5ba3ff',
  museum: '#a5d088',
  park: '#3fae57',
  restaurant: '#ff8c00',
  food: '#ff8c00',
  cafe: '#ff8c00',
  lodging: '#b28dff',
  shopping_mall: '#e2b23f',
  store: '#e2b23f',
}
const DEFAULT_MARKER_COLOR = '#e2492f'

/**
 * Build a self-contained divIcon for a pin of the given color. Leaflet's
 * default marker icon requests marker-icon.png/marker-shadow.png relative to
 * the current page path. Under this app's SPA catch-all routing those paths
 * 404 and silently resolve to index.html, so the browser tries to render
 * HTML as an image and shows a broken-image icon — this avoids that
 * entirely by never depending on external image assets.
 */
function buildPinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'trip-one-map-marker',
    html:
      `<span style="display:block;width:20px;height:20px;border-radius:50% 50% 50% 0;` +
      `background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);` +
      `transform:rotate(-45deg);"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -26],
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

export function MapView({ lat, lng, label, markers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([lat, lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const icon = buildPinIcon(DEFAULT_MARKER_COLOR)
    L.marker([lat, lng], { icon }).addTo(map).bindPopup(buildPopupEl(label))

    for (const marker of markers ?? []) {
      const color = CATEGORY_COLORS[marker.category] ?? DEFAULT_MARKER_COLOR
      const markerIcon = buildPinIcon(color)
      L.marker([marker.lat, marker.lng], { icon: markerIcon })
        .addTo(map)
        .bindPopup(buildPopupEl(`${marker.label} (${marker.category})`))
    }

    return () => {
      map.remove()
    }
  }, [lat, lng, label, markers])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
