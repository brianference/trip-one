import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  /** Omitted on the final crumb, which is the current page. */
  to?: string
}

/**
 * Breadcrumb trail.
 *
 * Uses a real `<nav aria-label="Breadcrumb">` with an ordered list, and marks
 * the last item `aria-current="page"` — that's what assistive tech uses to
 * announce position. The separators are `aria-hidden` so they aren't read out
 * between every item.
 *
 * It wraps rather than scrolls on narrow screens, which is what stops the long
 * trails on trip pages from overlapping the content beside them.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm opacity-75">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {item.to && !last ? (
                <Link to={item.to} className="hover:text-dusk-600 hover:underline underline-offset-4">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate font-medium">
                  {item.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="opacity-50">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Standard content page: constrained measure, breadcrumbs, a title block, then
 * the body. Every static page uses this so they can't drift apart.
 */
export function PageShell({
  title,
  lead,
  crumbs = [],
  children,
  wide = false,
}: {
  title: string
  lead?: ReactNode
  crumbs?: Crumb[]
  children: ReactNode
  wide?: boolean
}) {
  return (
    <main id="main" className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-12 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <Breadcrumbs items={crumbs} />
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {lead && <p className="mt-3 text-lg leading-relaxed opacity-80">{lead}</p>}
      </header>
      {children}
    </main>
  )
}

/**
 * Long-form prose styling for the legal and about pages.
 *
 * `max-w-prose` caps the measure at a readable line length; without it these
 * pages run to full width on a desktop and become genuinely hard to read.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className="max-w-prose space-y-5 leading-relaxed
        [&_h2]:mt-10 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-xl [&_h2]:font-semibold
        [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2
        [&_a]:text-dusk-600 [&_a]:underline [&_a]:underline-offset-4"
    >
      {children}
    </div>
  )
}
