import type { ThingToDo } from '../../../lib/api/client'
import { directionsUrl } from '../../../lib/itinerary/badges'

/** One nearby suggestion: name, category, real directions link, add-to-itinerary button. */
export function ThingToDoCard({ item, onAdd }: { item: ThingToDo; onAdd: () => void }) {
  return (
    <li>
      <span className="chronicle-suggestion-category">{item.category}</span>
      <span className="chronicle-suggestion-name">{item.name}</span>
      <a className="chronicle-directions-link" href={directionsUrl(item.name)} target="_blank" rel="noopener noreferrer" title={`Directions to ${item.name}`}>
        Directions
      </a>
      <button type="button" className="chronicle-suggestion-add" onClick={onAdd}>
        Add to itinerary
      </button>
    </li>
  )
}
