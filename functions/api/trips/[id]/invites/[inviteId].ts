import type { Env } from '../../../../lib/db'
import { getTrip, revokeTripInvite } from '../../../../lib/db'
import {
  guardInviteRequest,
  json,
  uuidSchema,
  INVITE_NOT_FOUND_MESSAGE,
  NOT_FOUND_MESSAGE,
  SERVER_ERROR_MESSAGE,
} from '../../../../lib/tripInvites'
import { logger } from '../../../../../src/lib/logger'

/**
 * DELETE /api/trips/:id/invites/:inviteId
 *
 * Revokes an invite. A revoked invite can no longer be used to join, and
 * drops out of the invite list. Revoking twice succeeds and keeps the first
 * revocation time. An invite on another trip answers 404, like an unknown one.
 *
 * @param context - Request context with `env`, `request`, `params.id` and `params.inviteId`
 * @returns 200 `{ ok: true }`, or `{ error }` with 403 (demo trip), 404, 429 or 500
 */
export async function onRequestDelete({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { id: string; inviteId: string }
}): Promise<Response> {
  const checked = await guardInviteRequest(env, request, params.id, true)
  if ('response' in checked) return checked.response
  const { tripId } = checked

  const inviteId = uuidSchema.safeParse(params.inviteId)
  if (!inviteId.success) return json({ error: INVITE_NOT_FOUND_MESSAGE }, 404)

  try {
    if (!(await getTrip(env, tripId))) return json({ error: NOT_FOUND_MESSAGE }, 404)
    if (!(await revokeTripInvite(env, tripId, inviteId.data, Date.now()))) {
      return json({ error: INVITE_NOT_FOUND_MESSAGE }, 404)
    }
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('invite revoke failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
