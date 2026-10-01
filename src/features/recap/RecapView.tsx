import { useId, useMemo, useState, type ReactNode, type RefObject } from 'react'
import type { RecapPayload } from './types'
import { buildRecap } from './buildRecap'
import { RecapMap } from './RecapMap'
import { RecapSlideshow, type SlideshowSlide } from './RecapSlideshow'
import { dateForDay, dayHeading } from '../../lib/itinerary/tripDates'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { ButtonLink } from '../../components/ui/Button'
import { StopPhotoStrip } from '../photos/StopPhotoStrip'

/** Accessible name (and visible text) of the footer link back to the planner. */
export const NEXT_TRIP_LINK_TEXT = 'Plan your next trip with us'

/** Pixel size of the day-list thumbnails (the `<img>` width/height attributes). */
const THUMB_SIZE_PX = 64

interface Props {
  /** The recap data: from `GET /api/recap/:token` on the public route, built from the trip on the owner route. */
  payload: RecapPayload
  /** The `<img src>` for a photo id; the two routes serve photo bytes from different URLs. */
  photoUrl: (photoId: string) => string
  /** `owner` shows an add-photos hint when there are none; `public` just leaves the photo section out. */
  variant: 'owner' | 'public'
  /** Rendered beside the heading (the owner's Share button). */
  headerAction?: ReactNode
  /** Rendered directly under the header (the public recap's "Were you on this trip?" banner). */
  belowHeader?: ReactNode
  /**
   * Contributor mode on the public recap: each stop's photos show as the
   * captioned strip, with a remove control (and its inline confirm) on the
   * photos marked `mine` only.
   */
  contributor?: {
    /** Removes one of the viewer's own photos. */
    onRemovePhoto: (photoId: string) => void
    /** Where focus goes once the last removable photo at a stop is gone. */
    addButtonRef: RefObject<HTMLButtonElement>
  }
}

/**
 * "Sep 5 – Sep 7, 2026" for a trip with a start date, or null without one.
 * @param startDate - The trip's start date (`YYYY-MM-DD`) or null
 * @param lengthDays - How many days the trip runs
 */
function formatDateRange(startDate: string | null, lengthDays: number): string | null {
  const start = dateForDay(startDate, 1)
  const end = dateForDay(startDate, lengthDays)
  if (!start || !end) return null
  const withYear: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  if (lengthDays <= 1) return start.toLocaleDateString(undefined, withYear)
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, withYear)}`
}

/**
 * The trip recap, shared by the owner route (`/trip/:id/recap`) and the
 * public read-only route (`/recap/:token`): a header, the animated map
 * walkthrough, the photo slideshow, every stop day by day with its
 * thumbnails, and a footer link to plan the next trip.
 *
 * The map and the slideshow follow each other: a slide change moves the
 * map to that photo's stop, and a map stop change moves the slideshow to
 * that stop's first photo. Only one of them plays at a time: the map
 * starting playback pauses slideshow autoplay, and starting slideshow
 * autoplay sends the map a pause request.
 */
export function RecapView({ payload, photoUrl, variant, headerAction, belowHeader, contributor }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const headingId = useId()
  const photosHeadingId = useId()
  const daysHeadingId = useId()

  // Memoized so the map sees a stable `route` for an unchanged payload.
  const recap = useMemo(() => buildRecap(payload), [payload])
  const slides = useMemo((): SlideshowSlide[] => {
    const sizes = new Map(payload.photos.map((photo) => [photo.id, photo]))
    return recap.slides.map((slide) => {
      const size = sizes.get(slide.photoId)
      return { ...slide, width: size?.width ?? 0, height: size?.height ?? 0 }
    })
  }, [recap, payload.photos])

  const [activeStopId, setActiveStopId] = useState<string | null>(null)
  const [slideshowPlaying, setSlideshowPlaying] = useState(false)
  const [mapPauseRequest, setMapPauseRequest] = useState(0)

  /** The map started or stopped; when it starts, the slideshow yields. */
  function onMapPlayingChange(playing: boolean) {
    if (playing) setSlideshowPlaying(false)
  }

  /** The slideshow's Play/Pause; when it starts, the map yields. */
  function onSlideshowPlayingChange(playing: boolean) {
    setSlideshowPlaying(playing)
    if (playing) setMapPauseRequest((count) => count + 1)
  }

  const title = payload.title ?? `${payload.displayName} trip`
  const lastDay = recap.days.length > 0 ? recap.days[recap.days.length - 1].day : 1
  const dateRange = formatDateRange(payload.startDate, payload.tripLengthDays ?? lastDay)
  const showPhotos = variant === 'owner' || slides.length > 0

  return (
    <article className="chronicle-chapter chronicle-chapter--wide chronicle-recap" aria-labelledby={headingId}>
      <header className="chronicle-overview-header">
        <div>
          <p className="chronicle-kicker">Trip recap</p>
          <h1 id={headingId}>{title}</h1>
          {dateRange && <p className="chronicle-recap-dates">{dateRange}</p>}
        </div>
        {headerAction}
      </header>

      {belowHeader}

      {recap.route.length > 0 && (
        <section className="chronicle-recap-section" aria-label="Map walkthrough">
          <RecapMap
            route={recap.route}
            activeStopId={activeStopId}
            onStopSelect={setActiveStopId}
            playing={!reducedMotion}
            onPlayingChange={onMapPlayingChange}
            pauseRequest={mapPauseRequest}
          />
        </section>
      )}

      {showPhotos && (
        <section className="chronicle-recap-section" aria-labelledby={photosHeadingId}>
          <h2 id={photosHeadingId} className="chronicle-recap-h2">
            Photos
          </h2>
          <RecapSlideshow
            slides={slides}
            photoUrl={photoUrl}
            variant={variant}
            playing={slideshowPlaying}
            onPlayingChange={onSlideshowPlayingChange}
            activeStopId={activeStopId}
            onSlideChange={setActiveStopId}
          />
        </section>
      )}

      <section className="chronicle-recap-section" aria-labelledby={daysHeadingId}>
        <h2 id={daysHeadingId} className="chronicle-recap-h2">
          Day by day
        </h2>
        {recap.days.map(({ day, stops }) => (
          <div key={day} className="chronicle-recap-day">
            <h3 className="chronicle-recap-h3">{dayHeading(payload.startDate, day)}</h3>
            <ol className="chronicle-recap-stops">
              {stops.map((stop) => (
                <li key={stop.stopId} className="chronicle-recap-stop">
                  <span className="chronicle-recap-stop-order" aria-hidden="true">
                    {stop.order}
                  </span>
                  <div className="chronicle-recap-stop-body">
                    <span className="chronicle-recap-stop-name">{stop.text}</span>
                    {stop.photos.length > 0 && contributor && (
                      <StopPhotoStrip
                        photoUrl={photoUrl}
                        stopName={stop.text}
                        photos={stop.photos}
                        onRemove={contributor.onRemovePhoto}
                        addButtonRef={contributor.addButtonRef}
                        variant="captioned"
                        canRemove={(photo) => photo.mine === true}
                      />
                    )}
                    {stop.photos.length > 0 && !contributor && (
                      <ul className="chronicle-photo-strip" aria-label={`Photos at ${stop.text}`}>
                        {stop.photos.map((photo) => (
                          <li key={photo.id}>
                            <img
                              src={photoUrl(photo.id)}
                              alt={`${stop.text}, day ${day}`}
                              width={THUMB_SIZE_PX}
                              height={THUMB_SIZE_PX}
                              loading="lazy"
                              className="chronicle-photo-thumb__img"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <footer className="chronicle-recap-footer">
        <ButtonLink to="/" size="lg">
          {NEXT_TRIP_LINK_TEXT}
        </ButtonLink>
      </footer>
    </article>
  )
}
