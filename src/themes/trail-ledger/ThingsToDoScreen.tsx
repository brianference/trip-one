import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

/**
 * Things to do screen for Trail Ledger theme — displays location suggestions in table format.
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
    <table className="tl-suggestions">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.name}>
            <td>{item.name}</td>
            <td>{item.category}</td>
            <td>
              <button type="button" onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}>
                Add
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
