import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Glass overview component — renders the location with weather forecast in a frosted glass card.
 */
function GlassOverview({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  return (
    <div className="lg-glass-card">
      <h1 className="lg-title">{displayName}</h1>
      <nav className="lg-nav">
        <Link className="lg-tap-target lg-nav-link" to={`/trip/${trip.id}/itinerary`}>
          Itinerary
        </Link>
        <Link className="lg-tap-target lg-nav-link" to={`/trip/${trip.id}/things-to-do`}>
          Things to do
        </Link>
        <Link className="lg-tap-target lg-nav-link" to={`/trip/${trip.id}/local-info`}>
          Local info
        </Link>
      </nav>
      {forecast && (
        <p className="lg-weather-row">
          <span className="lg-weather-value">{forecast.temperatureF}°F</span>
          <span className="lg-weather-condition">{forecast.condition}</span>
        </p>
      )}
      {location && (
        <div className="lg-glass-card lg-map-card">
          <MapView lat={location.lat} lng={location.lng} label={displayName} />
        </div>
      )}
    </div>
  )
}

/**
 * Overview screen for Liquid Glass theme — displays trip location with frosted glass aesthetic.
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
      <div className="lg-app-screen">
        <p className="lg-loading">Loading…</p>
      </div>
    )

  return (
    <div className="lg-app-screen">
      <ErrorBoundary label="Overview">
        <GlassOverview trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}
