import type { Env } from '../lib/supabaseAdmin'
import { getLocationBySlug } from '../lib/supabaseAdmin'
import { logger } from '../../src/lib/logger'

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
