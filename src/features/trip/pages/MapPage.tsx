import { useState } from 'react'
import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { useItineraryActions } from '../hooks/useItineraryActions'
import { TripMap } from '../components/TripMap'
import { ThingsToDoList } from '../components/ThingsToDoList'
import { PlaceDetailPanel } from '../place/PlaceDetailPanel'
import { usePlaceDetail, type PlaceQuery } from '../place/usePlaceDetail'
import { placeQueryFor, placeQueryForThing } from '../place/placeQuery'

/**
 * The Map page combines the map with the list of the places on it: the map up
 * top, then every mapped place as a card below (open details, get directions,
 * add to the itinerary) — so you can see where things are AND act on them in
 * one place. Clicking a map pin or a card opens the same detail panel.
 */
export function MapPage() {
  const { trip, location } = useTripContext()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const { addFromThingToDo } = useItineraryActions(trip.id)
  const [selected, setSelected] = useState<PlaceQuery | null>(null)
  const { detail, loading, error } = usePlaceDetail(selected)

  if (!location) return <p>Loading map…</p>

  return (
    <article className="chronicle-chapter chronicle-chapter--wide">
      <h1>Map</h1>
      <TripMap
        location={location}
        itinerary={itinerary}
        tripLengthDays={tripLengthDays}
        height={520}
        onSelectMarker={(marker) =>
          setSelected(placeQueryFor({ name: marker.label, placeId: marker.placeId, lat: marker.lat, lng: marker.lng }))
        }
      />

      <section aria-label="Places on the map" className="chronicle-map-places">
        <h2 className="chronicle-weather-section-heading">Places on the map</h2>
        <ThingsToDoList
          thingsToDo={location.thingsToDo}
          onAdd={addFromThingToDo}
          onSelect={(item) => setSelected(placeQueryForThing(item))}
        />
      </section>

      {selected && (
        <PlaceDetailPanel query={selected} detail={detail} loading={loading} error={error} onClose={() => setSelected(null)} />
      )}
    </article>
  )
}
