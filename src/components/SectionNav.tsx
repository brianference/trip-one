import { useActiveSection } from '../hooks/useActiveSection'

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

function ListIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5h.01" />
    </svg>
  )
}

const SECTIONS = [
  { id: 'trip-overview', label: 'Overview', Icon: HomeIcon },
  { id: 'trip-itinerary', label: 'Itinerary', Icon: CalendarIcon },
  { id: 'trip-things-to-do', label: 'Things to do', Icon: ListIcon },
  { id: 'trip-local-info', label: 'Info', Icon: InfoIcon },
]

/**
 * A sticky top nav bar with icon+label tabs that scroll to each section of
 * the unified trip page (rather than navigating to a separate route) and
 * highlight whichever section is currently in view. Shared between Liquid
 * Glass and Chronicle — each supplies its own `classPrefix` so it can style
 * the same markup to match its identity (e.g. "lg" or "chronicle").
 */
export function SectionNav({ classPrefix }: { classPrefix: string }) {
  const activeId = useActiveSection(SECTIONS.map((s) => s.id))

  function handleClick(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className={`${classPrefix}-section-nav`} aria-label="Trip sections">
      {SECTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`${classPrefix}-tap-target ${classPrefix}-section-nav-item${activeId === id ? ` ${classPrefix}-section-nav-item--active` : ''}`}
          aria-current={activeId === id ? 'true' : undefined}
          onClick={() => handleClick(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
