import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PreviewCard } from './PreviewCard'

describe('PreviewCard', () => {
  it('renders the title, children, and a jump link with the given label', () => {
    render(
      <MemoryRouter>
        <PreviewCard title="Up next" to="/trip/t1/itinerary" linkLabel="See full itinerary">
          <p>Breakfast at 8am</p>
        </PreviewCard>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument()
    expect(screen.getByText('Breakfast at 8am')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /see full itinerary/i })
    expect(link).toHaveAttribute('href', '/trip/t1/itinerary')
  })
})
