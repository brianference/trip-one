// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { onRequestPost } from './confirm-request'
import { fakeD1 } from '../../lib/testD1'
import { signToken } from '../../lib/auth/jwt'

const SECRET = 'test-signing-secret-at-least-32-chars'

async function authedRequest(userId: string, ver = 0): Promise<Request> {
  const token = await signToken(userId, ver, SECRET)
  return new Request('https://trip-one.pages.dev/api/auth/confirm-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  })
}

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'alex@example.com',
    password_hash: 'x',
    display_name: null,
    created_at: 't',
    token_version: 0,
    email_verified: 0,
    ...over,
  }
}

describe('POST /api/auth/confirm-request', () => {
  it('returns 401 when nobody is signed in', async () => {
    const { env } = fakeD1({ extraEnv: { JWT_SECRET: SECRET, SITE_URL: 'https://trip-one.pages.dev' } })
    const res = await onRequestPost({
      env,
      request: new Request('https://x/api/auth/confirm-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: '{}',
      }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 and does not mint a token when already confirmed', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('FROM users')) return userRow({ email_verified: 1 })
        return null
      },
      extraEnv: { JWT_SECRET: SECRET, SITE_URL: 'https://trip-one.pages.dev' },
    })
    const res = await onRequestPost({ env, request: await authedRequest('u1') })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.some((c) => c.sql.includes('email_verifications'))).toBe(false)
  })

  it('mints a new confirmation token for an unverified user', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('FROM users')) return userRow()
        return null
      },
      extraEnv: { JWT_SECRET: SECRET, SITE_URL: 'https://trip-one.pages.dev' },
    })
    const res = await onRequestPost({ env, request: await authedRequest('u1') })
    expect(res.status).toBe(200)
    expect(calls.some((c) => c.sql.includes('INSERT INTO email_verifications'))).toBe(true)
  })
})
