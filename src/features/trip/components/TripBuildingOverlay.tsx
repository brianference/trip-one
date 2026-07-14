import { Logo } from '../../../components/Logo'

/**
 * A full-screen overlay shown while a trip is being built from the homepage.
 * The location lookup plus the grounded plan can take a few seconds, and a
 * bare disabled button read as "nothing happened" — so this covers the screen
 * with the brand, an animated row of map pins, and the live status
 * ("Finding real places in Rome…") so the request clearly registers.
 */
export function TripBuildingOverlay({ status }: { status?: string }) {
  return (
    <div className="chronicle-building-overlay" role="status" aria-live="polite">
      <div className="chronicle-building-card">
        <div className="chronicle-building-anim" aria-hidden="true">
          <span className="chronicle-building-pin" />
          <span className="chronicle-building-pin" />
          <span className="chronicle-building-pin" />
        </div>
        <Logo size={26} />
        <p className="chronicle-building-status">{status || 'Building your trip…'}</p>
        <p className="chronicle-building-sub">Finding real places, then planning your days.</p>
      </div>
    </div>
  )
}
