import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { ConfirmPage } from './ConfirmPage'

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
