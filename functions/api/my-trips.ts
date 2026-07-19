import { listTripsForUser } from '../lib/db'
import { getAuthedUser, type AuthEnv } from '../lib/auth/session'
import { logger } from '../../src/lib/logger'

/**
 * GET /api/my-trips
 *
 * The signed-in user's saved trips, newest first. 401 for a visitor — unlike
 * /api/auth/me, there is no meaningful anonymous answer here.
 */
export async function onRequestGet({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const user = await getAuthedUser(env, request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Please sign in to see your trips' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const trips = await listTripsForUser(env, user.id)
    return new Response(JSON.stringify({ trips }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    logger.error('my-trips failed', err)
    return new Response(JSON.stringify({ error: 'Could not load your trips. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
