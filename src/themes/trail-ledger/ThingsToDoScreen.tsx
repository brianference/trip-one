import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchLocation, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../../features/map/MapView'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Trail Ledger theme — displays location suggestions in table format.
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
    <div className="tl-screen">
      <div className="tl-container">
        {id && (
          <nav className="tl-nav">
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
        <h1 className="tl-page-title">Things to do</h1>
        {location && (
          <div className="tl-map">
            <MapView
              lat={location.lat}
              lng={location.lng}
              label={location.displayName}
              markers={markers}
              boundingBox={location.boundingBox}
            />
          </div>
        )}
        <table className="tl-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.name}>
                <td>{item.name}</td>
                <td>
                  <span className="tl-badge">{item.category}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="tl-btn tl-btn-add"
                    onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
                  >
                    Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
