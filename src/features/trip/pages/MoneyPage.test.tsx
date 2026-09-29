import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MoneyPage } from './MoneyPage'

let outletContext: unknown

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useOutletContext: () => outletContext }
})

function mockContext(location: { displayName: string } | null) {
  outletContext = {
    trip: { id: 't1', locationSlug: 'placeholder', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
    location: location && { slug: 'x', lat: 0, lng: 0, displayName: location.displayName, thingsToDo: [] },
  }
}

function mockTokyoContext() {
  mockContext({ displayName: 'Tokyo, Japan' })
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

    // The label spells out the ISO code (not just the symbol, which is
    // ambiguous across dollar-type currencies) — Fix 1(c).
    const reverseInput = screen.getByLabelText(/JPY/i)

    // The input is a real full-page control, not the slim header chip — it
    // needs a real >=44px tap target, via a Money-page-only modifier class
    // that leaves the shared .chronicle-currency-input alone — Fix 1(a).
    expect(reverseInput).toHaveClass('chronicle-currency-input')
    expect(reverseInput).toHaveClass('chronicle-currency-input--lg')

    // The result is a live region so a screen reader announces the update
    // without the user having to move focus — Fix 1(b).
    const result = screen.getByRole('status')
    expect(result).toHaveAttribute('aria-live', 'polite')
    expect(result).toBeEmptyDOMElement()

    // Reverse converter: ¥2000 at rate 150.4 -> $13.30.
    fireEvent.change(reverseInput, { target: { value: '2000' } })
    expect(result).toHaveTextContent('$13.30')
  })

  it('strips thousands-separator commas before converting ("1,000" is a valid amount, not invalid input) — Fix 1(d)', async () => {
    mockTokyoContext()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 150.4, updatedAt: null }) }))

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    const reverseInput = await waitFor(() => screen.getByLabelText(/JPY/i))
    fireEvent.change(reverseInput, { target: { value: '1,000' } })
    // 1000 / 150.4 ≈ 6.65.
    expect(screen.getByRole('status')).toHaveTextContent('$6.65')
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

  it('shows a "no conversion needed" message and no table or credit for a domestic US destination (Miami) — Fix 2', () => {
    mockContext({ displayName: 'Miami, Florida' })
    vi.stubGlobal('fetch', vi.fn())

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no currency conversion needed for this trip/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /exchange rate api/i })).not.toBeInTheDocument()
  })

  it('never claims US dollars for an international trip whose currency is unknown (Havana)', () => {
    mockContext({ displayName: 'Havana, Cuba' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('We don’t have currency info for Cuba yet.')).toBeInTheDocument()
    expect(screen.queryByText(/us dollars/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a loading state (never a fake USD-to-USD table) while the location has not resolved yet', () => {
    mockContext(null)
    vi.stubGlobal('fetch', vi.fn())

    render(
      <MemoryRouter>
        <MoneyPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/^loading…$/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /exchange rate api/i })).not.toBeInTheDocument()
  })
})
