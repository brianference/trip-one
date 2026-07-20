import { Link } from 'react-router-dom'
import { Logo } from '../Logo'
import { useAuth } from '../../features/auth/AuthContext'

/**
 * Site footer.
 *
 * Structure follows the reference the user pointed at
 * (kanban-board-public.pages.dev), whose footer I read rather than guessed at.
 * The things that make that one read as premium rather than as a link dump:
 *
 *  - an asymmetric grid, so the brand column is wider than the link columns and
 *    the footer has a clear starting point instead of four equal blocks
 *  - a soft gradient into the footer plus an upward shadow, so it arrives as a
 *    surface rather than a hard rule across the page
 *  - capability badges, which say what the product does without a sentence
 *  - one forward action, with an arrow that moves on hover
 *  - a separate, tinted base bar, so copyright and status sit apart from
 *    navigation instead of competing with it
 *
 * Each column stays a real <nav> with its own accessible name.
 */
const COLUMNS: { title: string; links: { to: string; label: string }[] }[] = [
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

const BADGES = ['Day-by-day plans', 'Live weather', 'Printable itinerary']

export function SiteFooter() {
  const year = new Date().getFullYear()
  const { user } = useAuth()

  return (
    <footer
      className="mt-16 border-t border-[var(--hairline)]
        bg-[linear-gradient(180deg,var(--surface-muted)_0%,var(--page-bg)_45%)]
        shadow-[0_-8px_32px_rgb(20_18_15_/_0.04)]"
    >
      {/* The brand column is deliberately wider than the three link columns. */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-8 pt-11 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.55fr_0.85fr_0.85fr_0.85fr] lg:gap-x-10">
        <div className="flex max-w-xs flex-col items-start gap-3.5">
          <Link to="/" aria-label="Trip One — home">
            <Logo size={26} />
          </Link>
          <p className="text-sm leading-relaxed opacity-70">
            One sentence in, a day-by-day itinerary out — then reshape it by chatting.
          </p>

          <ul className="flex flex-wrap gap-1.5" aria-label="What Trip One does">
            {BADGES.map((badge) => (
              <li
                key={badge}
                className="inline-flex min-h-6 items-center rounded-[var(--radius-pill)] border border-[var(--hairline)]
                  bg-[var(--surface)] px-2.5 py-0.5 text-[0.68rem] font-semibold tracking-wide opacity-75
                  shadow-[0_1px_2px_rgb(20_18_15_/_0.04)]"
              >
                {badge}
              </li>
            ))}
          </ul>

          <Link
            to={user ? '/my-trips' : '/'}
            className="group mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent-text)] transition-colors hover:text-[var(--color-primary)]"
          >
            {user ? 'Go to my trips' : 'Plan a trip'}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3.5 text-[0.7rem] font-bold uppercase tracking-[0.08em]">{col.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {col.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm font-medium opacity-70 transition-colors hover:text-[var(--accent-text)] hover:opacity-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Base bar: its own tint and rule, so the legal line reads as a footer
          of the footer rather than a fourth column. */}
      <div className="border-t border-[var(--hairline)] bg-[var(--surface-muted)]/55">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-4 py-3.5 text-xs opacity-70 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-7 sm:px-6">
          <p>© {year} Trip One. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5 font-semibold">
            <span
              aria-hidden="true"
              className="size-[7px] shrink-0 rounded-full bg-pine-500 shadow-[0_0_0_3px_rgb(69_112_95_/_0.22)]"
            />
            All systems operational
          </p>
          <p>Place data from Google Places and Tripadvisor · Weather from Open-Meteo</p>
        </div>
      </div>
    </footer>
  )
}
