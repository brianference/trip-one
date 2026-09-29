import type { Env } from '../../../../lib/db'
import { getPhotoForTrip, deletePhotoRow } from '../../../../lib/db'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { photoBytesResponse } from '../../../../lib/photoResponse'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/** Per-IP hourly cap on photo reads (listing and fetching bytes). */
const READS_PER_HOUR = 3000
/** Per-IP hourly cap on photo deletes. */
const DELETES_PER_HOUR = 120

/** How long the browser may reuse a photo's bytes. Photos never change once uploaded. */
const PHOTO_CACHE_CONTROL = 'private, max-age=86400'

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const NOT_FOUND_MESSAGE = 'We couldn’t find that photo.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/** Both path params are uuids; anything else cannot name a photo and is answered 404. */
const paramsSchema = z.object({ id: z.string().uuid(), photoId: z.string().uuid() })

type PhotoParams = { id: string; photoId: string }

/**
 * JSON response helper.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/trips/:id/photos/:photoId
 *
 * Serves a photo's bytes. The photo is looked up by id AND trip, so a photo id
 * that belongs to another trip answers the same 404 as one that does not
 * exist. The response type is the one recorded in D1 at upload time (the
 * sniffed type), never R2 metadata or anything the uploader declared.
 *
 * @param context - Request context with `env`, `request` and `params`
 * @returns 200 with the image bytes, or `{ error }` with 404, 429 or 500
 */
export async function onRequestGet({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: PhotoParams
}): Promise<Response> {
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return json({ error: NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env, request, 'photos-read', READS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const row = await getPhotoForTrip(env, parsed.data.id, parsed.data.photoId)
    if (!row) return json({ error: NOT_FOUND_MESSAGE }, 404)
    const res = await photoBytesResponse(env, row, PHOTO_CACHE_CONTROL)
    if (!res) {
      logger.warn('photo row has no R2 object', { photoId: row.id })
      return json({ error: NOT_FOUND_MESSAGE }, 404)
    }
    return res
  } catch (err) {
    logger.error('photo read failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}

/**
 * DELETE /api/trips/:id/photos/:photoId
 *
 * Removes a photo: the R2 object first, then the row. If the object delete
 * fails the row is kept, so the photo stays visible and deletable rather than
 * leaving an unreachable object in the bucket.
 *
 * @param context - Request context with `env`, `request` and `params`
 * @returns 200 `{ ok: true }`, or `{ error }` with 404, 429 or 500
 */
export async function onRequestDelete({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: PhotoParams
}): Promise<Response> {
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return json({ error: NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env, request, 'photos-delete', DELETES_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const row = await getPhotoForTrip(env, parsed.data.id, parsed.data.photoId)
    if (!row) return json({ error: NOT_FOUND_MESSAGE }, 404)
    await env.PHOTOS.delete(row.r2_key)
    await deletePhotoRow(env, row.trip_id, row.id)
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('photo delete failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
