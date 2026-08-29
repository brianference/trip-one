/**
 * Email confirmation: issue a token, mail the link, redeem it.
 *
 * Confirmation is deliberately NOT a gate on using the account. Blocking
 * sign-in until an email arrives means a Brevo outage locks every new user
 * out of a product that otherwise works. What confirmation buys is a
 * recoverable address.
 */
import {
  deleteEmailVerificationsForUser,
  getEmailVerification,
  getUserById,
  insertEmailVerification,
  markEmailVerified,
  markEmailVerificationUsed,
  type Env,
} from '../db'
import { confirmEmailHtml, sendEmail, siteOrigin, type MailEnv, type SendResult } from '../email'
import { randomToken, sha256hex, VERIFY_TTL_MS } from './tokens'
import { logger } from '../../../src/lib/logger'

export type ConfirmResult = { ok: true; email: string } | { ok: false; reason: 'invalid' }

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
 * Redeem a confirmation token. One-time: the row is marked used, not deleted.
 * Invalid, expired, and already-used tokens share one answer so the endpoint
 * is not an oracle for "this token existed".
 *
 * @param env - D1 env
 * @param token - The plaintext token from the link
 */
export async function confirmEmail(env: Env, token: string): Promise<ConfirmResult> {
  const hash = await sha256hex(token)
  const now = Date.now()
  const row = await getEmailVerification(env, hash)

  if (!row || row.used_at != null || row.expires_at < now) return { ok: false, reason: 'invalid' }

  await markEmailVerificationUsed(env, hash, now)
  await markEmailVerified(env, row.user_id)

  const user = await getUserById(env, row.user_id)
  return { ok: true, email: user?.email ?? '' }
}
