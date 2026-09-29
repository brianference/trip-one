import { useEffect, useState } from 'react'

/** The media query that reports an OS/browser "reduce motion" preference. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Reads the reduced-motion preference right now. Guards `matchMedia`, which
 * is absent in some environments (jsdom under test without a stub).
 */
function readPreference(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false
}

/**
 * Whether the visitor asked the OS/browser for reduced motion, kept current
 * if they change the setting while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPreference)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}
