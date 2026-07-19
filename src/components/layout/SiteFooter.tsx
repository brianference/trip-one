import { Link } from 'react-router-dom'
import { Logo } from './Logo'

/**
 * Site footer, organised into labelled columns.
 *
 * Grouped under real headings rather than one long link list: a flat run of
 * links is harder to scan and gives a screen reader no structure to navigate
 * by. Each column is a <nav> with its own accessible name.
 */
const COLUMNS: { title: string; links: { to: string; label: string; external?: boolean }[] }[] = [
  {
    title: 'Plan',
    links: [
      { to: '/', label: 'Plan a trip' },
      { to: '/explore', label: 'Explore destinations' },
      { to: '/my-trips', label: 'My trips' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About us' },
      { to: '/contact', label: 'Contact us' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/terms', label: 'Terms and conditions' },
    ],
  },
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-[var(--hairline)] bg-[var(--surface-muted)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed opacity-75">
              Real places, real itineraries. Trip One plans day-by-day trips from verified places — never invented
              ones.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider opacity-60">{col.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-sm hover:text-dusk-600 hover:underline underline-offset-4">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-[var(--hairline)] pt-6 text-sm opacity-70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Trip One. All rights reserved.</p>
          <p>
            Place data from Google Places and Tripadvisor. Weather from Open-Meteo.
          </p>
        </div>
      </div>
    </footer>
  )
}
