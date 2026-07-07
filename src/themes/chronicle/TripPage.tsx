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
import { useDailyForecast } from '../../features/weather/useDailyForecast'
import { packingTips } from '../../features/weather/packingTips'
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

const DEFAULT_FORECAST_DAYS = 5

function TripContent({ tripId, location }: { tripId: string; location: LocationResult | null }) {
  const { data: forecast } = useForecast(location?.lat ?? 0, location?.lng ?? 0)
  const displayName = location?.displayName ?? 'Loading…'
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const [selectedDay, setSelectedDay] = useState(1)
  const { data: dailyForecast } = useDailyForecast(
    location?.lat ?? 0,
    location?.lng ?? 0,
    tripLengthDays ?? DEFAULT_FORECAST_DAYS,
  )
  const tips = dailyForecast ? packingTips(dailyForecast) : []

  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map. Memoized so
  // MapView's effect (keyed on this array's identity) doesn't tear down and
  // recreate the whole Leaflet map on every unrelated re-render (e.g. the
  // daily forecast landing) — recreating the map mid fitBounds animation
  // throws inside Leaflet's zoom-transition handler.
  const markers = useMemo(
    () =>
      (location?.thingsToDo ?? [])
        .filter((item) => item.lat != null && item.lng != null)
        .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category })),
    [location?.thingsToDo],
  )

  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1
  const route = useMemo(
    () =>
      itinerary
        .filter((item) => (item.day ?? 1) === selectedDay && item.lat != null && item.lng != null)
        .map((item) => ({ lat: item.lat as number, lng: item.lng as number })),
    [itinerary, selectedDay],
  )

  return (
    <div className="chronicle-book">
      <SectionNav classPrefix="chronicle" />
      <article id="trip-overview" className="chronicle-chapter">
        <span className="chronicle-kicker">Chapter one</span>
        <h1>Arrival: {displayName}</h1>
        {forecast && (
          <p className="chronicle-weather">
            {forecast.temperatureF}°F <span className="chronicle-weather-condition">— {forecast.condition}</span>
          </p>
        )}
        {dailyForecast && dailyForecast.length > 0 && (
          <div className="chronicle-forecast">
            <ul className="chronicle-forecast-strip">
              {dailyForecast.map((day) => (
                <li key={day.date} className="chronicle-forecast-day">
                  <span className="chronicle-forecast-date">
                    {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="chronicle-forecast-condition">{day.condition}</span>
                  <span className="chronicle-forecast-temps">
                    {Math.round(day.hiF)}° / {Math.round(day.loF)}°
                  </span>
                  {day.precipPercent != null && <span className="chronicle-forecast-precip">{day.precipPercent}% precip</span>}
                </li>
              ))}
            </ul>
            {tips.length > 0 && (
              <div className="chronicle-packing-tips">
                <h3>Packing</h3>
                <ul>
                  {tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
            {markers.length > 0 && <MapLegend className="chronicle-map-legend" />}
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
    <article id="trip-itinerary" className="chronicle-chapter">
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
              {entries.map(({ item, index }, entryPos) => {
                const badge = badgeFor(item)
                return (
                  <li key={`${item.time}-${item.text}-${index}`} className="chronicle-entry">
                    <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
                    <span className="chronicle-entry-time">{item.time}</span>
                    <span className={`chronicle-badge chronicle-badge--${badge.tone}`}>{badge.label}</span>
                    <span className="chronicle-entry-text">{item.text}</span>
                    <a
                      className="chronicle-directions-link"
                      href={directionsUrl(item.q ?? item.text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Directions to ${item.text}`}
                    >
                      Directions
                    </a>
                    <div className="chronicle-move-btns">
                      <button
                        type="button"
                        onClick={() => handleMove(entries, entryPos, -1)}
                        disabled={entryPos === 0}
                        aria-label={`Move ${item.text} earlier`}
                        className="chronicle-move-btn"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(entries, entryPos, 1)}
                        disabled={entryPos === entries.length - 1}
                        aria-label={`Move ${item.text} later`}
                        className="chronicle-move-btn"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      type="button"
                      className="chronicle-entry-remove"
                      onClick={() => handleRemove(index)}
                      aria-label={`Remove ${item.text}`}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
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
    <article id="trip-things-to-do" className="chronicle-chapter">
      <span className="chronicle-kicker">Chapter three</span>
      <h1>Things to do nearby</h1>
      <ol className="chronicle-suggestions">
        {thingsToDo.map((item) => (
          <li key={item.name}>
            <span className="chronicle-suggestion-category">{item.category}</span>
            <span className="chronicle-suggestion-name">{item.name}</span>
            <a
              className="chronicle-directions-link"
              href={directionsUrl(item.name)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Directions to ${item.name}`}
            >
              Directions
            </a>
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
    <article id="trip-local-info" className="chronicle-chapter">
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
