import { describe, it, expect } from 'vitest'
import { isRateLimited } from './rateLimitGuard'
import { fakeD1 } from './testD1'

function envWithCount(count: number) {
  return fakeD1({ first: (sql) => (sql.includes('COUNT(*)') ? { n: count } : null) })
}

function req(ip = '203.0.113.9'): Request {
  return new Request('https://x/api/whatever', { method: 'POST', headers: { 'CF-Connecting-IP': ip } })
}

describe('isRateLimited', () => {
  it('allows a caller under the limit', async () => {
    const { env } = envWithCount(3)
    expect(await isRateLimited(env, req(), 'auth-register', 10)).toBe(false)
  })

  it('blocks a caller at the limit', async () => {
    const { env } = envWithCount(10)
    expect(await isRateLimited(env, req(), 'auth-register', 10)).toBe(true)
  })

  // The bug this test exists for: the count was not scoped to an endpoint, so
  // every per-route limit shared one budget and the effective limit was the
  // smallest across all routes. Planning a trip spends dozens of calls, which
  // consumed registration's allowance of 10 and made signing up impossible.
  it('counts only the endpoint being limited', async () => {
    const { env, calls } = envWithCount(1)
    await isRateLimited(env, req(), 'auth-register', 10)
    const countQuery = calls.find((c) => c.sql.includes('COUNT(*)'))
    expect(countQuery).toBeDefined()
    expect(countQuery?.sql).toContain('endpoint = ?')
    expect(countQuery?.args).toContain('auth-register')
  })

  it('records the request against that endpoint once allowed', async () => {
    const { env, calls } = envWithCount(1)
    await isRateLimited(env, req(), 'auth-login', 20)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO request_log'))
    expect(insert?.args).toContain('auth-login')
  })

  // These limits guard routes that should stay available; a bookkeeping blip
  // must not lock everyone out.
  it('fails open when the rate-limit bookkeeping itself errors', async () => {
    const { env } = fakeD1({ fail: true })
    expect(await isRateLimited(env, req(), 'auth-login', 5)).toBe(false)
  })
})
