import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

/**
 * Search screen for Field Guide theme — allows users to search for a location to start a trip.
 */
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
      logger.error('field-guide search failed', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="field-guide-search">
      <label htmlFor="fg-location-query">Where to?</label>
      <input id="fg-location-query" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
