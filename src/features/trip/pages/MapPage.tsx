import { useTripContext } from '../useTripContext'
import { useTripStore } from '../../../store/tripStore'
import { TripMap } from '../components/TripMap'

export function MapPage() {
  const { location } = useTripContext()
  const itinerary = useTripStore((s) => s.itinerary)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)

  if (!location) return <p>Loading map…</p>

  return (
    <article className="chronicle-chapter">
      <h1>Map</h1>
      <TripMap location={location} itinerary={itinerary} tripLengthDays={tripLengthDays} />
    </article>
  )
}
