import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ItineraryItem } from '../../lib/validation/schemas'
import { isTripOver } from '../../lib/itinerary/tripDates'
import { listTripPhotos } from '../photos/photosApi'
import { ButtonLink } from '../../components/ui/Button'
import { logger } from '../../lib/logger'

interface Props {
  tripId: string
  itinerary: ItineraryItem[]
  startDate: string | null
  tripLengthDays: number | null
}

/**
 * The Overview page's way into the recap. Once the trip's last day is
 * behind us it is a prominent "Your trip is over" card; before that (or with
 * no dates set) it is a quiet "Recap (N photos so far)" link, where N counts
 * only photos on stops still on the itinerary, the same ones the recap shows.
 */
export function RecapOverviewCard({ tripId, itinerary, startDate, tripLengthDays }: Props) {
  const recapPath = `/trip/${tripId}/recap`
  const over = isTripOver(startDate, tripLengthDays)
  const [photoStopIds, setPhotoStopIds] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setPhotoStopIds(null)
    listTripPhotos(tripId)
      .then((photos) => {
        if (!cancelled) setPhotoStopIds(photos.map((photo) => photo.stopId))
      })
      .catch((err) => {
        // The count is a nicety; the link still works without it.
        logger.warn('recap photo count failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  const photoCount = useMemo(() => {
    if (photoStopIds === null) return null
    const stopIds = new Set(itinerary.map((item) => item.id).filter((id): id is string => typeof id === 'string'))
    return photoStopIds.filter((stopId) => stopIds.has(stopId)).length
  }, [photoStopIds, itinerary])

  if (over) {
    return (
      <section className="chronicle-preview-card chronicle-recap-over-card">
        <h2>Your trip is over</h2>
        <p className="chronicle-rate-line">
          Here’s your recap: every stop on the map, in order, with your photos.
        </p>
        <ButtonLink to={recapPath} size="lg">
          See your trip recap
        </ButtonLink>
      </section>
    )
  }

  const label =
    photoCount === null ? 'Recap' : `Recap (${photoCount} photo${photoCount === 1 ? '' : 's'} so far)`
  return (
    <p className="chronicle-recap-entry">
      <Link to={recapPath} className="chronicle-preview-link">
        {label}
      </Link>
    </p>
  )
}
