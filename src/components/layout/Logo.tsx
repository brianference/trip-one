import { Link } from 'react-router-dom'

/**
 * The wordmark: an inline SVG compass mark plus the name.
 *
 * Inline rather than an <img> on purpose — it costs no extra request, cannot
 * flash or shift layout while loading, and inherits `currentColor` so it works
 * in both themes without a second asset.
 */
export function Logo({ className = '', showText = true }: { className?: string; showText?: boolean }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 group ${className}`}
      aria-label="Trip One — home"
    >
      <span className="relative grid place-items-center size-9 rounded-xl bg-dusk-500 text-white shadow-[var(--shadow-card)] transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          {/* Compass needle — the mark reads as navigation at 16px too. */}
          <path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5 5-2.2Z" fill="currentColor" />
        </svg>
      </span>
      {showText && (
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
          Trip<span className="text-dusk-500">One</span>
        </span>
      )}
    </Link>
  )
}
