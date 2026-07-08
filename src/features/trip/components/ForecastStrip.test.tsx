import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ForecastStrip } from './ForecastStrip'

describe('ForecastStrip', () => {
  it('renders one card per day with rounded temps and precip', () => {
    render(
      <ForecastStrip
        days={[{ date: '2026-07-10', hiF: 75.4, loF: 55.6, condition: 'Overcast', precipPercent: 20 }]}
      />,
    )
    expect(screen.getByText('Overcast')).toBeInTheDocument()
    expect(screen.getByText('75° / 56°')).toBeInTheDocument()
    expect(screen.getByText('20% precip')).toBeInTheDocument()
  })

  it('renders nothing when there are no days', () => {
    const { container } = render(<ForecastStrip days={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
