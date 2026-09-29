import {
  claimTripForUser,
  createUser,
  getUserByEmail,
  getUserById,
  markEmailVerified,
  normalizeEmail,
  secureUnverifiedUser,
  type Env,
  type UserRow,
} from '../../../lib/db'
import { redeemEmailCode } from '../../../lib/auth/emailCode'
import { unusablePasswordHash } from '../../../lib/auth/password'
import { signToken } from '../../../lib/auth/jwt'
import { getAuthedUser, sessionCookie, type AuthEnv } from '../../../lib/auth/session'
import { codeVerifySchema, firstIssueMessage, CODE_FAILED_MESSAGE } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { logger } from '../../../../src/lib/logger'

/** Per-IP verifies per hour. Each code also dies after 5 guesses; this caps guessing across many emails. */
const RATE_LIMIT_PER_HOUR = 30
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
 * The account for an email whose owner just proved control of it with a code.
 *
 * - No account: one is created, verified in the same insert, with an unusable
 *   password. If two first sign-ins race, the unique email index rejects the
 *   loser's insert and the winner's row is used.
 * - Unverified account, and the request carries THAT account's own session:
 *   the person who registered it is the one proving the address, so it is
 *   just marked verified; their password and sessions stay (as /confirm does).
 * - Unverified account otherwise: it was registered with a password by someone
 *   who never proved they own the address, possibly an attacker
 *   pre-registering it. Its password is replaced with an unusable one and
 *   every existing session is revoked (token version bump) before the owner is
 *   signed in, so whoever registered it keeps nothing.
 * - Verified account: returned unchanged; its password and sessions stay valid.
 *
 * @param env - Auth env (DB, optional pepper)
 * @param email - The verified, normalized address
 * @param sessionUserId - The signed-in user on this request, or null
 * @returns The user row as it is after any takeover, with the current token version
 */
async function signInUser(env: AuthEnv, email: string, sessionUserId: string | null): Promise<UserRow> {
  let user = await getUserByEmail(env, email)
  if (!user) {
    const localPart = email.slice(0, email.indexOf('@')).slice(0, MAX_DISPLAY_NAME_LENGTH)
    try {
      return await createUser(env, {
        email,
        password_hash: await unusablePasswordHash(env.PASSWORD_PEPPER),
        display_name: localPart || null,
        email_verified: true,
      })
    } catch (err) {
      user = await getUserByEmail(env, email)
      if (!user) throw err
    }
  }
  if (user.email_verified === 1) return user

  if (sessionUserId === user.id) {
    await markEmailVerified(env, user.id)
    return { ...user, email_verified: 1 }
  }

  await secureUnverifiedUser(env, user.id, await unusablePasswordHash(env.PASSWORD_PEPPER))
  // Read back so the session is signed with the bumped token version.
  const secured = await getUserById(env, user.id)
  if (!secured) throw new Error('user vanished during code sign-in')
  return secured
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

    const session = await getAuthedUser(env, request)
    const user = await signInUser(env, email, session?.id ?? null)

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
