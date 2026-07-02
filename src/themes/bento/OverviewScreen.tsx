import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

function OverviewContent({ tripId, trip, location }: { tripId: string; trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  return (
    <div className="bento-grid">
      <div className="bento-tile">
        <h1>{location?.displayName ?? trip.locationSlug}</h1>
        <nav>
          <Link to={`/trip/${tripId}/itinerary`}>Itinerary</Link>
          {' · '}
          <Link to={`/trip/${tripId}/things-to-do`}>Things to do</Link>
        </nav>
      </div>
      {forecast && (
        <div className="bento-tile">
          <p className="bento-weather-value">{forecast.temperatureF}°F</p>
          <p className="bento-weather-condition">{forecast.condition}</p>
        </div>
      )}
      {location && (
        <div className="bento-tile bento-tile--map">
          <MapView lat={location.lat} lng={location.lng} label={location.displayName} />
        </div>
      )}
    </div>
  )
}

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

  if (!trip || !id) return <p className="bento-app-screen">Loading…</p>

  return (
    <div className="bento-app-screen">
      <ErrorBoundary label="Overview">
        <OverviewContent tripId={id} trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}
