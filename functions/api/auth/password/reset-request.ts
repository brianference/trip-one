import {
  deletePasswordResetsForUser,
  getUserByEmail,
  insertPasswordReset,
  type Env,
} from '../../../lib/db'
import { passwordResetHtml, sendEmail, siteOrigin } from '../../../lib/email'
import { randomToken, sha256hex, RESET_TTL_MS } from '../../../lib/auth/tokens'
import { resetRequestSchema, firstIssueMessage } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { type AuthEnv } from '../../../lib/auth/session'
import { logger } from '../../../../src/lib/logger'

/** Low enough that this cannot be used as a mail cannon, high enough for typos. */
const RATE_LIMIT_PER_HOUR = 10

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/password/reset-request
 *
 * Always returns 200 `{ ok: true }`, whether or not the account exists. A token
 * is minted and mailed only when it does. That is a deliberate anti-enumeration
 * property: the response must not reveal which emails are registered.
 *
 * @returns `{ ok: true }` (or 400/429 for a malformed body / flood)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = resetRequestSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const { email } = parsed.data

  if (await isRateLimited(env as Env, request, 'auth-reset-request', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    const user = await getUserByEmail(env as Env, email)
    if (user) {
      const token = randomToken(32)
      const now = Date.now()
      await deletePasswordResetsForUser(env as Env, user.id)
      await insertPasswordReset(env as Env, {
        token_hash: await sha256hex(token),
        user_id: user.id,
        expires_at: now + RESET_TTL_MS,
      })
      const result = await sendEmail(
        env,
        user.email,
        'Reset your Trip One password',
        passwordResetHtml(`${siteOrigin(env)}/reset?token=${token}`),
      )
      if (!result.sent && !result.stubbed) {
        logger.error('password reset email failed', new Error(result.error ?? 'unknown send failure'))
      }
    }
  } catch (err) {
    // Still 200: a DB blip that 500s only for registered addresses would
    // itself be an enumeration oracle.
    logger.error('password reset-request failed', err)
  }

  return json({ ok: true }, 200)
}
