import {
  claimTripForUser,
  createUser,
  getUserByEmail,
  markEmailVerified,
  normalizeEmail,
  type Env,
  type UserRow,
} from '../../../lib/db'
import { redeemEmailCode } from '../../../lib/auth/emailCode'
import { hashPassword } from '../../../lib/auth/password'
import { randomToken } from '../../../lib/auth/tokens'
import { signToken } from '../../../lib/auth/jwt'
import { sessionCookie, type AuthEnv } from '../../../lib/auth/session'
import { codeVerifySchema, firstIssueMessage, CODE_FAILED_MESSAGE } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { logger } from '../../../../src/lib/logger'

/** Per-IP verifies per hour. Each code also dies after 5 guesses; this caps guessing across many emails. */
const RATE_LIMIT_PER_HOUR = 30
/** Random bytes in the discarded secret behind a code-created account's password hash. */
const UNUSABLE_SECRET_BYTES = 32
/** Longest display name the register form accepts. */
const MAX_DISPLAY_NAME_LENGTH = 80

/**
 * JSON response with no-store: Pages Functions responses do not get
 * `_headers`, and a response that signs someone in must never be cached.
 */
function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...headers },
  })
}

/**
 * The account for a verified email, created on first sign-in.
 *
 * A new account gets a password hash of a random 32-byte secret that is
 * thrown away, so no password can ever match it; the person can set one later
 * through password reset. If two first sign-ins race, the unique email index
 * rejects the loser's insert and the winner's row is read back.
 *
 * @param env - Auth env (DB, optional pepper)
 * @param email - The verified, normalized address
 */
async function findOrCreateUser(env: AuthEnv, email: string): Promise<UserRow> {
  const existing = await getUserByEmail(env, email)
  if (existing) return existing
  const localPart = email.slice(0, email.indexOf('@')).slice(0, MAX_DISPLAY_NAME_LENGTH)
  try {
    return await createUser(env, {
      email,
      password_hash: await hashPassword(randomToken(UNUSABLE_SECRET_BYTES), env.PASSWORD_PEPPER),
      display_name: localPart || null,
    })
  } catch (err) {
    const raced = await getUserByEmail(env, email)
    if (raced) return raced
    throw err
  }
}

/**
 * POST /api/auth/code/verify
 *
 * Signs in with an emailed code, creating the account on first use. The code
 * proves control of the address, so the email is marked verified. Sets the
 * same session cookie as login and, like login, can claim one anonymous trip.
 * Every code failure gets the same 400 so none of them is an oracle.
 *
 * @returns `{ user }` with a Set-Cookie session, or `{ error }` (400/429/500)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  if (!env.JWT_SECRET) {
    logger.error('code verify called with no JWT_SECRET configured')
    return json({ error: 'Accounts are temporarily unavailable. Please try again later.' }, 500)
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = codeVerifySchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const email = normalizeEmail(parsed.data.email)

  if (await isRateLimited(env as Env, request, 'auth-code-verify', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    if (!(await redeemEmailCode(env as Env, email, parsed.data.code))) {
      return json({ error: CODE_FAILED_MESSAGE }, 400)
    }

    const user = await findOrCreateUser(env, email)
    if (user.email_verified !== 1) await markEmailVerified(env as Env, user.id)

    const claimTripId = parsed.data.claimTripId ? parsed.data.claimTripId : null
    if (claimTripId) await claimTripForUser(env as Env, claimTripId, user.id)

    const token = await signToken(user.id, user.token_version, env.JWT_SECRET)
    return json(
      { user: { id: user.id, email: user.email, displayName: user.display_name, emailVerified: true } },
      200,
      { 'Set-Cookie': sessionCookie(token) },
    )
  } catch (err) {
    logger.error('code verify failed', err)
    return json({ error: 'Could not sign you in. Please try again.' }, 500)
  }
}
