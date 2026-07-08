import { useEffect, useState } from 'react'
import { getTrip, fetchLocation, type Trip, type LocationResult } from '../../../lib/api/client'
import { useTripStore } from '../../../store/tripStore'
import { logger } from '../../../lib/logger'

/**
 * Loads a trip and its location once per `tripId`, and rehydrates the
 * shared itinerary store from the fetched trip — without this, revisiting
 * or reloading a trip URL directly (rather than arriving from the search
 * flow, which already populates the store) would show an empty itinerary
 * even though stops were saved, since the store resets on every fresh page
 * load. Shared by every page under `TripShell` so the fetch happens once
 * per trip visit, not once per page.
 * @param tripId - The trip id from the route param
 * @returns The loaded trip, its resolved location, a loading flag, and an
 * `error` flag. `trip`/`location` stay `null` until the fetch resolves;
 * `error` is true if the trip fetch failed (so the shell can show a real
 * error state instead of an infinite spinner).
 */
export function useTripData(tripId: string) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let tripLoaded = false
    setLoading(true)
    setError(false)
    getTrip(tripId)
      .then((loadedTrip) => {
        if (cancelled) return
        tripLoaded = true
        setTrip(loadedTrip)
        useTripStore.setState({
          tripId: loadedTrip.id,
          locationSlug: loadedTrip.locationSlug,
          itinerary: loadedTrip.itinerary,
          tripLengthDays: loadedTrip.tripLengthDays,
        })
        return fetchLocation(loadedTrip.locationSlug).then((loc) => {
          if (!cancelled) setLocation(loc)
        })
      })
      .catch((err) => {
        logger.error('failed to load trip data', err)
        // Only the trip fetch failing is fatal to the page; a failed
        // location fetch still leaves a usable trip (itinerary works, the
        // map just won't render), so don't flip error for that.
        if (!cancelled && !tripLoaded) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  return { trip, location, loading, error }
}
