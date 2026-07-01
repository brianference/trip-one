import type { Env } from '../../lib/supabaseAdmin'
import { getTrip, updateTrip } from '../../lib/supabaseAdmin'
import { itineraryItemSchema } from '../../../src/lib/validation/schemas'
import { logger } from '../../../src/lib/logger'
import { z } from 'zod'

const patchSchema = z.object({
  itinerary: z.array(itineraryItemSchema).optional(),
  design_style: z.enum(['bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger']).optional(),
}).strict()

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * GET /api/trips/:id
 *
 * Retrieves a trip by its ID.
 * @param context - Request context with `env` (bindings/secrets) and `params` containing the trip ID
 * @returns JSON response: trip row on success (200), or `{ error }` with 404 (not found) or 500 (internal error)
 */
export async function onRequestGet({ env, params }: { env: Env; params: { id: string } }): Promise<Response> {
  try {
    const trip = await getTrip(env, params.id)
    if (!trip) return json({ error: 'not found' }, 404)
    return json(trip, 200)
  } catch (err) {
    logger.error('trip lookup failed', err)
    return json({ error: 'internal error' }, 500)
  }
}

/**
 * PATCH /api/trips/:id
 *
 * Updates a trip's itinerary and/or design_style.
 * @param context - Request context with `env` (bindings/secrets), `request`, and `params` containing the trip ID
 * @returns JSON response: updated trip row on success (200), or `{ error }` with 400 (validation) or 500 (internal error)
 */
export async function onRequestPatch({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { id: string }
}): Promise<Response> {
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid patch body' }, 400)

  try {
    const updated = await updateTrip(env, params.id, parsed.data)
    return json(updated, 200)
  } catch (err) {
    logger.error('trip update failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
