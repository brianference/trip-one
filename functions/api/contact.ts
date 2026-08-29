import { insertContactMessage, markContactDelivered, type Env } from '../lib/db'
import { getAuthedUser, type AuthEnv } from '../lib/auth/session'
import { contactNotificationHtml, sendEmail } from '../lib/email'
import { contactSchema, firstIssueMessage } from '../lib/auth/validation'
import { isRateLimited } from '../lib/rateLimitGuard'
import { logger } from '../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 10
const DEFAULT_OPERATOR_EMAIL = 'brianference@protonmail.com'

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * POST /api/contact
 *
 * Persists the message FIRST, then attempts the send, and sets `delivered = 1`
 * only if the send succeeded — a Brevo outage must not lose a message.
 *
 * `website` is a honeypot: if it is non-empty, return a normal 200 and write
 * nothing, so the bot learns nothing.
 *
 * @returns `{ ok: true }` (or 400/429)
 */
export async function onRequestPost({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = contactSchema.safeParse(raw)
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const { name, email, subject, message, website } = parsed.data

  // Honeypot tripped: answer exactly like success so the bot learns nothing.
  if (typeof website === 'string' && website.trim() !== '') {
    return json({ ok: true }, 200)
  }

  if (await isRateLimited(env as Env, request, 'contact', RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  const authed = await getAuthedUser(env, request)
  const id = crypto.randomUUID()

  try {
    await insertContactMessage(env as Env, {
      id,
      name,
      email,
      subject,
      message,
      user_id: authed?.id ?? null,
      created_at: Date.now(),
    })
  } catch (err) {
    logger.error('contact persist failed', err)
    return json({ error: 'Could not send your message. Please try again.' }, 500)
  }

  const result = await sendEmail(
    env,
    env.CONTACT_TO || DEFAULT_OPERATOR_EMAIL,
    `[Trip One] ${subject}`,
    contactNotificationHtml({ name, email, subject, message }),
    email,
  )
  if (result.sent) {
    try {
      await markContactDelivered(env as Env, id)
    } catch (err) {
      // The operator already got the mail; failing to flip the flag is logged,
      // not returned — the visitor's message landed.
      logger.error('contact delivered-flag failed', err)
    }
  } else if (!result.stubbed) {
    logger.error('contact email failed', new Error(result.error ?? 'unknown send failure'))
  }

  return json({ ok: true }, 200)
}
