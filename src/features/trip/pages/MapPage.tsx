import { useState } from 'react'
import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { TripMap } from '../components/TripMap'
import { PlaceDetailPanel } from '../place/PlaceDetailPanel'
import { usePlaceDetail, type PlaceQuery } from '../place/usePlaceDetail'
import { placeQueryFor } from '../place/placeQuery'

export function MapPage() {
  const { location } = useTripContext()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
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
      {selected && (
        <PlaceDetailPanel query={selected} detail={detail} loading={loading} error={error} onClose={() => setSelected(null)} />
      )}
    </article>
  )
}
