import { z } from 'zod'
import type { Env, TripInviteRow, TripRow } from './db'
import { claimTripInviteSend, getTripInviteById, releaseTripInviteSend } from './db'
import { isRateLimited } from './rateLimitGuard'
import { stripTripId } from './recapAccess'
import { cleanDisplayName } from '../../src/lib/location/displayName'
import { DEMO_TRIP_ID_SET } from '../../src/lib/api/demoIds'

/**
 * Shared pieces of the trip invite endpoints (`/api/trips/:id/invites` and
 * `/api/trips/:id/invites/:inviteId`). Like every trip write, the trip URL is
 * the capability: whoever can edit the trip can invite people to it.
 */

/** Per-IP hourly cap on invite writes (`trip-invites`): creating and revoking share one budget. */
export const TRIP_INVITES_PER_HOUR = 30

/** The window every invite-email cap counts over, and the minimum gap between two sends of one invite. */
export const INVITE_SEND_WINDOW_MS = 24 * 60 * 60 * 1000
/** Most invite emails one trip may send per {@link INVITE_SEND_WINDOW_MS}. */
export const MAX_INVITE_SENDS_PER_TRIP = 20
/** Most live (unrevoked) invites one trip may hold, accepted ones included. */
export const MAX_LIVE_INVITES_PER_TRIP = 50
/** Most invite emails one address may receive per {@link INVITE_SEND_WINDOW_MS}, across every trip. */
export const MAX_INVITE_SENDS_PER_RECIPIENT = 3
/** App-wide circuit breaker: most invite emails per {@link INVITE_SEND_WINDOW_MS}. */
export const MAX_INVITE_SENDS_GLOBAL = 300

/**
 * Why an invite was saved but not emailed. `daily_limit` covers the per-trip,
 * per-recipient and app-wide caps alike, and the endpoint never looks up
 * accounts, so it never reveals whether the recipient has one. It CAN reveal
 * invite activity: a sender whose own trip is under its cap, on a quiet day
 * for the app, who gets `daily_limit` learns that the address has already
 * been sent at least {@link MAX_INVITE_SENDS_PER_RECIPIENT} invites in the
 * last 24 hours, from any trips.
 */
export type InviteNotSentReason = 'daily_limit' | 'recently_sent' | 'send_failed'

export const LIVE_INVITE_LIMIT_MESSAGE = `This trip already has ${MAX_LIVE_INVITES_PER_TRIP} open invites. Remove one to invite someone new.`
export const INVITES_UNAVAILABLE_MESSAGE =
  'Invites are paused for the moment. Please try again later.'
/** Longest trip name put in an invite's subject and body; a title can be longer. */
export const MAX_INVITE_TRIP_NAME_LENGTH = 100
/** Used when a trip has neither a title nor a place name. */
const FALLBACK_TRIP_NAME = 'A trip'

export const RATE_LIMIT_MESSAGE =
  'You’ve made a lot of requests in a short time. Please wait a few minutes and try again.'
export const NOT_FOUND_MESSAGE = 'We couldn’t find that trip.'
export const INVITE_NOT_FOUND_MESSAGE = 'We couldn’t find that invite. It may have been removed.'
export const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'
const DEMO_MESSAGE = "Demo trips can't have invites. Start your own trip to invite people."

/** Trip and invite ids are uuids; anything else cannot name one and is answered 404. */
export const uuidSchema = z.string().uuid()

/**
 * JSON response with no-store: Pages Functions responses do not get
 * `_headers`, and invite lists name people's email addresses.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * The shared front half of every invite handler: validates the trip id,
 * applies the `trip-invites` rate limit on writes, and refuses demo trips.
 * @param env - Function env
 * @param request - The incoming request (for the client IP)
 * @param rawTripId - `params.id`
 * @param isWrite - Whether this request spends the write budget
 * @returns The validated trip id, or the error response to send
 */
export async function guardInviteRequest(
  env: Env,
  request: Request,
  rawTripId: string,
  isWrite: boolean,
): Promise<{ tripId: string } | { response: Response }> {
  const parsed = uuidSchema.safeParse(rawTripId)
  if (!parsed.success) return { response: json({ error: NOT_FOUND_MESSAGE }, 404) }
  if (isWrite && (await isRateLimited(env, request, 'trip-invites', TRIP_INVITES_PER_HOUR))) {
    return { response: json({ error: RATE_LIMIT_MESSAGE }, 429) }
  }
  if (DEMO_TRIP_ID_SET.has(parsed.data)) return { response: json({ error: DEMO_MESSAGE }, 403) }
  return { tripId: parsed.data }
}

/** An invite as the API returns it. */
export interface PublicInvite {
  id: string
  email: string
  createdAt: number
  acceptedAt: number | null
}

/**
 * Maps an invite row to its API shape, field by field.
 * @param row - The stored invite
 */
export function toPublicInvite(row: TripInviteRow): PublicInvite {
  return { id: row.id, email: row.email, createdAt: row.created_at, acceptedAt: row.accepted_at }
}

/**
 * The trip's name as an invitee sees it: the title, else the place, as one
 * line with the trip id removed (the invitee must not learn the id from the
 * email before joining) and capped at {@link MAX_INVITE_TRIP_NAME_LENGTH}.
 * Control characters, including CR and LF, become spaces so the name cannot
 * break the subject header. Not HTML-escaped: the template does that.
 * @param trip - The trip row
 * @param rawDisplayName - The location's stored display name, if any
 */
export function inviteTripName(trip: TripRow, rawDisplayName: string | null): string {
  const oneLine = (text: string) =>
    stripTripId(text, trip.id)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  const title = typeof trip.title === 'string' ? oneLine(trip.title) : ''
  const place = rawDisplayName ? oneLine(cleanDisplayName(rawDisplayName)) : ''
  const name = title || place || FALLBACK_TRIP_NAME
  // By code point, so a cut never splits an emoji's surrogate pair.
  const chars = Array.from(name)
  return chars.length > MAX_INVITE_TRIP_NAME_LENGTH ? chars.slice(0, MAX_INVITE_TRIP_NAME_LENGTH).join('').trimEnd() : name
}

/**
 * The invite email's subject line. Fixed text: the trip name is chosen by
 * whoever holds the trip link, so it goes only in the (escaped) body, never in
 * the subject where it would lead the message in the recipient's inbox.
 */
export const INVITE_SUBJECT = "You're invited to add photos on Trip One"

/** The outcome of {@link claimInviteSend}. */
export type InviteSendDecision =
  | { send: true; claimedAtMs: number; previousSentAtMs: number | null }
  | { send: false; reason: InviteNotSentReason }

/**
 * Decides whether an invite may be emailed now and, if so, claims the send.
 *
 * The decision is ONE statement, {@link claimTripInviteSend}: the no-re-send
 * rule and the per-trip, per-recipient and app-wide caps are all in its WHERE
 * clause, so a burst of concurrent requests cannot all slip under a cap. When
 * it changes nothing, the row is read again only to name the reason: sent
 * within the window means `recently_sent`, otherwise a cap was full, so
 * `daily_limit`.
 *
 * Throws when the database cannot answer; the caller must then send nothing
 * (fail closed), because a cap it cannot read is a cap it cannot honour.
 *
 * @param env - Function env (DB)
 * @param invite - The invite as just saved
 * @param nowMs - Current time, epoch ms
 */
export async function claimInviteSend(env: Env, invite: TripInviteRow, nowMs: number): Promise<InviteSendDecision> {
  const windowStartMs = nowMs - INVITE_SEND_WINDOW_MS
  const claimed = await claimTripInviteSend(env, {
    inviteId: invite.id,
    tripId: invite.trip_id,
    email: invite.email,
    nowMs,
    windowStartMs,
    maxPerTrip: MAX_INVITE_SENDS_PER_TRIP,
    maxPerRecipient: MAX_INVITE_SENDS_PER_RECIPIENT,
    maxGlobal: MAX_INVITE_SENDS_GLOBAL,
  })
  if (claimed) return { send: true, claimedAtMs: nowMs, previousSentAtMs: invite.last_sent_at }

  const current = await getTripInviteById(env, invite.trip_id, invite.id)
  const sentInWindow = current?.last_sent_at != null && current.last_sent_at > windowStartMs
  return { send: false, reason: sentInWindow ? 'recently_sent' : 'daily_limit' }
}

/**
 * Gives back a claimed send whose email never left, so a provider outage does
 * not spend the recipient's budget or block a re-send for 24 hours.
 * @param env - Function env (DB)
 * @param inviteId - The invite
 * @param decision - The successful claim being undone
 */
export async function releaseInviteSend(
  env: Env,
  inviteId: string,
  decision: { claimedAtMs: number; previousSentAtMs: number | null },
): Promise<void> {
  await releaseTripInviteSend(env, inviteId, decision.claimedAtMs, decision.previousSentAtMs)
}
