import { useOutletContext } from 'react-router-dom'
import type { Trip, LocationResult } from '../../lib/api/client'

export interface TripContextValue {
  trip: Trip
  location: LocationResult | null
}

/**
 * Reads the trip/location data that `TripShell` loads once and passes down
 * via the route outlet context — every page under `/trip/:id/*` uses this
 * instead of re-fetching. `TripShell` only renders its `<Outlet>` once
 * `trip` is loaded, so pages can assume `trip` is non-null; `location` may
 * still be null if that fetch is still in flight or failed.
 */
export function useTripContext() {
  return useOutletContext<TripContextValue>()
}
