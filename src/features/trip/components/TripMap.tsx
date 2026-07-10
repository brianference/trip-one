import { useMemo, useState } from 'react'
import type { LocationResult } from '../../../lib/api/client'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { MapView, type MapMarker } from '../../map/MapView'
import { MapLegend } from '../../map/MapLegend'
import { DayTabs } from './DayTabs'

/**
 * The trip map: day tabs (for multi-day trips), the Leaflet view, and a
 * category legend. Markers/route are memoized on their real dependencies
 * (not recomputed as fresh array literals every render) — MapView's effect
 * is keyed on their identity, and an unrelated re-render recreating them
 * tears down and rebuilds the whole Leaflet map, which previously crashed
 * mid zoom-transition.
 */
export function TripMap({
  location,
  itinerary,
  tripLengthDays,
  height,
  onSelectMarker,
  selectedDay: controlledDay,
  onSelectDay,
  showDayStops,
  onSelectStop,
  focusLatLng,
}: {
  location: LocationResult
  itinerary: ItineraryItem[]
  tripLengthDays: number | null
  height?: number
  /** Clicking a things-to-do pin calls this (e.g. to open the place detail panel). */
  onSelectMarker?: (marker: MapMarker) => void
  /** Controlled selected day — when provided, the parent owns the day (so a stop list can share it). */
  selectedDay?: number
  onSelectDay?: (day: number) => void
  /** Render the selected day's stops as a bulleted list under the map. */
  showDayStops?: boolean
  /** When set, each day stop becomes a button that opens the place's detail. */
  onSelectStop?: (item: ItineraryItem) => void
  /** Pan/highlight this coordinate when it changes (tap a stop or chat chip). */
  focusLatLng?: { lat: number; lng: number; nonce: number } | null
}) {
  const [internalDay, setInternalDay] = useState(1)
  const selectedDay = controlledDay ?? internalDay
  const setSelectedDay = onSelectDay ?? setInternalDay
  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1
  const dayStops = itinerary.filter((item) => (item.day ?? 1) === selectedDay)

  // Only Places-sourced entries carry real per-item coordinates today —
  // Tripadvisor entries without lat/lng are left off the map rather than
  // guessing a location for them.
  const markers = useMemo(
    () =>
      location.thingsToDo
        .filter((item) => item.lat != null && item.lng != null)
        .map((item) => ({ lat: item.lat as number, lng: item.lng as number, label: item.name, category: item.category, placeId: item.placeId })),
    [location.thingsToDo],
  )

  const route = useMemo(
    () =>
      itinerary
        .filter((item) => (item.day ?? 1) === selectedDay && item.lat != null && item.lng != null)
        .map((item) => ({ lat: item.lat as number, lng: item.lng as number })),
    [itinerary, selectedDay],
  )

  return (
    <div className="chronicle-map-frame">
      <DayTabs dayCount={dayCount} selectedDay={selectedDay} onSelect={setSelectedDay} />
      <MapView
        lat={location.lat}
        lng={location.lng}
        label={location.displayName}
        markers={markers}
        boundingBox={location.boundingBox}
        route={route}
        height={height}
        onSelectMarker={onSelectMarker}
        focusLatLng={focusLatLng}
      />
      {markers.length > 0 && <MapLegend className="chronicle-map-legend" />}
      {showDayStops && (
        <div className="chronicle-map-day-stops" key={`${selectedDay}-${dayStops.length}`}>
          {dayStops.length > 0 ? (
            <ul>
              {dayStops.map((item, i) => (
                <li key={`${item.text}-${i}`}>
                  {item.time && <span className="chronicle-preview-time">{item.time}</span>}{' '}
                  {onSelectStop ? (
                    <button type="button" className="chronicle-map-day-stop" onClick={() => onSelectStop(item)}>
                      {item.text}
                    </button>
                  ) : (
                    item.text
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="chronicle-rate-line">No stops on day {selectedDay} yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
