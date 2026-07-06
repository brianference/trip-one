import { useEffect, useState } from 'react'
import { getTrip, fetchLocation, type Trip, type LocationResult, type ThingToDo } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { useTripStore } from '../../store/tripStore'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { MapView } from '../../features/map/MapView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { logger } from '../../lib/logger'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

/**
 * The single unified page for a Chronicle trip: search lands here, and the
 * whole plan reads as a sequence of chapters — arrival, the itinerary,
 * things to do, local notes — in one scroll instead of separate routes.
 */
export function TripPage({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getTrip(tripId)
      .then((loadedTrip) => {
        if (cancelled) return
        setTrip(loadedTrip)
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
      <div className="chronicle-page">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="chronicle-page">
      <ErrorBoundary label="Trip">
        <TripContent location={location} />
      </ErrorBoundary>
    </div>
  )
}

function TripContent({ location }: { location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? 'Loading…'
  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map.
  const markers = (location?.thingsToDo ?? [])
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  return (
    <div className="chronicle-book">
      <article className="chronicle-chapter">
        <span className="chronicle-kicker">Chapter one</span>
        <h1>Arrival: {displayName}</h1>
        {forecast && (
          <p className="chronicle-weather">
            {forecast.temperatureF}°F <span className="chronicle-weather-condition">— {forecast.condition}</span>
          </p>
        )}
        {location && (
          <div className="chronicle-map-frame">
            <MapView
              lat={location.lat}
              lng={location.lng}
              label={displayName}
              markers={markers}
              boundingBox={location.boundingBox}
            />
          </div>
        )}
      </article>

      <ItineraryChapter />
      <ThingsToDoChapter thingsToDo={location?.thingsToDo ?? []} />
      <LocalInfoChapter displayName={displayName} />
    </div>
  )
}

function ItineraryChapter() {
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
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter two</span>
      <h1 className="chronicle-timeline-heading">The itinerary</h1>
      <form className="chronicle-stop-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="chronicle-stop-time">Time</label>
          <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="chronicle-stop-text">What</label>
          <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="submit" className="chronicle-stop-submit">
          Add stop
        </button>
      </form>
      {itinerary.length === 0 ? (
        <p className="chronicle-rate-line">No stops yet — add one above, or add a suggestion below.</p>
      ) : (
        <ol>
          {itinerary.map((item, i) => (
            <li key={`${item.time}-${item.text}-${i}`} className="chronicle-entry">
              <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
              <span className="chronicle-entry-time">{item.time}</span>
              <span className="chronicle-entry-text">{item.text}</span>
              <button type="button" className="chronicle-entry-remove" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}

function ThingsToDoChapter({ thingsToDo }: { thingsToDo: ThingToDo[] }) {
  const addItem = useTripStore((s) => s.addItem)

  if (thingsToDo.length === 0) return null

  return (
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter three</span>
      <h1>Things to do nearby</h1>
      <ol className="chronicle-suggestions">
        {thingsToDo.map((item) => (
          <li key={item.name}>
            <span className="chronicle-suggestion-category">{item.category}</span>
            <span className="chronicle-suggestion-name">{item.name}</span>
            <button
              type="button"
              className="chronicle-suggestion-add"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add to timeline
            </button>
          </li>
        ))}
      </ol>
    </article>
  )
}

function LocalInfoChapter({ displayName }: { displayName: string }) {
  const targetCurrency = currencyForDisplayName(displayName)
  const { rate, loading } = useCurrencyRate(targetCurrency)
  const transitUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`public transit in ${displayName}`)}`
  const translateUrl = 'https://translate.google.com/?sl=en&tl=auto&op=translate'

  return (
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Field notes</span>
      <h1>Local info</h1>
      {!loading && rate !== null && (
        <p className="chronicle-rate-line">
          1 USD ≈ <strong>{rate}</strong> {targetCurrency}
        </p>
      )}
      {!loading && rate === null && <p className="chronicle-rate-line">Currency rate unavailable right now.</p>}
      <ul className="chronicle-link-list">
        <li>
          <a href={transitUrl} target="_blank" rel="noopener noreferrer">
            Transit directions
          </a>
        </li>
        <li>
          <a href={translateUrl} target="_blank" rel="noopener noreferrer">
            Phrasebook
          </a>
        </li>
      </ul>
    </article>
  )
}
