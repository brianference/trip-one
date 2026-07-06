import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Chapter component — renders the day-one heading with location and forecast.
 */
function Chapter({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map.
  const markers = (location?.thingsToDo ?? [])
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))
  return (
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter one</span>
      <h1>Day one: {displayName}</h1>
      <nav>
        <Link to={`/trip/${trip.id}/itinerary`}>Itinerary</Link>
        {' · '}
        <Link to={`/trip/${trip.id}/things-to-do`}>Things to do</Link>
        {' · '}
        <Link to={`/trip/${trip.id}/local-info`}>Local info</Link>
      </nav>
      {forecast && (
        <p className="chronicle-weather">
          {forecast.temperatureF}°F <span className="chronicle-weather-condition">— {forecast.condition}</span>
        </p>
      )}
      {location && (
        <div className="chronicle-map-frame">
          <MapView
            lat={location.lat}
            lng={location.lng}
            label={displayName}
            markers={markers}
            boundingBox={location.boundingBox}
          />
        </div>
      )}
    </article>
  )
}

/**
 * Overview screen for Chronicle theme — displays trip location as first day of vertical timeline.
 */
export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getTrip(id)
      .then((loadedTrip) => {
        if (cancelled) return
        setTrip(loadedTrip)
        return fetchLocation(loadedTrip.locationSlug).then((loc) => {
          if (!cancelled) setLocation(loc)
        })
      })
      .catch((err) => {
        logger.error('failed to load trip overview', err)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!trip)
    return (
      <div className="chronicle-page">
        <p>Loading…</p>
      </div>
    )

  return (
    <div className="chronicle-page">
      <ErrorBoundary label="Overview">
        <Chapter trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}
