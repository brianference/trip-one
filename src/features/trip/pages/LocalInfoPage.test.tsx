import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LocalInfoPage } from './LocalInfoPage'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useOutletContext: () => ({
      trip: { id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'chronicle', tripLengthDays: null },
      location: { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, displayName: 'Dublin, Ireland', thingsToDo: [] },
    }),
  }
})

describe('LocalInfoPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the real currency rate for the trip location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 0.92 }) }))
    render(<LocalInfoPage />)
    await waitFor(() => expect(screen.getByText(/0.92/)).toBeInTheDocument())
  })
})
