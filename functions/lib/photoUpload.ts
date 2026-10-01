import { z } from 'zod'
import type { Env, PhotoRow, TripRow } from './db'
import { listPhotosForTrip, countPhotosForStop, insertPhoto } from './db'
import { sniffImageType, SNIFF_BYTES } from './imageSniff'
import { DEMO_TRIP_ID_SET } from '../../src/lib/api/demoIds'
import { logger } from '../../src/lib/logger'

/**
 * The one photo-upload pipeline, shared by the owner route
 * (`POST /api/trips/:id/photos`, authorised by the trip link) and the
 * contributor route (`POST /api/recap/:token/photos`, authorised by session
 * plus membership). Both get exactly the same body-size guard, field
 * validation, caps, content sniffing, R2 key and rollback; only who may call
 * it, and how the stop is named, differ.
 */

/** Largest photo accepted, in bytes. The client resizes before uploading. */
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

const BAD_UPLOAD_MESSAGE = 'We couldn’t read that upload. Please choose the photo again and retry.'
/** Demo trips are shared by everyone and never hold photos. */
export const PHOTO_DEMO_MESSAGE = "Demo trips can't hold photos. Start your own trip to add some."
const TOO_LARGE_MESSAGE = 'That photo is too large. Please choose one under 4 MB.'
const LENGTH_REQUIRED_MESSAGE = 'We couldn’t tell how large that upload is. Please choose the photo again and retry.'
const NOT_AN_IMAGE_MESSAGE = 'That file isn’t a photo we can use. Please choose a JPEG, PNG or WebP image.'
/** A stop that is not (or no longer) on the trip. Exported for the contributor route's own stop lookup. */
export const UNKNOWN_STOP_MESSAGE = 'That stop isn’t on this trip any more. Refresh the page and try again.'
const STOP_FULL_MESSAGE = `This stop already has ${MAX_PHOTOS_PER_STOP} photos. Remove one to add another.`
const TRIP_FULL_MESSAGE = `This trip already has ${MAX_PHOTOS_PER_TRIP} photos. Remove some to add more.`

/** A refusal to send as `{ error }` with this status. */
export interface UploadFailure {
  status: number
  error: string
}

/** The validated parts of an upload, before anything touches the database. */
export interface PhotoUpload {
  file: File
  /** The stop as the client named it, validated by the caller's schema. */
  stopId: string
  width: number
  height: number
}

/** One pixel dimension, sent by the client as a plain decimal integer string. */
const dimensionSchema = z
  .string()
  .regex(/^\d{1,5}$/)
  .transform(Number)
  .pipe(z.number().int().min(MIN_PHOTO_DIMENSION).max(MAX_PHOTO_DIMENSION))

/**
 * The stable stop ids currently in a trip's itinerary. A photo whose stop was
 * removed from the itinerary (an orphan) is not on any of them: it stays in R2
 * until the trip is deleted but is neither listed nor counted.
 * @param itinerary - The trip's itinerary as stored
 * @returns Every string `id` found on an itinerary item
 */
export function currentStopIds(itinerary: unknown[]): Set<string> {
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
export async function listPhotosOnCurrentStops(env: Env, tripId: string, stopIds: Set<string>): Promise<PhotoRow[]> {
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
 * @returns null when the declared size is acceptable, else a 411 or 413 refusal
 */
export function checkDeclaredBodySize(request: Request): UploadFailure | null {
  const header = request.headers.get('Content-Length')
  if (header === null || !/^\d+$/.test(header.trim())) return { status: 411, error: LENGTH_REQUIRED_MESSAGE }
  const declared = Number(header.trim())
  if (!Number.isSafeInteger(declared)) return { status: 411, error: LENGTH_REQUIRED_MESSAGE }
  return declared > MAX_UPLOAD_BODY_BYTES ? { status: 413, error: TOO_LARGE_MESSAGE } : null
}

/**
 * Parses the multipart body (`file`, `stop_id`, `width`, `height`). Call only
 * after {@link checkDeclaredBodySize} passed. The client-declared file type is
 * ignored here and everywhere after: {@link storeTripPhoto} sniffs the bytes.
 * @param request - The incoming request
 * @param stopIdSchema - What a valid `stop_id` looks like for this route
 * @returns The validated upload, or a 400 / 413 refusal
 */
export async function readPhotoUpload(
  request: Request,
  stopIdSchema: z.ZodType<string>,
): Promise<{ ok: true; upload: PhotoUpload } | { ok: false; failure: UploadFailure }> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return { ok: false, failure: { status: 400, error: BAD_UPLOAD_MESSAGE } }
  }

  const file = form.get('file')
  const fields = z
    .object({ stop_id: stopIdSchema, width: dimensionSchema, height: dimensionSchema })
    .safeParse({ stop_id: form.get('stop_id'), width: form.get('width'), height: form.get('height') })
  if (!(file instanceof File) || !fields.success) return { ok: false, failure: { status: 400, error: BAD_UPLOAD_MESSAGE } }

  // The body is already in memory by now (formData() buffered it, bounded by
  // the Content-Length check). Checking the part's size here only avoids
  // making a second copy of an oversized file with arrayBuffer().
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, failure: { status: 413, error: TOO_LARGE_MESSAGE } }

  return { ok: true, upload: { file, stopId: fields.data.stop_id, width: fields.data.width, height: fields.data.height } }
}

/**
 * Stores one photo on one stop of a trip: refuses demo trips (403), a stop not
 * in the itinerary (400), a full stop or trip (409) and anything that does not
 * sniff as a JPEG, PNG or WEBP (415); otherwise writes the bytes to R2 under
 * `trips/<tripId>/<photoId>` (built only from the trip row's id and a
 * server-generated id, never from client input) and records the row. If the
 * row cannot be written, the R2 object is removed again so nothing is left
 * that no row can serve or delete.
 *
 * @param env - Worker env (DB and PHOTOS)
 * @param trip - The trip, already authorised by the caller
 * @param upload - The validated upload, with `stopId` as the STORED stop id
 * @param uploaderUserId - The signed-in contributor, or null for a trip-link upload
 * @returns The stored row, or the refusal to send
 * @throws When D1 or R2 fails; the caller answers 500
 */
export async function storeTripPhoto(
  env: Env,
  trip: TripRow,
  upload: PhotoUpload,
  uploaderUserId: string | null,
): Promise<{ ok: true; row: PhotoRow } | { ok: false; failure: UploadFailure }> {
  if (DEMO_TRIP_ID_SET.has(trip.id)) return { ok: false, failure: { status: 403, error: PHOTO_DEMO_MESSAGE } }

  const stopIds = currentStopIds(trip.itinerary)
  if (!stopIds.has(upload.stopId)) return { ok: false, failure: { status: 400, error: UNKNOWN_STOP_MESSAGE } }

  if ((await countPhotosForStop(env, trip.id, upload.stopId)) >= MAX_PHOTOS_PER_STOP) {
    return { ok: false, failure: { status: 409, error: STOP_FULL_MESSAGE } }
  }
  if ((await listPhotosOnCurrentStops(env, trip.id, stopIds)).length >= MAX_PHOTOS_PER_TRIP) {
    return { ok: false, failure: { status: 409, error: TRIP_FULL_MESSAGE } }
  }

  const bytes = new Uint8Array(await upload.file.arrayBuffer())
  const contentType = sniffImageType(bytes.subarray(0, SNIFF_BYTES))
  if (!contentType) return { ok: false, failure: { status: 415, error: NOT_AN_IMAGE_MESSAGE } }

  const photoId = crypto.randomUUID()
  const r2Key = `trips/${trip.id}/${photoId}`
  await env.PHOTOS.put(r2Key, bytes, { httpMetadata: { contentType } })

  const row: PhotoRow = {
    id: photoId,
    trip_id: trip.id,
    stop_id: upload.stopId,
    r2_key: r2Key,
    content_type: contentType,
    width: upload.width,
    height: upload.height,
    bytes: bytes.byteLength,
    created_at: new Date().toISOString(),
    uploader_user_id: uploaderUserId,
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
  return { ok: true, row }
}
