import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LocalInfoCard } from './LocalInfoCard'

describe('LocalInfoCard', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the real currency rate once loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
    render(<LocalInfoCard displayName="Dublin, Ireland" />)
    await waitFor(() => expect(screen.getByText(/0.92/)).toBeInTheDocument())
    expect(screen.getByText(/EUR/)).toBeInTheDocument()
  })

  it('renders a transit card and no phrasebook for an English-speaking destination', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
    render(<LocalInfoCard displayName="Dublin, Ireland" />)
    await waitFor(() => expect(screen.getByText(/0.92/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /getting around/i })).toHaveAttribute(
      'href',
      expect.stringContaining('public%20transit%20in%20Dublin'),
    )
    // English-speaking country: no phrasebook at all (and never a Google Translate link)
    expect(screen.queryByText(/phrasebook/i)).not.toBeInTheDocument()
  })

  it('hides the currency line for a US (same-currency) destination', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 1 }) }))
    render(<LocalInfoCard displayName="San Diego, California" />)
    expect(screen.queryByText(/1 USD/)).not.toBeInTheDocument()
    // transit card still shows
    expect(screen.getByRole('link', { name: /getting around/i })).toBeInTheDocument()
  })

  it('shows a real phrase list for a destination whose language is covered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 157.3 }) }))
    render(<LocalInfoCard displayName="Kyoto, Japan" />)
    await waitFor(() => expect(screen.getByText(/157\.3/)).toBeInTheDocument())
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText(/Konnichiwa/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /phrasebook/i })).not.toBeInTheDocument()
  })
})
