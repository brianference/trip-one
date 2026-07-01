import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Liquid Glass theme — displays cached location suggestions with add buttons.
 */
export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    let cancelled = false
    fetchLocation(locationSlug)
      .then((loc) => {
        if (!cancelled) setItems(loc.thingsToDo)
      })
      .catch((err) => {
        logger.error('failed to load things to do', err)
      })
    return () => {
      cancelled = true
    }
  }, [locationSlug])

  return (
    <ul className="lg-glass-card">
      {items.map((item) => (
        <li key={item.name}>
          <span>{item.name}</span>
          <span> ({item.category})</span>
          <button
            type="button"
            className="lg-tap-target"
            onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
          >
            Add
          </button>
        </li>
      ))}
    </ul>
  )
}
