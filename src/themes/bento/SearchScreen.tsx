import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('failed to create trip from search', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="bento-search">
        <label htmlFor="location-query">Where to?</label>
        <input
          id="location-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="US state, city, or country"
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
