/** One invite to add photos to a trip, exactly as the invites API returns it. */
export interface TripInvite {
  id: string
  email: string
  createdAt: number
  acceptedAt: number | null
}

/** Why a saved invite's email did not go out (see `POST /api/trips/:id/invites`). */
export type InviteNotSentReason = 'daily_limit' | 'recently_sent' | 'send_failed'

/** The result of sending (or re-sending) one invite. */
export interface SendInviteResult {
  invite: TripInvite
  emailSent: boolean
  reason?: InviteNotSentReason
}

/** The result of removing one invite. */
export interface RevokeInviteResult {
  ok: true
  /** True when the invite had already been accepted, so it was left in place (its member keeps the trip link). */
  alreadyJoined?: boolean
}

/**
 * The server's own `error` text from a failed response, or `fallback` when the
 * body is not JSON (a platform error page, for example) or has no `error`.
 * @param res - A response that is not ok
 * @param fallback - The message to use when the body carries none
 * @returns The message to throw
 */
async function errorMessageFrom(res: Response, fallback: string): Promise<string> {
  const body: { error?: unknown } = await res.json().catch(() => ({}))
  return typeof body.error === 'string' ? body.error : fallback
}

/**
 * Lists a trip's live invites (pending and accepted alike), oldest first.
 * @param tripId - The trip to list invites for
 * @throws If the request fails; the thrown message is the server's own `error` text
 */
export async function listTripInvites(tripId: string): Promise<TripInvite[]> {
  const res = await fetch(`/api/trips/${tripId}/invites`)
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to load invites'))
  const body: { invites?: TripInvite[] } = await res.json()
  return body.invites ?? []
}

/**
 * Invites an email address to add photos to a trip. The invite is saved even
 * when the email itself could not be sent (see `SendInviteResult.emailSent`).
 * @param tripId - The trip to invite the address to
 * @param email - The address to invite; sent as typed, the server normalizes it
 * @throws If the request is refused (400 invalid email, 403 demo trip, 409 too
 *   many live invites, 429 rate limited, 500); the thrown message is the
 *   server's own `error` text
 */
export async function sendTripInvite(tripId: string, email: string): Promise<SendInviteResult> {
  const res = await fetch(`/api/trips/${tripId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to send invite'))
  return (await res.json()) as SendInviteResult
}

/**
 * Removes one invite. A pending invite is revoked outright; an already
 * accepted one is left in place (`alreadyJoined: true`) since its member's
 * access comes from the trip link they used to join, not the invite row.
 * @param tripId - The trip the invite belongs to
 * @param inviteId - The invite to remove
 * @throws If the request fails; the thrown message is the server's own `error` text
 */
export async function revokeTripInvite(tripId: string, inviteId: string): Promise<RevokeInviteResult> {
  const res = await fetch(`/api/trips/${tripId}/invites/${inviteId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to remove invite'))
  return (await res.json()) as RevokeInviteResult
}
