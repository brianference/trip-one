import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResetPage } from './ResetPage'

afterEach(() => vi.unstubAllGlobals())

describe('ResetPage', () => {
  it('asks for a new link when the token is missing', () => {
    render(
      <MemoryRouter initialEntries={['/reset']}>
        <ResetPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/missing its token/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot')
  })

  it('submits the new password and shows success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toContain('/api/auth/password/reset')
        expect(JSON.parse(String(init?.body))).toMatchObject({ token: 'tokentokentokentoken', password: 'new-password-here' })
        return { ok: true, json: async () => ({ ok: true }) }
      }),
    )
    render(
      <MemoryRouter initialEntries={['/reset?token=tokentokentokentoken']}>
        <ResetPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'new-password-here' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText(/your password has been updated/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})
