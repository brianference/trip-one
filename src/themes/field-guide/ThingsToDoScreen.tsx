import { useEffect, useState } from 'react'
import { fetchLocation, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { MapView } from '../../features/map/MapView'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Field Guide theme — displays location attractions as postcard grid.
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
    <div className="field-guide-app-screen">
      {location && (
        <div className="field-guide-map-frame">
          <MapView lat={location.lat} lng={location.lng} label={location.displayName} markers={markers} />
        </div>
      )}
      <p className="field-guide-eyebrow field-guide-section-eyebrow">Things to do</p>
      <div className="field-guide-postcard-grid">
        {items.map((item) => (
          <div key={item.name} className="field-guide-postcard">
            <span className="field-guide-postcard-badge">{item.category}</span>
            <p className="field-guide-postcard-title">{item.name}</p>
            <div className="field-guide-postcard-actions">
              <button
                type="button"
                className="field-guide-btn"
                onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
              >
                Add to guide
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
