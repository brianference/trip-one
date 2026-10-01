import { confirmEmail } from '../../lib/auth/verification'
import { confirmSchema, firstIssueMessage } from '../../lib/auth/validation'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'
import type { Env } from '../../lib/db'
import { logger } from '../../../src/lib/logger'

/**
 * Tight-ish limit: each guess is cheap (a hash lookup) but an unbounded
 * flood is still a way to probe stolen inbox links.
 */
const RATE_LIMIT_PER_HOUR = 30

/** The one answer for an unknown, expired or already-used link. Shared with /api/auth/confirm/deny. */
export const CONFIRM_LINK_INVALID_MESSAGE =
  'This confirmation link is invalid or has expired. Sign in and request a new one from your trips page.'

/** JSON response with no-store: Pages Functions responses do not get `_headers`. */
function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...headers },
  })
}

/**
 * POST /api/auth/confirm
 *
 * Redeems a confirmation token for the account's OWN session: marks
 * `users.email_verified = 1` and spends the token, and the answer is
 * `{ ok: true, email, passwordReset: false }` (the field is kept for the
 * client; this endpoint never resets a password any more).
 *
 * Without that account's session (signed out, or signed in as someone else)
 * nothing changes and the token is NOT spent: the answer is 200
 * `{ ok: false, needsSignIn: true, email }`, so the page can ask them to sign
 * in and come back, or offer "This wasn't me" (POST /api/auth/confirm/deny).
 *
 * @returns 200 as above, or `{ error }` with 400 (bad or spent link), 429 or 500
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = confirmSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)

  if (await isRateLimited(env as Env, request, 'auth-confirm', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    const session = await getAuthedUser(env, request)
    const result = await confirmEmail(env, parsed.data.token, session?.id ?? null)
    if (result.ok) return json({ ok: true, email: result.email, passwordReset: false }, 200)
    if (result.reason === 'needs-sign-in') return json({ ok: false, needsSignIn: true, email: result.email }, 200)
    return json({ error: CONFIRM_LINK_INVALID_MESSAGE }, 400)
  } catch (err) {
    logger.error('confirm failed', err)
    return json({ error: 'Something went wrong on our end. Please try again in a moment.' }, 500)
  }
}
