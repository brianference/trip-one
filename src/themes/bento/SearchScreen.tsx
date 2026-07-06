import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { fetchLocation, createTrip, updateTrip, fetchAutocomplete, type AutocompleteSuggestion } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'
import { buildStarterItinerary } from '../../lib/itinerary/buildStarterItinerary'

const AUTOCOMPLETE_DEBOUNCE_MS = 300
const AUTOCOMPLETE_MIN_LENGTH = 2

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="bento-search-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <path d="M14.5 9.5 13 13l-3.5 1.5L11 11l3.5-1.5Z" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="bento-suggestion-icon" aria-hidden="true">
      <path
        d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.25" strokeWidth="1.75" />
    </svg>
  )
}

function CloudSunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8.5V5m3 2 1.8-1.8M3 9l2.2 1M15.5 5.7 17.2 4" />
      <path d="M8.5 15.5a4.5 4.5 0 1 1 7.9-3h.6a3.5 3.5 0 0 1 0 7H8a3 3 0 0 1-.5-5.95" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v16l-6-4-6 4Z" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  )
}

function CompassGhostIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
      <path d="M14.5 9.5 13 13l-3.5 1.5L11 11l3.5-1.5Z" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

const FEATURES = [
  {
    icon: <CloudSunIcon />,
    accent: 'sulfur' as const,
    title: 'Live weather',
    description: 'Current conditions the moment you search, so you know what to pack.',
  },
  {
    icon: <MapPinIcon />,
    accent: 'thermal' as const,
    title: 'Interactive map',
    description: 'Every stop plotted. Drag, zoom, or open the pin in Google Maps.',
  },
  {
    icon: <BookmarkIcon />,
    accent: 'sulfur' as const,
    title: 'Real things to do',
    description: 'Tripadvisor and Google Places, ranked by rating and how close they are.',
  },
  {
    icon: <LayersIcon />,
    accent: 'thermal' as const,
    title: 'Five ways to see it',
    description: 'Bento, Chronicle, Field Guide, Liquid Glass, Trail Ledger — switch anytime.',
  },
]

function DemoCard({
  eyebrow,
  title,
  description,
  cta,
  to,
}: {
  eyebrow: string
  title: string
  description: string
  cta: string
  to: string
}) {
  return (
    <Link to={to} className="bento-demo-card">
      <div className="bento-demo-image">
        <CompassGhostIcon />
      </div>
      <div className="bento-demo-body">
        <p className="bento-demo-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="bento-demo-cta">
          {cta} <span className="bento-demo-cta-arrow" aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  )
}

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
    // Guard against submitting a blank/whitespace query (e.g. an accidental
    // Enter/click on an empty box) and against overlapping submissions if a
    // prior submitLocation call is still in flight — either one previously
    // hit the API with an invalid/duplicate query and left a stale error
    // banner on screen that a later, valid query never cleared.
    if (!locationQuery.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(locationQuery)
      const trip = await createTrip(location.slug)
      const starterItinerary = buildStarterItinerary(location.thingsToDo)
      const updatedTrip =
        starterItinerary.length > 0 ? await updateTrip(trip.id, { itinerary: starterItinerary }) : trip
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
    <div className="bento-page">
      <section className="bento-hero">
        <div className="bento-hero-inner">
          <p className="bento-eyebrow">Trip One · a trip planner, without the friction</p>
          <h1>Somewhere new, ready in a minute.</h1>
          <p className="bento-hero-sub">
            Search any city, state, or national park. Get live weather, an interactive map, and real things to do —
            instantly, without signing up.
          </p>

          <div ref={containerRef} onKeyDown={handleKeyDown} className="bento-search-wrap">
            <form onSubmit={handleSubmit} className="bento-search-bar">
              <label htmlFor="location-query" className="bento-sr-only">
                Where to?
              </label>
              <CompassIcon />
              <input
                id="location-query"
                className="bento-search-input"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  // Clear any error left over from a previous failed submission as
                  // soon as the user starts editing the query again — otherwise a
                  // stale "invalid query" banner from an earlier submit can sit on
                  // screen next to fresh, valid autocomplete suggestions.
                  setError(null)
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Yellowstone, Tokyo, Reykjavik…"
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions && suggestions.length > 0}
                aria-autocomplete="list"
                aria-controls="location-suggestions"
              />
              <button type="submit" className="bento-btn bento-search-submit" disabled={busy}>
                <span>{busy ? 'Loading…' : 'Go'}</span>
                {!busy && (
                  <span className="bento-go-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </button>
            </form>
            {error && (
              <p role="alert" className="bento-search-error">
                {error}
              </p>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul id="location-suggestions" role="listbox" className="bento-suggestions">
                {suggestions.map((suggestion) => (
                  <li key={`${suggestion.lat}-${suggestion.lng}`} role="option" aria-selected="false" className="bento-suggestion">
                    <button type="button" className="bento-suggestion-btn" onClick={() => handleSelectSuggestion(suggestion)}>
                      <PinIcon />
                      <span className="bento-suggestion-text">{suggestion.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="bento-trust-line">No account. No tracking. Powered by Tripadvisor + Google Places.</p>
          <hr className="bento-hero-rule" />
        </div>
      </section>

      <section className="bento-features" aria-labelledby="bento-features-heading">
        <p className="bento-eyebrow">What you get</p>
        <h2 id="bento-features-heading">Four things, done well.</h2>
        <p className="bento-section-sub">No dashboards to configure. No accounts. Search, and it's there.</p>
        <div className="bento-feature-grid">
          {FEATURES.map((feature) => (
            <div className="bento-feature-tile" key={feature.title}>
              <span className={`bento-feature-icon bento-feature-icon--${feature.accent}`}>{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bento-demos" aria-labelledby="bento-demos-heading">
        <p className="bento-eyebrow">See it live</p>
        <h2 id="bento-demos-heading">Two trips, already built.</h2>
        <p className="bento-section-sub">Poke around before you plan your own. No signup required.</p>
        <div className="bento-demo-grid">
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

      <footer className="bento-footer">
        <div>
          <span className="bento-footer-wordmark">Trip One</span>
          <br />
          <span className="bento-footer-tagline">Made for wanderers. No accounts, ever.</span>
        </div>
        <nav className="bento-footer-links" aria-label="Footer">
          <a href="https://github.com/brianference/trip-one" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  )
}
