// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendEmail, htmlToText, confirmEmailHtml, passwordResetHtml, contactNotificationHtml } from './email'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('htmlToText', () => {
  it('keeps the link URL in the plain-text alternative', () => {
    const text = htmlToText('<p>Go <a href="https://example.com/x">here</a></p>')
    expect(text).toContain('https://example.com/x')
    expect(text).toContain('here')
    expect(text).not.toContain('<a')
  })
})

describe('templates', () => {
  it('include both the brand heading and a text-extractable button link', () => {
    const html = confirmEmailHtml('https://trip-one.pages.dev/confirm?token=abc')
    expect(html).toContain('Trip One')
    expect(html).toContain('#1f7a3d')
    expect(htmlToText(html)).toContain('https://trip-one.pages.dev/confirm?token=abc')
    expect(htmlToText(passwordResetHtml('https://trip-one.pages.dev/reset?token=xyz'))).toContain(
      'https://trip-one.pages.dev/reset?token=xyz',
    )
  })

  it('escapes visitor-controlled contact fields', () => {
    const html = contactNotificationHtml({
      name: '<script>x</script>',
      email: 'a@b.com',
      subject: 'Hi & bye',
      message: '<img src=x>',
    })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('Hi &amp; bye')
  })
})

describe('sendEmail', () => {
  it('stubs and does not fetch when BREVO_API_KEY is unset', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendEmail({}, 'a@b.com', 'Hello', '<p>Hi</p>')
    expect(result).toEqual({ sent: false, stubbed: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    const result = await sendEmail({ BREVO_API_KEY: 'key', MAIL_FROM: 'no-reply@txeas.com' }, 'a@b.com', 'Hello', '<p>Hi</p>')
    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/network down/)
  })

  it('sends htmlContent and textContent, from MAIL_FROM, with the api-key header', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendEmail(
      { BREVO_API_KEY: 'secret-key', MAIL_FROM: 'no-reply@txeas.com' },
      'a@b.com',
      'Hello',
      '<p>Hi there</p>',
    )
    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((init.headers as Record<string, string>)['api-key']).toBe('secret-key')
    const body = JSON.parse(String(init.body)) as {
      sender: { email: string; name: string }
      htmlContent: string
      textContent: string
    }
    expect(body.sender.email).toBe('no-reply@txeas.com')
    expect(body.htmlContent).toContain('Hi there')
    expect(body.textContent).toContain('Hi there')
  })

  it('refuses to send as a protonmail.com address', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    await sendEmail(
      { BREVO_API_KEY: 'secret-key', MAIL_FROM: 'brianference@protonmail.com' },
      'a@b.com',
      'Hello',
      '<p>Hi</p>',
    )
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      sender: { email: string }
    }
    expect(body.sender.email).toBe('no-reply@txeas.com')
  })

  it('returns the Brevo error body instead of throwing on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })),
    )
    const result = await sendEmail({ BREVO_API_KEY: 'bad', MAIL_FROM: 'no-reply@txeas.com' }, 'a@b.com', 'Hello', '<p>Hi</p>')
    expect(result.sent).toBe(false)
    expect(result.error).toMatch(/401/)
  })
})
