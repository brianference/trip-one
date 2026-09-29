import type { RecapLinkRow, TripRow } from './db'
import { getActiveRecapLinkByToken, getTrip, isTripMember } from './db'
import { getAuthedUser, type AuthedUser, type AuthEnv } from './auth/session'

/**
 * Authorisation for the contributor endpoints under /api/recap/:token.
 *
 * A contributor is a signed-in user with a trip_members row for the trip the
 * ACTIVE recap token points at. They are authorised by session plus
 * membership, looked up through the token, never by a trip id from the
 * client, which they never hold.
 */

/**
 * The one refusal for a signed-in caller who may not do what they asked: not
 * a member of this trip, or (on delete) not the uploader of that photo. Fixed
 * text, identical in both cases, so neither can be told apart from the other.
 */
export const CONTRIBUTOR_FORBIDDEN_MESSAGE = 'Only people who joined this trip can add photos, and only their own can be removed.'

/** For a contributor endpoint called signed out. */
export const CONTRIBUTOR_SIGN_IN_MESSAGE = 'Sign in first'

/** Who is asking, relative to the trip behind a recap token. */
export type RecapMemberAccess =
  | { kind: 'not-found' }
  | { kind: 'signed-out' }
  | { kind: 'not-member'; user: AuthedUser }
  | { kind: 'member'; user: AuthedUser; link: RecapLinkRow; trip: TripRow }

/**
 * Resolves a (well-formed) recap token and the request's session to the
 * caller's access. The token is checked first, so an unknown or revoked token,
 * or one whose trip is gone, is `not-found` whether or not anyone is signed in.
 * @param env - Auth env (DB, JWT_SECRET)
 * @param request - The incoming request (session cookie or bearer)
 * @param token - A token that already passed `recapTokenSchema`
 * @throws When D1 fails; the caller answers 500
 */
export async function resolveRecapMember(env: AuthEnv, request: Request, token: string): Promise<RecapMemberAccess> {
  const link = await getActiveRecapLinkByToken(env, token)
  if (!link) return { kind: 'not-found' }
  const trip = await getTrip(env, link.trip_id)
  if (!trip) return { kind: 'not-found' }

  const user = await getAuthedUser(env, request)
  if (!user) return { kind: 'signed-out' }
  if (!(await isTripMember(env, trip.id, user.id))) return { kind: 'not-member', user }
  return { kind: 'member', user, link, trip }
}
