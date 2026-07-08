import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PackingTips } from './PackingTips'

describe('PackingTips', () => {
  it('renders each tip', () => {
    render(<PackingTips tips={['Pack a rain layer.', 'Pack warm layers.']} />)
    expect(screen.getByText('Pack a rain layer.')).toBeInTheDocument()
    expect(screen.getByText('Pack warm layers.')).toBeInTheDocument()
  })

  it('renders nothing when there are no tips', () => {
    const { container } = render(<PackingTips tips={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
