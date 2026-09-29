import type { Env } from '../../../lib/db'
import { getTrip, revokeRecapLinksForTrip } from '../../../lib/db'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { ensureActiveRecapLink } from '../../../lib/recapAccess'
import { DEMO_TRIP_ID_SET } from '../../../../src/lib/api/demoIds'
import { logger } from '../../../../src/lib/logger'
import { z } from 'zod'

/** Per-IP hourly cap on creating and revoking recap links (one budget for both). */
const RECAP_LINKS_PER_HOUR = 60

const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const NOT_FOUND_MESSAGE = 'We couldn’t find that trip.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'
const DEMO_MESSAGE = "Demo trips can't be shared as a recap. Start your own trip to share one."

/** Trip ids are uuids; anything else cannot be a trip and is answered 404. */
const tripIdSchema = z.string().uuid()

/**
 * JSON response helper.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type LinkContext = { env: Env; request: Request; params: { id: string } }

/**
 * The shared front half of both handlers: validates the trip id, applies the
 * `recap-link` rate limit and refuses demo trips.
 * @param context - The request context
 * @returns The validated trip id, or the error response to send
 */
async function guard({ env, request, params }: LinkContext): Promise<{ tripId: string } | { response: Response }> {
  const parsed = tripIdSchema.safeParse(params.id)
  if (!parsed.success) return { response: json({ error: NOT_FOUND_MESSAGE }, 404) }
  if (await isRateLimited(env, request, 'recap-link', RECAP_LINKS_PER_HOUR)) {
    return { response: json({ error: RATE_LIMIT_MESSAGE }, 429) }
  }
  if (DEMO_TRIP_ID_SET.has(parsed.data)) return { response: json({ error: DEMO_MESSAGE }, 403) }
  return { tripId: parsed.data }
}

/**
 * POST /api/trips/:id/recap-link
 *
 * Returns the trip's read-only recap share token, creating one only when the
 * trip has no active link, so repeated calls return the same token. Like every
 * trip write, the trip URL is the capability: whoever can edit the trip can
 * share it.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 200 `{ token }`, or `{ error }` with 403 (demo trip), 404, 429 or 500
 */
export async function onRequestPost(context: LinkContext): Promise<Response> {
  const checked = await guard(context)
  if ('response' in checked) return checked.response
  const { env } = context
  const { tripId } = checked

  try {
    if (!(await getTrip(env, tripId))) return json({ error: NOT_FOUND_MESSAGE }, 404)
    return json({ token: await ensureActiveRecapLink(env, tripId) }, 200)
  } catch (err) {
    logger.error('recap link create failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}

/**
 * DELETE /api/trips/:id/recap-link
 *
 * Revokes the trip's recap link. The revoked token then answers 404, and the
 * next POST mints a new one. Succeeds when there was nothing to revoke.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 200 `{ ok: true }`, or `{ error }` with 403 (demo trip), 404, 429 or 500
 */
export async function onRequestDelete(context: LinkContext): Promise<Response> {
  const checked = await guard(context)
  if ('response' in checked) return checked.response
  const { env } = context
  const { tripId } = checked

  try {
    if (!(await getTrip(env, tripId))) return json({ error: NOT_FOUND_MESSAGE }, 404)
    await revokeRecapLinksForTrip(env, tripId, new Date().toISOString())
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('recap link revoke failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
