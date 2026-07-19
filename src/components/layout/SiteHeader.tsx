import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Link as RouterLink } from 'react-router-dom'
import { Logo } from '../Logo'
import { Button, ButtonLink } from '../ui/Button'
import { useAuth } from '../../features/auth/AuthContext'
import { ThemeToggle } from '../ThemeToggle'

const NAV = [
  { to: '/', label: 'Plan a trip', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

/**
 * Sticky site header.
 *
 * `sticky` rather than `fixed` so it participates in layout and no page needs a
 * compensating top padding. It only grows a border and blur once the page has
 * actually scrolled, so it sits flat against the hero at rest.
 *
 * NOTE: a `position: sticky` element is trapped by any ancestor with a
 * transform, filter or backdrop-filter. This must stay outside those wrappers.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout, loading } = useAuth()
  const location = useLocation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Navigating with the mobile menu open would otherwise leave it covering the
  // page the user just asked for.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Escape closes the menu and returns focus to the control that opened it,
  // so keyboard users aren't stranded.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header
      className={`sticky top-0 z-50 transition-shadow ${
        scrolled
          ? 'border-b border-[var(--hairline)] bg-[var(--page-bg)]/85 backdrop-blur-md shadow-[var(--shadow-card)]'
          : 'bg-[var(--page-bg)]'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <RouterLink to="/" aria-label="Trip One — home" className="shrink-0">
          <Logo size={26} />
        </RouterLink>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-[var(--surface-muted)] text-[var(--accent-text)]' : 'hover:bg-[var(--surface-muted)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-3 md:gap-2">
          <ThemeToggle />
          {/* Reserve the space while auth resolves so the header doesn't jump. */}
          {loading ? (
            <div className="hidden h-9 w-32 animate-pulse rounded-full bg-[var(--surface-muted)] md:block" />
          ) : user ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                to="/my-trips"
                className="rounded-full px-3.5 py-2 text-sm font-medium hover:bg-[var(--surface-muted)]"
              >
                My trips
              </Link>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link to="/login" className="rounded-full px-3.5 py-2 text-sm font-medium hover:bg-[var(--surface-muted)]">
                Sign in
              </Link>
              <ButtonLink to="/register" size="sm">
                Create account
              </ButtonLink>
            </div>
          )}

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="grid size-11 place-items-center rounded-xl hover:bg-[var(--surface-muted)] md:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-[var(--hairline)] bg-[var(--page-bg)] md:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col p-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-3 text-base font-medium ${
                    isActive ? 'bg-[var(--surface-muted)] text-[var(--accent-text)]' : ''
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            <div className="my-2 h-px bg-[var(--hairline)]" />

            {user ? (
              <>
                <NavLink to="/my-trips" className="rounded-xl px-3 py-3 text-base font-medium">
                  My trips
                </NavLink>
                <Button variant="secondary" block className="mt-2" onClick={() => void logout()}>
                  Sign out
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <ButtonLink to="/login" variant="secondary" block>
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register" block>
                  Create account
                </ButtonLink>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
