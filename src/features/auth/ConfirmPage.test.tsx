import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ConfirmPage } from './ConfirmPage'
import { ForgotPage } from './ForgotPage'

function renderAt(path: string, fetchImpl: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => fetchImpl(String(url))))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ConfirmPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ConfirmPage', () => {
  it('shows the expired-link message when the token is missing', async () => {
    renderAt('/confirm', async (url) => {
      if (url.includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      throw new Error(`unexpected fetch ${url}`)
    })
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it('POSTs the token on mount and shows success', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (String(url).includes('/api/auth/confirm')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ token: 'abc123token' })
        return { ok: true, json: async () => ({ ok: true, email: 'alex@example.com' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/confirm?token=abc123token']}>
        <AuthProvider>
          <ConfirmPage />
        </AuthProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/alex@example.com/i)).toBeInTheDocument())
    expect(screen.getByText(/is confirmed/i)).toBeInTheDocument()
  })

  it('keeps the normal success message when the password was not reset', async () => {
    renderAt('/confirm?token=owntoken', async (url) => {
      if (url.includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (url.includes('/api/auth/confirm')) {
        return { ok: true, json: async () => ({ ok: true, email: 'alex@example.com', passwordReset: false }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    expect(await screen.findByText(/is confirmed\. You can reset your password/i)).toBeInTheDocument()
    expect(screen.queryByText(/set a password to sign in/i)).not.toBeInTheDocument()
  })

  it('tells the visitor to set a password when the confirmation reset it, pre-filling the reset form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
        if (String(url).includes('/api/auth/confirm')) {
          return { ok: true, json: async () => ({ ok: true, email: 'alex@example.com', passwordReset: true }) }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    render(
      <MemoryRouter initialEntries={['/confirm?token=signedout']}>
        <AuthProvider>
          <Routes>
            <Route path="/confirm" element={<ConfirmPage />} />
            <Route path="/forgot" element={<ForgotPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('Your email is confirmed. For your security, set a password to sign in.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/You can reset your password from this/i)).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /set a password/i })
    expect(link).toHaveAttribute('href', '/forgot')
    fireEvent.click(link)
    expect(await screen.findByLabelText(/^email$/i)).toHaveValue('alex@example.com')
  })

  it('shows the expired-link message when the server rejects the token', async () => {
    renderAt('/confirm?token=dead', async (url) => {
      if (url.includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (url.includes('/api/auth/confirm')) {
        return { ok: false, json: async () => ({ error: 'invalid' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })
})
