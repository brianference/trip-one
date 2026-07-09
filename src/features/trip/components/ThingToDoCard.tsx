import type { ThingToDo } from '../../../lib/api/client'
import { directionsUrl } from '../../../lib/itinerary/badges'

/** Title-case a Google category slug ("tourist_attraction" → "Tourist attraction"). */
function prettyCategory(category: string): string {
  const spaced = category.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * One nearby suggestion as a card: category and rating up top, the name as a
 * button that opens the rich detail panel (reviews, photos, hours, phone), and
 * a clear action row — Details, Directions, and Add to itinerary.
 */
export function ThingToDoCard({ item, onAdd, onSelect }: { item: ThingToDo; onAdd: () => void; onSelect: () => void }) {
  return (
    <li className="chronicle-ttd-card">
      <div className="chronicle-ttd-head">
        <span className="chronicle-suggestion-category">{prettyCategory(item.category)}</span>
        {item.rating != null && (
          <span className="chronicle-ttd-rating">
            <span aria-hidden="true">★</span> {item.rating.toFixed(1)}
          </span>
        )}
      </div>

      <button type="button" className="chronicle-ttd-name" onClick={onSelect}>
        {item.name}
      </button>

      <div className="chronicle-ttd-actions">
        <button type="button" className="chronicle-ttd-details" onClick={onSelect}>
          Details
        </button>
        <a
          className="chronicle-ttd-directions"
          href={directionsUrl(item.name)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Directions to ${item.name}`}
        >
          Directions
        </a>
        <button type="button" className="chronicle-ttd-add" onClick={onAdd} aria-label={`Add ${item.name} to itinerary`}>
          Add
        </button>
      </div>
    </li>
  )
}
