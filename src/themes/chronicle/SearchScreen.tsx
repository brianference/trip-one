import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip, updateTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'
import { buildStarterItinerary } from '../../lib/itinerary/buildStarterItinerary'

/**
 * Search screen for Chronicle theme — allows users to search for a location and create a trip.
 */
export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  /**
   * Handle form submission — fetch location, create trip, update store, and navigate.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Guard against submitting a blank query or overlapping an in-flight
    // submission — either can leave a stale error banner on screen.
    if (!query.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      const starterItinerary = buildStarterItinerary(location.thingsToDo)
      const updatedTrip =
        starterItinerary.length > 0 ? await updateTrip(trip.id, { itinerary: starterItinerary }) : trip
      setTrip(updatedTrip.id, updatedTrip.locationSlug, updatedTrip.itinerary, updatedTrip.designStyle)
      navigate(`/trip/${updatedTrip.id}`)
    } catch (err) {
      logger.error('chronicle search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="chronicle-search">
        <label htmlFor="chronicle-location-query">Where to?</label>
        <input
          id="chronicle-location-query"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setError(null)
          }}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Loading…' : 'Go'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <nav aria-label="Explore a demo">
        <p>Or explore a demo:</p>
        <Link to={`/trip/${DEMO_TRIP_IDS.yellowstone}`}>Yellowstone</Link>
        <Link to={`/trip/${DEMO_TRIP_IDS.tokyo}`}>Tokyo</Link>
      </nav>
    </>
  )
}
