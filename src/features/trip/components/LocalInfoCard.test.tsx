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

  it('renders real transit and phrasebook links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
    render(<LocalInfoCard displayName="Dublin, Ireland" />)
    await waitFor(() => expect(screen.getByText(/0.92/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /transit directions/i })).toHaveAttribute(
      'href',
      expect.stringContaining('public%20transit%20in%20Dublin'),
    )
    expect(screen.getByRole('link', { name: /phrasebook/i })).toHaveAttribute('href', expect.stringContaining('translate.google.com'))
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
