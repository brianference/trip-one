import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripNav } from './TripNav'
import { destinationFor } from '../localinfo/destination'

const TOKYO = destinationFor('Tokyo, Japan') // international, non-English-speaking, JPY
const DUBLIN = destinationFor('Dublin, Ireland') // international (EUR), but English-speaking
const MIAMI = destinationFor('Miami, Florida') // domestic (USD, not international)
const LOADING = destinationFor(null)

describe('TripNav', () => {
  it('renders a real link per page, pointing at distinct URLs under the trip', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/trip/t1')
    expect(screen.getByRole('link', { name: /plan/i })).toHaveAttribute('href', '/trip/t1/plan')
    expect(screen.getByRole('link', { name: /weather/i })).toHaveAttribute('href', '/trip/t1/weather')
    expect(screen.getByRole('link', { name: /phrases/i })).toHaveAttribute('href', '/trip/t1/phrasebook')
    expect(screen.getByRole('link', { name: /money/i })).toHaveAttribute('href', '/trip/t1/money')
    // "New trip" leaves the current trip for the homepage location picker.
    expect(screen.getByRole('link', { name: /new trip/i })).toHaveAttribute('href', '/')
    // Map, itinerary, and things-to-do are consolidated into the one Plan page.
    expect(screen.queryByRole('link', { name: /^map$/i })).not.toBeInTheDocument()
  })

  it('marks the current route active', () => {
    render(
      <MemoryRouter initialEntries={['/trip/t1/plan']}>
        <TripNav tripId="t1" variant="pill" destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /plan/i })).toHaveClass('chronicle-section-nav-item--active')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveClass('chronicle-section-nav-item--active')
  })

  it('shows the current temperature on the Weather item when given', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" currentTempF={63.6} destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /weather 64°/i })).toBeInTheDocument()
  })

  it('omits the temperature when none is provided', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/°/)).not.toBeInTheDocument()
  })

  it('does not render icons in the footer variant', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="footer" destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(document.querySelector('svg')).not.toBeInTheDocument()
  })

  it('shows both Phrases and Money for an international, non-English-speaking destination (Tokyo)', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={TOKYO} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /phrases/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /money/i })).toBeInTheDocument()
  })

  it('shows neither Phrases nor Money for a domestic US destination (Miami)', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={MIAMI} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /phrases/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /money/i })).not.toBeInTheDocument()
  })

  it('shows Money but not Phrases for an English-speaking, non-USD destination (Dublin)', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={DUBLIN} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /money/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /phrases/i })).not.toBeInTheDocument()
  })

  it('shows neither Phrases nor Money while the destination is still loading', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" destination={LOADING} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /phrases/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /money/i })).not.toBeInTheDocument()
  })
})
