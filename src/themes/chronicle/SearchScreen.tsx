import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip, updateTrip, fetchAutocomplete, type AutocompleteSuggestion } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIPS } from '../../lib/api/demoIds'
import { buildStarterItinerary } from '../../lib/itinerary/buildStarterItinerary'
import { HomeAiPlanner } from '../../features/trip/components/HomeAiPlanner'
import { TripBuildingOverlay } from '../../features/trip/components/TripBuildingOverlay'
import { getRecentTrips } from '../../features/trip/recentTrips'
import { Logo } from '../../components/Logo'

const AUTOCOMPLETE_DEBOUNCE_MS = 300
const AUTOCOMPLETE_MIN_LENGTH = 2

const FEATURES = [
  { title: 'Grounded AI', description: 'Describe your trip in a sentence and get a real day-by-day plan — every stop a real place, never invented.' },
  { title: 'Day plan + map', description: 'One Plan page: the map, each day’s stops, and nearby places to add — toggle days to see the route.' },
  { title: 'Real weather', description: 'Current conditions and a 5-day forecast, each day linking to its hourly forecast, plus packing tips.' },
  { title: 'Refine by chat', description: 'Ask the assistant to add food, relax a day, or change destination — it re-plans from real places.' },
]

/**
 * Landing page for Trip One — Chronicle is the only theme, so this screen is
 * the site's actual front door.
 */
export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [buildStatus, setBuildStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)
  const containerRef = useRef<HTMLDivElement>(null)
  // Trips opened before on this device — a no-account "continue" list.
  const [recentTrips] = useState(() => getRecentTrips())
  // Autocomplete should only fire from real typing. When we set the query
  // programmatically (selecting a suggestion, or submitting), this suppresses
  // the debounced re-fetch — otherwise the dropdown re-opened ~300ms after a
  // selection while the trip was still being created, which read as "my click
  // did nothing" and made people click a second time.
  const suppressAutocompleteRef = useRef(false)

  useEffect(() => {
    if (suppressAutocompleteRef.current) return
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
    // Guard against a blank/whitespace query and against overlapping
    // submissions if a prior call is still in flight — either previously
    // hit the API with an invalid/duplicate query and left a stale error
    // banner on screen that a later, valid query never cleared.
    if (!locationQuery.trim() || busy) return
    suppressAutocompleteRef.current = true
    setShowSuggestions(false)
    setBusy(true)
    setError(null)
    try {
      setBuildStatus(`Finding real places in ${locationQuery.trim()}…`)
      const location = await fetchLocation(locationQuery)
      const trip = await createTrip(location.slug, 'chronicle')
      setBuildStatus('Planning your first days…')
      const starterItinerary = buildStarterItinerary(location.thingsToDo)
      const updatedTrip = starterItinerary.length > 0 ? await updateTrip(trip.id, { itinerary: starterItinerary }) : trip
      setTrip(updatedTrip.id, updatedTrip.locationSlug, updatedTrip.itinerary, updatedTrip.designStyle)
      navigate(`/trip/${updatedTrip.id}`)
    } catch (err) {
      logger.error('failed to create trip from search', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
      setBuildStatus('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await submitLocation(query)
  }

  async function handleSelectSuggestion(suggestion: AutocompleteSuggestion) {
    suppressAutocompleteRef.current = true
    setQuery(suggestion.displayName)
    setShowSuggestions(false)
    setSuggestions([])
    await submitLocation(suggestion.displayName)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  return (
    <div className="chronicle-landing">
      {busy && <TripBuildingOverlay status={buildStatus} />}
      <section className="chronicle-hero">
        <div className="chronicle-hero-logo">
          <Logo size={40} />
        </div>
        <p className="chronicle-kicker">A trip planner, without the friction</p>
        <h1 className="chronicle-hero-heading">Describe your trip. We build it.</h1>
        <p className="chronicle-hero-sub">
          Tell us where you want to go and what you’re after — we turn one sentence into a real day-by-day itinerary
          made from actual places there. No account, no signup.
        </p>

        <div className="chronicle-hero-cols">
          <div className="chronicle-hero-col-ai">
            <HomeAiPlanner />
          </div>

          <div className="chronicle-hero-col-browse">
            <p className="chronicle-hero-col-label">Or just browse a place</p>
            <div ref={containerRef} onKeyDown={handleKeyDown} className="chronicle-search-wrap">
          <form onSubmit={handleSubmit} className="chronicle-search-bar">
            <label htmlFor="chronicle-location-query" className="chronicle-sr-only">
              Where to?
            </label>
            <input
              id="chronicle-location-query"
              value={query}
              onChange={(e) => {
                suppressAutocompleteRef.current = false
                setQuery(e.target.value)
                setError(null)
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Yellowstone, Tokyo, Reykjavik…"
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-autocomplete="list"
              aria-controls="chronicle-location-suggestions"
            />
            <button type="submit" className="chronicle-search-submit" disabled={busy}>
              {busy ? 'Loading…' : 'Go'}
            </button>
          </form>
          {error && (
            <p role="alert" className="chronicle-search-error">
              {error}
            </p>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <ul id="chronicle-location-suggestions" role="listbox" className="chronicle-autocomplete-list">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.lat}-${suggestion.lng}`} role="option" aria-selected="false">
                  <button type="button" className="chronicle-autocomplete-btn" onClick={() => handleSelectSuggestion(suggestion)}>
                    {suggestion.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
            </div>

            <p className="chronicle-hero-col-label chronicle-hero-ready-label">Or start from a ready trip</p>
            <ul className="chronicle-ready-trips">
              {DEMO_TRIPS.map((trip) => (
                <li key={trip.id}>
                  <Link to={`/trip/${trip.id}`} className="chronicle-ready-trip">
                    <span className="chronicle-ready-trip-city">{trip.city}</span>
                    <span className="chronicle-ready-trip-blurb">{trip.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {recentTrips.length > 0 && (
        <section className="chronicle-recents" aria-labelledby="chronicle-recents-heading">
          <p className="chronicle-kicker">Continue</p>
          <h2 id="chronicle-recents-heading">Pick up where you left off.</h2>
          <ul className="chronicle-ready-trips chronicle-recents-list">
            {recentTrips.map((t) => (
              <li key={t.id}>
                <Link to={`/trip/${t.id}`} className="chronicle-ready-trip">
                  <span className="chronicle-ready-trip-city">{t.name}</span>
                  <span className="chronicle-ready-trip-blurb">Open your trip →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="chronicle-features" aria-labelledby="chronicle-features-heading">
        <p className="chronicle-kicker">What you get</p>
        <h2 id="chronicle-features-heading">Four things, done well.</h2>
        <p className="chronicle-section-sub">
          Every stop is a real place from Google and Tripadvisor — never invented. No account, no signup.
        </p>
        <div className="chronicle-feature-grid">
          {FEATURES.map((feature) => (
            <div className="chronicle-feature-tile" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
