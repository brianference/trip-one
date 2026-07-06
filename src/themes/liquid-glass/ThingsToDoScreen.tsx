import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../../features/map/MapView'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Liquid Glass theme — displays cached location suggestions with add buttons.
 */
export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const { id } = useParams<{ id: string }>()
  const [location, setLocation] = useState<LocationResult | null>(null)
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    let cancelled = false
    fetchLocation(locationSlug)
      .then((loc) => {
        if (!cancelled) setLocation(loc)
      })
      .catch((err) => {
        logger.error('failed to load things to do', err)
      })
    return () => {
      cancelled = true
    }
  }, [locationSlug])

  const items: ThingToDo[] = location?.thingsToDo ?? []
  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map.
  const markers = items
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  return (
    <div className="lg-app-screen">
      {id && (
        <nav className="lg-nav">
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}`}>
            Overview
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/itinerary`}>
            Itinerary
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/things-to-do`} aria-current="page">
            Things to do
          </Link>
          <Link className="lg-tap-target lg-nav-link" to={`/trip/${id}/local-info`}>
            Local info
          </Link>
        </nav>
      )}
      {location && (
        <div className="lg-glass-card lg-map-card">
          <MapView
            lat={location.lat}
            lng={location.lng}
            label={location.displayName}
            markers={markers}
            boundingBox={location.boundingBox}
          />
        </div>
      )}
      <ul className="lg-things-list">
        {items.map((item) => (
          <li key={item.name} className="lg-glass-card lg-thing-card">
            <span className="lg-thing-name">{item.name}</span>
            <span className="lg-thing-badge">({item.category})</span>
            <button
              type="button"
              className="lg-tap-target lg-btn lg-btn-secondary lg-thing-add"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
