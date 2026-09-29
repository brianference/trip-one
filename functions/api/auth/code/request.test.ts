// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestPost } from './request'
import { codeStore } from '../../../lib/testEmailCodes'
import { sha256hex } from '../../../lib/auth/tokens'
import { MAX_CODES_PER_EMAIL_PER_HOUR } from '../../../lib/auth/emailCode'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Synthetic mail config; fetch is stubbed so nothing is sent. */
const MAIL = { SITE_URL: 'https://trip-one.pages.dev', MAIL_FROM: 'no-reply@txeas.com', BREVO_API_KEY: 'test-key' }

function post(body: unknown, ip = '203.0.113.9'): Request {
  return new Request('https://trip-one.pages.dev/api/auth/code/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  })
}

/** Stubs Brevo and returns the list of messages "sent". */
function stubMail(): { to: string; subject: string; html: string; text: string }[] {
  const sent: { to: string; subject: string; html: string; text: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        to: { email: string }[]
        subject: string
        htmlContent: string
        textContent: string
      }
      sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent, text: body.textContent })
      return new Response('{}', { status: 201 })
    }),
  )
  return sent
}

/** Reads the 6-digit code out of a sent message. */
function codeFrom(text: string): string {
  const match = text.match(/sign-in code is (\d{6})\./)
  if (!match) throw new Error(`no code in: ${text}`)
  return match[1]
}

describe('POST /api/auth/code/request', () => {
  it('emails a code, stores only its email-bound hash, and answers {ok:true} with no-store', async () => {
    const sent = stubMail()
    const store = codeStore(MAIL)
    const res = await onRequestPost({ env: store.fake.env, request: post({ email: ' Alex@Example.com ' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: true })

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('alex@example.com')
    expect(sent[0].subject).not.toMatch(/\d{6}/)
    const code = codeFrom(sent[0].text)
    expect(sent[0].text).toContain(`Your Trip One sign-in code is ${code}. It expires in 10 minutes.`)
    expect(store.codes).toHaveLength(1)
    expect(store.codes[0].code_hash).toBe(await sha256hex(`alex@example.com:${code}`))
  })

  it('answers identically, and does the same work, for an email with and without an account', async () => {
    const sent = stubMail()
    const store = codeStore(MAIL)
    store.users.push({
      id: 'u1',
      email: 'known@example.com',
      password_hash: 'x',
      display_name: null,
      created_at: 't',
      token_version: 0,
      email_verified: 1,
    })
    const known = await onRequestPost({ env: store.fake.env, request: post({ email: 'known@example.com' }) })
    const unknown = await onRequestPost({ env: store.fake.env, request: post({ email: 'nobody@example.com' }) })

    expect(unknown.status).toBe(known.status)
    expect([...unknown.headers.entries()]).toEqual([...known.headers.entries()])
    expect(await unknown.text()).toBe(await known.text())
    // Both got a code and an email: the server never looks the account up here.
    expect(sent.map((m) => m.to)).toEqual(['known@example.com', 'nobody@example.com'])
    expect(store.codes.map((c) => c.email)).toEqual(['known@example.com', 'nobody@example.com'])
    expect(store.fake.calls.some((c) => c.sql.includes('FROM users'))).toBe(false)
  })

  it('stops sending after 5 codes per email per hour but still answers {ok:true}', async () => {
    const sent = stubMail()
    const store = codeStore(MAIL)
    const responses: string[] = []
    for (let i = 0; i <= MAX_CODES_PER_EMAIL_PER_HOUR; i += 1) {
      const res = await onRequestPost({ env: store.fake.env, request: post({ email: 'alex@example.com' }) })
      expect(res.status).toBe(200)
      responses.push(await res.text())
    }
    expect(new Set(responses)).toEqual(new Set([JSON.stringify({ ok: true })]))
    expect(sent).toHaveLength(MAX_CODES_PER_EMAIL_PER_HOUR)
    expect(store.codes).toHaveLength(MAX_CODES_PER_EMAIL_PER_HOUR)
  })

  it('limits one IP to 10 requests an hour across emails', async () => {
    stubMail()
    const store = codeStore(MAIL)
    for (let i = 0; i < 10; i += 1) {
      const res = await onRequestPost({ env: store.fake.env, request: post({ email: `person${i}@example.com` }) })
      expect(res.status).toBe(200)
    }
    const limited = await onRequestPost({ env: store.fake.env, request: post({ email: 'person10@example.com' }) })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Cache-Control')).toBe('private, no-store')
    // A different IP is unaffected.
    const other = await onRequestPost({ env: store.fake.env, request: post({ email: 'person10@example.com' }, '198.51.100.7') })
    expect(other.status).toBe(200)
  })

  it('rejects a malformed email with 400 and sends nothing', async () => {
    const sent = stubMail()
    const store = codeStore(MAIL)
    const res = await onRequestPost({ env: store.fake.env, request: post({ email: 'not-an-email' }) })
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ error: 'Please enter a valid email address' })
    expect(sent).toHaveLength(0)
    expect(store.codes).toHaveLength(0)
  })

  it('still answers {ok:true} when the mail provider is down', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('brevo down'))))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = codeStore(MAIL)
    const res = await onRequestPost({ env: store.fake.env, request: post({ email: 'alex@example.com' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
