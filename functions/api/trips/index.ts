import type { Env } from '../../lib/supabaseAdmin'
import { createTrip } from '../../lib/supabaseAdmin'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { logger } from '../../../src/lib/logger'
import { z } from 'zod'

const CREATE_TRIPS_PER_HOUR = 300

const createTripSchema = z.object({
  location_slug: z.string().min(1),
  design_style: z.enum(['bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger']).optional(),
})

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

  // Unauthenticated write — cap trip creation per IP so it can't be scripted
  // into unbounded DB rows.
  if (await isRateLimited(env, request, 'trips', CREATE_TRIPS_PER_HOUR)) {
    return json({ error: 'rate limit exceeded, try again later' }, 429)
  }

  try {
    const trip = await createTrip(env, {
      location_slug: parsed.data.location_slug,
      itinerary: [],
      design_style: parsed.data.design_style ?? 'chronicle',
    })
    return json(trip, 201)
  } catch (err) {
    logger.error('trip creation failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
