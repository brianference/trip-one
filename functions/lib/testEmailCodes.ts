import { fakeD1, type FakeD1 } from './testD1'
import type { EmailCodeRow, UserRow } from './db'

/**
 * A stateful fake D1 for the email-code sign-in tests.
 *
 * It keeps real `email_codes`, `users` and `request_log` tables in memory and
 * honours the WHERE clause of every statement the code path runs (email scope,
 * `used_at IS NULL`, expiry, the attempts cap), so a query that dropped one of
 * those conditions would be caught rather than papered over. Any statement it
 * does not recognise throws, so new SQL cannot silently no-op in a test.
 *
 * All values are synthetic unit-test values; none render in the product.
 */
export interface CodeStore {
  fake: FakeD1
  codes: EmailCodeRow[]
  users: UserRow[]
  /** Trip ids passed to claimTripForUser, with the claiming user. */
  claims: { tripId: string; userId: string }[]
  requestLog: { ipHash: string; endpoint: string; createdAt: string }[]
}

/**
 * Builds the in-memory store and a fake D1 env over it.
 * @param extraEnv - Extra env fields (JWT_SECRET, mail config)
 */
export function codeStore(extraEnv: Record<string, unknown> = {}): CodeStore {
  const codes: EmailCodeRow[] = []
  const users: UserRow[] = []
  const claims: { tripId: string; userId: string }[] = []
  const requestLog: { ipHash: string; endpoint: string; createdAt: string }[] = []

  const first = (sql: string, args: unknown[]): unknown => {
    if (sql.includes('FROM request_log WHERE ip_hash = ? AND endpoint = ?')) {
      const [ipHash, endpoint, since] = args as [string, string, string]
      return { n: requestLog.filter((r) => r.ipHash === ipHash && r.endpoint === endpoint && r.createdAt >= since).length }
    }
    if (sql.includes('COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at >= ?')) {
      const [email, since] = args as [string, number]
      return { n: codes.filter((c) => c.email === email && c.created_at >= since).length }
    }
    if (
      sql.includes('FROM email_codes') &&
      sql.includes('WHERE email = ? AND used_at IS NULL AND expires_at > ?') &&
      sql.includes('ORDER BY created_at DESC, id DESC LIMIT 1')
    ) {
      const [email, now] = args as [string, number]
      const live = codes
        .filter((c) => c.email === email && c.used_at === null && c.expires_at > now)
        .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      return live[0] ? { ...live[0] } : null
    }
    if (sql === 'SELECT * FROM users WHERE email = ?') return users.find((u) => u.email === args[0]) ?? null
    if (sql === 'SELECT * FROM users WHERE id = ?') return users.find((u) => u.id === args[0]) ?? null
    throw new Error(`codeStore: unexpected first() SQL: ${sql}`)
  }

  const run = (sql: string, args: unknown[]): number => {
    if (sql.startsWith('INSERT INTO request_log')) {
      const [ipHash, endpoint, createdAt] = args as [string, string, string]
      requestLog.push({ ipHash, endpoint, createdAt })
      return 1
    }
    if (sql === 'DELETE FROM email_codes WHERE created_at < ?') {
      const [before] = args as [number]
      const keep = codes.filter((c) => c.created_at >= before)
      const removed = codes.length - keep.length
      codes.splice(0, codes.length, ...keep)
      return removed
    }
    if (sql === 'UPDATE email_codes SET expires_at = ? WHERE email = ? AND used_at IS NULL AND expires_at > ?') {
      const [expiresAt, email, now] = args as [number, string, number]
      const hit = codes.filter((c) => c.email === email && c.used_at === null && c.expires_at > now)
      for (const c of hit) c.expires_at = expiresAt
      return hit.length
    }
    if (sql.startsWith('INSERT INTO email_codes')) {
      const [id, email, codeHash, expiresAt, createdAt] = args as [string, string, string, number, number]
      codes.push({ id, email, code_hash: codeHash, expires_at: expiresAt, attempts: 0, used_at: null, created_at: createdAt })
      return 1
    }
    if (sql === 'UPDATE email_codes SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < ?') {
      const [id, max] = args as [string, number]
      const row = codes.find((c) => c.id === id && c.used_at === null && c.attempts < max)
      if (!row) return 0
      row.attempts += 1
      return 1
    }
    if (sql === 'UPDATE email_codes SET used_at = ? WHERE id = ? AND used_at IS NULL') {
      const [usedAt, id] = args as [number, string]
      const row = codes.find((c) => c.id === id && c.used_at === null)
      if (!row) return 0
      row.used_at = usedAt
      return 1
    }
    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, passwordHash, displayName, createdAt, emailVerified] = args as [
        string,
        string,
        string,
        string | null,
        string,
        number,
      ]
      if (users.some((u) => u.email === email)) throw new Error('UNIQUE constraint failed: users.email')
      users.push({
        id,
        email,
        password_hash: passwordHash,
        display_name: displayName,
        created_at: createdAt,
        token_version: 0,
        email_verified: emailVerified,
      })
      return 1
    }
    if (
      sql ===
      'UPDATE users SET password_hash = ?, token_version = token_version + 1, email_verified = 1 WHERE id = ? AND email_verified = 0'
    ) {
      const [passwordHash, id] = args as [string, string]
      const row = users.find((u) => u.id === id && u.email_verified === 0)
      if (!row) return 0
      row.password_hash = passwordHash
      row.token_version += 1
      row.email_verified = 1
      return 1
    }
    if (sql === 'UPDATE users SET email_verified = 1 WHERE id = ?') {
      const row = users.find((u) => u.id === args[0])
      if (row) row.email_verified = 1
      return row ? 1 : 0
    }
    if (sql === 'UPDATE trips SET user_id = ? WHERE id = ? AND user_id IS NULL') {
      const [userId, tripId] = args as [string, string]
      claims.push({ tripId, userId })
      return 1
    }
    throw new Error(`codeStore: unexpected run() SQL: ${sql}`)
  }

  const fake = fakeD1({ first, run, extraEnv })
  return { fake, codes, users, claims, requestLog }
}
