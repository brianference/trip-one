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
    expect(link.getAttribute('href')).toContain('google.com/search')
    expect(link.getAttribute('href')).toContain('Reykjavik')
  })

  it('renders nothing when there are no days', () => {
    const { container } = render(<ForecastStrip days={[]} displayName="Nowhere" />)
    expect(container).toBeEmptyDOMElement()
  })
})
