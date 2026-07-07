import { useEffect, useState } from 'react'
import { getTrip, fetchLocation, type Trip, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { useTripStore } from '../../store/tripStore'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

/**
 * The single unified page for a Liquid Glass trip: search lands here, and
 * the whole plan — map, weather, itinerary, nearby things to do, and local
 * info — scrolls as one page instead of requiring navigation between
 * separate routes for each section.
 */
export function TripPage({ tripId }: { tripId: string }) {
  const [trip, setLocalTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getTrip(tripId)
      .then((loadedTrip) => {
        if (cancelled) return
        setLocalTrip(loadedTrip)
        // Rehydrates the itinerary into the shared store on every load —
        // without this, revisiting/reloading a trip URL directly (rather
        // than arriving straight from the search flow that already calls
        // setTrip) would show an empty itinerary even though stops were
        // saved, since the store resets on every fresh page load. A partial
        // update (not the full setTrip action) deliberately leaves
        // designStyle alone: overwriting it here could race with an
        // in-progress ThemeSwitcher change and revert it back to whatever
        // was last persisted.
        useTripStore.setState({
          tripId: loadedTrip.id,
          locationSlug: loadedTrip.locationSlug,
          itinerary: loadedTrip.itinerary,
        })
        return fetchLocation(loadedTrip.locationSlug).then((loc) => {
          if (!cancelled) setLocation(loc)
        })
      })
      .catch((err) => {
        logger.error('failed to load unified trip page', err)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  if (!trip) {
    return (
      <div className="lg-app-screen">
        <p className="lg-loading">Loading…</p>
      </div>
    )
  }

  return (
    <div className="lg-app-screen">
      <ErrorBoundary label="Trip">
        <TripContent trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}

function TripContent({ trip, location }: { trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  // Only Places-sourced entries carry real per-item coordinates today (see
  // ThingToDo in src/lib/api/client.ts) — Tripadvisor entries without
  // lat/lng are left off the map rather than guessing a location for them.
  const markers = (location?.thingsToDo ?? [])
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  return (
    <div className="lg-trip-page">
      <header className="lg-glass-card lg-trip-header">
        <h1 className="lg-title">{displayName}</h1>
        {forecast && (
          <p className="lg-weather-row">
            <span className="lg-weather-value">{forecast.temperatureF}°F</span>
            <span className="lg-weather-condition">{forecast.condition}</span>
          </p>
        )}
      </header>

      {location && (
        <section className="lg-glass-card lg-map-card" aria-label="Map">
          <MapView
            lat={location.lat}
            lng={location.lng}
            label={displayName}
            markers={markers}
            boundingBox={location.boundingBox}
          />
        </section>
      )}

      <ItinerarySection />
      <ThingsToDoSection thingsToDo={location?.thingsToDo ?? []} />
      <LocalInfoSection displayName={displayName} />
    </div>
  )
}

function ItinerarySection() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <section className="lg-glass-card lg-trip-section" aria-labelledby="lg-itinerary-heading">
      <h2 id="lg-itinerary-heading" className="lg-section-heading">
        Your itinerary
      </h2>
      <form onSubmit={handleSubmit} className="lg-itinerary-form">
        <div className="lg-field">
          <label htmlFor="lg-stop-time" className="lg-label">
            Time
          </label>
          <input
            id="lg-stop-time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="lg-tap-target lg-input"
          />
        </div>
        <div className="lg-field lg-field-grow">
          <label htmlFor="lg-stop-text" className="lg-label">
            What
          </label>
          <input
            id="lg-stop-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="lg-tap-target lg-input"
          />
        </div>
        <button type="submit" className="lg-tap-target lg-btn lg-btn-primary">
          Add stop
        </button>
      </form>
      {itinerary.length === 0 ? (
        <p className="lg-empty-state">No stops yet — add one above, or add a suggestion below.</p>
      ) : (
        <ul className="lg-timeline">
          {itinerary.map((item, i) => (
            <li key={`${item.time}-${item.text}-${i}`} className="lg-timeline-item">
              <span className="lg-timeline-time">{item.time}</span>
              <span className="lg-timeline-text">{item.text}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={`Remove ${item.text}`}
                className="lg-tap-target lg-remove-btn"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ThingsToDoSection({ thingsToDo }: { thingsToDo: ThingToDo[] }) {
  const addItem = useTripStore((s) => s.addItem)

  if (thingsToDo.length === 0) return null

  return (
    <section className="lg-trip-section lg-things-section" aria-labelledby="lg-things-heading">
      <h2 id="lg-things-heading" className="lg-section-heading">
        Things to do nearby
      </h2>
      <ul className="lg-things-list">
        {thingsToDo.map((item) => (
          <li key={item.name} className="lg-glass-card lg-thing-card">
            <span className="lg-thing-name">{item.name}</span>
            <span className="lg-thing-badge">({item.category})</span>
            <button
              type="button"
              className="lg-tap-target lg-btn lg-btn-secondary lg-thing-add"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LocalInfoSection({ displayName }: { displayName: string }) {
  const targetCurrency = currencyForDisplayName(displayName)
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`
  const translateUrl = 'https://translate.google.com/?sl=en&tl=auto&op=translate'

  return (
    <section className="lg-glass-card lg-trip-section" aria-labelledby="lg-local-info-heading">
      <h2 id="lg-local-info-heading" className="lg-section-heading">
        Local info
      </h2>
      {!loading && rate !== null && (
        <p className="lg-rate-row">
          <span className="lg-rate-value">1 USD ≈ {rate}</span>
          <span className="lg-rate-currency">{targetCurrency}</span>
        </p>
      )}
      {!loading && rate === null && <p className="lg-rate-unavailable">Currency rate unavailable right now.</p>}
      <div className="lg-link-row">
        <a className="lg-tap-target lg-btn lg-btn-secondary" href={transitUrl} target="_blank" rel="noopener noreferrer">
          Transit directions
        </a>
        <a className="lg-tap-target lg-btn lg-btn-secondary" href={translateUrl} target="_blank" rel="noopener noreferrer">
          Phrasebook
        </a>
      </div>
    </section>
  )
}
