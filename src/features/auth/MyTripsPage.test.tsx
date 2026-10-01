import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { MyTripsPage } from './MyTripsPage'

/** Synthetic unit-test values (never rendered in the product). */
const TOKEN_A = 'tok_abcdefghijklmnopqrstuvwxyz012345'
const TOKEN_B = 'tok_zyxwvutsrqponmlkjihgfedcba543210'
const user = { id: 'u1', email: 'bea@example.com', displayName: 'Bea', emailVerified: true }

/** Stubs the session check and GET /api/my-trips. */
function stubApi(myTrips: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => ({ user }) }
      if (url === '/api/my-trips') return { ok: true, status: 200, json: async () => myTrips }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

/** Renders My trips at its route. */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/my-trips']}>
      <AuthProvider>
        <MyTripsPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('MyTripsPage joined trips', () => {
  it('lists "Trips you’ve joined", each linking to its recap by token', async () => {
    stubApi({
      trips: [],
      joined: [
        { recapToken: TOKEN_A, title: 'Autumn in Oslo', displayName: 'Oslo, Norway' },
        { recapToken: TOKEN_B, title: null, displayName: 'Anaheim, California' },
      ],
    })
    renderPage()
    const section = await screen.findByRole('region', { name: 'Trips you’ve joined' })
    expect(within(section).getByRole('link', { name: /Autumn in Oslo/ })).toHaveAttribute('href', `/recap/${TOKEN_A}`)
    expect(within(section).getByRole('link', { name: /Anaheim, California trip/ })).toHaveAttribute(
      'href',
      `/recap/${TOKEN_B}`,
    )
    // No joined trip ever links into /trip/.
    for (const link of within(section).getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('/trip/')
  })

  it('shows no joined section when there are none', async () => {
    stubApi({ trips: [], joined: [] })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No saved trips yet' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Trips you’ve joined' })).toBeNull()
  })
})
