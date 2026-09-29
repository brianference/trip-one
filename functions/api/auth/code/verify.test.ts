// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { onRequestPost } from './verify'
import { codeStore, type CodeStore } from '../../../lib/testEmailCodes'
import { CODE_TTL_MS, MAX_CODE_ATTEMPTS, issueEmailCode } from '../../../lib/auth/emailCode'
import { getAuthedUser, SESSION_COOKIE } from '../../../lib/auth/session'
import { verifyPassword } from '../../../lib/auth/password'

/** Synthetic signing secret for tests only. */
const SECRET = 'test-signing-secret-at-least-32-chars'
const FAILED = { error: "That code didn't work. Check it or request a new one." }
const ALEX = 'alex@example.com'
const BLAIR = 'blair@example.com'

function post(body: unknown, ip = '203.0.113.9'): Request {
  return new Request('https://trip-one.pages.dev/api/auth/code/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  })
}

function store(): CodeStore {
  return codeStore({ JWT_SECRET: SECRET })
}

/** A 6-digit code guaranteed to differ from `code`. */
function wrongCode(code: string): string {
  return code === '000000' ? '000001' : '000000'
}

async function verify(s: CodeStore, body: unknown, ip?: string): Promise<Response> {
  return onRequestPost({ env: s.fake.env, request: post(body, ip) })
}

/** Pulls the session token out of a Set-Cookie header. */
function sessionToken(res: Response): string {
  const cookie = res.headers.get('Set-Cookie') ?? ''
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!match) throw new Error(`no session cookie in: ${cookie}`)
  return match[1]
}

describe('POST /api/auth/code/verify', () => {
  it('signs in with the right code, creating a verified account named from the email', async () => {
    const s = store()
    const code = (await issueEmailCode(s.fake.env, ALEX)) as string
    const res = await verify(s, { email: 'Alex@Example.com', code })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await res.json()) as { user: { id: string } }
    expect(body).toEqual({ user: { id: s.users[0].id, email: ALEX, displayName: 'alex', emailVerified: true } })

    expect(s.users).toHaveLength(1)
    expect(s.users[0].email_verified).toBe(1)
    // The password hash is real PBKDF2 output of a discarded secret: no guessable password matches it.
    expect(s.users[0].password_hash).toMatch(/^pbkdf2\$sha256\$/)
    expect(await verifyPassword('', s.users[0].password_hash)).toBe(false)

    // The cookie is a working session for that user, exactly like login's.
    const cookie = res.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    const authed = await getAuthedUser(
      s.fake.env,
      new Request('https://x/', { headers: { Cookie: `${SESSION_COOKIE}=${sessionToken(res)}` } }),
    )
    expect(authed?.id).toBe(body.user.id)
  })

  it('creates the user once and reuses it on the second sign-in', async () => {
    const s = store()
    const first = await verify(s, { email: ALEX, code: await issueEmailCode(s.fake.env, ALEX) })
    const second = await verify(s, { email: ALEX, code: await issueEmailCode(s.fake.env, ALEX) })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(s.users).toHaveLength(1)
    const a = (await first.json()) as { user: { id: string } }
    const b = (await second.json()) as { user: { id: string } }
    expect(b.user.id).toBe(a.user.id)
  })

  it('signs in an existing password account and marks its email verified', async () => {
    const s = store()
    s.users.push({
      id: 'existing-user',
      email: ALEX,
      password_hash: 'pbkdf2$sha256$1$AA==$AA==',
      display_name: 'Alex R',
      created_at: 't',
      token_version: 3,
      email_verified: 0,
    })
    const res = await verify(s, { email: ALEX, code: await issueEmailCode(s.fake.env, ALEX) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      user: { id: 'existing-user', email: ALEX, displayName: 'Alex R', emailVerified: true },
    })
    expect(s.users).toHaveLength(1)
    expect(s.users[0].email_verified).toBe(1)
    expect(s.users[0].password_hash).toBe('pbkdf2$sha256$1$AA==$AA==')
  })

  it('rejects a wrong code with the generic message and counts the attempt', async () => {
    const s = store()
    const code = (await issueEmailCode(s.fake.env, ALEX)) as string
    const res = await verify(s, { email: ALEX, code: wrongCode(code) })
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Set-Cookie')).toBeNull()
    expect(await res.json()).toEqual(FAILED)
    expect(s.codes[0].attempts).toBe(1)
    expect(s.users).toHaveLength(0)
  })

  it('fails the 6th attempt even with the right code', async () => {
    const s = store()
    const code = (await issueEmailCode(s.fake.env, ALEX)) as string
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      expect((await verify(s, { email: ALEX, code: wrongCode(code) })).status).toBe(400)
    }
    const sixth = await verify(s, { email: ALEX, code })
    expect(sixth.status).toBe(400)
    expect(await sixth.json()).toEqual(FAILED)
    expect(sixth.headers.get('Set-Cookie')).toBeNull()
    expect(s.users).toHaveLength(0)
  })

  it('rejects an expired code', async () => {
    const s = store()
    const code = (await issueEmailCode(s.fake.env, ALEX, Date.now() - CODE_TTL_MS - 1)) as string
    const res = await verify(s, { email: ALEX, code })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(FAILED)
    expect(s.users).toHaveLength(0)
  })

  it('rejects a code sent to email A when used for email B', async () => {
    const s = store()
    const alexCode = (await issueEmailCode(s.fake.env, ALEX)) as string
    const res = await verify(s, { email: BLAIR, code: alexCode })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(FAILED)
    expect(res.headers.get('Set-Cookie')).toBeNull()
    expect(s.users).toHaveLength(0)
  })

  it('works only once per code', async () => {
    const s = store()
    const code = (await issueEmailCode(s.fake.env, ALEX)) as string
    expect((await verify(s, { email: ALEX, code })).status).toBe(200)
    const replay = await verify(s, { email: ALEX, code })
    expect(replay.status).toBe(400)
    expect(await replay.json()).toEqual(FAILED)
  })

  it('answers a malformed code with the same generic message', async () => {
    const s = store()
    const res = await verify(s, { email: ALEX, code: '12ab' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(FAILED)
  })

  it('claims an anonymous trip on sign-in, like login', async () => {
    const s = store()
    const res = await verify(s, { email: ALEX, code: await issueEmailCode(s.fake.env, ALEX), claimTripId: 'trip-123' })
    expect(res.status).toBe(200)
    expect(s.claims).toEqual([{ tripId: 'trip-123', userId: s.users[0].id }])
  })

  it('limits one IP to 30 verifies an hour', async () => {
    const s = store()
    for (let i = 0; i < 30; i += 1) {
      expect((await verify(s, { email: `p${i}@example.com`, code: '123456' })).status).toBe(400)
    }
    const limited = await verify(s, { email: ALEX, code: '123456' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
