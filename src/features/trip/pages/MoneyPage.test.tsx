import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MoneyPage } from './MoneyPage'

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

function mockTokyoContext() {
  outletContext = {
    trip: { id: 't1', locationSlug: 'tokyo-japan', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
    location: { slug: 'tokyo-japan', lat: 35.68, lng: 139.69, displayName: 'Tokyo, Japan', thingsToDo: [] },
  }
}

describe('MoneyPage', () => {
  afterEach(() => {
    outletContext = undefined
    vi.restoreAllMocks()
  })

  it('shows the conversion table, the required attribution, the updated date, and a working reverse converter', async () => {
    mockTokyoContext()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 150.4, updatedAt: 'Tue, 29 Sep 2026 00:02:31 +0000' }) }),
    )

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /^money$/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    // Header row.
    expect(screen.getByRole('columnheader', { name: /us dollars/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'JPY' })).toBeInTheDocument()

    // 6 body rows (one per preset amount), $1,000 in the last one.
    const rows = screen.getAllByRole('row').slice(1) // drop the header row
    expect(rows).toHaveLength(6)
    expect(rows[rows.length - 1]).toHaveTextContent('$1,000')

    // Required provider attribution.
    const attribution = screen.getByRole('link', { name: /rates by exchange rate api/i })
    expect(attribution).toHaveAttribute('href', 'https://www.exchangerate-api.com')
    expect(attribution).toHaveAttribute('rel', 'noopener')

    // Provider's update date, shown in a stable (UTC) form.
    expect(screen.getByText(/september 29, 2026/i)).toBeInTheDocument()

    // Reverse converter: ¥2000 at rate 150.4 -> $13.30.
    const reverseInput = screen.getByLabelText(/¥ to \$/i)
    fireEvent.change(reverseInput, { target: { value: '2000' } })
    expect(screen.getByText(/\$13\.30/)).toBeInTheDocument()
  })

  it('shows an unavailable message and no table when the rate is null', async () => {
    mockTokyoContext()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: null, updatedAt: null }) }))

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText(/currency rate unavailable right now/i)).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
