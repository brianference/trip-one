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
    L.marker([lat, lng]).addTo(map).bindPopup(label)
    return () => map.remove()
  }, [lat, lng, label])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
