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
    <svg viewBox="0 0 24 24" className="lg-search-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <path d="M14.5 9.5 13 13l-3.5 1.5L11 11l3.5-1.5Z" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="lg-suggestion-icon" aria-hidden="true">
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

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5" />
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
    title: 'Live weather',
    description: 'Current conditions the moment you search, so you know what to pack.',
  },
  {
    icon: <MapPinIcon />,
    title: 'One unified page',
    description: 'Map, itinerary, things to do, and local info — all in one scroll, no extra taps.',
  },
  {
    icon: <BookmarkIcon />,
    title: 'Real things to do',
    description: 'Tripadvisor and Google Places, ranked by rating and how close they are.',
  },
  {
    icon: <SparkleIcon />,
    title: 'Starts pre-planned',
    description: 'Your itinerary auto-fills with the top-rated nearby spots the moment you search.',
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
    <Link to={to} className="lg-glass-card lg-demo-card">
      <div className="lg-demo-image">
        <CompassGhostIcon />
      </div>
      <div className="lg-demo-body">
        <p className="lg-demo-eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="lg-demo-cta">
          {cta}{' '}
          <span className="lg-demo-cta-arrow" aria-hidden="true">
            →
          </span>
        </span>
      </div>
    </Link>
  )
}

/**
 * Landing page for Trip One — Liquid Glass is the default theme, so this
 * screen is the site's actual front door (rendered at "/" regardless of
 * which theme a later trip ends up using).
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
      const trip = await createTrip(location.slug, 'liquid-glass')
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
    <div className="lg-landing">
      <section className="lg-hero">
        <div className="lg-hero-inner">
          <p className="lg-eyebrow">Trip One · a trip planner, without the friction</p>
          <h1 className="lg-hero-heading">Somewhere new, ready in a minute.</h1>
          <p className="lg-hero-sub">
            Search any city, state, or national park. Land on one page with the map, your itinerary, and real things
            to do — instantly, without signing up.
          </p>

          <div ref={containerRef} onKeyDown={handleKeyDown} className="lg-search-wrap">
            <form onSubmit={handleSubmit} className="lg-glass-card lg-search-bar">
              <label htmlFor="lg-location-query" className="lg-sr-only">
                Where to?
              </label>
              <CompassIcon />
              <input
                id="lg-location-query"
                className="lg-search-input"
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
                aria-controls="lg-location-suggestions"
              />
              <button type="submit" className="lg-tap-target lg-btn lg-btn-primary lg-search-submit" disabled={busy}>
                {busy ? 'Loading…' : 'Go'}
              </button>
            </form>
            {error && (
              <p role="alert" className="lg-search-error">
                {error}
              </p>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul id="lg-location-suggestions" role="listbox" className="lg-glass-card lg-suggestions">
                {suggestions.map((suggestion) => (
                  <li key={`${suggestion.lat}-${suggestion.lng}`} role="option" aria-selected="false" className="lg-suggestion">
                    <button type="button" className="lg-tap-target lg-suggestion-btn" onClick={() => handleSelectSuggestion(suggestion)}>
                      <PinIcon />
                      <span className="lg-suggestion-text">{suggestion.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="lg-trust-line">No account. No tracking. Powered by Tripadvisor + Google Places.</p>
        </div>
      </section>

      <section className="lg-features" aria-labelledby="lg-features-heading">
        <p className="lg-eyebrow">What you get</p>
        <h2 id="lg-features-heading" className="lg-section-heading">
          Four things, done well.
        </h2>
        <p className="lg-section-sub">No dashboards to configure. No accounts. Search, and it's there.</p>
        <div className="lg-feature-grid">
          {FEATURES.map((feature) => (
            <div className="lg-glass-card lg-feature-tile" key={feature.title}>
              <span className="lg-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lg-demos" aria-labelledby="lg-demos-heading">
        <p className="lg-eyebrow">See it live</p>
        <h2 id="lg-demos-heading" className="lg-section-heading">
          Two trips, already built.
        </h2>
        <p className="lg-section-sub">Poke around before you plan your own. No signup required.</p>
        <div className="lg-demo-grid">
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

      <footer className="lg-footer">
        <div>
          <span className="lg-footer-wordmark">Trip One</span>
          <br />
          <span className="lg-footer-tagline">Made for wanderers. No accounts, ever.</span>
        </div>
        <nav className="lg-footer-links" aria-label="Footer">
          <a href="https://github.com/brianference/trip-one" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  )
}
