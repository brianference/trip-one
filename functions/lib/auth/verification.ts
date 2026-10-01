/**
 * Email confirmation: issue a token, mail the link, redeem it.
 *
 * Confirmation is deliberately NOT a gate on using the account. Blocking
 * sign-in until an email arrives means a Brevo outage locks every new user
 * out of a product that otherwise works. What confirmation buys is a
 * recoverable address.
 */
import {
  consumeEmailVerification,
  deleteEmailVerificationsForUser,
  getEmailVerification,
  getUserById,
  insertEmailVerification,
  markEmailVerified,
  secureUnverifiedUser,
  type Env,
} from '../db'
import { confirmEmailHtml, sendEmail, siteOrigin, type MailEnv, type SendResult } from '../email'
import { randomToken, sha256hex, VERIFY_TTL_MS } from './tokens'
import { unusablePasswordHash } from './password'
import { logger } from '../../../src/lib/logger'

export type ConfirmResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'needs-sign-in'; email: string }

/**
 * Create a confirmation token and email it. Returns the send result so the
 * caller can log a failure; callers must not surface it, because a registration
 * that reports "we could not email you" is a slower way of saying the address
 * exists.
 *
 * @param env - D1 + mail env
 * @param userId - The new (or existing unverified) user
 * @param email - Address to send to, already normalized
 */
export async function sendConfirmationEmail(
  env: Env & MailEnv,
  userId: string,
  email: string,
): Promise<SendResult> {
  const token = randomToken(32)
  const hash = await sha256hex(token)
  const now = Date.now()

  // One live token per account: asking again invalidates the previous link
  // rather than leaving a widening set of valid tokens in inboxes.
  await deleteEmailVerificationsForUser(env, userId)
  await insertEmailVerification(env, { token_hash: hash, user_id: userId, expires_at: now + VERIFY_TTL_MS })

  const link = `${siteOrigin(env)}/confirm?token=${token}`
  return sendEmail(env, email, `Confirm your email for Trip One`, confirmEmailHtml(link))
}

/**
 * Best-effort wrapper used at register time: a mail or token-insert failure
 * must never fail the account create.
 *
 * @param env - D1 + mail env
 * @param userId - The new user
 * @param email - Address to send to
 */
export async function trySendConfirmationEmail(env: Env & MailEnv, userId: string, email: string): Promise<void> {
  try {
    const result = await sendConfirmationEmail(env, userId, email)
    if (!result.sent && !result.stubbed) {
      logger.error('confirmation email failed', new Error(result.error ?? 'unknown send failure'))
    }
  } catch (err) {
    logger.error('confirmation email threw', err)
  }
}

/**
 * Redeem a confirmation token, but only for the account's OWN session.
 *
 * Clicking the link proves control of the inbox, not that the clicker chose
 * the account's password: anyone can register someone else's address and
 * re-send the link. So confirming requires the session of the account the
 * token belongs to (the person who registered is the one confirming). Without
 * it, nothing changes and the token stays unused: the answer is
 * `needs-sign-in` with the account's email, so the page can ask them to sign
 * in and come back, or to say "This wasn't me" ({@link denyEmailConfirmation}).
 *
 * Invalid, expired, and already-used tokens share one answer so the endpoint
 * is not an oracle for "this token existed". The token is consumed in one
 * statement guarded on `used_at IS NULL`, so two concurrent clicks cannot both
 * spend it.
 *
 * @param env - D1 env
 * @param token - The plaintext token from the link
 * @param sessionUserId - The signed-in user on this request, or null
 */
export async function confirmEmail(env: Env, token: string, sessionUserId: string | null): Promise<ConfirmResult> {
  const hash = await sha256hex(token)
  const now = Date.now()
  const row = await getEmailVerification(env, hash)
  if (!row || row.used_at != null || row.expires_at < now) return { ok: false, reason: 'invalid' }

  const user = await getUserById(env, row.user_id)
  if (!user) return { ok: false, reason: 'invalid' }

  if (sessionUserId !== row.user_id) return { ok: false, reason: 'needs-sign-in', email: user.email }

  if (!(await consumeEmailVerification(env, hash, now))) return { ok: false, reason: 'invalid' }
  await markEmailVerified(env, row.user_id)
  return { ok: true, email: user.email }
}

/**
 * "This wasn't me": the inbox owner got a confirmation link for an account
 * they did not create. Consumes the token (one statement, first caller wins)
 * and secures the account the way a code sign-in does: unusable password,
 * every session revoked, email verified, in one statement guarded on
 * `email_verified = 0`, so an already-verified account is left as it is.
 * Whoever registered the address without owning it keeps nothing; the real
 * owner can sign in with an emailed code.
 *
 * @param env - D1 env, plus the optional password pepper
 * @param token - The plaintext token from the link
 * @returns False for an invalid, expired or already-used token
 */
export async function denyEmailConfirmation(
  env: Env & { PASSWORD_PEPPER?: string },
  token: string,
): Promise<boolean> {
  const hash = await sha256hex(token)
  const now = Date.now()
  const row = await getEmailVerification(env, hash)
  if (!row || row.used_at != null || row.expires_at < now) return false
  if (!(await consumeEmailVerification(env, hash, now))) return false
  await secureUnverifiedUser(env, row.user_id, await unusablePasswordHash(env.PASSWORD_PEPPER))
  return true
}
