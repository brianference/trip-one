import { createUser, getUserByEmail, claimTripForUser, type Env } from '../../lib/db'
import { hashPassword } from '../../lib/auth/password'
import { signToken } from '../../lib/auth/jwt'
import { sessionCookie, type AuthEnv } from '../../lib/auth/session'
import { registerSchema, firstIssueMessage } from '../../lib/auth/validation'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { logger } from '../../../src/lib/logger'

/**
 * Tight limit: registration is the cheapest endpoint to abuse (it creates rows
 * and burns PBKDF2 cycles) and no real person needs more than a handful.
 */
const RATE_LIMIT_PER_HOUR = 10

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/register
 *
 * Creates an account and signs the user in, returning an httpOnly session
 * cookie. Optionally claims one anonymous trip (`claimTripId`) so a visitor who
 * planned a trip and then registered keeps it, instead of losing the thing that
 * made them sign up.
 *
 * @returns `{ user }` with a Set-Cookie session, or `{ error }` (400/409/429/500)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  if (!env.JWT_SECRET) {
    logger.error('register called with no JWT_SECRET configured')
    return json({ error: 'Accounts are temporarily unavailable. Please try again later.' }, 500)
  }

  // Read the body ONCE. A Request body is a single-use stream, so cloning it
  // after it has been consumed fails.
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const { email, password, displayName } = parsed.data

  if (await isRateLimited(env as Env, request, 'auth-register', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    // Checked up front for a clear message. The unique index is still the real
    // guarantee — two simultaneous registrations both pass this check, and the
    // insert below is what actually rejects the loser.
    if (await getUserByEmail(env as Env, email)) {
      return json({ error: 'An account with that email already exists' }, 409)
    }

    const user = await createUser(env as Env, {
      email,
      password_hash: await hashPassword(password, env.PASSWORD_PEPPER),
      display_name: displayName ?? null,
    })

    const claimTripId = typeof raw.claimTripId === 'string' && raw.claimTripId !== '' ? raw.claimTripId : null
    if (claimTripId) await claimTripForUser(env as Env, claimTripId, user.id)

    const token = await signToken(user.id, user.token_version, env.JWT_SECRET)
    return json(
      { user: { id: user.id, email: user.email, displayName: user.display_name } },
      201,
      { 'Set-Cookie': sessionCookie(token) },
    )
  } catch (err) {
    // The unique constraint losing a race lands here; report it as the conflict
    // it is rather than a 500.
    const message = err instanceof Error ? err.message : String(err)
    if (/unique/i.test(message)) return json({ error: 'An account with that email already exists' }, 409)
    logger.error('register failed', err)
    return json({ error: 'Could not create your account. Please try again.' }, 500)
  }
}
