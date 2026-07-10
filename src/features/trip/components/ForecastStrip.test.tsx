import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ForecastStrip } from './ForecastStrip'

describe('ForecastStrip', () => {
  it('renders one card per day with rounded temps, precip, and a per-day hourly link', () => {
    render(
      <ForecastStrip
        days={[{ date: '2026-07-10', hiF: 75.4, loF: 55.6, condition: 'Overcast', code: 3, precipPercent: 20 }]}
        displayName="Reykjavik, Iceland"
      />,
    )
    expect(screen.getByText('Overcast')).toBeInTheDocument()
    expect(screen.getByText('75° / 56°')).toBeInTheDocument()
    expect(screen.getByText('20% precip')).toBeInTheDocument()
    // each day links to a real hourly forecast for that place
    const link = screen.getByRole('link', { name: /hourly/i })
    // Reykjavik, Iceland → a real Weather Underground hourly URL for that date
    expect(link.getAttribute('href')).toBe('https://www.wunderground.com/hourly/is/reykjavik/date/2026-07-10')
  })

  it('renders nothing when there are no days', () => {
    const { container } = render(<ForecastStrip days={[]} displayName="Nowhere" />)
    expect(container).toBeEmptyDOMElement()
  })
})
