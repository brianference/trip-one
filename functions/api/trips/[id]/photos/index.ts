import type { Env, PhotoRow } from '../../../../lib/db'
import { getTrip } from '../../../../lib/db'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import {
  checkDeclaredBodySize,
  currentStopIds,
  listPhotosOnCurrentStops,
  PHOTO_DEMO_MESSAGE,
  readPhotoUpload,
  storeTripPhoto,
} from '../../../../lib/photoUpload'
import { DEMO_TRIP_ID_SET } from '../../../../../src/lib/api/demoIds'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

export {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_STOP,
  MAX_PHOTOS_PER_TRIP,
  MIN_PHOTO_DIMENSION,
  MAX_PHOTO_DIMENSION,
} from '../../../../lib/photoUpload'

/** Per-IP hourly cap on photo uploads. */
const UPLOADS_PER_HOUR = 120
/** Per-IP hourly cap on photo reads (listing and fetching bytes). */
const READS_PER_HOUR = 3000

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const NOT_FOUND_MESSAGE = 'We couldn’t find that trip.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/** Trip ids are uuids; anything else cannot be a trip and is answered 404. */
const tripIdSchema = z.string().uuid()
/** The owner names a stop by its stored uuid. */
const storedStopIdSchema = z.string().uuid()

/** The shape a photo is described as to the browser: no bucket key, no byte count. */
export interface PublicPhoto {
  id: string
  stopId: string
  width: number
  height: number
  createdAt: string
}

/**
 * JSON response helper.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Maps a stored row to the public shape.
 * @param row - A trip_photos row
 */
function toPublicPhoto(row: PhotoRow): PublicPhoto {
  return { id: row.id, stopId: row.stop_id, width: row.width, height: row.height, createdAt: row.created_at }
}

/**
 * GET /api/trips/:id/photos
 *
 * Lists the trip's photos in the public shape, only those on a stop still in
 * the itinerary (a photo on a removed stop has nowhere to be shown).
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 200 `{ photos }`, or `{ error }` with 404 (unknown trip), 429 or 500
 */
export async function onRequestGet({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { id: string }
}): Promise<Response> {
  const tripId = tripIdSchema.safeParse(params.id)
  if (!tripId.success) return json({ error: NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env, request, 'photos-read', READS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const trip = await getTrip(env, tripId.data)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)
    const rows = await listPhotosOnCurrentStops(env, tripId.data, currentStopIds(trip.itinerary))
    return json({ photos: rows.map(toPublicPhoto) }, 200)
  } catch (err) {
    logger.error('photo list failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}

/**
 * POST /api/trips/:id/photos
 *
 * Uploads one photo for one itinerary stop, as multipart form data with
 * `file`, `stop_id`, `width` and `height`, through the shared pipeline in
 * functions/lib/photoUpload.ts (also used by the contributor recap route).
 *
 * The client-declared type is ignored: the stored and served type is what the
 * leading bytes sniff as, and anything that is not a JPEG, PNG or WEBP is
 * refused. The declared Content-Length is required and bounded before the
 * body is parsed (411 / 413), and `file.size` is checked before the file is
 * copied out. The object key is built only from the validated trip id and a
 * server-generated photo id, never from anything else the client sent.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 201 `{ id, stopId, width, height, createdAt }`, or `{ error }` with
 * 400, 403 (demo trip), 404, 409 (limit reached), 411, 413, 415, 429 or 500
 */
export async function onRequestPost({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { id: string }
}): Promise<Response> {
  const tripIdResult = tripIdSchema.safeParse(params.id)
  if (!tripIdResult.success) return json({ error: NOT_FOUND_MESSAGE }, 404)
  const tripId = tripIdResult.data

  const sizeRefusal = checkDeclaredBodySize(request)
  if (sizeRefusal) return json({ error: sizeRefusal.error }, sizeRefusal.status)

  if (await isRateLimited(env, request, 'photos-upload', UPLOADS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  if (DEMO_TRIP_ID_SET.has(tripId)) return json({ error: PHOTO_DEMO_MESSAGE }, 403)

  const read = await readPhotoUpload(request, storedStopIdSchema)
  if (!read.ok) return json({ error: read.failure.error }, read.failure.status)

  try {
    const trip = await getTrip(env, tripId)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)
    // Uploaded through the trip link, which carries no user: no uploader.
    const stored = await storeTripPhoto(env, trip, read.upload, null)
    if (!stored.ok) return json({ error: stored.failure.error }, stored.failure.status)
    return json(toPublicPhoto(stored.row), 201)
  } catch (err) {
    logger.error('photo upload failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
