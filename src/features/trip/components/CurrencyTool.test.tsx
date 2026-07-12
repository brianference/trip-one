import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CurrencyTool } from './CurrencyTool'

describe('CurrencyTool', () => {
  it('renders nothing for a USD destination', () => {
    const { container } = render(<CurrencyTool code="USD" rate={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the rate is unavailable', () => {
    const { container } = render(<CurrencyTool code="MAD" rate={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('converts USD to the destination currency and updates as the amount changes', () => {
    render(<CurrencyTool code="EUR" rate={0.92} />)
    // Default 1 USD → 0.92 EUR.
    expect(screen.getByText('0.92')).toBeInTheDocument()
    expect(screen.getByText(/EUR/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Amount in US dollars'), { target: { value: '10' } })
    expect(screen.getByText('9.2')).toBeInTheDocument()
  })

  it('compact variant shows a static "$1 = €rate" chip (currency symbol) with no input box', () => {
    render(<CurrencyTool code="EUR" rate={0.87} variant="compact" />)
    // Renders the currency symbol and value (e.g. "€0.87"), not the ISO code.
    expect(screen.getByText(/€0\.87/)).toBeInTheDocument()
    expect(screen.getByText(/\$1 =/)).toBeInTheDocument()
    // No editable input in the slim top bar (that pushed the result off-screen).
    expect(screen.queryByLabelText('Amount in US dollars')).not.toBeInTheDocument()
  })
})
