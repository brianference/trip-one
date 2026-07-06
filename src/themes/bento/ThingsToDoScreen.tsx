import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../../features/map/MapView'
import { logger } from '../../lib/logger'

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
  // Only Places-sourced entries carry real per-item coordinates today (see
  // ThingToDo in src/lib/api/client.ts) — Tripadvisor entries without lat/lng
  // are left off the map rather than guessing a location for them.
  const markers = items
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  return (
    <div className="bento-app-screen">
      {id && (
        <nav className="bento-app-nav">
          <Link to={`/trip/${id}`}>Overview</Link>
          {' · '}
          <Link to={`/trip/${id}/itinerary`}>Itinerary</Link>
          {' · '}
          <Link to={`/trip/${id}/things-to-do`} aria-current="page">
            Things to do
          </Link>
          {' · '}
          <Link to={`/trip/${id}/local-info`}>Local info</Link>
        </nav>
      )}
      {location && (
        <div className="bento-tile bento-tile--map">
          <MapView
            lat={location.lat}
            lng={location.lng}
            label={location.displayName}
            markers={markers}
            boundingBox={location.boundingBox}
          />
        </div>
      )}
      <ul className="bento-things-to-do">
        {items.map((item) => (
          <li key={item.name}>
            <span className="bento-thing-badge">{item.category}</span>
            <span className="bento-thing-name">{item.name}</span>
            <button
              type="button"
              className="bento-btn bento-thing-add"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add to itinerary
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
