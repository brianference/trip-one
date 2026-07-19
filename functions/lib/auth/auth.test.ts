import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, needsRehash, PBKDF2_ITERATIONS } from './password'
import { signToken, verifyToken, TOKEN_TTL_SECONDS } from './jwt'
import { registerSchema, loginSchema, MIN_PASSWORD_LENGTH } from './validation'

// PBKDF2 at 600k iterations is intentionally slow; these are the real thing,
// not a mock, so give them room.
const SLOW = 30_000

describe('password hashing', () => {
  it('round-trips a correct password and rejects a wrong one', { timeout: SLOW }, async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('salts, so the same password hashes differently every time', { timeout: SLOW }, async () => {
    const [a, b] = [await hashPassword('same password here'), await hashPassword('same password here')]
    expect(a).not.toBe(b)
    expect(await verifyPassword('same password here', a)).toBe(true)
    expect(await verifyPassword('same password here', b)).toBe(true)
  })

  it('stores a self-describing hash and never the plaintext', { timeout: SLOW }, async () => {
    const hash = await hashPassword('a secret password')
    expect(hash.startsWith(`pbkdf2$sha256$${PBKDF2_ITERATIONS}$`)).toBe(true)
    expect(hash).not.toContain('a secret password')
    expect(hash.split('$')).toHaveLength(5)
  })

  // A corrupt row must fail the login, never throw and 500 the endpoint.
  it('returns false for malformed or unknown-algorithm hashes', async () => {
    for (const bad of ['', 'garbage', 'pbkdf2$sha256$notanumber$c2E=$ZA==', 'bcrypt$2b$12$xyz$abc', '$$$$']) {
      expect(await verifyPassword('anything', bad), bad).toBe(false)
    }
  })

  it('flags hashes made at a weaker work factor for upgrade', () => {
    expect(needsRehash(`pbkdf2$sha256$1000$c2E=$ZA==`)).toBe(true)
    expect(needsRehash(`pbkdf2$sha256$${PBKDF2_ITERATIONS}$c2E=$ZA==`)).toBe(false)
    expect(needsRehash('garbage')).toBe(true)
  })
})

describe('jwt', () => {
  const secret = 'test-signing-secret'
  const now = 1_700_000_000

  it('round-trips a token', async () => {
    const token = await signToken('user-1', 3, secret, now)
    const payload = await verifyToken(token, secret, now)
    expect(payload?.sub).toBe('user-1')
    expect(payload?.ver).toBe(3)
    expect(payload?.exp).toBe(now + TOKEN_TTL_SECONDS)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken('user-1', 0, secret, now)
    expect(await verifyToken(token, 'other-secret', now)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const token = await signToken('user-1', 0, secret, now)
    const [header, , sig] = token.split('.')
    const forged = btoa(JSON.stringify({ sub: 'admin', ver: 0, iat: now, exp: now + 999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(await verifyToken(`${header}.${forged}.${sig}`, secret, now)).toBeNull()
  })

  // The classic JWT bypass: swap the algorithm to `none` and drop the
  // signature. The verifier never reads the header's alg, so this can't work.
  it('rejects an alg:none token', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '')
    const body = btoa(JSON.stringify({ sub: 'admin', ver: 0, iat: now, exp: now + 999 })).replace(/=+$/, '')
    expect(await verifyToken(`${header}.${body}.`, secret, now)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signToken('user-1', 0, secret, now)
    expect(await verifyToken(token, secret, now + TOKEN_TTL_SECONDS + 1)).toBeNull()
  })

  it('rejects malformed tokens without throwing', async () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c.d', '...', 'not-a-token']) {
      expect(await verifyToken(bad, secret, now), bad).toBeNull()
    }
  })
})

describe('credential validation', () => {
  it('requires a real email and a long-enough password', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(MIN_PASSWORD_LENGTH) }).success).toBe(true)
    expect(registerSchema.safeParse({ email: 'not-an-email', password: 'x'.repeat(20) }).success).toBe(false)
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
  })

  it('caps password length, so PBKDF2 cannot be used as a DoS lever', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(5000) }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(5000) }).success).toBe(false)
  })

  // An existing password that predates a rule change must still be able to log
  // in, so login only bounds the length rather than enforcing the minimum.
  it('lets an old short password still attempt login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'old' }).success).toBe(true)
  })

  it('normalizes surrounding whitespace on email', () => {
    const parsed = registerSchema.safeParse({ email: '  Person@Example.com  ', password: 'x'.repeat(12) })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.email).toBe('Person@Example.com')
  })
})

// The work factor is capped by the Workers CPU limit, so a pepper carries the
// weight instead: a stolen database alone is unusable without the secret, which
// lives in the Worker environment rather than in the database.
describe('peppered hashing', () => {
  const PEPPER = 'server-side-pepper-secret'

  it('round-trips with the pepper', { timeout: SLOW }, async () => {
    const hash = await hashPassword('a-long-enough-password', PEPPER)
    expect(await verifyPassword('a-long-enough-password', hash, PEPPER)).toBe(true)
    expect(await verifyPassword('wrong-password-here', hash, PEPPER)).toBe(false)
  })

  // The whole point: the digest cannot be attacked without the secret.
  it('cannot be verified without the pepper, or with the wrong one', { timeout: SLOW }, async () => {
    const hash = await hashPassword('a-long-enough-password', PEPPER)
    expect(await verifyPassword('a-long-enough-password', hash)).toBe(false)
    expect(await verifyPassword('a-long-enough-password', hash, 'wrong-pepper')).toBe(false)
  })

  it('marks peppered hashes distinctly from legacy ones', { timeout: SLOW }, async () => {
    expect((await hashPassword('a-long-enough-password', PEPPER)).startsWith('pbkdf2p$sha256$')).toBe(true)
    expect((await hashPassword('a-long-enough-password')).startsWith('pbkdf2$sha256$')).toBe(true)
  })

  // Existing accounts must keep working and gain the pepper on next login.
  it('still verifies legacy un-peppered hashes and flags them for upgrade', { timeout: SLOW }, async () => {
    const legacy = await hashPassword('a-long-enough-password')
    expect(await verifyPassword('a-long-enough-password', legacy, PEPPER)).toBe(true)
    expect(needsRehash(legacy, true)).toBe(true)
    expect(needsRehash(legacy, false)).toBe(false)
  })

  it('does not re-flag an already-peppered hash', { timeout: SLOW }, async () => {
    expect(needsRehash(await hashPassword('a-long-enough-password', PEPPER), true)).toBe(false)
  })
})
