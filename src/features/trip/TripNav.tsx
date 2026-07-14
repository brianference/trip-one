import { NavLink } from 'react-router-dom'

// Lighter, cohesive line icons (Lucide-style, 1.75 stroke) — crisper at tab
// size than the old 2px glyphs, and Phrasebook uses a translate mark so it
// doesn't read as a duplicate of the Chat speech-bubble.
const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function HomeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="m3 10.4 9-7 9 7" />
      <path d="M5 9v10.5a.5.5 0 0 0 .5.5H9v-6h6v6h3.5a.5.5 0 0 0 .5-.5V9" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="m9 4-6 2.2v13.6l6-2.2 6 2.2 6-2.2V3.8l-6 2.2z" />
      <path d="M9 4v13.6M15 6.4V20" />
    </svg>
  )
}

function WeatherIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="8" cy="8.5" r="3.2" />
      <path d="M8 2.6v1.4M3.4 8.5H2M8 13v1.4M13 8.5h1.4M4.6 5.1 3.6 4.1M12.4 5.1l1-1" />
      <path d="M17.5 20a4 4 0 0 0 .2-8 5 5 0 0 0-9.4-.6A3.5 3.5 0 0 0 8.5 20z" />
    </svg>
  )
}

function PhraseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 5h8" />
      <path d="M8 3v2c0 3.5-2 6.3-5 7.5" />
      <path d="M5.5 9.2c.9 2 2.8 3.4 5 3.8" />
      <path d="m13 21 4-9 4 9" />
      <path d="M14.4 18h5.2" />
    </svg>
  )
}

function NewTripIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.3v7.4M8.3 12h7.4" />
    </svg>
  )
}

/**
 * Real routes, not tabs-within-one-component and not anchor-scroll — each
 * link navigates to a distinct URL under `/trip/:id/*`, so back/forward and
 * direct deep links all work correctly. `end` on the Overview link keeps it
 * from matching every nested trip route.
 */
function tripPages(tripId: string) {
  // Map, itinerary, and things-to-do are one consolidated "Plan" page now.
  // "New trip" leaves the current trip for the homepage, where you pick a new
  // location — the current trip stays saved at its own link.
  return [
    { to: `/trip/${tripId}`, end: true, label: 'Home', Icon: HomeIcon },
    { to: `/trip/${tripId}/plan`, end: false, label: 'Plan', Icon: MapIcon },
    { to: `/trip/${tripId}/weather`, end: false, label: 'Weather', Icon: WeatherIcon },
    { to: `/trip/${tripId}/phrasebook`, end: false, label: 'Phrases', Icon: PhraseIcon },
    { to: '/', end: true, label: 'New trip', Icon: NewTripIcon },
  ]
}

/**
 * The pill nav bar, shared between `TripShell`'s persistent sticky nav and the
 * footer's quick-link row. When `currentTempF` is provided, the Weather item
 * shows the destination's live temperature, so the current conditions are
 * visible from anywhere without opening the Weather page.
 */
export function TripNav({ tripId, variant, currentTempF }: { tripId: string; variant: 'pill' | 'footer'; currentTempF?: number | null }) {
  const pages = tripPages(tripId)
  const navClass = variant === 'pill' ? 'chronicle-section-nav' : 'chronicle-footer-links'
  const itemClass = variant === 'pill' ? 'chronicle-tap-target chronicle-section-nav-item' : 'chronicle-footer-link'

  return (
    <nav className={navClass} aria-label="Trip pages">
      {pages.map(({ to, end, label, Icon }) => {
        const showTemp = label === 'Weather' && currentTempF != null
        return (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${itemClass}${isActive ? ` ${itemClass}--active` : ''}`}>
            {variant === 'pill' && <Icon />}
            <span className="chronicle-nav-label">
              {label}
              {showTemp && <span className="chronicle-nav-temp"> {Math.round(currentTempF as number)}°</span>}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
