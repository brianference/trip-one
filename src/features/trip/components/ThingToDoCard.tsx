import type { ThingToDo } from '../../../lib/api/client'
import { directionsUrl } from '../../../lib/itinerary/badges'

/**
 * One nearby suggestion. The name is a button that opens the rich detail panel
 * (reviews, photos, hours, phone); the row also keeps a quick directions link
 * and an add-to-itinerary button.
 */
export function ThingToDoCard({ item, onAdd, onSelect }: { item: ThingToDo; onAdd: () => void; onSelect: () => void }) {
  return (
    <li>
      <span className="chronicle-suggestion-category">{item.category}</span>
      <button type="button" className="chronicle-suggestion-name chronicle-suggestion-name-btn" onClick={onSelect}>
        {item.name}
      </button>
      <a className="chronicle-directions-link" href={directionsUrl(item.name)} target="_blank" rel="noopener noreferrer" title={`Directions to ${item.name}`}>
        Directions
      </a>
      <button type="button" className="chronicle-suggestion-add" onClick={onAdd}>
        Add to itinerary
      </button>
    </li>
  )
}
