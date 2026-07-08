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
})
