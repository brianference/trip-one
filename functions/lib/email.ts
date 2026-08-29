/**
 * Transactional email, through Brevo.
 *
 * MAIL_FROM must be an address on a domain AUTHENTICATED IN BREVO, currently
 * no-reply@txeas.com. It must NOT be a protonmail.com address.
 *
 * Sending as protonmail.com through Brevo fails DMARC by construction:
 * protonmail.com publishes `p=quarantine` with strict alignment (aspf=s,
 * adkim=s) and Brevo is not in its SPF record. Brevo logged "delivered" for
 * messages that never reached an inbox, because the receiving server accepted
 * them and Proton then quarantined them. Verifying an individual address in
 * Brevo proves you control it; it does not authorise Brevo to send AS that
 * domain.
 *
 * Always send both htmlContent and textContent. HTML with no text/plain
 * alternative is a spam-filter penalty.
 */
import { logger } from '../../src/lib/logger'

export type MailEnv = {
  BREVO_API_KEY?: string
  /** Sender address. MUST be on a Brevo-authenticated domain: no-reply@txeas.com. */
  MAIL_FROM?: string
  SITE_URL?: string
  /** Destination for Contact Us submissions. */
  CONTACT_TO?: string
}

export type SendResult = { sent: boolean; stubbed?: boolean; error?: string }

const APP_NAME = 'Trip One'
/** Measured 5.37:1 against white — passes WCAG AA. Used only in email HTML. */
const BRAND_COLOR = '#1f7a3d'
const TEXT_COLOR = '#13241a'
const MUTED_COLOR = '#6b6355'
const FALLBACK_FROM = 'no-reply@txeas.com'
const BREVO_SMTP_URL = 'https://api.brevo.com/v3/smtp/email'

/**
 * Parse a From value that may be `Name <addr@host>` or a bare address.
 * @param from - The configured MAIL_FROM string
 */
function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match && match[2]) return { name: match[1] || APP_NAME, email: match[2] }
  return { name: APP_NAME, email: from }
}

/**
 * The address we actually send as. protonmail.com is refused even if it was
 * configured: that misconfiguration already cost a production incident.
 * @param from - env.MAIL_FROM, possibly unset
 */
function senderAddress(from: string | undefined): string {
  const raw = (from ?? '').trim() || FALLBACK_FROM
  if (/@protonmail\.com$/i.test(parseSender(raw).email) || /@proton\.me$/i.test(parseSender(raw).email)) {
    logger.warn('MAIL_FROM is a Proton address; refusing to send as it (DMARC quarantine)')
    return FALLBACK_FROM
  }
  return raw
}

/**
 * Derive a plain-text alternative from the HTML body. An HTML-only message
 * with no text/plain part is a well-known spam-filter penalty, so every send
 * ships both.
 * @param html - The HTML body
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Send one message. Never throws: a mail outage must not turn a registration
 * or a reset into an error that tells the caller something went wrong, because
 * the generic response is what stops the endpoint enumerating accounts.
 * Failures are returned and logged server-side instead.
 *
 * When BREVO_API_KEY is unset, logs and returns a stubbed result so local
 * dev works without a key.
 *
 * @param env - Mail configuration
 * @param to - Recipient address
 * @param subject - Subject line
 * @param html - HTML body; a text/plain alternative is derived from this
 * @param replyTo - Optional Reply-To (the visitor's address on contact mail)
 */
export async function sendEmail(
  env: MailEnv,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<SendResult> {
  const key = env.BREVO_API_KEY
  if (!key) {
    logger.info('email stubbed; BREVO_API_KEY is unset', { to, subject })
    return { sent: false, stubbed: true }
  }

  const sender = parseSender(senderAddress(env.MAIL_FROM))
  try {
    const res = await fetch(BREVO_SMTP_URL, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        subject,
        htmlContent: html,
        textContent: htmlToText(html),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const error = `brevo ${res.status}: ${text.slice(0, 200)}`
      logger.error('email send failed', new Error(error))
      return { sent: false, error }
    }
    return { sent: true }
  } catch (err) {
    logger.error('email send threw', err)
    return { sent: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Wraps inner HTML in the branded Trip One layout used by every template.
 * @param inner - The body content, already HTML
 */
function wrap(inner: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:${TEXT_COLOR}">
     <h2 style="color:${BRAND_COLOR};margin:0 0 12px">${APP_NAME}</h2>${inner}
     <p style="color:${MUTED_COLOR};font-size:12px;margin-top:24px">You received this because you have a Trip One account, or because you wrote to us.</p>
   </div>`
}

/**
 * A single call-to-action button. Colour is the measured brand green.
 * @param href - Destination URL
 * @param label - Button label
 */
function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${label}</a></p>`
}

/**
 * Confirmation email, sent immediately after registration. The account works
 * before it is confirmed — this mail is how we know the address can receive.
 * @param link - Absolute confirmation URL including the token
 */
export function confirmEmailHtml(link: string): string {
  return wrap(
    `<p>Confirm this address so you can recover your account if you forget your password:</p>
     ${button(link, 'Confirm my email')}
     <p style="color:${MUTED_COLOR};font-size:13px">This link expires in 24 hours. If you didn't create an account, ignore this email and nothing further will happen.</p>`,
  )
}

/**
 * Password-reset email. One-time, 60 minutes.
 * @param link - Absolute reset URL including the token
 */
export function passwordResetHtml(link: string): string {
  return wrap(
    `<p>Someone asked to reset the password on this account. Choose a new one:</p>
     ${button(link, 'Set a new password')}
     <p style="color:${MUTED_COLOR};font-size:13px">This link expires in 60 minutes and can be used once. If you didn't request it, ignore this email — your password stays as it is.</p>`,
  )
}

/**
 * Escape text that will be interpolated into the contact notification HTML.
 * @param value - Untrusted visitor input
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Operator notification for a Contact Us submission. The visitor's address
 * goes in Reply-To at the call site, never in `sender`: mailing AS a visitor's
 * domain is the same DMARC failure documented at the top of this file.
 * @param message - The stored contact fields
 */
export function contactNotificationHtml(message: {
  name: string
  email: string
  subject: string
  message: string
}): string {
  return wrap(
    `<p><strong>${escapeHtml(message.name)}</strong> &lt;${escapeHtml(message.email)}&gt; wrote:</p>
     <p style="font-weight:600">${escapeHtml(message.subject)}</p>
     <div style="white-space:pre-wrap;border-left:3px solid ${BRAND_COLOR};padding-left:12px">${escapeHtml(message.message)}</div>`,
  )
}

/**
 * Absolute site origin with no trailing slash, for building email links.
 * @param env - Mail configuration (SITE_URL)
 */
export function siteOrigin(env: MailEnv): string {
  const raw = (env.SITE_URL ?? 'https://trip-one.pages.dev').trim()
  return raw.replace(/\/+$/, '')
}
