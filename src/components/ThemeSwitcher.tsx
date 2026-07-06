import { useTripStore, type DesignStyle } from '../store/tripStore'
import { updateTrip } from '../lib/api/client'

// Bento, Field Guide, and Trail Ledger remain in the codebase (and remain
// directly reachable by a trip that was already saved with one of those
// design_style values) but are no longer offered as a choice here — the
// product now standardizes on two: Liquid Glass (default) and Chronicle.
const OPTIONS: { value: DesignStyle; label: string }[] = [
  { value: 'liquid-glass', label: 'Liquid Glass' },
  { value: 'chronicle', label: 'Chronicle' },
]

/**
 * Lets the traveler switch which of the 2 offered themes renders the current
 * trip's unified page, persisting the choice to the trip record via `updateTrip`.
 */
export function ThemeSwitcher({ tripId }: { tripId: string }) {
  const designStyle = useTripStore((s) => s.designStyle)
  const setDesignStyle = useTripStore((s) => s.setDesignStyle)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DesignStyle
    setDesignStyle(next)
    await updateTrip(tripId, { designStyle: next })
  }

  return (
    <label>
      Design
      <select value={designStyle} onChange={handleChange} aria-label="Design">
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
