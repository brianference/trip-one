import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripNav } from './TripNav'

describe('TripNav', () => {
  it('renders a real link per page, pointing at distinct URLs under the trip', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="pill" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/trip/t1')
    expect(screen.getByRole('link', { name: /itinerary/i })).toHaveAttribute('href', '/trip/t1/itinerary')
    expect(screen.getByRole('link', { name: /^map$/i })).toHaveAttribute('href', '/trip/t1/map')
    expect(screen.getByRole('link', { name: /things to do/i })).toHaveAttribute('href', '/trip/t1/things-to-do')
    expect(screen.getByRole('link', { name: /weather/i })).toHaveAttribute('href', '/trip/t1/weather')
  })

  it('marks the current route active', () => {
    render(
      <MemoryRouter initialEntries={['/trip/t1/itinerary']}>
        <TripNav tripId="t1" variant="pill" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /itinerary/i })).toHaveClass('chronicle-section-nav-item--active')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveClass('chronicle-section-nav-item--active')
  })

  it('does not render icons in the footer variant', () => {
    render(
      <MemoryRouter>
        <TripNav tripId="t1" variant="footer" />
      </MemoryRouter>,
    )
    expect(document.querySelector('svg')).not.toBeInTheDocument()
  })
})
