import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Chapter component — renders the day-one heading with location and forecast.
 */
function Chapter({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  return (
    <article className="chronicle-chapter">
      <h1>Day one: {trip.locationSlug}</h1>
      {forecast && <p>{forecast.temperatureC}°C — {forecast.condition}</p>}
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

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <Chapter trip={trip} location={location} />
    </ErrorBoundary>
  )
}
