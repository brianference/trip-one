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
    L.marker([lat, lng]).addTo(map).bindPopup(popupEl)

    return () => map.remove()
  }, [lat, lng, label])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
