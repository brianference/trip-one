import { listJoinedTrips, listTripsForUser, type JoinedTripRow } from '../lib/db'
import { getAuthedUser, type AuthEnv } from '../lib/auth/session'
import { stripTripId } from '../lib/recapAccess'
import { cleanDisplayName } from '../../src/lib/location/displayName'
import { logger } from '../../src/lib/logger'

/** A trip the user joined through an invite, as the API returns it: no trip id, only its recap. */
export interface JoinedTrip {
  recapToken: string
  title: string | null
  displayName: string
}

/**
 * Maps a joined-trip row to its API shape, field by field. The trip id is
 * used only to scrub it out of the title (the traveler may have pasted their
 * own trip link there); it is never copied into the result.
 * @param row - A row from listJoinedTrips
 */
function toJoinedTrip(row: JoinedTripRow): JoinedTrip {
  const title = typeof row.title === 'string' ? stripTripId(row.title, row.trip_id) : ''
  return {
    recapToken: row.recap_token,
    title: title === '' ? null : title,
    displayName: cleanDisplayName(row.location_name ?? row.location_slug),
  }
}

/**
 * GET /api/my-trips
 *
 * The signed-in user's saved trips, newest first, plus `joined`: the trips
 * they joined through an invite that still have an active recap link, most
 * recently joined first, each named only by its recap token (a member never
 * receives the trip id). 401 for a visitor — unlike /api/auth/me, there is no
 * meaningful anonymous answer here.
 *
 * @returns 200 `{ trips, joined }`, or `{ error }` with 401 or 500
 */
export async function onRequestGet({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const user = await getAuthedUser(env, request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Please sign in to see your trips' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })
  }

  try {
    const trips = await listTripsForUser(env, user.id)
    const joined = (await listJoinedTrips(env, user.id)).map(toJoinedTrip)
    return new Response(JSON.stringify({ trips, joined }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    logger.error('my-trips failed', err)
    return new Response(JSON.stringify({ error: 'Could not load your trips. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })
  }
}
