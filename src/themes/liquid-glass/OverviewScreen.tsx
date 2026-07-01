import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Glass overview component — renders the location with weather forecast in a frosted glass card.
 */
function GlassOverview({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  return (
    <div className="lg-glass-card">
      <h1>{trip.locationSlug}</h1>
      {forecast && (
        <p>
          <span>{forecast.temperatureC}°C</span>
          <span> — </span>
          <span>{forecast.condition}</span>
        </p>
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

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <GlassOverview trip={trip} location={location} />
    </ErrorBoundary>
  )
}
