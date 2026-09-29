import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhrasebookPage } from './PhrasebookPage'

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

describe('PhrasebookPage', () => {
  afterEach(() => {
    outletContext = undefined
  })

  it('lists real phrases for a non-English-speaking international destination (Tokyo)', () => {
    mockContext({ displayName: 'Tokyo, Japan' })
    render(
      <MemoryRouter>
        <PhrasebookPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /^phrasebook$/i, level: 1 })).toBeInTheDocument()
    // At least one curated phrase (e.g. "Hello" -> "Konnichiwa") is shown.
    expect(screen.getByText(/konnichiwa/i)).toBeInTheDocument()
  })

  it('shows an English-speaking note for Dublin, with no phrase list', () => {
    mockContext({ displayName: 'Dublin, Ireland' })
    render(
      <MemoryRouter>
        <PhrasebookPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/english-speaking/i)).toBeInTheDocument()
  })

  it('shows an honest "not yet" message for a destination with no curated language (Ljubljana), and never claims it is English-speaking', () => {
    mockContext({ displayName: 'Ljubljana, Slovenia' })
    render(
      <MemoryRouter>
        <PhrasebookPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/don.t have a phrasebook for slovenia yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/english-speaking/i)).not.toBeInTheDocument()
  })

  it('shows a loading state when the location has not resolved yet, and never claims English-speaking', () => {
    mockContext(null)
    render(
      <MemoryRouter>
        <PhrasebookPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/english-speaking/i)).not.toBeInTheDocument()
  })
})
