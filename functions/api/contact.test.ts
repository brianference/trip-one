// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './contact'
import { fakeD1 } from '../lib/testD1'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function post(body: unknown): Request {
  return new Request('https://trip-one.pages.dev/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

const VALID = {
  name: 'Alex',
  email: 'alex@example.com',
  subject: 'A question about a trip',
  message: 'This is long enough to pass validation.',
}

describe('POST /api/contact', () => {
  it('returns 200 and writes nothing when the honeypot is filled', async () => {
    const { env, calls } = fakeD1({ extraEnv: { CONTACT_TO: 'ops@example.com', MAIL_FROM: 'no-reply@txeas.com' } })
    const res = await onRequestPost({ env, request: post({ ...VALID, website: 'https://spam.test' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.some((c) => c.sql.includes('contact_messages'))).toBe(false)
  })

  it('persists the message before attempting the send, and does not mark delivered on a stub', async () => {
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
      extraEnv: { CONTACT_TO: 'ops@example.com', MAIL_FROM: 'no-reply@txeas.com', JWT_SECRET: 's' },
    })
    const res = await onRequestPost({ env, request: post(VALID) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const insert = calls.find((c) => c.sql.includes('INSERT INTO contact_messages'))
    expect(insert).toBeDefined()
    expect(insert?.args).toContain('Alex')
    expect(calls.some((c) => c.sql.includes('delivered = 1'))).toBe(false)
  })

  it('marks delivered only after a successful send', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })))
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
      extraEnv: {
        CONTACT_TO: 'ops@example.com',
        MAIL_FROM: 'no-reply@txeas.com',
        BREVO_API_KEY: 'k',
        JWT_SECRET: 's',
      },
    })
    const res = await onRequestPost({ env, request: post(VALID) })
    expect(res.status).toBe(200)
    expect(calls.some((c) => c.sql.includes('INSERT INTO contact_messages'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('delivered = 1'))).toBe(true)
  })

  it('still returns 200 and keeps the row when Brevo fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
    const { env, calls } = fakeD1({
      first: (sql) => (sql.includes('COUNT(*)') ? { n: 0 } : null),
      extraEnv: {
        CONTACT_TO: 'ops@example.com',
        MAIL_FROM: 'no-reply@txeas.com',
        BREVO_API_KEY: 'k',
        JWT_SECRET: 's',
      },
    })
    const res = await onRequestPost({ env, request: post(VALID) })
    expect(res.status).toBe(200)
    expect(calls.some((c) => c.sql.includes('INSERT INTO contact_messages'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('delivered = 1'))).toBe(false)
  })
})
