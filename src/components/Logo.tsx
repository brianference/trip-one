/**
 * The Trip One logo: a short dashed route of stops leading into a destination
 * pin (the product in one glyph — a planned journey ending at a real place),
 * paired with the wordmark. The mark alone is reused for the favicon and OG
 * image. Colors come from the Chronicle theme tokens so it tracks light/dark.
 *
 * @param withWordmark - Show the "Trip One" text beside the mark (default true)
 * @param size - Mark height in px (the wordmark scales with it)
 */
export function Logo({ withWordmark = true, size = 28 }: { withWordmark?: boolean; size?: number }) {
  return (
    <span className="chronicle-logo" aria-label="Trip One" role="img">
      <LogoMark size={size} />
      {withWordmark && (
        <span className="chronicle-logo-word" style={{ fontSize: size * 0.82 }}>
          Trip<span className="chronicle-logo-one">One</span>
        </span>
      )}
    </span>
  )
}

/** The standalone mark — a route of stops into a destination pin. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="chronicle-logo-mark">
      {/* Route: two waypoint dots stepping up to the destination. */}
      <circle cx="7" cy="31" r="2.4" className="chronicle-logo-route" />
      <circle cx="15.5" cy="27.5" r="2.4" className="chronicle-logo-route" />
      <path d="M9 30 L13.5 28.2" className="chronicle-logo-line" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 4" />
      <path d="M17.5 26.4 L22 22" className="chronicle-logo-line" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 4" />
      {/* Destination pin. */}
      <path
        d="M27 5c-6 0-10.5 4.6-10.5 10.6 0 7.6 10.5 17 10.5 17s10.5-9.4 10.5-17C37.5 9.6 33 5 27 5z"
        className="chronicle-logo-pin"
        strokeWidth="2.6"
      />
      <circle cx="27" cy="15.2" r="4" className="chronicle-logo-dot" />
    </svg>
  )
}
