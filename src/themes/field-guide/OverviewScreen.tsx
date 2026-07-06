import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Hero component — renders the map with an overlay card displaying location and forecast.
 */
function Hero({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  return (
    <div className="field-guide-hero">
      <MapView lat={location?.lat ?? 0} lng={location?.lng ?? 0} label={displayName} />
      <div className="field-guide-overlay-card" data-testid="field-guide-overlay-card">
        <p className="field-guide-eyebrow">Field guide</p>
        <h1>{displayName}</h1>
        <ul className="field-guide-nav">
          <li>
            <Link to={`/trip/${trip.id}/itinerary`}>Itinerary</Link>
          </li>
          <li>
            <Link to={`/trip/${trip.id}/things-to-do`}>Things to do</Link>
          </li>
          <li>
            <Link to={`/trip/${trip.id}/local-info`}>Local info</Link>
          </li>
        </ul>
        {forecast && (
          <p className="field-guide-weather">
            <strong>{forecast.temperatureF}°F</strong> — {forecast.condition}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Overview screen for Field Guide theme — displays trip location with map hero and overlay card.
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

  if (!trip) return <p className="field-guide-loading">Loading…</p>

  return (
    <div className="field-guide-app-screen">
      <ErrorBoundary label="Overview">
        <Hero trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}
