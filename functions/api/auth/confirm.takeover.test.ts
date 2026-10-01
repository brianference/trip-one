// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost as confirm } from './confirm'
import { onRequestPost as register } from './register'
import { onRequestPost as deny } from './confirm/deny'
import { codeStore, type CodeStore } from '../../lib/testEmailCodes'
import { getAuthedUser, SESSION_COOKIE } from '../../lib/auth/session'
import { verifyPassword } from '../../lib/auth/password'
import { consumeEmailVerification } from '../../lib/db'
import { sqliteD1 } from '../../lib/testSqliteD1'

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

/** POSTs "This wasn't me" for a token. */
function denyWith(s: CodeStore, token: string): Promise<Response> {
  return deny({
    env: s.fake.env,
    request: new Request('https://trip-one.pages.dev/api/auth/confirm/deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
      body: JSON.stringify({ token }),
    }),
  })
}

/** A snapshot of the first user's account fields a confirm could change. */
function accountState(s: CodeStore) {
  const { password_hash, token_version, email_verified } = s.users[0]
  return { password_hash, token_version, email_verified }
}

describe('POST /api/auth/confirm and pre-registration takeover', () => {
  it('WITHOUT the account’s session: changes nothing, keeps the token, and asks them to sign in', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const attackerPassword = 'attacker-chosen-password'
    const attacker = await registerAccount(s, sent, VICTIM, attackerPassword)
    const before = accountState(s)

    // The victim clicks the link from their inbox, signed out.
    const res = await confirmWith(s, attacker.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: false, needsSignIn: true, email: VICTIM })

    // Nothing about the account moved, and the token is still unspent.
    expect(accountState(s)).toEqual(before)
    expect(s.verifications[0].used_at).toBeNull()
    expect(await verifyPassword(attackerPassword, s.users[0].password_hash)).toBe(true)
    expect((await whoIs(s, attacker.cookie))?.emailVerified).toBe(false)
  })

  it('with ANOTHER user’s session is treated as no session: needsSignIn, nothing changes for either account', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const target = await registerAccount(s, sent, VICTIM, 'attacker-chosen-password')
    const other = await registerAccount(s, sent, 'blair@example.com', 'blair-own-password')
    const before = accountState(s)
    const res = await confirmWith(s, target.token, other.cookie)
    expect(await res.json()).toEqual({ ok: false, needsSignIn: true, email: VICTIM })
    expect(accountState(s)).toEqual(before)
    expect((await whoIs(s, target.cookie))?.email).toBe(VICTIM)
    expect((await whoIs(s, other.cookie))?.email).toBe('blair@example.com')
    expect(s.verifications.find((v) => v.user_id === s.users[0].id)?.used_at).toBeNull()
  })

  it('WITH the account’s own session keeps the password and the session (unchanged behaviour)', async () => {
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

  it('a signed-out click does not burn the link: the owner can still confirm after signing in', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const owner = await registerAccount(s, sent, VICTIM, 'owner-real-password')
    expect(await (await confirmWith(s, owner.token)).json()).toMatchObject({ needsSignIn: true })
    expect(await (await confirmWith(s, owner.token, owner.cookie)).json()).toEqual({
      ok: true,
      email: VICTIM,
      passwordReset: false,
    })
  })

  it('still redeems a link only once', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const owner = await registerAccount(s, sent, VICTIM, 'owner-real-password')
    expect((await confirmWith(s, owner.token, owner.cookie)).status).toBe(200)
    expect((await confirmWith(s, owner.token, owner.cookie)).status).toBe(400)
    expect((await confirmWith(s, owner.token)).status).toBe(400)
  })
})

describe('POST /api/auth/confirm/deny ("This wasn’t me")', () => {
  it('spends the token and secures the unverified account: password and sessions revoked, verified', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const attackerPassword = 'attacker-chosen-password'
    const attacker = await registerAccount(s, sent, VICTIM, attackerPassword)

    const res = await denyWith(s, attacker.token)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: true })

    expect(s.verifications[0].used_at).not.toBeNull()
    expect(s.users[0].email_verified).toBe(1)
    expect(await verifyPassword(attackerPassword, s.users[0].password_hash)).toBe(false)
    expect(await whoIs(s, attacker.cookie)).toBeNull()
  })

  it('works once: a second deny, or a confirm after it, gets the invalid-link 400', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const attacker = await registerAccount(s, sent, VICTIM, 'attacker-chosen-password')
    expect((await denyWith(s, attacker.token)).status).toBe(200)
    const again = await denyWith(s, attacker.token)
    expect(again.status).toBe(400)
    expect(again.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await confirmWith(s, attacker.token)).status).toBe(400)
  })

  it('answers 400 for an unknown token and changes nothing', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    await registerAccount(s, sent, VICTIM, 'attacker-chosen-password')
    const before = accountState(s)
    expect((await denyWith(s, 'f'.repeat(64))).status).toBe(400)
    expect(accountState(s)).toEqual(before)
  })

  it('leaves an already-verified account as it is (the secure UPDATE is guarded on email_verified = 0)', async () => {
    const sent = stubMail()
    const s = codeStore(ENV)
    const owner = await registerAccount(s, sent, VICTIM, 'owner-real-password')
    // A link still in the inbox for an account that has since been verified.
    s.users[0].email_verified = 1
    const before = accountState(s)
    expect((await denyWith(s, owner.token)).status).toBe(200)
    expect(accountState(s)).toEqual(before)
    expect((await whoIs(s, owner.cookie))?.email).toBe(VICTIM)
  })
})

describe('consumeEmailVerification on real SQLite', () => {
  it('spends a live token exactly once, and never an expired one', async () => {
    const db = sqliteD1()
    const now = Date.now()
    db.exec(
      "INSERT INTO users (id, email, password_hash, display_name, created_at, token_version, email_verified) VALUES ('u1', 'a@example.com', 'x', NULL, 't', 0, 0)",
    )
    db.exec('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)', 'live', 'u1', now + 60_000)
    db.exec('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)', 'dead', 'u1', now - 1)
    const [first, second] = await Promise.all([
      consumeEmailVerification(db.env, 'live', now),
      consumeEmailVerification(db.env, 'live', now),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect(await consumeEmailVerification(db.env, 'dead', now)).toBe(false)
  })
})
