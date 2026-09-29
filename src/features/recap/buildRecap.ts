import type { RecapPayload } from './types'

/**
 * Day a stop is placed on when its own `day` is missing or invalid (absent,
 * zero, negative, or non-integer). Matches `DEFAULT_STOP_DAY` in
 * `functions/api/recap/[token].ts` so a client-built payload (Task 12 builds
 * one directly from trip data, with none of the server's validation) lands
 * on the same day the server would have assigned.
 */
const DEFAULT_DAY = 1

/** Milliseconds in a day, for UTC date arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * One stop, positioned for display: its day, its 1-based order across the
 * whole trip, and the photos attached to it (oldest first).
 */
export interface RecapStop {
  stopId: string
  day: number
  order: number
  text: string
  lat: number | null
  lng: number | null
  photos: RecapPayload['photos']
}

/**
 * One photo in slide order, carrying its stop's day/order/text so the
 * slideshow can label and navigate without a second lookup.
 */
export interface RecapSlide {
  photoId: string
  stopId: string
  day: number
  stopText: string
  stopOrder: number
}

/**
 * The recap, ready to render: days in order with their stops, every photo
 * flattened into slide order, and the coordinate-bearing stops that make up
 * the walkthrough route.
 */
export interface Recap {
  days: { day: number; date: string | null; stops: RecapStop[] }[]
  slides: RecapSlide[]
  route: RecapStop[]
}

/**
 * A stop's day, defaulted the same way the server does: anything that isn't
 * an integer >= 1 becomes {@link DEFAULT_DAY}.
 * @param day - The stop's stored day
 */
function normalizeDay(day: number): number {
  return Number.isInteger(day) && day >= 1 ? day : DEFAULT_DAY
}

/**
 * The calendar date for a trip day, computed entirely in UTC so the
 * machine's local timezone can never shift it by a day. Returns null when
 * there is no start date, or it isn't a plain `YYYY-MM-DD` string.
 * @param startDate - The trip's start date, as stored (`YYYY-MM-DD`) or null
 * @param day - 1-based day number
 */
function dateForDay(startDate: string | null, day: number): string | null {
  if (startDate === null) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!match) return null
  const [, year, month, date] = match
  const startMs = Date.UTC(Number(year), Number(month) - 1, Number(date))
  const dayMs = startMs + (day - 1) * MS_PER_DAY
  return new Date(dayMs).toISOString().slice(0, 10)
}

/**
 * Turns a recap API payload into the ordered structure the walkthrough map
 * and slideshow render: stops grouped by day (ascending, itinerary order
 * kept within a day), a trip-wide order (1..N) over every stop, every photo
 * flattened into slide order (stop order, then oldest photo first within a
 * stop), and the route of stops that carry coordinates.
 *
 * Defends against an orphan photo (a `stopId` with no matching stop) even
 * though the server already drops those in `toPublicPhotos` before this ever
 * runs on the public recap page — the owner recap page (Task 12) builds a
 * payload on the client from trip data and the photo list directly, with no
 * server-side filtering, so the same defect could reach this function there.
 *
 * @param payload - The recap API payload
 */
export function buildRecap(payload: RecapPayload): Recap {
  const grouped = new Map<number, RecapPayload['stops']>()
  for (const stop of payload.stops) {
    const day = normalizeDay(stop.day)
    const bucket = grouped.get(day)
    if (bucket) bucket.push(stop)
    else grouped.set(day, [stop])
  }
  const orderedDays = [...grouped.keys()].sort((a, b) => a - b)

  const knownStopIds = new Set(payload.stops.map((stop) => stop.stopId))
  const photosByStop = new Map<string, RecapPayload['photos']>()
  for (const photo of payload.photos) {
    if (!knownStopIds.has(photo.stopId)) continue // orphan: the stop was deleted
    const bucket = photosByStop.get(photo.stopId)
    if (bucket) bucket.push(photo)
    else photosByStop.set(photo.stopId, [photo])
  }
  for (const photos of photosByStop.values()) {
    photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // oldest first
  }

  let order = 0
  const days: Recap['days'] = []
  const allStops: RecapStop[] = []
  for (const day of orderedDays) {
    const stopsForDay = (grouped.get(day) ?? []).map((stop): RecapStop => {
      order += 1
      return {
        stopId: stop.stopId,
        day,
        order,
        text: stop.text,
        lat: stop.lat,
        lng: stop.lng,
        photos: photosByStop.get(stop.stopId) ?? [],
      }
    })
    allStops.push(...stopsForDay)
    days.push({ day, date: dateForDay(payload.startDate, day), stops: stopsForDay })
  }

  const slides: RecapSlide[] = allStops.flatMap((stop) =>
    stop.photos.map(
      (photo): RecapSlide => ({
        photoId: photo.id,
        stopId: stop.stopId,
        day: stop.day,
        stopText: stop.text,
        stopOrder: stop.order,
      }),
    ),
  )

  const route = allStops.filter((stop) => stop.lat !== null && stop.lng !== null)

  return { days, slides, route }
}
