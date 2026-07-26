import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  ExperienceCard,
  canShowExperiencePrice,
  formatExperiencePrice,
  AFFILIATE_DISCLOSURE,
} from './ExperienceCard'

const fullItem = {
  name: 'Tokyo Sushi Class',
  rating: 4.8,
  numReviews: 1240,
  priceFrom: 89,
  currency: 'USD',
  durationMinutes: 180,
  bookingUrl: 'https://www.viator.com/tours/Tokyo/Sushi/d334-X?pid=P1',
  freeCancellation: true,
}

describe('canShowExperiencePrice / formatExperiencePrice', () => {
  it('shows price only when currency is confirmed', () => {
    expect(canShowExperiencePrice({ priceFrom: 149, currency: 'USD' })).toBe(true)
    expect(canShowExperiencePrice({ priceFrom: 149, currency: 'JPY' })).toBe(true)
    // Unlabeled number is a 100× error if yen reads as dollars.
    expect(canShowExperiencePrice({ priceFrom: 149 })).toBe(false)
    expect(canShowExperiencePrice({ priceFrom: 149, currency: '' })).toBe(false)
    expect(canShowExperiencePrice({ priceFrom: 149, currency: 'US' })).toBe(false)
    expect(canShowExperiencePrice({ currency: 'USD' })).toBe(false)
  })

  it('formats with the real currency code', () => {
    const usd = formatExperiencePrice(89, 'USD')
    expect(usd).toMatch(/89/)
    expect(usd.toUpperCase()).toMatch(/USD|\$/)
  })
})

describe('ExperienceCard', () => {
  it('renders title, rating, review count, duration, and free-cancellation badge', () => {
    render(<ExperienceCard item={fullItem} />)
    expect(screen.getByText('Tokyo Sushi Class')).toBeInTheDocument()
    expect(screen.getByText(/4\.8/)).toBeInTheDocument()
    expect(screen.getByText(/1,240 reviews/)).toBeInTheDocument()
    expect(screen.getByText('about 3 hours')).toBeInTheDocument()
    expect(screen.getByText('Free cancellation')).toBeInTheDocument()
  })

  it('renders price only when currency is confirmed', () => {
    const { rerender } = render(<ExperienceCard item={fullItem} />)
    expect(screen.getByText(/From/)).toBeInTheDocument()

    rerender(
      <ExperienceCard
        item={{
          ...fullItem,
          currency: undefined,
          // priceFrom present but unlabeled — must not render as bare dollars
          priceFrom: 14900,
        }}
      />,
    )
    expect(screen.queryByText(/From/)).not.toBeInTheDocument()
    expect(screen.queryByText(/14900/)).not.toBeInTheDocument()
  })

  it('booking link carries rel="sponsored" and opens in a new tab', () => {
    render(<ExperienceCard item={fullItem} />)
    const link = screen.getByRole('link', { name: /book on viator/i })
    expect(link).toHaveAttribute('href', fullItem.bookingUrl)
    expect(link).toHaveAttribute('target', '_blank')
    const rel = link.getAttribute('rel') ?? ''
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['sponsored', 'noopener', 'noreferrer']))
  })

  it('shows affiliate disclosure adjacent to the booking link', () => {
    render(<ExperienceCard item={fullItem} />)
    expect(screen.getByText(AFFILIATE_DISCLOSURE)).toBeInTheDocument()
  })

  it('omits free-cancellation badge when the flag is not set', () => {
    render(<ExperienceCard item={{ ...fullItem, freeCancellation: undefined }} />)
    expect(screen.queryByText('Free cancellation')).not.toBeInTheDocument()
  })

  it('omits booking row when there is no booking URL', () => {
    render(<ExperienceCard item={{ ...fullItem, bookingUrl: undefined }} />)
    expect(screen.queryByRole('link', { name: /book on viator/i })).not.toBeInTheDocument()
  })
})
