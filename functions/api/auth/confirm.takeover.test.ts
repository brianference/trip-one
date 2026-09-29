// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost as confirm } from './confirm'
import { onRequestPost as register } from './register'
import { codeStore, type CodeStore } from '../../lib/testEmailCodes'
import { getAuthedUser, SESSION_COOKIE } from '../../lib/auth/session'
import { verifyPassword } from '../../lib/auth/password'

/**
 * The /confirm link against a pre-registration takeover: the whole flow runs
 * through the real register and confirm endpoints over the stateful fake, with
 * the confirmation token read out of the (stubbed) email register sends.
 * All values are synthetic unit-test values.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Synthetic signing secret and mail config; fetch is stubbed so nothing is sent. */
const ENV = {
  JWT_SECRET: 'test-signing-secret-at-least-32-chars',
  SITE_URL: 'https://trip-one.pages.dev',
  MAIL_FROM: 'no-reply@txeas.com',
  BREVO_API_KEY: 'test-key',
}
const VICTIM = 'alex@example.com'

/** Stubs Brevo and returns the text bodies of the messages "sent". */
function stubMail(): string[] {
  const sent: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push((JSON.parse(String(init.body)) as { textContent: string }).textContent)
      return new Response('{}', { status: 201 })
    }),
  )
  return sent
}

/** Registers through the real endpoint; returns the session cookie and the mailed confirmation token. */
async function registerAccount(
  s: CodeStore,
  sent: string[],
  email: string,
  password: string,
): Promise<{ cookie: string; token: string }> {
  const res = await register({
    env: s.fake.env,
    request: new Request('https://trip-one.pages.dev/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.66' },
      body: JSON.stringify({ email, password }),
    }),
  })
  expect(res.status).toBe(201)
  const cookieMatch = (res.headers.get('Set-Cookie') ?? '').match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  const tokenMatch = (sent[sent.length - 1] ?? '').match(/\/confirm\?token=([0-9a-f]+)/)
  if (!cookieMatch || !tokenMatch) throw new Error('register did not produce a session and a confirmation link')
  return { cookie: `${SESSION_COOKIE}=${cookieMatch[1]}`, token: tokenMatch[1] }
}

/** POSTs a confirmation token, optionally with a session cookie. */
function confirmWith(s: CodeStore, token: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }
  if (cookie) headers.Cookie = cookie
  return confirm({
    env: s.fake.env,
    request: new Request('https://trip-one.pages.dev/api/auth/confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    }),
  })
}

/** Resolves a session cookie to its user, or null. */
function whoIs(s: CodeStore, cookie: string) {
  return getAuthedUser(s.fake.env, new Request('https://x/', { headers: { Cookie: cookie } }))
}

describe('POST /api/auth/confirm and pre-registration takeover', () => {
  it('confirming WITHOUT the account’s session resets the password and revokes existing sessions', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const attackerPassword = 'attacker-chosen-password'
    const attacker = await registerAccount(s, sent, VICTIM, attackerPassword)
    expect((await whoIs(s, attacker.cookie))?.emailVerified).toBe(false)

    // The victim clicks the link from their inbox, signed out.
    const res = await confirmWith(s, attacker.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: true, email: VICTIM, passwordReset: true })

    expect(s.users[0].email_verified).toBe(1)
    // The attacker's password no longer works.
    expect(await verifyPassword(attackerPassword, s.users[0].password_hash)).toBe(false)
    // The attacker's session from registration is dead.
    expect(await whoIs(s, attacker.cookie)).toBeNull()
  })

  it('confirming with ANOTHER user’s session is treated as no session', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const target = await registerAccount(s, sent, VICTIM, 'attacker-chosen-password')
    const other = await registerAccount(s, sent, 'blair@example.com', 'blair-own-password')
    const res = await confirmWith(s, target.token, other.cookie)
    expect(await res.json()).toEqual({ ok: true, email: VICTIM, passwordReset: true })
    expect(await whoIs(s, target.cookie)).toBeNull()
    // Blair's own account and session are untouched.
    expect((await whoIs(s, other.cookie))?.email).toBe('blair@example.com')
  })

  it('confirming WITH the account’s own session keeps the password and the session', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const password = 'owner-real-password'
    const owner = await registerAccount(s, sent, VICTIM, password)
    const hashBefore = s.users[0].password_hash
    const versionBefore = s.users[0].token_version

    const res = await confirmWith(s, owner.token, owner.cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: VICTIM, passwordReset: false })

    expect(s.users[0].email_verified).toBe(1)
    expect(s.users[0].password_hash).toBe(hashBefore)
    expect(s.users[0].token_version).toBe(versionBefore)
    expect(await verifyPassword(password, s.users[0].password_hash)).toBe(true)
    const session = await whoIs(s, owner.cookie)
    expect(session?.email).toBe(VICTIM)
    expect(session?.emailVerified).toBe(true)
  })

  it('still redeems a link only once', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const owner = await registerAccount(s, sent, VICTIM, 'owner-real-password')
    expect((await confirmWith(s, owner.token, owner.cookie)).status).toBe(200)
    expect((await confirmWith(s, owner.token)).status).toBe(400)
  })
})
