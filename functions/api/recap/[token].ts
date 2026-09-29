import type { Env, PhotoRow, TripRow } from '../../lib/db'
import { getActiveRecapLinkByToken, getTrip, getLocationBySlug, listPhotosForTrip } from '../../lib/db'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { recapTokenSchema, RECAP_READS_PER_HOUR, RECAP_NOT_FOUND_MESSAGE, stripTripId } from '../../lib/recapAccess'
import { cleanDisplayName } from '../../../src/lib/location/displayName'
import type { RecapPayload } from '../../../src/features/recap/types'
import { logger } from '../../../src/lib/logger'

/** Day a stop is shown on when the itinerary does not say. */
const DEFAULT_STOP_DAY = 1

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

type RecapStop = RecapPayload['stops'][number]
type RecapPhoto = RecapPayload['photos'][number]

/**
 * JSON response helper.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * User-written optional text with the trip id stripped; null when absent or
 * nothing is left.
 * @param value - The stored value, of unknown type
 * @param tripId - The trip id to strip
 */
function publicText(value: unknown, tripId: string): string | null {
  if (typeof value !== 'string') return null
  const cleaned = stripTripId(value, tripId)
  return cleaned === '' ? null : cleaned
}

/**
 * A finite number, or null.
 * @param value - The stored value, of unknown type
 */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A stored stop id passed through as-is: uuid-shaped, so it can never collide with a {@link positionalStopId}. */
const PASS_THROUGH_STOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The public id for a stop whose stored id cannot be passed through. It comes
 * from the stop's position in the itinerary only, so it is the same on every
 * load of the recap and carries nothing about the trip.
 * @param index - The stop's index in the stored itinerary array
 */
function positionalStopId(index: number): string {
  return `stop-${index}`
}

/**
 * Maps the itinerary to public stops, in itinerary order, keeping only the
 * recap fields (never booking links, prices or product codes).
 *
 * A stop's stored id is passed through so photos can be matched to it when it
 * is a uuid that does not contain the trip id and no earlier stop used it.
 * Otherwise (a legacy stop with no id, an id containing the trip id, a
 * non-uuid id, or a duplicate) the stop gets {@link positionalStopId}, which
 * is stable across loads. Every public stopId is therefore unique.
 *
 * Photos are keyed by stored stop id, so the returned map sends each stored
 * id to the public id of the FIRST stop that carries it: when stops share a
 * stored id, their photos all attach to the first of them.
 *
 * @param itinerary - The trip's itinerary as stored
 * @param tripId - The trip id, which must not appear in the output
 */
function toPublicStops(itinerary: unknown[], tripId: string): { stops: RecapStop[]; stopIds: Map<string, string> } {
  const stops: RecapStop[] = []
  const stopIds = new Map<string, string>()
  const tripIdLower = tripId.toLowerCase()
  itinerary.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const stop = item as Record<string, unknown>
    if (typeof stop.text !== 'string') return

    const storedId = typeof stop.id === 'string' && stop.id !== '' ? stop.id : null
    const firstUse = storedId !== null && !stopIds.has(storedId)
    const passThrough =
      firstUse && PASS_THROUGH_STOP_ID.test(storedId) && !storedId.toLowerCase().includes(tripIdLower)
    const stopId = passThrough ? storedId : positionalStopId(index)
    if (storedId !== null && firstUse) stopIds.set(storedId, stopId)

    const day = typeof stop.day === 'number' && Number.isInteger(stop.day) && stop.day >= 1 ? stop.day : DEFAULT_STOP_DAY
    stops.push({
      stopId,
      day,
      text: stripTripId(stop.text, tripId),
      lat: finiteOrNull(stop.lat),
      lng: finiteOrNull(stop.lng),
      category: publicText(stop.category, tripId),
    })
  })
  return { stops, stopIds }
}

/**
 * Maps photo rows to the public shape. A photo whose stop is no longer on the
 * itinerary is dropped (it has nowhere to show, and its stored stop id would
 * otherwise go out unfiltered).
 * @param rows - The trip's photo rows
 * @param stopIds - Stored stop id to public stop id, from {@link toPublicStops}
 */
function toPublicPhotos(rows: PhotoRow[], stopIds: Map<string, string>): RecapPhoto[] {
  const photos: RecapPhoto[] = []
  for (const row of rows) {
    const stopId = stopIds.get(row.stop_id)
    if (stopId === undefined) continue
    photos.push({ id: row.id, stopId, width: row.width, height: row.height, createdAt: row.created_at })
  }
  return photos
}

/**
 * Builds the recap payload from a trip, its location name and its photos.
 * Every field is chosen explicitly; nothing from the trip row is spread in,
 * so the trip id and owner can never ride along.
 * @param trip - The trip row
 * @param rawDisplayName - The location's stored display name
 * @param photoRows - The trip's photo rows
 */
export function buildRecapPayload(trip: TripRow, rawDisplayName: string, photoRows: PhotoRow[]): RecapPayload {
  const { stops, stopIds } = toPublicStops(trip.itinerary, trip.id)
  return {
    title: publicText(trip.title, trip.id),
    displayName: cleanDisplayName(rawDisplayName),
    startDate: trip.start_date ?? null,
    tripLengthDays: trip.trip_length_days ?? null,
    stops,
    photos: toPublicPhotos(photoRows, stopIds),
  }
}

/**
 * GET /api/recap/:token
 *
 * The public, read-only recap of the trip a share token points at. Needs no
 * sign-in: the token is the capability. The response never contains the trip
 * id. Unknown, revoked and malformed tokens, and a token whose trip is gone,
 * all answer the same 404.
 *
 * @param context - Request context with `env`, `request` and `params.token`
 * @returns 200 {@link RecapPayload}, or `{ error }` with 404, 429 or 500
 */
export async function onRequestGet({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { token: string }
}): Promise<Response> {
  const token = recapTokenSchema.safeParse(params.token)
  if (!token.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env, request, 'recap-read', RECAP_READS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const link = await getActiveRecapLinkByToken(env, token.data)
    if (!link) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    const trip = await getTrip(env, link.trip_id)
    if (!trip) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    const location = await getLocationBySlug(env, trip.location_slug)
    // Every trip is created against an existing location row; the slug is the
    // fallback only so a missing row degrades the heading instead of the page.
    const rawDisplayName = location?.display_name ?? trip.location_slug
    const photos = await listPhotosForTrip(env, trip.id)
    return json(buildRecapPayload(trip, rawDisplayName, photos), 200)
  } catch (err) {
    logger.error('recap read failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
