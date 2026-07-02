import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * Ledger table component — displays trip info as a two-column table, with the map below.
 */
function LedgerTable({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  return (
    <div className="tl-ledger">
      <table>
        <tbody>
          <tr>
            <th>Location</th>
            <td>{displayName}</td>
          </tr>
          {forecast && (
            <tr>
              <th>Weather</th>
              <td>{forecast.temperatureF}°F — {forecast.condition}</td>
            </tr>
          )}
        </tbody>
      </table>
      {location && <MapView lat={location.lat} lng={location.lng} label={displayName} />}
    </div>
  )
}

/**
 * Overview screen for Trail Ledger theme — displays trip location and forecast in table format.
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
      <LedgerTable trip={trip} location={location} />
    </ErrorBoundary>
  )
}
