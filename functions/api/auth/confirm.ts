import { confirmEmail } from '../../lib/auth/verification'
import { confirmSchema, firstIssueMessage } from '../../lib/auth/validation'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { type AuthEnv } from '../../lib/auth/session'
import type { Env } from '../../lib/db'

/**
 * Tight-ish limit: each guess is cheap (a hash lookup) but an unbounded
 * flood is still a way to probe stolen inbox links.
 */
const RATE_LIMIT_PER_HOUR = 30

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/auth/confirm
 *
 * Redeems a confirmation token. One-time. Marks `users.email_verified = 1`.
 *
 * @returns `{ ok, email }` or `{ error }` (400/429)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = confirmSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)

  if (await isRateLimited(env as Env, request, 'auth-confirm', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  const result = await confirmEmail(env as Env, parsed.data.token)
  if (!result.ok) {
    return json({ error: 'This confirmation link is invalid or has expired. Sign in and request a new one from your trips page.' }, 400)
  }
  return json({ ok: true, email: result.email }, 200)
}
