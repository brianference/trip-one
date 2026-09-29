// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { isRateLimited, REQUEST_LOG_PURGE_ONE_IN, REQUEST_LOG_RETENTION_MS } from './rateLimitGuard'
import { purgeRequestLogBefore } from './db'
import { fakeD1 } from './testD1'
import { sqliteD1 } from './testSqliteD1'
import { logger } from '../../src/lib/logger'

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
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { env } = fakeD1({ fail: true })
    expect(await isRateLimited(env, req(), 'auth-login', 5)).toBe(false)
  })
})

describe('request_log purge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A real SQLite request_log holding one row 3 hours old and one 10 minutes old. */
  function seeded() {
    const db = sqliteD1()
    const now = Date.now()
    db.exec('INSERT INTO request_log (ip_hash, endpoint, created_at) VALUES (?, ?, ?)', 'old', 'x', new Date(now - 3 * 60 * 60 * 1000).toISOString())
    db.exec('INSERT INTO request_log (ip_hash, endpoint, created_at) VALUES (?, ?, ?)', 'new', 'x', new Date(now - 10 * 60 * 1000).toISOString())
    return db
  }

  it(`purges rows older than 2 hours when the 1-in-${REQUEST_LOG_PURGE_ONE_IN} roll hits, keeping recent ones`, async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const db = seeded()
    expect(await isRateLimited(db.env, req(), 'auth-login', 20)).toBe(false)
    const left = db.rows<{ ip_hash: string }>('SELECT ip_hash FROM request_log ORDER BY id')
    expect(left.map((r) => r.ip_hash)).toEqual(['new', expect.any(String)])
    expect(REQUEST_LOG_RETENTION_MS).toBe(2 * 60 * 60 * 1000)
    expect(REQUEST_LOG_PURGE_ONE_IN).toBe(50)
  })

  it('does not purge when the roll misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1 / REQUEST_LOG_PURGE_ONE_IN)
    const db = seeded()
    await isRateLimited(db.env, req(), 'auth-login', 20)
    expect(db.rows('SELECT id FROM request_log')).toHaveLength(3)
  })

  it('never purges on a request that was refused (the limit is spent, nothing was written)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { env, calls } = envWithCount(10)
    expect(await isRateLimited(env, req(), 'auth-register', 10)).toBe(true)
    expect(calls.some((c) => c.sql.includes('DELETE FROM request_log'))).toBe(false)
  })

  it('still allows the request when the purge itself fails', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
      run: (sql) => {
        if (sql.includes('DELETE FROM request_log')) throw new Error('D1 write failed')
        return 1
      },
    })
    expect(await isRateLimited(env, req(), 'auth-login', 5)).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO request_log'))).toBe(true)
    expect(warn).toHaveBeenCalledWith('request_log purge failed; will retry on a later request')
  })

  it('purgeRequestLogBefore deletes every row when none is recent, and nothing from an empty table', async () => {
    const db = seeded()
    expect(await purgeRequestLogBefore(db.env, new Date(Date.now() + 60_000).toISOString())).toBe(2)
    expect(await purgeRequestLogBefore(db.env, new Date().toISOString())).toBe(0)
  })

  it('the per-endpoint count uses the (ip_hash, endpoint, created_at) index from 0008', () => {
    const db = sqliteD1()
    const plan = db.rows<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT COUNT(*) AS n FROM request_log WHERE ip_hash = 'a' AND endpoint = 'b' AND created_at >= 'c'",
    )
    expect(plan.map((p) => p.detail).join(' ')).toContain('request_log_ip_endpoint_created_idx')
  })

  it('0008 drops the old (ip_hash, created_at) index, and the count without an endpoint still uses an index', () => {
    const db = sqliteD1()
    const indexes = db.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'request_log'")
    expect(indexes.map((i) => i.name)).not.toContain('request_log_ip_hash_created_at_idx')
    const plan = db.rows<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT COUNT(*) AS n FROM request_log WHERE ip_hash = 'a' AND created_at >= 'c'",
    )
    const detail = plan.map((p) => p.detail).join(' ')
    expect(detail).toContain('USING COVERING INDEX request_log_ip_endpoint_created_idx (ip_hash=?)')
    expect(detail).not.toMatch(/\bSCAN request_log\b/)
  })
})
