import { denyEmailConfirmation } from '../../../lib/auth/verification'
import { confirmSchema, firstIssueMessage } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import type { AuthEnv } from '../../../lib/auth/session'
import type { Env } from '../../../lib/db'
import { CONFIRM_LINK_INVALID_MESSAGE } from '../confirm'
import { logger } from '../../../../src/lib/logger'

/** Per-IP denials per hour; same budget size as confirm, its own endpoint label. */
export const CONFIRM_DENIES_PER_HOUR = 30

const SERVER_ERROR_MESSAGE = 'Something went wrong on our end. Please try again in a moment.'

/** JSON response with no-store: Pages Functions responses do not get `_headers`. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * POST /api/auth/confirm/deny `{ token }`
 *
 * "This wasn't me": the inbox owner got a confirmation link for an account
 * they did not create. Spends the token (atomically; a second click gets the
 * same 400 as a bad link) and, if the account is still unverified, secures it:
 * unusable password, every session revoked, email verified. Whoever
 * registered the address without owning it keeps nothing, and the owner can
 * sign in with an emailed code. An already-verified account is left as it is.
 *
 * Needs no session: the token itself proves the caller reads that inbox.
 *
 * @returns 200 `{ ok: true }`, or `{ error }` with 400, 429 or 500
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = confirmSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)

  if (await isRateLimited(env as Env, request, 'auth-confirm-deny', CONFIRM_DENIES_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    if (!(await denyEmailConfirmation(env, parsed.data.token))) {
      return json({ error: CONFIRM_LINK_INVALID_MESSAGE }, 400)
    }
    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('confirm deny failed', err)
    return json({ error: SERVER_ERROR_MESSAGE }, 500)
  }
}
