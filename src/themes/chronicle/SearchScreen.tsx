import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip, updateTrip, fetchAutocomplete, type AutocompleteSuggestion } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'
import { buildStarterItinerary } from '../../lib/itinerary/buildStarterItinerary'

const AUTOCOMPLETE_DEBOUNCE_MS = 300
const AUTOCOMPLETE_MIN_LENGTH = 2

const FEATURES = [
  { title: 'Live weather', description: 'Current conditions and a real 5-day forecast the moment you search, so you know what to pack.' },
  { title: 'A real trip page', description: 'Home, Itinerary, Map, Things to do, and Info — separate pages, not one long scroll to hunt through.' },
  { title: 'Real things to do', description: 'Tripadvisor and Google Places, ranked by rating and how close they are.' },
  { title: 'Starts pre-planned', description: 'Your itinerary auto-fills with the top-rated nearby spots the moment you search.' },
]

function DemoCard({ eyebrow, title, description, cta, to }: { eyebrow: string; title: string; description: string; cta: string; to: string }) {
  return (
    <Link to={to} className="chronicle-demo-card">
      <p className="chronicle-demo-eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="chronicle-demo-cta">{cta} →</span>
    </Link>
  )
}

/**
 * Landing page for Trip One — Chronicle is the only theme, so this screen is
 * the site's actual front door.
 */
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
    // Guard against a blank/whitespace query and against overlapping
    // submissions if a prior call is still in flight — either previously
    // hit the API with an invalid/duplicate query and left a stale error
    // banner on screen that a later, valid query never cleared.
    if (!locationQuery.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(locationQuery)
      const trip = await createTrip(location.slug, 'chronicle')
      const starterItinerary = buildStarterItinerary(location.thingsToDo)
      const updatedTrip = starterItinerary.length > 0 ? await updateTrip(trip.id, { itinerary: starterItinerary }) : trip
      setTrip(updatedTrip.id, updatedTrip.locationSlug, updatedTrip.itinerary, updatedTrip.designStyle)
      navigate(`/trip/${updatedTrip.id}`)
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
    <div className="chronicle-landing">
      <section className="chronicle-hero">
        <p className="chronicle-kicker">Trip One · a trip planner, without the friction</p>
        <h1 className="chronicle-hero-heading">Somewhere new, ready in a minute.</h1>
        <p className="chronicle-hero-sub">
          Search any city, state, or national park. Land on a real trip page with a Home dashboard, itinerary, map,
          and real things to do — instantly, without signing up.
        </p>

        <div ref={containerRef} onKeyDown={handleKeyDown} className="chronicle-search-wrap">
          <form onSubmit={handleSubmit} className="chronicle-search-bar">
            <label htmlFor="chronicle-location-query" className="chronicle-sr-only">
              Where to?
            </label>
            <input
              id="chronicle-location-query"
              value={query}
              onChange={(e) => {
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
        <p className="chronicle-trust-line">No account. No tracking. Powered by Tripadvisor + Google Places.</p>
      </section>

      <section className="chronicle-features" aria-labelledby="chronicle-features-heading">
        <p className="chronicle-kicker">What you get</p>
        <h2 id="chronicle-features-heading">Four things, done well.</h2>
        <p className="chronicle-section-sub">No dashboards to configure. No accounts. Search, and it's there.</p>
        <div className="chronicle-feature-grid">
          {FEATURES.map((feature) => (
            <div className="chronicle-feature-tile" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="chronicle-demos" aria-labelledby="chronicle-demos-heading">
        <p className="chronicle-kicker">See it live</p>
        <h2 id="chronicle-demos-heading">Two trips, already built.</h2>
        <p className="chronicle-section-sub">Poke around before you plan your own. No signup required.</p>
        <div className="chronicle-demo-grid">
          <DemoCard
            eyebrow="Demo trip"
            title="Yellowstone in 3 days"
            description="Geysers, wolves, and Old Faithful at 6am."
            cta="Explore Yellowstone"
            to={`/trip/${DEMO_TRIP_IDS.yellowstone}`}
          />
          <DemoCard
            eyebrow="Demo trip"
            title="Tokyo in 5 days"
            description="Ramen in Shinjuku, gardens in Meguro, Shibuya at dusk."
            cta="Explore Tokyo"
            to={`/trip/${DEMO_TRIP_IDS.tokyo}`}
          />
        </div>
      </section>

      <footer className="chronicle-landing-footer">
        <div>
          <span className="chronicle-footer-wordmark">Trip One</span>
          <br />
          <span className="chronicle-footer-tagline">Made for wanderers. No accounts, ever.</span>
        </div>
        <nav className="chronicle-landing-footer-links" aria-label="Footer">
          <a href="https://github.com/brianference/trip-one" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  )
}
