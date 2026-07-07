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
import { reorderItinerary } from '../../lib/itinerary/reorderItinerary'
import { badgeFor, directionsUrl } from '../../lib/itinerary/badges'
import { currencyForDisplayName } from '../../features/localinfo/currencyByCountry'
import { useCurrencyRate } from '../../features/localinfo/useCurrencyRate'
import { MapView } from '../../features/map/MapView'
import { MapLegend } from '../../features/map/MapLegend'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { SectionNav } from '../../components/SectionNav'
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
      <div className="lg-app-screen">
        <p className="lg-loading">Loading…</p>
      </div>
    )
  }

  return (
    <div className="lg-app-screen">
      <ErrorBoundary label="Trip">
        <TripContent tripId={tripId} trip={trip} location={location} />
      </ErrorBoundary>
    </div>
  )
}

function TripContent({ tripId, trip, location }: { tripId: string; trip: Trip; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? trip.locationSlug
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const [selectedDay, setSelectedDay] = useState(1)

  // Only Places-sourced entries carry real per-item coordinates today (see
  // ThingToDo in src/lib/api/client.ts) — Tripadvisor entries without
  // lat/lng are left off the map rather than guessing a location for them.
  const markers = (location?.thingsToDo ?? [])
    .filter((item) => item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category }))

  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1
  const route = itinerary
    .filter((item) => (item.day ?? 1) === selectedDay && item.lat != null && item.lng != null)
    .map((item) => ({ lat: item.lat as number, lng: item.lng as number }))

  return (
    <div className="lg-trip-page">
      <SectionNav classPrefix="lg" />
      <header id="trip-overview" className="lg-glass-card lg-trip-header">
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
          {dayCount > 1 && (
            <div className="lg-day-tabs" role="tablist" aria-label="Select day to show its route">
              {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={selectedDay === day}
                  className={`lg-tap-target lg-day-tab${selectedDay === day ? ' lg-day-tab--active' : ''}`}
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
          {markers.length > 0 && <MapLegend className="lg-map-legend" />}
        </section>
      )}

      <ItinerarySection tripId={tripId} />
      <ThingsToDoSection tripId={tripId} thingsToDo={location?.thingsToDo ?? []} />
      <LocalInfoSection displayName={displayName} />
    </div>
  )
}

/**
 * Re-organizes the itinerary (day clustering + meal-slot ordering) and
 * persists the result, both to the shared store and the backend. Centralized
 * here so every mutation (add, remove, change trip length) goes through the
 * same organize-then-persist path rather than three subtly different ones.
 * @param items - The itinerary items after whatever mutation just happened
 * @param tripLengthDays - The current trip length to cluster into
 * @param tripId - The trip to persist the result to
 */
function organizeAndPersist(items: ItineraryItem[], tripLengthDays: number | null, tripId: string) {
  const organized = organizeItinerary(items, tripLengthDays)
  useTripStore.getState().setItinerary(organized)
  updateTrip(tripId, { itinerary: organized }).catch((err) => {
    logger.error('failed to persist organized itinerary', err)
  })
}

function ItinerarySection({ tripId }: { tripId: string }) {
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

  /**
   * Persists a manual reorder directly, bypassing organizeAndPersist — a
   * manual move is a deliberate override of the smart day/meal ordering, so
   * re-running that algorithm here would immediately undo what the user
   * just did.
   */
  function persistReorder(fromIndex: number, toIndex: number, targetDay: number) {
    const reordered = reorderItinerary(itinerary, fromIndex, toIndex, targetDay)
    useTripStore.getState().setItinerary(reordered)
    updateTrip(tripId, { itinerary: reordered }).catch((err) => {
      logger.error('failed to persist manual reorder', err)
    })
  }

  function handleMove(entries: { item: ItineraryItem; index: number }[], entryPos: number, direction: -1 | 1) {
    const targetPos = entryPos + direction
    if (targetPos < 0 || targetPos >= entries.length) return
    persistReorder(entries[entryPos].index, entries[targetPos].index, entries[entryPos].item.day ?? 1)
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
    <section id="trip-itinerary" className="lg-glass-card lg-trip-section" aria-labelledby="lg-itinerary-heading">
      <div className="lg-itinerary-header">
        <h2 id="lg-itinerary-heading" className="lg-section-heading">
          Your itinerary
        </h2>
        <label className="lg-trip-length-control">
          <span className="lg-label">Trip length</span>
          <select
            className="lg-tap-target lg-select"
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
        <div className="lg-field lg-field-grow">
          <label htmlFor="lg-stop-location" className="lg-label">
            Location (optional)
          </label>
          <input
            id="lg-stop-location"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Eiffel Tower"
            className="lg-tap-target lg-input"
          />
        </div>
        <button type="submit" className="lg-tap-target lg-btn lg-btn-primary" disabled={geocoding}>
          {geocoding ? 'Adding…' : 'Add stop'}
        </button>
      </form>
      {itinerary.length === 0 ? (
        <p className="lg-empty-state">No stops yet — add one above, or add a suggestion below.</p>
      ) : (
        dayGroups.map(([day, entries]) => (
          <div key={day} className="lg-day-group">
            {dayGroups.length > 1 && <h3 className="lg-day-heading">Day {day}</h3>}
            <ul className="lg-timeline">
              {entries.map(({ item, index }, entryPos) => {
                const badge = badgeFor(item)
                return (
                  <li key={`${item.time}-${item.text}-${index}`} className="lg-timeline-item">
                    <span className="lg-timeline-time">{item.time}</span>
                    <span className={`lg-badge lg-badge--${badge.tone}`}>{badge.label}</span>
                    <span className="lg-timeline-text">{item.text}</span>
                    <a
                      className="lg-tap-target lg-directions-link"
                      href={directionsUrl(item.q ?? item.text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Directions to ${item.text}`}
                    >
                      Directions
                    </a>
                    <div className="lg-move-btns">
                      <button
                        type="button"
                        onClick={() => handleMove(entries, entryPos, -1)}
                        disabled={entryPos === 0}
                        aria-label={`Move ${item.text} earlier`}
                        className="lg-tap-target lg-move-btn"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(entries, entryPos, 1)}
                        disabled={entryPos === entries.length - 1}
                        aria-label={`Move ${item.text} later`}
                        className="lg-tap-target lg-move-btn"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      aria-label={`Remove ${item.text}`}
                      className="lg-tap-target lg-remove-btn"
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

function ThingsToDoSection({ tripId, thingsToDo }: { tripId: string; thingsToDo: ThingToDo[] }) {
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
    <section id="trip-things-to-do" className="lg-trip-section lg-things-section" aria-labelledby="lg-things-heading">
      <h2 id="lg-things-heading" className="lg-section-heading">
        Things to do nearby
      </h2>
      <ul className="lg-things-list">
        {thingsToDo.map((item) => (
          <li key={item.name} className="lg-glass-card lg-thing-card">
            <span className="lg-thing-name">{item.name}</span>
            <span className="lg-thing-badge">({item.category})</span>
            <a
              className="lg-tap-target lg-directions-link"
              href={directionsUrl(item.name)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Directions to ${item.name}`}
            >
              Directions
            </a>
            <button
              type="button"
              className="lg-tap-target lg-btn lg-btn-secondary lg-thing-add"
              onClick={() => handleAdd(item)}
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
    <section id="trip-local-info" className="lg-glass-card lg-trip-section" aria-labelledby="lg-local-info-heading">
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
