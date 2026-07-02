import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip, fetchAutocomplete, type AutocompleteSuggestion } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'

const AUTOCOMPLETE_DEBOUNCE_MS = 300
const AUTOCOMPLETE_MIN_LENGTH = 2

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < AUTOCOMPLETE_MIN_LENGTH) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      fetchAutocomplete(query).then((results) => {
        setSuggestions(results)
        setShowSuggestions(true)
      })
    }, AUTOCOMPLETE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function submitLocation(locationQuery: string) {
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(locationQuery)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await submitLocation(query)
  }

  async function handleSelectSuggestion(suggestion: AutocompleteSuggestion) {
    setQuery(suggestion.displayName)
    setShowSuggestions(false)
    setSuggestions([])
    await submitLocation(suggestion.displayName)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  return (
    <>
      <div ref={containerRef} onKeyDown={handleKeyDown} style={{ position: 'relative' }}>
        <form onSubmit={handleSubmit} className="bento-search">
          <label htmlFor="location-query">Where to?</label>
          <input
            id="location-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="US state, city, or country"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-autocomplete="list"
            aria-controls="location-suggestions"
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Loading…' : 'Go'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
        {showSuggestions && suggestions.length > 0 && (
          <ul id="location-suggestions" role="listbox" className="bento-search-suggestions">
            {suggestions.map((suggestion) => (
              <li key={`${suggestion.lat}-${suggestion.lng}`} role="option" aria-selected="false">
                <button type="button" onClick={() => handleSelectSuggestion(suggestion)}>
                  {suggestion.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <nav aria-label="Explore a demo">
        <p>Or explore a demo:</p>
        <Link to={`/trip/${DEMO_TRIP_IDS.yellowstone}`}>Yellowstone</Link>
        <Link to={`/trip/${DEMO_TRIP_IDS.tokyo}`}>Tokyo</Link>
      </nav>
    </>
  )
}
