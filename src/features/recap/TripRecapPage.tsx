import { useEffect, useMemo, useState } from 'react'
import { useTripContext } from '../trip/useTripContext'
import { useTripStore } from '../../store/tripStore'
import { listTripPhotos, tripPhotoUrl, type TripPhoto } from '../photos/photosApi'
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'
import type { ItineraryItem } from '../../lib/validation/schemas'
import { logger } from '../../lib/logger'
import type { RecapPayload } from './types'
import { DEFAULT_DAY } from './buildRecap'
import { RecapView } from './RecapView'
import { ShareRecap } from './ShareRecap'
import { TripSkeleton } from '../trip/components/TripSkeleton'

/** Demo trip ids as a plain string set: demo trips can't mint a recap link (the server answers 403). */
const DEMO_TRIP_ID_SET: ReadonlySet<string> = new Set(Object.values(DEMO_TRIP_IDS))

/**
 * The recap's stops from the live itinerary, in itinerary order, with the
 * same day default the server and `buildRecap` use. A stop still missing an
 * id gets a positional one, which no photo can match (photos key on real ids).
 * @param itinerary - The trip's current itinerary
 */
function toRecapStops(itinerary: ItineraryItem[]): RecapPayload['stops'] {
  return itinerary.map((item, index) => ({
    stopId: item.id ?? `stop-${index}`,
    day: item.day ?? DEFAULT_DAY,
    text: item.text,
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    category: item.category ?? null,
  }))
}

/**
 * `/trip/:id/recap`: the owner's recap, built on the client from the live
 * trip (itinerary, dates) plus its photo list, in the same `RecapPayload`
 * shape the public route gets from the server, so one `RecapView` renders
 * both. The owner also gets the Share button.
 *
 * Reads itinerary and dates from the trip store rather than the context's
 * `trip`: the context copy is loaded once per visit, while the store holds
 * the edits made since (the Overview and Plan pages read it the same way).
 */
export function TripRecapPage() {
  const { trip, location } = useTripContext()
  const itinerary = useTripStore((s) => s.itinerary)
  const startDate = useTripStore((s) => s.startDate)
  const tripLengthDays = useTripStore((s) => s.tripLengthDays)
  const displayName = location?.displayName ?? trip.locationSlug

  const [photos, setPhotos] = useState<TripPhoto[] | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPhotos(null)
    setPhotoError(null)
    listTripPhotos(trip.id)
      .then((loaded) => {
        if (!cancelled) setPhotos(loaded)
      })
      .catch((err) => {
        logger.error('failed to load recap photos', err)
        if (cancelled) return
        setPhotoError(err instanceof Error ? err.message : String(err))
        setPhotos([])
      })
    return () => {
      cancelled = true
    }
  }, [trip.id])

  const payload = useMemo(
    (): RecapPayload | null =>
      photos === null
        ? null
        : {
            title: trip.title ?? null,
            displayName,
            startDate,
            tripLengthDays,
            stops: toRecapStops(itinerary),
            photos: photos.map(({ id, stopId, width, height, createdAt }) => ({ id, stopId, width, height, createdAt })),
          },
    [photos, trip.title, displayName, startDate, tripLengthDays, itinerary],
  )

  if (payload === null) return <TripSkeleton />

  return (
    <>
      {photoError && (
        <p role="alert" className="chronicle-recap-share-error">
          {photoError}
        </p>
      )}
      <RecapView
        payload={payload}
        photoUrl={(photoId) => tripPhotoUrl(trip.id, photoId)}
        variant="owner"
        headerAction={DEMO_TRIP_ID_SET.has(trip.id) ? undefined : <ShareRecap tripId={trip.id} tripName={displayName} />}
      />
    </>
  )
}
