import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

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
    <div className="bento-app-screen">
      <ul className="bento-things-to-do">
        {items.map((item) => (
          <li key={item.name}>
            <span className="bento-thing-badge">{item.category}</span>
            <span className="bento-thing-name">{item.name}</span>
            <button
              type="button"
              className="bento-btn bento-thing-add"
              onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
            >
              Add to itinerary
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
