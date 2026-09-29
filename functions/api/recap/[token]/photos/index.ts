import type { Env } from '../../../../lib/db'
import type { AuthEnv } from '../../../../lib/auth/session'
import { isRateLimited } from '../../../../lib/rateLimitGuard'
import { recapTokenSchema, RECAP_NOT_FOUND_MESSAGE } from '../../../../lib/recapAccess'
import { CONTRIBUTOR_FORBIDDEN_MESSAGE, CONTRIBUTOR_SIGN_IN_MESSAGE, resolveRecapMember } from '../../../../lib/recapMember'
import { storedStopIdFor } from '../../../../lib/recapPayload'
import { checkDeclaredBodySize, readPhotoUpload, storeTripPhoto, UNKNOWN_STOP_MESSAGE } from '../../../../lib/photoUpload'
import type { RecapPayload } from '../../../../../src/features/recap/types'
import { logger } from '../../../../../src/lib/logger'
import { z } from 'zod'

/** Per-IP hourly cap on contributor uploads (`recap-photo-upload`). */
export const RECAP_PHOTO_UPLOADS_PER_HOUR = 120

/** Longest public stop id: a uuid is 36 characters, `stop-<index>` far fewer. */
const MAX_PUBLIC_STOP_ID_LENGTH = 64

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/**
 * A stop as the recap names it (a `stopId` from GET /api/recap/:token): the
 * stored uuid when it could be passed through, else `stop-<index>`. Only its
 * shape is checked here; {@link storedStopIdFor} decides whether it exists.
 */
const publicStopIdSchema = z.string().min(1).max(MAX_PUBLIC_STOP_ID_LENGTH).regex(/^[A-Za-z0-9-]+$/)

/**
 * JSON response with no-store on every status: every answer depends on who is
 * signed in, and Pages Functions responses do not get `_headers`.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * POST /api/recap/:token/photos
 *
 * A trip member adds one photo to a stop, as multipart form data with `file`,
 * `stop_id` (the recap's public `stopId`), `width` and `height`. Authorised by
 * session plus membership of the trip the active token points at, never by a
 * trip id. The upload runs through the same pipeline as the owner route
 * (functions/lib/photoUpload.ts): body-size guard, validation, per-stop and
 * per-trip caps, byte sniffing, R2 key and rollback. The row records the
 * member as `uploader_user_id`, which is what lets them delete it later.
 *
 * Checked in this order: the token (recap 404), the per-IP limit (429), the
 * token's link and trip (recap 404), sign-in (401), membership (403), then
 * the upload itself.
 *
 * @param context - Request context with `env`, `request` and `params.token`
 * @returns 201 `{ id, stopId, width, height, createdAt, mine: true }` (the
 *   recap's photo shape, with the public stop id), or `{ error }` with 400,
 *   401, 403, 404, 409, 411, 413, 415, 429 or 500
 */
export async function onRequestPost({
  env,
  request,
  params,
}: {
  env: AuthEnv
  request: Request
  params: { token: string }
}): Promise<Response> {
  const token = recapTokenSchema.safeParse(params.token)
  if (!token.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

  if (await isRateLimited(env as Env, request, 'recap-photo-upload', RECAP_PHOTO_UPLOADS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const access = await resolveRecapMember(env, request, token.data)
    if (access.kind === 'not-found') return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    if (access.kind === 'signed-out') return json({ error: CONTRIBUTOR_SIGN_IN_MESSAGE }, 401)
    if (access.kind === 'not-member') return json({ error: CONTRIBUTOR_FORBIDDEN_MESSAGE }, 403)

    const sizeRefusal = checkDeclaredBodySize(request)
    if (sizeRefusal) return json({ error: sizeRefusal.error }, sizeRefusal.status)
    const read = await readPhotoUpload(request, publicStopIdSchema)
    if (!read.ok) return json({ error: read.failure.error }, read.failure.status)

    const publicStopId = read.upload.stopId
    const storedStopId = storedStopIdFor(access.trip, publicStopId)
    if (storedStopId === null) return json({ error: UNKNOWN_STOP_MESSAGE }, 400)

    const stored = await storeTripPhoto(env, access.trip, { ...read.upload, stopId: storedStopId }, access.user.id)
    if (!stored.ok) return json({ error: stored.failure.error }, stored.failure.status)

    const { row } = stored
    const photo: RecapPayload['photos'][number] = {
      id: row.id,
      stopId: publicStopId,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      mine: true,
    }
    return json(photo, 201)
  } catch (err) {
    logger.error('recap photo upload failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
