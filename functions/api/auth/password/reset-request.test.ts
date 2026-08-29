// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './reset-request'
import { fakeD1 } from '../../../lib/testD1'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function post(body: unknown): Request {
  return new Request('https://trip-one.pages.dev/api/auth/password/reset-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

const MAIL = { SITE_URL: 'https://trip-one.pages.dev', MAIL_FROM: 'no-reply@txeas.com' }

describe('POST /api/auth/password/reset-request', () => {
  it('always returns 200 for an unknown account and does not insert a token', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        return null
      },
      extraEnv: MAIL,
    })
    const res = await onRequestPost({ env, request: post({ email: 'nobody@example.com' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.some((c) => c.sql.includes('password_resets'))).toBe(false)
  })

  it('mints a hashed token and stubs the send when the account exists', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('FROM users')) {
          return {
            id: 'u1',
            email: 'alex@example.com',
            password_hash: 'x',
            display_name: null,
            created_at: 't',
            token_version: 0,
            email_verified: 1,
          }
        }
        return null
      },
      extraEnv: MAIL,
    })
    const res = await onRequestPost({ env, request: post({ email: 'alex@example.com' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const insert = calls.find((c) => c.sql.includes('INSERT INTO password_resets'))
    expect(insert).toBeDefined()
    // The bound token_hash is 64 hex chars, not the plaintext token.
    expect(insert?.args[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(insert?.args[1]).toBe('u1')
  })

  it('still returns 200 when the send path throws', async () => {
    const { env } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('FROM users')) {
          return {
            id: 'u1',
            email: 'alex@example.com',
            password_hash: 'x',
            display_name: null,
            created_at: 't',
            token_version: 0,
            email_verified: 1,
          }
        }
        return null
      },
      extraEnv: { ...MAIL, BREVO_API_KEY: 'k' },
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
    const res = await onRequestPost({ env, request: post({ email: 'alex@example.com' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
