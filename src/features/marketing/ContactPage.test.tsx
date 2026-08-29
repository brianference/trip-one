import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ContactPage } from './ContactPage'

afterEach(() => vi.unstubAllGlobals())

describe('ContactPage', () => {
  it('includes a hidden honeypot named website', () => {
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    )
    const honeypot = document.getElementById('contact-website') as HTMLInputElement | null
    expect(honeypot).not.toBeNull()
    expect(honeypot?.getAttribute('name')).toBe('website')
    expect(honeypot?.getAttribute('tabindex')).toBe('-1')
  })

  it('POSTs the form to /api/contact and shows success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: 'Something is broken on my Tokyo trip page.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))
    await waitFor(() => expect(screen.getByText(/we've received your message/i)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/contact')
    const body = JSON.parse(String(init.body)) as { name: string; website: string }
    expect(body.name).toBe('Alex')
    expect(body.website).toBe('')
  })

  it('disables submit while the request is in flight', async () => {
    let resolve: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r
          }),
      ),
    )
    render(
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: 'Something is broken on my Tokyo trip page.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    resolve({ ok: true, json: async () => ({ ok: true }) })
    await waitFor(() => expect(screen.getByText(/we've received your message/i)).toBeInTheDocument())
  })
})
