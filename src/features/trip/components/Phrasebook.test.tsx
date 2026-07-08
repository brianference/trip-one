import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Phrasebook } from './Phrasebook'

describe('Phrasebook', () => {
  it('renders a real phrase list when phrases are given', () => {
    render(<Phrasebook phrases={[{ english: 'Hello', translation: 'Bonjour' }]} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Bonjour')).toBeInTheDocument()
  })

  it('renders nothing when there are no phrases (English/US destinations get no phrasebook)', () => {
    const { container } = render(<Phrasebook phrases={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
