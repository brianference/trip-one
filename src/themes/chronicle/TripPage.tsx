import { useEffect, useMemo, useState } from 'react'
import {
  getTrip,
  fetchLocation,
  updateTrip,
  type Trip,
  type LocationResult,
  type ThingToDo,
} from '../../lib/api/client'
import type { ItineraryItem } from '../../lib/validation/schemas'
import { useForecast } from '../../features/weather/useForecast'
import { useTripStore } from '../../store/tripStore'
import { organizeItinerary } from '../../lib/itinerary/organizeItinerary'
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
  const [trip, setLocalTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)

  useEffect(() => {
    let cancelled = false
    getTrip(tripId)
      .then((loadedTrip) => {
        if (cancelled) return
        setLocalTrip(loadedTrip)
        // Rehydrates the itinerary/trip length into the shared store on
        // every load — without this, revisiting/reloading a trip URL
        // directly (rather than arriving straight from the search flow that
        // already calls setTrip) would show an empty itinerary even though
        // stops were saved, since the store resets on every fresh page load.
        // A partial update (not the full setTrip action) deliberately
        // leaves designStyle alone: overwriting it here could race with an
        // in-progress ThemeSwitcher change and revert it back to whatever
        // was last persisted.
        useTripStore.setState({
          tripId: loadedTrip.id,
          locationSlug: loadedTrip.locationSlug,
          itinerary: loadedTrip.itinerary,
          tripLengthDays: loadedTrip.tripLengthDays,
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
      <div className="chronicle-page">
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="chronicle-page">
      <ErrorBoundary label="Trip">
        <TripContent tripId={tripId} location={location} />
      </ErrorBoundary>
    </div>
  )
}

function TripContent({ tripId, location }: { tripId: string; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? 'Loading…'
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const [selectedDay, setSelectedDay] = useState(1)

  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map.
  const markers = (location?.thingsToDo ?? [])
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1
  const route = itinerary
    .filter((item) => (item.day ?? 1) === selectedDay && item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number }))

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
            {dayCount > 1 && (
              <div className="chronicle-day-tabs" role="tablist" aria-label="Select day to show its route">
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={selectedDay === day}
                    className={`chronicle-day-tab${selectedDay === day ? ' chronicle-day-tab--active' : ''}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    Day {day}
                  </button>
                ))}
              </div>
            )}
            <MapView
              lat={location.lat}
              lng={location.lng}
              label={displayName}
              markers={markers}
              boundingBox={location.boundingBox}
              route={route}
            />
          </div>
        )}
      </article>

      <ItineraryChapter tripId={tripId} />
      <ThingsToDoChapter tripId={tripId} thingsToDo={location?.thingsToDo ?? []} />
      <LocalInfoChapter displayName={displayName} />
    </div>
  )
}

/**
 * Re-organizes the itinerary (day clustering + meal-slot ordering) and
 * persists the result, both to the shared store and the backend. Centralized
 * here so every mutation (add, remove, change trip length) goes through the
 * same organize-then-persist path rather than three subtly different ones.
 */
function organizeAndPersist(items: ItineraryItem[], tripLengthDays: number | null, tripId: string) {
  const organized = organizeItinerary(items, tripLengthDays)
  useTripStore.getState().setItinerary(organized)
  updateTrip(tripId, { itinerary: organized }).catch((err) => {
    logger.error('failed to persist organized itinerary', err)
  })
}

function ItineraryChapter({ tripId }: { tripId: string }) {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const [locationText, setLocationText] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    setGeocoding(true)
    let lat: number | undefined
    let lng: number | undefined
    if (locationText.trim()) {
      try {
        const geocoded = await fetchLocation(locationText)
        lat = geocoded.lat
        lng = geocoded.lng
      } catch (err) {
        // Fails soft: the stop is still added, just without map/route
        // placement, rather than blocking the user over a bad location string.
        logger.error('failed to geocode itinerary stop location', err)
      }
    }
    organizeAndPersist([...itinerary, { time, text, type: 'option', lat, lng }], tripLengthDays, tripId)
    setTime('')
    setText('')
    setLocationText('')
    setGeocoding(false)
  }

  function handleRemove(index: number) {
    organizeAndPersist(
      itinerary.filter((_, i) => i !== index),
      tripLengthDays,
      tripId,
    )
  }

  async function handleTripLengthChange(newLength: number | null) {
    // Changing the trip length re-clusters everything from scratch (day
    // assignments are stripped first) rather than only fitting new stops
    // around whatever the previous day count happened to place — a day
    // count change is a deliberate re-plan, not an incremental addition.
    const stripped = itinerary.map((item) => ({ ...item, day: undefined }))
    const organized = organizeItinerary(stripped, newLength)
    useTripStore.getState().setItinerary(organized)
    useTripStore.getState().setTripLengthDays(newLength)
    try {
      await updateTrip(tripId, { itinerary: organized, tripLengthDays: newLength })
    } catch (err) {
      logger.error('failed to persist trip length change', err)
    }
  }

  const dayGroups = useMemo(() => {
    const groups = new Map<number, { item: ItineraryItem; index: number }[]>()
    itinerary.forEach((item, index) => {
      const day = item.day ?? 1
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)?.push({ item, index })
    })
    return [...groups.entries()].sort(([a], [b]) => a - b)
  }, [itinerary])

  return (
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter two</span>
      <div className="chronicle-itinerary-header">
        <h1 className="chronicle-timeline-heading">The itinerary</h1>
        <label className="chronicle-trip-length-control">
          <span>Trip length</span>
          <select
            value={tripLengthDays ?? ''}
            onChange={(e) => handleTripLengthChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Not set</option>
            {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form className="chronicle-stop-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="chronicle-stop-time">Time</label>
          <input id="chronicle-stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="chronicle-stop-text">What</label>
          <input id="chronicle-stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label htmlFor="chronicle-stop-location">Location (optional)</label>
          <input
            id="chronicle-stop-location"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Eiffel Tower"
          />
        </div>
        <button type="submit" className="chronicle-stop-submit" disabled={geocoding}>
          {geocoding ? 'Adding…' : 'Add stop'}
        </button>
      </form>
      {itinerary.length === 0 ? (
        <p className="chronicle-rate-line">No stops yet — add one above, or add a suggestion below.</p>
      ) : (
        dayGroups.map(([day, entries]) => (
          <div key={day} className="chronicle-day-group">
            {dayGroups.length > 1 && <h2 className="chronicle-day-heading">Day {day}</h2>}
            <ol>
              {entries.map(({ item, index }) => (
                <li key={`${item.time}-${item.text}-${index}`} className="chronicle-entry">
                  <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
                  <span className="chronicle-entry-time">{item.time}</span>
                  <span className="chronicle-entry-text">{item.text}</span>
                  <button
                    type="button"
                    className="chronicle-entry-remove"
                    onClick={() => handleRemove(index)}
                    aria-label={`Remove ${item.text}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </article>
  )
}

function ThingsToDoChapter({ tripId, thingsToDo }: { tripId: string; thingsToDo: ThingToDo[] }) {
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)

  if (thingsToDo.length === 0) return null

  function handleAdd(item: ThingToDo) {
    organizeAndPersist(
      [...itinerary, { time: '', text: item.name, type: 'option', q: item.name, lat: item.lat, lng: item.lng, category: item.category }],
      tripLengthDays,
      tripId,
    )
  }

  return (
    <article className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter three</span>
      <h1>Things to do nearby</h1>
      <ol className="chronicle-suggestions">
        {thingsToDo.map((item) => (
          <li key={item.name}>
            <span className="chronicle-suggestion-category">{item.category}</span>
            <span className="chronicle-suggestion-name">{item.name}</span>
            <button type="button" className="chronicle-suggestion-add" onClick={() => handleAdd(item)}>
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
