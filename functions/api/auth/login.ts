import { getUserByEmail, updateUserPasswordHash, claimTripForUser, type Env } from '../../lib/db'
import { verifyPassword, hashPassword, needsRehash } from '../../lib/auth/password'
import { signToken } from '../../lib/auth/jwt'
import { sessionCookie, type AuthEnv } from '../../lib/auth/session'
import { loginSchema, firstIssueMessage } from '../../lib/auth/validation'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { logger } from '../../../src/lib/logger'

/** Low enough to make online password guessing impractical, high enough for typos. */
const RATE_LIMIT_PER_HOUR = 20

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/login
 *
 * Verifies credentials and issues an httpOnly session cookie. Like register, it
 * can claim one anonymous trip so signing in doesn't lose the trip in progress.
 *
 * @returns `{ user }` with a Set-Cookie session, or `{ error }` (400/401/429/500)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  if (!env.JWT_SECRET) {
    logger.error('login called with no JWT_SECRET configured')
    return json({ error: 'Accounts are not available right now' }, 500)
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const { email, password } = parsed.data

  if (await isRateLimited(env as Env, request, 'auth-login', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    const user = await getUserByEmail(env as Env, email)

    // One message for both "no such account" and "wrong password". Saying which
    // turns the login form into an account-enumeration oracle.
    const invalid = json({ error: 'Email or password is incorrect' }, 401)
    if (!user) {
      // Hash anyway so a missing account doesn't return measurably faster than
      // a wrong password, which would leak which emails are registered.
      await hashPassword(password)
      return invalid
    }
    if (!(await verifyPassword(password, user.password_hash))) return invalid

    // Transparently upgrade a hash made at an older work factor, now that the
    // plaintext is in hand and known correct.
    if (needsRehash(user.password_hash)) {
      try {
        await updateUserPasswordHash(env as Env, user.id, await hashPassword(password))
      } catch (err) {
        // A failed upgrade must not fail the login; it retries next time.
        logger.warn('password rehash failed', { reason: err instanceof Error ? err.message : String(err) })
      }
    }

    const claimTripId = typeof raw.claimTripId === 'string' && raw.claimTripId !== '' ? raw.claimTripId : null
    if (claimTripId) await claimTripForUser(env as Env, claimTripId, user.id)

    const token = await signToken(user.id, user.token_version, env.JWT_SECRET)
    return json({ user: { id: user.id, email: user.email, displayName: user.display_name } }, 200, {
      'Set-Cookie': sessionCookie(token),
    })
  } catch (err) {
    logger.error('login failed', err)
    return json({ error: 'Could not sign you in. Please try again.' }, 500)
  }
}
