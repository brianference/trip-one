import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Resets scroll to the top on every route change. Without this, navigating from
 * the homepage into a trip (or between trip pages) kept the previous scroll
 * position, so a freshly-planned trip could open scrolled partway down the page.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
