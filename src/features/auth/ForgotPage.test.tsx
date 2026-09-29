import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ForgotPage } from './ForgotPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPage />
    </MemoryRouter>,
  )
}

describe('ForgotPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/auth/password/reset-request')) {
          return { ok: true, status: 200, json: async () => ({ ok: true }) }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the same confirmation after submit and does not mention whether the account exists', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(screen.getByText(/if an account exists for that address/i)).toBeInTheDocument())
    expect(screen.queryByText(/no such account/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(screen.getByText(/if an account exists for that address/i)).toHaveAttribute('aria-live', 'polite')
  })

  it('starts empty, and pre-fills the email another page passed in router state', () => {
    const { unmount } = renderPage()
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('')
    unmount()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/forgot', state: { email: 'alex@example.com' } }]}>
        <ForgotPage />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('alex@example.com')
  })
})
