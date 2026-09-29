import type { Env } from '../../../../lib/db'
import { deletePhotoRowUploadedBy, getActiveRecapLinkByToken, getPhotoForTrip } from '../../../../lib/db'
import type { AuthEnv } from '../../../../lib/auth/session'
import { photoBytesResponse } from '../../../../lib/photoResponse'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { recapTokenSchema, RECAP_NOT_FOUND_MESSAGE } from '../../../../lib/recapAccess'
import { CONTRIBUTOR_FORBIDDEN_MESSAGE, CONTRIBUTOR_SIGN_IN_MESSAGE, resolveRecapMember } from '../../../../lib/recapMember'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/**
 * Only the viewer's browser may store a recap photo, for at most an hour
 * (developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
 * so a revoked link stops showing photos soon after.
 */
const RECAP_PHOTO_CACHE_CONTROL = 'private, max-age=3600'

/** Per-IP hourly cap on contributor deletes (`recap-photo-delete`). */
export const RECAP_PHOTO_DELETES_PER_HOUR = 120

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/** A well-formed token and a uuid photo id; anything else is answered 404 without a lookup. */
const paramsSchema = z.object({ token: recapTokenSchema, photoId: z.string().uuid() })

/**
 * JSON response with no-store: error answers here, and every DELETE answer,
 * depend on the token or on who is signed in.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * GET /api/recap/:token/photos/:photoId
 *
 * Serves a photo's bytes to a recap viewer. The photo is looked up by id AND
 * the trip the ACTIVE token points at, so a photo from another trip, a
 * missing photo, and an unknown or revoked token all answer the same 404.
 *
 * Not rate-limited through D1 on purpose: isRateLimited writes a request_log
 * row per call (a COUNT plus an INSERT), one recap view fetches every photo,
 * and D1 Workers Free stops answering queries past 100,000 rows written a day
 * (developers.cloudflare.com/d1/platform/pricing/), which would take the whole
 * app down. The bytes are gated instead by the unguessable 256-bit recap
 * token plus a uuid photo id, and the browser caches them for an hour.
 *
 * @param context - Request context with `env` and `params`
 * @returns 200 with the image bytes, or `{ error }` with 404 or 500
 */
export async function onRequestGet({
  env,
  params,
}: {
  env: Env
  params: { token: string; photoId: string }
}): Promise<Response> {
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

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

/**
 * DELETE /api/recap/:token/photos/:photoId
 *
 * A trip member removes a photo THEY uploaded. Authorised by session plus
 * membership of the trip the active token points at, and the photo's
 * `uploader_user_id` must be the caller's id: removing anyone else's photo
 * (the owner's, or another member's) gets the same 403 body as not being a
 * member at all. The uploader is also in the DELETE's WHERE clause.
 *
 * The R2 object goes first, then the row, as on the owner route: if the object
 * delete fails the row stays, so the photo is still visible and deletable. If
 * the uploader-guarded row DELETE removes nothing, it logs and answers 500.
 *
 * @param context - Request context with `env`, `request` and `params`
 * @returns 200 `{ ok: true }`, or `{ error }` with 401, 403, 404, 429 or 500
 */
export async function onRequestDelete({
  env,
  request,
  params,
}: {
  env: AuthEnv
  request: Request
  params: { token: string; photoId: string }
}): Promise<Response> {
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env as Env, request, 'recap-photo-delete', RECAP_PHOTO_DELETES_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const access = await resolveRecapMember(env, request, parsed.data.token)
    if (access.kind === 'not-found') return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    if (access.kind === 'signed-out') return json({ error: CONTRIBUTOR_SIGN_IN_MESSAGE }, 401)
    if (access.kind === 'not-member') return json({ error: CONTRIBUTOR_FORBIDDEN_MESSAGE }, 403)

    const row = await getPhotoForTrip(env, access.trip.id, parsed.data.photoId)
    if (!row) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    if (row.uploader_user_id !== access.user.id) return json({ error: CONTRIBUTOR_FORBIDDEN_MESSAGE }, 403)

    await env.PHOTOS.delete(row.r2_key)
    if (!(await deletePhotoRowUploadedBy(env, access.trip.id, row.id, access.user.id))) {
      // The row was read above, so a guarded DELETE that matched nothing means
      // it changed underneath this request; never report a delete that did not happen.
      logger.error('recap photo row delete removed nothing', { photoId: row.id })
      return json({ error: SERVER_ERROR_MESSAGE }, 500)
    }
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('recap photo delete failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
