// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './confirm'
import { fakeD1 } from '../../lib/testD1'
import { sha256hex } from '../../lib/auth/tokens'

afterEach(() => {
  vi.restoreAllMocks()
})

function post(body: unknown): Request {
  return new Request('https://trip-one.pages.dev/api/auth/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/confirm', () => {
  it('returns 400 when the token is missing', async () => {
    const { env } = fakeD1()
    const res = await onRequestPost({ env, request: post({}) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an unknown, expired, or already-used token', async () => {
    const { env } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        return null
      },
    })
    const res = await onRequestPost({ env, request: post({ token: 'a'.repeat(32) }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/invalid or has expired/i)
  })

  it('marks the user verified and the token used, and returns the email', async () => {
    const token = 'b'.repeat(32)
    const hash = await sha256hex(token)
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('email_verifications')) {
          return { token_hash: hash, user_id: 'u1', expires_at: Date.now() + 60_000, used_at: null }
        }
        if (sql.includes('FROM users')) {
          return {
            id: 'u1',
            email: 'alex@example.com',
            password_hash: 'x',
            display_name: null,
            created_at: 't',
            token_version: 0,
            email_verified: 0,
          }
        }
        return null
      },
    })
    const res = await onRequestPost({ env, request: post({ token }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, email: 'alex@example.com' })
    expect(calls.some((c) => c.sql.includes('email_verified = 1'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('used_at') && c.sql.includes('email_verifications'))).toBe(true)
  })

  it('rejects an already-used token', async () => {
    const token = 'c'.repeat(32)
    const hash = await sha256hex(token)
    const { env } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('email_verifications')) {
          return { token_hash: hash, user_id: 'u1', expires_at: Date.now() + 60_000, used_at: Date.now() }
        }
        return null
      },
    })
    const res = await onRequestPost({ env, request: post({ token }) })
    expect(res.status).toBe(400)
  })
})
