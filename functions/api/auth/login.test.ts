// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { onRequestPost } from './login'
import { codeStore, type CodeStore } from '../../lib/testEmailCodes'
import { hashPassword, verifyPassword } from '../../lib/auth/password'

/**
 * Login's transparent rehash must not overwrite a hash that changed after the
 * login read it (a reset, or a takeover secured by email proof). All values
 * are synthetic unit-test values.
 */

/** Synthetic signing secret and pepper for tests only. */
const ENV = { JWT_SECRET: 'test-signing-secret-at-least-32-chars', PASSWORD_PEPPER: 'test-pepper-value' }
const EMAIL = 'alex@example.com'
const PASSWORD = 'owner-real-password'

/** A store holding one account with an UN-peppered hash, so login (with a pepper set) wants to rehash it. */
async function storeWithLegacyHash(): Promise<CodeStore> {
  const s = codeStore(ENV)
  s.users.push({
    id: 'u1',
    email: EMAIL,
    password_hash: await hashPassword(PASSWORD),
    display_name: null,
    created_at: 't',
    token_version: 0,
    email_verified: 1,
  })
  return s
}

function login(s: CodeStore): Promise<Response> {
  return onRequestPost({
    env: s.fake.env,
    request: new Request('https://trip-one.pages.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }),
  })
}

describe('POST /api/auth/login rehash', () => {
  it('upgrades a legacy hash when nothing changed it in between', async () => {
    const s = await storeWithLegacyHash()
    const res = await login(s)
    expect(res.status).toBe(200)
    expect(s.users[0].password_hash.startsWith('pbkdf2p$')).toBe(true)
    expect(await verifyPassword(PASSWORD, s.users[0].password_hash, ENV.PASSWORD_PEPPER)).toBe(true)
  })

  it('does not overwrite a hash that was replaced after login read it', async () => {
    const s = await storeWithLegacyHash()
    const securedHash = await hashPassword('someone-else-secured-this', ENV.PASSWORD_PEPPER)
    // Simulate a concurrent reset: right after login's user lookup returns, the stored hash changes.
    const db = s.fake.env.DB as unknown as { prepare: (sql: string) => { first: () => Promise<unknown> } }
    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      const stmt = originalPrepare(sql)
      if (sql === 'SELECT * FROM users WHERE email = ?') {
        const originalFirst = stmt.first.bind(stmt)
        stmt.first = async () => {
          const row = await originalFirst()
          s.users[0].password_hash = securedHash
          return row
        }
      }
      return stmt
    }

    // Login itself still succeeds: the password matched the hash it read.
    expect((await login(s)).status).toBe(200)
    expect(s.users[0].password_hash).toBe(securedHash)
    const rehash = s.fake.calls.find((c) => c.sql.startsWith('UPDATE users SET password_hash'))
    expect(rehash?.sql).toContain('AND password_hash = ?')
  })
})
