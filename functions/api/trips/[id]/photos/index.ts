import type { Env, PhotoRow } from '../../../../lib/db'
import { getTrip, listPhotosForTrip, countPhotosForStop, countPhotosForTrip, insertPhoto } from '../../../../lib/db'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { sniffImageType, SNIFF_BYTES } from '../../../../lib/imageSniff'
import { DEMO_TRIP_IDS } from '../../../../../src/lib/api/demoIds'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/** Largest photo accepted, in bytes. The client resizes before uploading (Task 7). */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
/** Most photos one itinerary stop may hold. */
export const MAX_PHOTOS_PER_STOP = 6
/** Most photos one trip may hold. */
export const MAX_PHOTOS_PER_TRIP = 300
/** Smallest and largest pixel dimension the client may report. */
export const MIN_PHOTO_DIMENSION = 1
export const MAX_PHOTO_DIMENSION = 10000

/**
 * Room allowed for the multipart envelope (boundaries, part headers, the
 * stop_id/width/height fields) on top of the file itself. Used only to refuse
 * an obviously oversized body before it is parsed into memory; the exact
 * per-file limit is still enforced on `file.size`.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

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
const NOT_AN_IMAGE_MESSAGE = 'That file isn’t a photo we can use. Please choose a JPEG, PNG or WebP image.'
const UNKNOWN_STOP_MESSAGE = 'That stop isn’t on this trip any more. Refresh the page and try again.'
const STOP_FULL_MESSAGE = `This stop already has ${MAX_PHOTOS_PER_STOP} photos. Remove one to add another.`
const TRIP_FULL_MESSAGE = `This trip already has ${MAX_PHOTOS_PER_TRIP} photos. Remove some to add more.`

const DEMO_TRIP_ID_SET: ReadonlySet<string> = new Set(Object.values(DEMO_TRIP_IDS))

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
 * True when the itinerary contains an item whose stable `id` is `stopId`.
 * @param itinerary - The trip's itinerary as stored
 * @param stopId - The stop the photo is for
 */
function itineraryHasStop(itinerary: unknown[], stopId: string): boolean {
  return itinerary.some(
    (item) => typeof item === 'object' && item !== null && (item as { id?: unknown }).id === stopId,
  )
}

/**
 * True when the request declares a body too large to possibly be one allowed
 * photo plus its form fields, so it can be refused before being buffered.
 * @param request - The incoming request
 */
function declaredBodyTooLarge(request: Request): boolean {
  const declared = Number(request.headers.get('Content-Length'))
  return Number.isFinite(declared) && declared > MAX_PHOTO_BYTES + MULTIPART_OVERHEAD_BYTES
}

/**
 * GET /api/trips/:id/photos
 *
 * Lists every photo on a trip in the public shape.
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
    const rows = await listPhotosForTrip(env, tripId.data)
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
 * refused. The size is checked on `file.size` before the bytes are read. The
 * object key is built only from the validated trip id and a server-generated
 * photo id, never from anything else the client sent.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 201 `{ id, stopId, width, height, createdAt }`, or `{ error }` with
 * 400, 403 (demo trip), 404, 409 (limit reached), 413, 415, 429 or 500
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

  if (declaredBodyTooLarge(request)) return json({ error: TOO_LARGE_MESSAGE }, 413)

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

  // Size first, from the part's metadata, so an oversized file is never copied
  // into an ArrayBuffer.
  if (file.size > MAX_PHOTO_BYTES) return json({ error: TOO_LARGE_MESSAGE }, 413)

  const { stop_id: stopId, width, height } = fields.data

  try {
    const trip = await getTrip(env, tripId)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)
    if (!itineraryHasStop(trip.itinerary, stopId)) return json({ error: UNKNOWN_STOP_MESSAGE }, 400)

    if ((await countPhotosForStop(env, tripId, stopId)) >= MAX_PHOTOS_PER_STOP) {
      return json({ error: STOP_FULL_MESSAGE }, 409)
    }
    if ((await countPhotosForTrip(env, tripId)) >= MAX_PHOTOS_PER_TRIP) {
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
