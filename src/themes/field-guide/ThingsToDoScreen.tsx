import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Field Guide theme — displays location attractions as postcard grid.
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
    <div className="field-guide-postcard-grid">
      {items.map((item) => (
        <div key={item.name} className="field-guide-postcard">
          <p>
            <span>{item.name}</span> ({item.category})
          </p>
          <button type="button" onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}>
            Add to guide
          </button>
        </div>
      ))}
    </div>
  )
}
