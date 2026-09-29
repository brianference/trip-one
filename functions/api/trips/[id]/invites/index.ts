import type { Env } from '../../../../lib/db'
import {
  getLocationBySlug,
  getTrip,
  getTripInviteByEmail,
  listActiveTripInvites,
  normalizeEmail,
  upsertTripInvite,
} from '../../../../lib/db'
import { ensureActiveRecapLink } from '../../../../lib/recapAccess'
import { sendEmail, siteOrigin, tripInviteHtml, type MailEnv } from '../../../../lib/email'
import { tripInviteSchema, firstIssueMessage } from '../../../../lib/auth/validation'
import {
  guardInviteRequest,
  inviteSubject,
  inviteTripName,
  json,
  toPublicInvite,
  NOT_FOUND_MESSAGE,
  SERVER_ERROR_MESSAGE,
} from '../../../../lib/tripInvites'
import { logger } from '../../../../../src/lib/logger'

type InviteContext = { env: Env & MailEnv; request: Request; params: { id: string } }

/**
 * GET /api/trips/:id/invites
 *
 * The trip's live (unrevoked) invites, oldest first.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 200 `{ invites }`, or `{ error }` with 403 (demo trip), 404 or 500
 */
export async function onRequestGet({ env, request, params }: InviteContext): Promise<Response> {
  const checked = await guardInviteRequest(env, request, params.id, false)
  if ('response' in checked) return checked.response
  const { tripId } = checked

  try {
    if (!(await getTrip(env, tripId))) return json({ error: NOT_FOUND_MESSAGE }, 404)
    const rows = await listActiveTripInvites(env, tripId)
    return json({ invites: rows.map(toPublicInvite) }, 200)
  } catch (err) {
    logger.error('invite list failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}

/**
 * POST /api/trips/:id/invites `{ email }`
 *
 * Invites an email address to add photos to the trip: creates the invite (or
 * un-revokes an earlier one for the same address), makes sure the trip has an
 * active recap link, and emails the invitee that recap link with `?invite=1`.
 * The invitee is never sent the trip link; they get the trip id only by
 * joining (POST /api/recap/:token/join) signed in as this address.
 *
 * The response never depends on whether the address has an account (no user
 * lookup happens here), and a failed send does not change it.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 200 `{ invite }`, or `{ error }` with 400, 403 (demo trip), 404, 429 or 500
 */
export async function onRequestPost({ env, request, params }: InviteContext): Promise<Response> {
  const checked = await guardInviteRequest(env, request, params.id, true)
  if ('response' in checked) return checked.response
  const { tripId } = checked

  const parsed = tripInviteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const email = normalizeEmail(parsed.data.email)

  try {
    const trip = await getTrip(env, tripId)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)

    await upsertTripInvite(env, { id: crypto.randomUUID(), trip_id: tripId, email, created_at: Date.now() })
    // Read back: when the address was already invited, the existing row (and id) is the invite.
    const invite = await getTripInviteByEmail(env, tripId, email)
    if (!invite) throw new Error('invite missing after upsert')

    const token = await ensureActiveRecapLink(env, tripId)
    const location = await getLocationBySlug(env, trip.location_slug)
    const tripName = inviteTripName(trip, location?.display_name ?? null)
    const recapUrl = `${siteOrigin(env)}/recap/${token}?invite=1`
    const sent = await sendEmail(env, email, inviteSubject(tripName), tripInviteHtml({ tripName, recapUrl }))
    if (!sent.sent && !sent.stubbed) logger.warn('invite email not sent', { inviteId: invite.id })

    return json({ invite: toPublicInvite(invite) }, 200)
  } catch (err) {
    logger.error('invite create failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
