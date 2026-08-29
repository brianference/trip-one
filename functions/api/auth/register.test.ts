// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './register'
import { fakeD1 } from '../../lib/testD1'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const SLOW = 30_000

function post(body: unknown): Request {
  return new Request('https://trip-one.pages.dev/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/register confirmation mail', () => {
  it('creates the account and still returns 201 when the confirmation send fails', { timeout: SLOW }, async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        return null
      },
      extraEnv: {
        JWT_SECRET: 'test-signing-secret-at-least-32-chars',
        SITE_URL: 'https://trip-one.pages.dev',
        MAIL_FROM: 'no-reply@txeas.com',
        BREVO_API_KEY: 'k',
      },
    })
    const res = await onRequestPost({
      env,
      request: post({ email: 'new@example.com', password: 'a-long-enough-password' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user: { email: string; emailVerified: boolean } }
    expect(body.user.email).toBe('new@example.com')
    expect(body.user.emailVerified).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO users'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO email_verifications'))).toBe(true)
  })
})
