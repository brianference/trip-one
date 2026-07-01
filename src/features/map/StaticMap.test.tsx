import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaticMap } from './StaticMap'

describe('StaticMap', () => {
  it('renders the location label', () => {
    render(<StaticMap lat={53.35} lng={-6.26} label="Dublin, Ireland" />)
    expect(screen.getByText('Dublin, Ireland')).toBeInTheDocument()
  })
})
