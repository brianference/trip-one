import { confirmEmail } from '../../lib/auth/verification'
import { confirmSchema, firstIssueMessage } from '../../lib/auth/validation'
import { isRateLimited } from '../../lib/rateLimitGuard'
import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'
import type { Env } from '../../lib/db'

/**
 * Tight-ish limit: each guess is cheap (a hash lookup) but an unbounded
 * flood is still a way to probe stolen inbox links.
 */
const RATE_LIMIT_PER_HOUR = 30

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
 * Redeems a confirmation token. One-time. Marks `users.email_verified = 1`.
 * Without the account's own session on the request, an unverified account's
 * password and sessions are also reset (see confirmEmail) and the response
 * says so with `passwordReset: true`.
 *
 * @returns `{ ok, email, passwordReset }` or `{ error }` (400/429)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = confirmSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)

  if (await isRateLimited(env as Env, request, 'auth-confirm', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  const session = await getAuthedUser(env, request)
  const result = await confirmEmail(env, parsed.data.token, session?.id ?? null)
  if (!result.ok) {
    return json({ error: 'This confirmation link is invalid or has expired. Sign in and request a new one from your trips page.' }, 400)
  }
  return json({ ok: true, email: result.email, passwordReset: result.passwordReset }, 200)
}
