import { useEffect, useState } from 'react'
import { fetchLocation, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../../features/map/MapView'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Liquid Glass theme — displays cached location suggestions with add buttons.
 */
export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
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
    <>
      {location && (
        <div className="lg-glass-card lg-map-card">
          <MapView lat={location.lat} lng={location.lng} label={location.displayName} markers={markers} />
        </div>
      )}
      <ul className="lg-glass-card">
        {items.map((item) => (
          <li key={item.name}>
            <span>{item.name}</span>
            <span> ({item.category})</span>
            <button
              type="button"
              className="lg-tap-target"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
