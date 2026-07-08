import type { ItineraryItem } from '../../../lib/validation/schemas'
import { badgeFor, directionsUrl } from '../../../lib/itinerary/badges'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

/** One itinerary stop: time, type badge, directions link, move/remove controls. */
export function ItineraryEntryRow({
  item,
  isFirst,
  isLast,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: {
  item: ItineraryItem
  isFirst: boolean
  isLast: boolean
  onMoveEarlier: () => void
  onMoveLater: () => void
  onRemove: () => void
}) {
  const badge = badgeFor(item)
  return (
    <li className="chronicle-entry">
      <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
      <span className="chronicle-entry-time">{item.time}</span>
      <span className={`chronicle-badge chronicle-badge--${badge.tone}`}>{badge.label}</span>
      <span className="chronicle-entry-text">{item.text}</span>
      <a
        className="chronicle-directions-link"
        href={directionsUrl(item.q ?? item.text)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Directions to ${item.text}`}
      >
        Directions
      </a>
      <div className="chronicle-move-btns">
        <button type="button" onClick={onMoveEarlier} disabled={isFirst} aria-label={`Move ${item.text} earlier`} className="chronicle-move-btn">
          ↑
        </button>
        <button type="button" onClick={onMoveLater} disabled={isLast} aria-label={`Move ${item.text} later`} className="chronicle-move-btn">
          ↓
        </button>
      </div>
      <button type="button" className="chronicle-entry-remove" onClick={onRemove} aria-label={`Remove ${item.text}`}>
        ×
      </button>
    </li>
  )
}
