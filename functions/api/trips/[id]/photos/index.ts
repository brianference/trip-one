import type { Env, PhotoRow } from '../../../../lib/db'
import { getTrip, listPhotosForTrip, countPhotosForStop, insertPhoto } from '../../../../lib/db'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { sniffImageType, SNIFF_BYTES } from '../../../../lib/imageSniff'
import { DEMO_TRIP_ID_SET } from '../../../../../src/lib/api/demoIds'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/** Largest photo accepted, in bytes. The client resizes before uploading (Task 7). */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
/** Most photos one itinerary stop may hold. */
export const MAX_PHOTOS_PER_STOP = 6
/** Most photos one trip may hold on stops still in its itinerary (orphans on removed stops do not count). */
export const MAX_PHOTOS_PER_TRIP = 300
/** Smallest and largest pixel dimension the client may report. */
export const MIN_PHOTO_DIMENSION = 1
export const MAX_PHOTO_DIMENSION = 10000

/**
 * Room allowed for the multipart envelope (boundaries, part headers, the
 * stop_id/width/height fields) on top of the file itself. Used only to refuse
 * an oversized body before `formData()` buffers it into memory; the exact
 * per-file limit is still enforced on `file.size`.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
/** Largest request body an upload may declare: one allowed photo plus the envelope. */
const MAX_UPLOAD_BODY_BYTES = MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES

/** Per-IP hourly cap on photo uploads. */
const UPLOADS_PER_HOUR = 120
/** Per-IP hourly cap on photo reads (listing and fetching bytes). */
const READS_PER_HOUR = 3000

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const NOT_FOUND_MESSAGE = 'We couldn’t find that trip.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'
const BAD_UPLOAD_MESSAGE = 'We couldn’t read that upload. Please choose the photo again and retry.'
const DEMO_MESSAGE = "Demo trips can't hold photos. Start your own trip to add some."
const TOO_LARGE_MESSAGE = 'That photo is too large. Please choose one under 4 MB.'
const LENGTH_REQUIRED_MESSAGE = 'We couldn’t tell how large that upload is. Please choose the photo again and retry.'
const NOT_AN_IMAGE_MESSAGE = 'That file isn’t a photo we can use. Please choose a JPEG, PNG or WebP image.'
const UNKNOWN_STOP_MESSAGE = 'That stop isn’t on this trip any more. Refresh the page and try again.'
const STOP_FULL_MESSAGE = `This stop already has ${MAX_PHOTOS_PER_STOP} photos. Remove one to add another.`
const TRIP_FULL_MESSAGE = `This trip already has ${MAX_PHOTOS_PER_TRIP} photos. Remove some to add more.`

/** Trip ids are uuids; anything else cannot be a trip and is answered 404. */
const tripIdSchema = z.string().uuid()

/** One pixel dimension, sent by the client as a plain decimal integer string. */
const dimensionSchema = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number)
  .pipe(z.number().int().min(MIN_PHOTO_DIMENSION).max(MAX_PHOTO_DIMENSION))

/** The non-file fields of an upload. Width and height come from the client after it resizes. */
const uploadFieldsSchema = z.object({
  stop_id: z.string().uuid(),
  width: dimensionSchema,
  height: dimensionSchema,
})

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
 * The stable stop ids currently in a trip's itinerary. A photo whose stop was
 * removed from the itinerary (an orphan) is not on any of them: it stays in R2
 * until the trip is deleted but is neither listed nor counted.
 * @param itinerary - The trip's itinerary as stored
 * @returns Every string `id` found on an itinerary item
 */
function currentStopIds(itinerary: unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const item of itinerary) {
    if (typeof item !== 'object' || item === null) continue
    const id = (item as { id?: unknown }).id
    if (typeof id === 'string') ids.add(id)
  }
  return ids
}

/**
 * The trip's photos that sit on a stop still in its itinerary, oldest first.
 * @param env - Worker env with the DB binding
 * @param tripId - Validated trip id
 * @param stopIds - The itinerary's current stop ids, from {@link currentStopIds}
 */
async function listPhotosOnCurrentStops(env: Env, tripId: string, stopIds: Set<string>): Promise<PhotoRow[]> {
  const rows = await listPhotosForTrip(env, tripId)
  return rows.filter((row) => stopIds.has(row.stop_id))
}

/**
 * Checks the declared body size BEFORE `formData()` runs, because `formData()`
 * buffers the whole body into memory. A request with no Content-Length (for
 * example a chunked upload) could otherwise stream up to the platform body
 * limit into the isolate before `file.size` is ever looked at, so a missing or
 * malformed header is refused rather than trusted.
 * @param request - The incoming request
 * @returns 'ok', 'invalid' (missing or not a non-negative integer) or 'too-large'
 */
function checkDeclaredBodySize(request: Request): 'ok' | 'invalid' | 'too-large' {
  const header = request.headers.get('Content-Length')
  if (header === null || !/^\d+$/.test(header.trim())) return 'invalid'
  const declared = Number(header.trim())
  if (!Number.isSafeInteger(declared)) return 'invalid'
  return declared > MAX_UPLOAD_BODY_BYTES ? 'too-large' : 'ok'
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
 * `file`, `stop_id`, `width` and `height`.
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

  const declaredSize = checkDeclaredBodySize(request)
  if (declaredSize === 'invalid') return json({ error: LENGTH_REQUIRED_MESSAGE }, 411)
  if (declaredSize === 'too-large') return json({ error: TOO_LARGE_MESSAGE }, 413)

  if (await isRateLimited(env, request, 'photos-upload', UPLOADS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  if (DEMO_TRIP_ID_SET.has(tripId)) return json({ error: DEMO_MESSAGE }, 403)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: BAD_UPLOAD_MESSAGE }, 400)
  }

  const file = form.get('file')
  const fields = uploadFieldsSchema.safeParse({
    stop_id: form.get('stop_id'),
    width: form.get('width'),
    height: form.get('height'),
  })
  if (!(file instanceof File) || !fields.success) return json({ error: BAD_UPLOAD_MESSAGE }, 400)

  // The body is already in memory by now (formData() buffered it, bounded by
  // the Content-Length check above). Checking the part's size here only avoids
  // making a second copy of an oversized file with arrayBuffer().
  if (file.size > MAX_PHOTO_BYTES) return json({ error: TOO_LARGE_MESSAGE }, 413)

  const { stop_id: stopId, width, height } = fields.data

  try {
    const trip = await getTrip(env, tripId)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)
    const stopIds = currentStopIds(trip.itinerary)
    if (!stopIds.has(stopId)) return json({ error: UNKNOWN_STOP_MESSAGE }, 400)

    if ((await countPhotosForStop(env, tripId, stopId)) >= MAX_PHOTOS_PER_STOP) {
      return json({ error: STOP_FULL_MESSAGE }, 409)
    }
    if ((await listPhotosOnCurrentStops(env, tripId, stopIds)).length >= MAX_PHOTOS_PER_TRIP) {
      return json({ error: TRIP_FULL_MESSAGE }, 409)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const contentType = sniffImageType(bytes.subarray(0, SNIFF_BYTES))
    if (!contentType) return json({ error: NOT_AN_IMAGE_MESSAGE }, 415)

    const photoId = crypto.randomUUID()
    const r2Key = `trips/${tripId}/${photoId}`
    await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType } })

    const row: PhotoRow = {
      id: photoId,
      trip_id: tripId,
      stop_id: stopId,
      r2_key: r2Key,
      content_type: contentType,
      width,
      height,
      bytes: bytes.byteLength,
      created_at: new Date().toISOString(),
    }
    try {
      await insertPhoto(env, row)
    } catch (err) {
      // Without the row nothing can ever serve or delete this object, so take
      // it back out rather than leave an orphan in the bucket.
      await env.PHOTOS.delete(r2Key).catch((cleanupErr: unknown) => {
        logger.error('orphaned photo cleanup failed', cleanupErr)
      })
      throw err
    }
    return json(toPublicPhoto(row), 201)
  } catch (err) {
    logger.error('photo upload failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
