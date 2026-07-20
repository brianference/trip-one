import type { Env } from '../../lib/db'
import { getTrip, updateTrip, deleteTripOwnedBy } from '../../lib/db'
import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'
import { itineraryItemSchema } from '../../../src/lib/validation/schemas'
import { logger } from '../../../src/lib/logger'
import { z } from 'zod'

const patchSchema = z.object({
  itinerary: z.array(itineraryItemSchema).optional(),
  design_style: z.enum(['bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger']).optional(),
  trip_length_days: z.number().int().min(1).max(60).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD').nullable().optional(),
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
    if (!trip) return json({ error: 'We couldn’t find that.' }, 404)
    return json(trip, 200)
  } catch (err) {
    logger.error('trip lookup failed', err)
    return json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500)
  }
}

/**
 * PATCH /api/trips/:id
 *
 * Updates a trip's itinerary, design_style, and/or trip_length_days.
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
  if (!parsed.success) return json({ error: 'We couldn’t save that change. Please try again.' }, 400)

  try {
    const updated = await updateTrip(env, params.id, parsed.data)
    return json(updated, 200)
  } catch (err) {
    logger.error('trip update failed', err)
    return json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500)
  }
}

/**
 * DELETE /api/trips/:id
 *
 * Deletes a trip the signed-in user owns.
 *
 * Ownership is enforced inside the SQL (`WHERE id = ? AND user_id = ?`) rather
 * than by reading the row and comparing: a check-then-delete can race, and
 * folding it into the statement makes it impossible to forget at a call site.
 *
 * A trip that does not exist and a trip belonging to someone else both answer
 * 404, so this cannot be used to discover which trip ids are real. Anonymous
 * trips have no owner and so can never be deleted through this route.
 */
export async function onRequestDelete({
  env,
  request,
  params,
}: {
  env: AuthEnv
  request: Request
  params: { id: string }
}): Promise<Response> {
  const user = await getAuthedUser(env, request)
  if (!user) return json({ error: 'Please sign in to delete a trip' }, 401)

  const id = typeof params.id === 'string' ? params.id.trim() : ''
  if (id === '') return json({ error: 'Something in that request didn’t look right. Please try again.' }, 400)

  try {
    const deleted = await deleteTripOwnedBy(env, id, user.id)
    if (!deleted) return json({ error: 'We couldn’t find that trip. It may have already been deleted.' }, 404)
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('delete trip failed', err)
    return json({ error: 'Could not delete that trip. Please try again.' }, 500)
  }
}
