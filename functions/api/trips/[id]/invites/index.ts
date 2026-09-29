import type { Env, TripInviteRow } from '../../../../lib/db'
import {
  countLiveTripInvites,
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
  claimInviteSend,
  guardInviteRequest,
  inviteTripName,
  json,
  toPublicInvite,
  INVITE_SUBJECT,
  INVITES_UNAVAILABLE_MESSAGE,
  LIVE_INVITE_LIMIT_MESSAGE,
  MAX_LIVE_INVITES_PER_TRIP,
  NOT_FOUND_MESSAGE,
  SERVER_ERROR_MESSAGE,
} from '../../../../lib/tripInvites'
import { logger } from '../../../../../src/lib/logger'

type InviteContext = { env: Env & MailEnv; request: Request; params: { id: string } }

/**
 * GET /api/trips/:id/invites
 *
 * The trip's live (unrevoked) invites, oldest first. Accepted invites stay in
 * the list with `acceptedAt` set, since an accepted invite cannot be revoked.
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
 * The endpoint must not become a mail relay, so the email goes out only when
 * {@link claimInviteSend} allows it: never twice within 24 hours for one
 * invite, at most 20 per trip, 3 per recipient and 300 app-wide per 24 hours.
 * When a cap stops the send, the invite is still saved and the response says
 * `emailSent: false` with a `reason`. The subject is fixed text; the trip name
 * (chosen by whoever holds the link) appears only, escaped, in the body.
 * A trip may hold at most 50 live invites (409 past that).
 *
 * The response never depends on whether the address has an account: no user
 * lookup happens here, and every cap reports the same `daily_limit`.
 *
 * @param context - Request context with `env`, `request` and `params.id`
 * @returns 201 `{ invite, emailSent, reason? }`, or `{ error }` with 400, 403
 *   (demo trip), 404, 409 (live-invite cap), 429 (per-IP limit, or the caps
 *   could not be read) or 500
 */
export async function onRequestPost({ env, request, params }: InviteContext): Promise<Response> {
  const checked = await guardInviteRequest(env, request, params.id, true)
  if ('response' in checked) return checked.response
  const { tripId } = checked

  const parsed = tripInviteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const email = normalizeEmail(parsed.data.email)

  let invite: TripInviteRow
  let tripName: string
  let recapUrl: string
  try {
    const trip = await getTrip(env, tripId)
    if (!trip) return json({ error: NOT_FOUND_MESSAGE }, 404)

    // A new invite, or bringing back a revoked one, adds a live invite: refuse past the cap.
    const existing = await getTripInviteByEmail(env, tripId, email)
    const addsLiveInvite = !existing || existing.revoked_at !== null
    if (addsLiveInvite && (await countLiveTripInvites(env, tripId)) >= MAX_LIVE_INVITES_PER_TRIP) {
      return json({ error: LIVE_INVITE_LIMIT_MESSAGE }, 409)
    }

    await upsertTripInvite(env, { id: crypto.randomUUID(), trip_id: tripId, email, created_at: Date.now() })
    // Read back: when the address was already invited, the existing row (and id) is the invite.
    const saved = await getTripInviteByEmail(env, tripId, email)
    if (!saved) throw new Error('invite missing after upsert')
    invite = saved

    // Everything the email needs is prepared BEFORE the send is claimed, so a
    // failure here can never stamp last_sent_at for an email that never left.
    // The recap link is also what the invitee opens and what join needs.
    const token = await ensureActiveRecapLink(env, tripId)
    const location = await getLocationBySlug(env, trip.location_slug)
    tripName = inviteTripName(trip, location?.display_name ?? null)
    recapUrl = `${siteOrigin(env)}/recap/${token}?invite=1`
  } catch (err) {
    logger.error('invite create failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }

  let decision: Awaited<ReturnType<typeof claimInviteSend>>
  try {
    decision = await claimInviteSend(env, invite, Date.now())
  } catch (err) {
    // Fail closed: a cap that cannot be read is not honoured by sending anyway.
    logger.error('invite send caps unreadable; not sending', err)
    return json({ error: INVITES_UNAVAILABLE_MESSAGE }, 429)
  }
  if (!decision.send) {
    return json({ invite: toPublicInvite(invite), emailSent: false, reason: decision.reason }, 201)
  }

  // sendEmail never throws; it reports failure in its result.
  const result = await sendEmail(env, email, INVITE_SUBJECT, tripInviteHtml({ tripName, recapUrl }))
  if (!result.sent) {
    if (!result.stubbed) logger.warn('invite email not sent', { inviteId: invite.id })
    return json({ invite: toPublicInvite(invite), emailSent: false, reason: 'send_failed' }, 201)
  }
  return json({ invite: toPublicInvite(invite), emailSent: true }, 201)
}
