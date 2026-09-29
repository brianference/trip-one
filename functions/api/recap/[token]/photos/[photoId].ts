import type { Env } from '../../../../lib/db'
import { getActiveRecapLinkByToken, getPhotoForTrip } from '../../../../lib/db'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { photoBytesResponse } from '../../../../lib/photoResponse'
import { recapTokenSchema, RECAP_PHOTO_READS_PER_HOUR, RECAP_NOT_FOUND_MESSAGE } from '../../../../lib/recapAccess'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/**
 * Only the viewer's browser may store a recap photo, for at most an hour
 * (developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
 * so a revoked link stops showing photos soon after.
 */
const RECAP_PHOTO_CACHE_CONTROL = 'private, max-age=3600'

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/** A well-formed token and a uuid photo id; anything else is answered 404 without a lookup. */
const paramsSchema = z.object({ token: recapTokenSchema, photoId: z.string().uuid() })

/**
 * JSON response helper.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/recap/:token/photos/:photoId
 *
 * Serves a photo's bytes to a recap viewer. The photo is looked up by id AND
 * the trip the ACTIVE token points at, so a photo from another trip, a
 * missing photo, and an unknown or revoked token all answer the same 404.
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
  params: { token: string; photoId: string }
}): Promise<Response> {
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env, request, 'recap-photo-read', RECAP_PHOTO_READS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const link = await getActiveRecapLinkByToken(env, parsed.data.token)
    if (!link) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    const row = await getPhotoForTrip(env, link.trip_id, parsed.data.photoId)
    if (!row) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    const res = await photoBytesResponse(env, row, RECAP_PHOTO_CACHE_CONTROL)
    if (!res) {
      logger.warn('photo row has no R2 object', { photoId: row.id })
      return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    }
    return res
  } catch (err) {
    logger.error('recap photo read failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
