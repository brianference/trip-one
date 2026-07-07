import { useEffect, useState } from 'react'

/**
 * Tracks which of the given section element IDs is currently most visible
 * in the viewport, for highlighting the matching tab in a sticky top nav on
 * a single scrolling page (rather than genuinely separate routes).
 * @param sectionIds - Element IDs to observe, in page order
 * @returns The ID of the section currently considered "active", or the
 * first ID before anything has been observed yet
 */
export function useActiveSection(sectionIds: string[]): string {
  const [active, setActive] = useState(sectionIds[0])

  useEffect(() => {
    // Not every environment implements IntersectionObserver (e.g. jsdom in
    // tests, or very old browsers) — fail soft to the default active section
    // rather than crashing the whole trip page over a nav highlight.
    if (typeof IntersectionObserver === 'undefined') return

    const elements = sectionIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el != null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return
        // Prefer the entry closest to the top of the viewport, so the nav
        // highlights the section the user is actually reading, not just any
        // section that happens to have a sliver visible at the bottom.
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
        setActive(topMost.target.id)
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sectionIds])

  return active
}
