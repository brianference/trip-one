// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { onRequestPost } from './reset'
import { fakeD1 } from '../../../lib/testD1'
import { sha256hex } from '../../../lib/auth/tokens'

afterEach(() => vi.restoreAllMocks())

const SLOW = 30_000

function post(body: unknown): Request {
  return new Request('https://trip-one.pages.dev/api/auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/password/reset', () => {
  it('returns 400 for an unknown token', async () => {
    const { env } = fakeD1({ first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null) })
    const res = await onRequestPost({ env, request: post({ token: 'a'.repeat(32), password: 'new-password-here' }) })
    expect(res.status).toBe(400)
  })

  it('rejects a confirmation token — reset looks only at password_resets', async () => {
    const token = 'd'.repeat(32)
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('email_verifications')) {
          return { token_hash: 'x', user_id: 'u1', expires_at: Date.now() + 60_000, used_at: null }
        }
        return null
      },
    })
    const res = await onRequestPost({ env, request: post({ token, password: 'new-password-here' }) })
    expect(res.status).toBe(400)
    expect(calls.some((c) => c.sql.includes('email_verifications'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('password_resets'))).toBe(true)
  })

  it('sets the new hash, marks the token used, and bumps token_version', { timeout: SLOW }, async () => {
    const token = 'e'.repeat(32)
    const hash = await sha256hex(token)
    const { env, calls } = fakeD1({
      first: (sql) => {
        if (sql.includes('COUNT(*)')) return { n: 0 }
        if (sql.includes('password_resets')) {
          return { token_hash: hash, user_id: 'u1', expires_at: Date.now() + 60_000, used_at: null }
        }
        return null
      },
    })
    const res = await onRequestPost({ env, request: post({ token, password: 'new-password-here' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const updateUser = calls.find((c) => c.sql.includes('token_version = token_version + 1'))
    expect(updateUser).toBeDefined()
    expect(updateUser?.sql).toContain('password_hash = ?')
    expect(calls.some((c) => c.sql.includes('used_at') && c.sql.includes('password_resets'))).toBe(true)
  })
})
