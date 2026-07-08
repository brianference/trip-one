import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * A generic dashboard tile for the Overview page: a heading, arbitrary real
 * content, and a link into the full page it's previewing. Shared by every
 * "peek at X, jump to the full X page" card on Overview so they stay
 * visually and structurally consistent.
 */
export function PreviewCard({ title, to, linkLabel, children }: { title: string; to: string; linkLabel: string; children: ReactNode }) {
  return (
    <section className="chronicle-preview-card">
      <h2>{title}</h2>
      {children}
      <Link to={to} className="chronicle-preview-link">
        {linkLabel} →
      </Link>
    </section>
  )
}
