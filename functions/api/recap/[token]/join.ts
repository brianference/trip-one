import type { Env } from '../../../lib/db'
import {
  addTripMemberForInvite,
  getActiveRecapLinkByToken,
  getActiveTripInvite,
  getTrip,
  markTripInviteAccepted,
  normalizeEmail,
} from '../../../lib/db'
import { getAuthedUser, type AuthEnv } from '../../../lib/auth/session'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { recapTokenSchema, RECAP_NOT_FOUND_MESSAGE } from '../../../lib/recapAccess'
import { logger } from '../../../../src/lib/logger'

/** Per-IP hourly cap on join attempts (`recap-join`). */
export const RECAP_JOINS_PER_HOUR = 60

/**
 * The one refusal for a signed-in visitor who may not join: unverified email,
 * no invite, a revoked invite, or an invite to another trip. Fixed text, so it
 * can never carry the trip id and no two cases can be told apart.
 */
export const JOIN_FORBIDDEN_MESSAGE = "This email isn't invited to this trip."

const SIGN_IN_MESSAGE = 'Sign in first'
const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/**
 * JSON response with no-store on every status: Pages Functions responses do
 * not get `_headers`, and every answer depends on who is signed in.
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
 * POST /api/recap/:token/join
 *
 * Turns an invite into trip membership, when every check passes: the token
 * names an active recap of a trip that still exists (else the recap GET's
 * exact 404), the caller is signed in (else 401), their account email is
 * verified and a live invite for that email exists on THIS trip (else the
 * fixed 403).
 *
 * It never answers with the trip id: the trip URL grants edit access, and a
 * member may only add and remove their own photos, which they do through the
 * recap-token endpoints (POST /api/recap/:token/photos and
 * DELETE /api/recap/:token/photos/:photoId).
 *
 * Idempotent: joining again answers the same and changes nothing; the first
 * acceptance time is kept.
 *
 * @param context - Request context with `env`, `request` and `params.token`
 * @returns 200 `{ joined: true }`, or `{ error }` with 401, 403, 404, 429 or 500
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

  if (await isRateLimited(env as Env, request, 'recap-join', RECAP_JOINS_PER_HOUR)) {
    return json({ error: RATE_LIMIT_MESSAGE }, 429)
  }

  try {
    const link = await getActiveRecapLinkByToken(env, token.data)
    if (!link) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
    if (!(await getTrip(env, link.trip_id))) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

    const user = await getAuthedUser(env, request)
    if (!user) return json({ error: SIGN_IN_MESSAGE }, 401)
    if (!user.emailVerified) return json({ error: JOIN_FORBIDDEN_MESSAGE }, 403)

    const invite = await getActiveTripInvite(env, link.trip_id, normalizeEmail(user.email))
    if (!invite) return json({ error: JOIN_FORBIDDEN_MESSAGE }, 403)

    // Claim the acceptance first, then add the member only through that live,
    // accepted invite. The owner can revoke at any moment; each step re-checks
    // `revoked_at IS NULL` in its own statement, so a revoke before either
    // one leaves no member and gets the revoked-invite answer. A revoke after
    // both removes the membership itself.
    const now = Date.now()
    if (!(await markTripInviteAccepted(env, invite.id, user.id, now))) {
      return json({ error: JOIN_FORBIDDEN_MESSAGE }, 403)
    }
    const member = await addTripMemberForInvite(env, {
      trip_id: link.trip_id,
      user_id: user.id,
      created_at: now,
      invite_id: invite.id,
    })
    if (!member) return json({ error: JOIN_FORBIDDEN_MESSAGE }, 403)
    return json({ joined: true }, 200)
  } catch (err) {
    logger.error('recap join failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
