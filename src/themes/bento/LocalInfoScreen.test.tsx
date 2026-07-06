import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LocalInfoScreen } from './LocalInfoScreen'
import * as client from '../../lib/api/client'

describe('LocalInfoScreen', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the exchange rate and transit/phrasebook links for the trip location', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'tokyo-japan',
      lat: 35.68,
      lng: 139.76,
      displayName: 'Tokyo, Japan',
      thingsToDo: [],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { JPY: 157.3 } }) }))

    render(<LocalInfoScreen locationSlug="tokyo-japan" />)

    await waitFor(() => expect(screen.getByText(/157\.3/)).toBeInTheDocument())
    expect(screen.getByText(/JPY/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /transit directions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /phrasebook/i })).toBeInTheDocument()
  })
})
