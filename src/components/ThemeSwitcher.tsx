import { useTripStore, type DesignStyle } from '../store/tripStore'
import { updateTrip } from '../lib/api/client'

const OPTIONS: { value: DesignStyle; label: string }[] = [
  { value: 'bento', label: 'Bento' },
  { value: 'chronicle', label: 'Chronicle' },
  { value: 'field-guide', label: 'Field Guide' },
  { value: 'liquid-glass', label: 'Liquid Glass' },
  { value: 'trail-ledger', label: 'Trail Ledger' },
]

/**
 * Lets the traveler switch which of the 5 themes renders the current trip's
 * Overview/Itinerary/ThingsToDo screens, persisting the choice to the trip
 * record via `updateTrip`.
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
