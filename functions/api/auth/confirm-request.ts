import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'
import { sendConfirmationEmail } from '../../lib/auth/verification'
import { getUserById, type Env } from '../../lib/db'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { logger } from '../../../src/lib/logger'

/** A person who didn't get the first mail should be able to ask a few times, not dozens. */
const RATE_LIMIT_PER_HOUR = 5

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/confirm-request
 *
 * Sends a fresh confirmation link to the signed-in user. Always `{ ok: true }`
 * when authenticated, including when the address is already confirmed (nothing
 * is sent in that case). Mail failure is logged, never surfaced.
 *
 * @returns `{ ok: true }` or `{ error }` (401/429)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const authed = await getAuthedUser(env, request)
  if (!authed) return json({ error: 'Please sign in to request a confirmation link.' }, 401)

  if (await isRateLimited(env as Env, request, 'auth-confirm-request', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  if (authed.emailVerified) return json({ ok: true }, 200)

  try {
    const user = await getUserById(env as Env, authed.id)
    if (user && user.email_verified !== 1) {
      const result = await sendConfirmationEmail(env, user.id, user.email)
      if (!result.sent && !result.stubbed) {
        logger.error('confirmation resend failed', new Error(result.error ?? 'unknown send failure'))
      }
    }
  } catch (err) {
    logger.error('confirmation resend threw', err)
  }

  return json({ ok: true }, 200)
}
