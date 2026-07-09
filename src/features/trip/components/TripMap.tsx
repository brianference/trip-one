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
}: {
  location: LocationResult
  itinerary: ItineraryItem[]
  tripLengthDays: number | null
  height?: number
  /** Clicking a things-to-do pin calls this (e.g. to open the place detail panel). */
  onSelectMarker?: (marker: MapMarker) => void
}) {
  const [selectedDay, setSelectedDay] = useState(1)
  const dayCount = tripLengthDays && tripLengthDays > 1 ? tripLengthDays : 1

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
      />
      {markers.length > 0 && <MapLegend className="chronicle-map-legend" />}
    </div>
  )
}
