import { normalizeEmail, type Env } from '../../../lib/db'
import { issueEmailCode } from '../../../lib/auth/emailCode'
import { sendEmail, signInCodeHtml } from '../../../lib/email'
import { codeRequestSchema, firstIssueMessage } from '../../../lib/auth/validation'
import { isRateLimited } from '../../../lib/rateLimitGuard'
import { type AuthEnv } from '../../../lib/auth/session'
import { logger } from '../../../../src/lib/logger'

/** Per-IP requests per hour: enough for typos and a resend, too few to use this as a mail cannon. */
const RATE_LIMIT_PER_HOUR = 10

/**
 * JSON response. Pages Functions responses do not get `_headers`, so the
 * no-store header is set here: a code response must never be cached.
 */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

/**
 * POST /api/auth/code/request
 *
 * Emails a one-time 6-digit sign-in code. The answer is `{ ok: true }` for
 * every well-formed email, whether or not it has an account (verifying the
 * code creates one) and whether or not the per-email hourly cap stopped the
 * send, so the endpoint reveals nothing about the address.
 *
 * @returns `{ ok: true }`, or `{ error }` for a malformed email (400) or an IP flood (429)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = codeRequestSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)

  if (await isRateLimited(env as Env, request, 'auth-code-request', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  try {
    const code = await issueEmailCode(env as Env, parsed.data.email)
    if (code) {
      const result = await sendEmail(env, normalizeEmail(parsed.data.email), 'Your Trip One sign-in code', signInCodeHtml(code))
      if (!result.sent && !result.stubbed) {
        logger.error('sign-in code email failed', new Error(result.error ?? 'unknown send failure'))
      }
    }
  } catch (err) {
    // Still ok: an error surfaced here would differ from the normal answer.
    logger.error('sign-in code request failed', err)
  }

  return json({ ok: true }, 200)
}
