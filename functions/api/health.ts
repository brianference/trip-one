import type { Env } from '../lib/db'
import { getLocationBySlug } from '../lib/db'
import { logger } from '../../src/lib/logger'

/**
 * GET /api/health
 *
 * Liveness probe. Runs one real D1 query (a lookup that returns null) so a 200
 * proves the database binding is actually reachable, not just that the Worker
 * booted. Returns 503 if the query throws.
 */
export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  try {
    await getLocationBySlug(env, '__healthcheck__')
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    logger.error('health check failed', err)
    return new Response(JSON.stringify({ status: 'error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
