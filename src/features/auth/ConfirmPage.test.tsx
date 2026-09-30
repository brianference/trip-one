import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ConfirmPage, DENIED_MESSAGE } from './ConfirmPage'

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

/** Stand-in login page that shows where it was told to return to. */
function LoginProbe() {
  const location = useLocation()
  return <p data-testid="login-from">{(location.state as { from?: string } | null)?.from ?? ''}</p>
}

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

  it('without the account session: asks to sign in, with a login link that returns to this confirm URL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (String(url).endsWith('/api/auth/confirm')) {
        return { ok: true, json: async () => ({ ok: false, needsSignIn: true, email: 'alex@example.com' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/confirm?token=signedout']}>
        <AuthProvider>
          <Routes>
            <Route path="/confirm" element={<ConfirmPage />} />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Sign in to confirm your email' })).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
    // Nothing says it is confirmed, and the old password-reset branch is gone.
    expect(screen.queryByText(/is confirmed/i)).toBeNull()
    expect(screen.queryByText(/set a password/i)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByTestId('login-from')).toHaveTextContent('/confirm?token=signedout')
    // Only the confirm POST was made: "This wasn't me" was never sent on its own.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deny'))).toHaveLength(0)
  })

  it('"This wasn\'t me" asks first; Cancel sends nothing and returns focus to the button', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (String(url).endsWith('/api/auth/confirm')) {
        return { ok: true, json: async () => ({ ok: false, needsSignIn: true, email: 'alex@example.com' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/confirm?token=signedout']}>
        <AuthProvider>
          <ConfirmPage />
        </AuthProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'This wasn’t me' }))
    expect(screen.getByText(/Lock this account\?/)).toBeInTheDocument()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    fireEvent.click(cancel)
    await waitFor(() => expect(screen.getByRole('button', { name: 'This wasn’t me' })).toHaveFocus())
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/deny'))).toHaveLength(0)
  })

  it('"This wasn\'t me" then "Yes, lock it" POSTs the token to confirm/deny and thanks the visitor', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (String(url).endsWith('/api/auth/confirm/deny')) {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ token: 'signedout' })
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (String(url).endsWith('/api/auth/confirm')) {
        return { ok: true, json: async () => ({ ok: false, needsSignIn: true, email: 'alex@example.com' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/confirm?token=signedout']}>
        <AuthProvider>
          <ConfirmPage />
        </AuthProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'This wasn’t me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, lock it' }))
    expect(await screen.findByText(DENIED_MESSAGE)).toBeInTheDocument()
    expect(DENIED_MESSAGE).toBe('Thanks — we’ve locked that account. You can ignore the email.')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/deny'))).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('a refused "This wasn\'t me" shows the server text in an alert and keeps the choice open', async () => {
    const message = 'This confirmation link is invalid or has expired. Sign in and request a new one from your trips page.'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderAt('/confirm?token=spent', async (url) => {
      if (url.includes('/api/auth/me')) return { ok: true, json: async () => ({ user: null }) }
      if (url.endsWith('/api/auth/confirm/deny')) return { ok: false, json: async () => ({ error: message }) }
      if (url.endsWith('/api/auth/confirm')) {
        return { ok: true, json: async () => ({ ok: false, needsSignIn: true, email: 'alex@example.com' }) }
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'This wasn’t me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, lock it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Yes, lock it' })).toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
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
