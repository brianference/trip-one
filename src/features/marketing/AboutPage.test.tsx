import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { AboutPage } from './AboutPage'

/**
 * Renders the About page inside a router, since it links to other routes.
 * @returns The render result
 */
function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  )
}

describe('AboutPage layout', () => {
  it('uses the same max width as the site header, not the narrow reading shell', () => {
    renderAbout()
    const main = screen.getByRole('main')
    expect(main.className).toContain('max-w-6xl')
    expect(main.className).not.toContain('max-w-3xl')
  })

  it('puts every section heading in its own two-column section on large screens', () => {
    renderAbout()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.length).toBeGreaterThanOrEqual(6)
    for (const heading of headings) {
      const section = heading.closest('section')
      expect(section, heading.textContent ?? '').not.toBeNull()
      expect(section!.className).toContain('lg:grid-cols-')
    }
  })

  it('keeps the page calls to action', () => {
    renderAbout()
    expect(screen.getByRole('link', { name: 'Plan a trip' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact')
  })
})
