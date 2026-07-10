import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CurrencyTool } from './CurrencyTool'

describe('CurrencyTool', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing for a US / USD destination', () => {
    const { container } = render(<CurrencyTool displayName="Yellowstone National Park, Wyoming, United States" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('converts USD to the destination currency and updates as the amount changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ rate: 0.92 }) }))
    render(<CurrencyTool displayName="Paris, France" />)

    // Default 1 USD → 0.92 EUR once the rate loads.
    await waitFor(() => expect(screen.getByText('0.92')).toBeInTheDocument())
    expect(screen.getByText(/EUR/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Amount in US dollars'), { target: { value: '10' } })
    expect(screen.getByText('9.2')).toBeInTheDocument()
  })

  it('stays silent when the rate is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ rate: null }) }))
    const { container } = render(<CurrencyTool displayName="Marrakesh, Morocco" />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
