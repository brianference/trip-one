import { getActiveRecapLinkByToken, getTrip, getLocationBySlug, isTripMember, listPhotosForTrip } from '../../lib/db'
import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { recapTokenSchema, RECAP_READS_PER_HOUR, RECAP_NOT_FOUND_MESSAGE } from '../../lib/recapAccess'
import { buildRecapPayload } from '../../lib/recapPayload'
import { logger } from '../../../src/lib/logger'

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/**
 * JSON response with no-store on every status: a member's view marks their
 * own photos (`mine`), so the body depends on who asks and must never be
 * reused for someone else from a cache.
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
 * GET /api/recap/:token
 *
 * The public, read-only recap of the trip a share token points at. Needs no
 * sign-in: the token is the capability. The response never contains the trip
 * id. Unknown, revoked and malformed tokens, and a token whose trip is gone,
 * all answer the same 404.
 *
 * When the request carries the session of a member of the trip, each photo
 * that member uploaded carries `mine: true`; for anyone else the payload is
 * the same as for a signed-out viewer.
 *
 * @param context - Request context with `env`, `request` and `params.token`
 * @returns 200 {@link RecapPayload}, or `{ error }` with 404, 429 or 500
 */
export async function onRequestGet({
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
    const viewer = await getAuthedUser(env, request)
    const viewerMemberId = viewer && (await isTripMember(env, trip.id, viewer.id)) ? viewer.id : null
    return json(buildRecapPayload(trip, rawDisplayName, photos, viewerMemberId), 200)
  } catch (err) {
    logger.error('recap read failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
