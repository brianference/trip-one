import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('toggles the document theme and persists the choice', () => {
    render(<ThemeToggle />)
    // jsdom has no matchMedia → systemTheme() defaults to dark, so first click goes to light.
    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('trip-one-theme')).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('trip-one-theme')).toBe('dark')
  })

  it('starts from the saved choice', () => {
    localStorage.setItem('trip-one-theme', 'light')
    render(<ThemeToggle />)
    // Saved light → the button offers to switch to dark.
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument()
  })
})
