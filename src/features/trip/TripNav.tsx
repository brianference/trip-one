import { NavLink } from 'react-router-dom'

const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function HomeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

function WeatherIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z" />
      <path d="M8 5.5 8.7 6.7M12 3v1.5M16 5.5l-.7 1.2" />
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
  return [
    { to: `/trip/${tripId}`, end: true, label: 'Home', Icon: HomeIcon },
    { to: `/trip/${tripId}/itinerary`, end: false, label: 'Itinerary', Icon: CalendarIcon },
    { to: `/trip/${tripId}/map`, end: false, label: 'Map', Icon: MapIcon },
    { to: `/trip/${tripId}/things-to-do`, end: false, label: 'Things to do', Icon: ListIcon },
    { to: `/trip/${tripId}/weather`, end: false, label: 'Weather', Icon: WeatherIcon },
  ]
}

/** The pill nav bar, shared between `TripShell`'s persistent sticky nav and the footer's quick-link row. */
export function TripNav({ tripId, variant }: { tripId: string; variant: 'pill' | 'footer' }) {
  const pages = tripPages(tripId)
  const navClass = variant === 'pill' ? 'chronicle-section-nav' : 'chronicle-footer-links'
  const itemClass = variant === 'pill' ? 'chronicle-tap-target chronicle-section-nav-item' : 'chronicle-footer-link'

  return (
    <nav className={navClass} aria-label="Trip pages">
      {pages.map(({ to, end, label, Icon }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `${itemClass}${isActive ? ` ${itemClass}--active` : ''}`}>
          {variant === 'pill' && <Icon />}
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
