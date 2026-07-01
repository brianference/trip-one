import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the search screen at the root route', () => {
    render(<App />)
    expect(screen.getByLabelText(/where to/i)).toBeInTheDocument()
  })
})
