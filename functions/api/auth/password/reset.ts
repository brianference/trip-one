import { getPasswordReset, markPasswordResetUsed, resetUserPassword, type Env } from '../../../lib/db'
import { hashPassword } from '../../../lib/auth/password'
import { sha256hex } from '../../../lib/auth/tokens'
import { resetSchema, firstIssueMessage } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { type AuthEnv } from '../../../lib/auth/session'
import { logger } from '../../../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 20

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/password/reset
 *
 * Sets the new password hash, marks the token used, and bumps
 * `users.token_version` so every existing JWT for that user stops working. A
 * password reset is the standard response to a suspected compromise; leaving
 * old tokens valid defeats it.
 *
 * @returns `{ ok: true }` or `{ error }` (400/429/500)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = resetSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const { token, password } = parsed.data

  if (await isRateLimited(env as Env, request, 'auth-reset', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    const hash = await sha256hex(token)
    const now = Date.now()
    const row = await getPasswordReset(env as Env, hash)

    if (!row || row.used_at != null || row.expires_at < now) {
      return json({ error: 'That reset link is invalid or has expired. Request a new one.' }, 400)
    }

    const passwordHash = await hashPassword(password, env.PASSWORD_PEPPER)
    await markPasswordResetUsed(env as Env, hash, now)
    await resetUserPassword(env as Env, row.user_id, passwordHash)

    return json({ ok: true }, 200)
  } catch (err) {
    logger.error('password reset failed', err)
    return json({ error: 'Could not update your password. Please try again.' }, 500)
  }
}
