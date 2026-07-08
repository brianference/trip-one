import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Phrasebook } from './Phrasebook'

describe('Phrasebook', () => {
  it('renders a real phrase list when phrases are given', () => {
    render(<Phrasebook phrases={[{ english: 'Hello', translation: 'Bonjour' }]} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Bonjour')).toBeInTheDocument()
  })

  it('falls back to a Google Translate link when no phrases are covered', () => {
    render(<Phrasebook phrases={null} />)
    expect(screen.getByRole('link', { name: /phrasebook/i })).toHaveAttribute('href', expect.stringContaining('translate.google.com'))
  })
})
