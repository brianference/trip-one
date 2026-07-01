import type { Env } from '../../lib/supabaseAdmin'
import { createTrip } from '../../lib/supabaseAdmin'
import { logger } from '../../../src/lib/logger'
import { z } from 'zod'

const createTripSchema = z.object({ location_slug: z.string().min(1) })

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * POST /api/trips
 *
 * Creates a new trip with the given location_slug.
 * @param context - Request context with `env` (bindings/secrets) and `request`
 * @returns JSON response: trip row on success (201), or `{ error }` with 400 (validation) or 500 (internal error)
 */
export async function onRequestPost({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const parsed = createTripSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'location_slug is required' }, 400)

  try {
    const trip = await createTrip(env, {
      location_slug: parsed.data.location_slug,
      itinerary: [],
      design_style: 'bento',
    })
    return json(trip, 201)
  } catch (err) {
    logger.error('trip creation failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
