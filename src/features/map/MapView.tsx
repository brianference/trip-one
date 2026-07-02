import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lng: number
  label: string
}

export function MapView({ lat, lng, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([lat, lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    // Create a DOM element with textContent to prevent XSS attacks
    // Leaflet's bindPopup renders HTML by default, so we use a text node instead
    const popupEl = document.createElement('div')
    popupEl.textContent = label

    // Leaflet's default marker icon requests marker-icon.png/marker-shadow.png
    // relative to the current page path. Under this app's SPA catch-all routing
    // those paths 404 and silently resolve to index.html, so the browser tries
    // to render HTML as an image and shows a broken-image icon. Build a
    // self-contained divIcon instead — no external image assets required.
    const icon = L.divIcon({
      className: 'trip-one-map-marker',
      html:
        '<span style="display:block;width:20px;height:20px;border-radius:50% 50% 50% 0;' +
        'background:#e2492f;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);' +
        'transform:rotate(-45deg);"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -26],
    })

    L.marker([lat, lng], { icon }).addTo(map).bindPopup(popupEl)

    return () => {
      map.remove()
    }
  }, [lat, lng, label])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
