import type { AuthEnv } from '../../../lib/auth/session'
import { recapTokenSchema, RECAP_NOT_FOUND_MESSAGE } from '../../../lib/recapAccess'
import { resolveRecapMember } from '../../../lib/recapMember'
import { logger } from '../../../../src/lib/logger'

const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/**
 * JSON response with no-store on every status: the answer depends on who is
 * signed in, and Pages Functions responses do not get `_headers`.
 * @param body - Serialized as the response body
 * @param status - HTTP status
 */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * GET /api/recap/:token/me
 *
 * Whether the signed-in viewer is a member (contributor) of the trip behind
 * this recap, so the page can switch to contributor mode. `userId` is the
 * viewer's own id and is present whenever they are signed in; it never names
 * the trip. Signed out answers `{ member: false }`.
 *
 * Not rate-limited through D1: it only reads, and a limit here would write a
 * request_log row on every recap view.
 *
 * @param context - Request context with `env`, `request` and `params.token`
 * @returns 200 `{ member, userId? }`, or `{ error }` with the recap 404 or 500
 */
export async function onRequestGet({
  env,
  request,
  params,
}: {
  env: AuthEnv
  request: Request
  params: { token: string }
}): Promise<Response> {
  const token = recapTokenSchema.safeParse(params.token)
  if (!token.success) return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)

  try {
    const access = await resolveRecapMember(env, request, token.data)
    switch (access.kind) {
      case 'not-found':
        return json({ error: RECAP_NOT_FOUND_MESSAGE }, 404)
      case 'signed-out':
        return json({ member: false }, 200)
      case 'not-member':
        return json({ member: false, userId: access.user.id }, 200)
      case 'member':
        return json({ member: true, userId: access.user.id }, 200)
    }
  } catch (err) {
    logger.error('recap membership check failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
