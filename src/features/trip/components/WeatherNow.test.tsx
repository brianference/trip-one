import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeatherNow } from './WeatherNow'

describe('WeatherNow', () => {
  it('renders the temperature and condition when forecast is present', () => {
    render(<WeatherNow forecast={{ temperatureF: 68, condition: 'Sunny', isFallback: false }} />)
    expect(screen.getByText(/68°F/)).toBeInTheDocument()
    expect(screen.getByText(/Sunny/)).toBeInTheDocument()
  })

  it('renders nothing when forecast is null', () => {
    const { container } = render(<WeatherNow forecast={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
