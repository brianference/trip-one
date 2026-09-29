import { useRef, useState } from 'react'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { roleFor, slotLabel, directionsUrl } from '../../../lib/itinerary/badges'
import { StopPhotoButton } from '../../photos/StopPhotoButton'
import { StopPhotoStrip } from '../../photos/StopPhotoStrip'
import type { TripPhoto } from '../../photos/photosApi'

const DOT_COLOR: Record<string, string> = { fixed: '#a5d088', travel: '#ffd700', option: '#5ba3ff' }

/**
 * One itinerary stop. The default row stays uncluttered — time (or soft slot),
 * role badge, name, directions — with all editing (set a clock time, move to a
 * different day, reorder within the day) tucked behind a per-row Edit toggle so
 * the list reads cleanly on mobile until the traveler wants to change something.
 */
export function ItineraryEntryRow({
  item,
  position,
  total,
  isFirst,
  isLast,
  dayCount,
  onOpen,
  onMoveEarlier,
  onMoveLater,
  onMoveToDay,
  onSetTime,
  onRemove,
  stopPhotos,
  uploadingPhoto,
  onAddPhoto,
  onRemovePhoto,
  tripId,
  demoTrip,
}: {
  item: ItineraryItem
  position: number
  total: number
  isFirst: boolean
  isLast: boolean
  dayCount: number
  /** Opens the place's rich detail (photos, reviews, hours). Makes the name a link. */
  onOpen?: () => void
  onMoveEarlier: () => void
  onMoveLater: () => void
  onMoveToDay: (day: number) => void
  onSetTime: (time: string) => void
  onRemove: () => void
  /** This stop's photos. Empty when the stop has no stable id yet or has none uploaded. */
  stopPhotos: TripPhoto[]
  /** True while a photo is uploading for this stop. */
  uploadingPhoto: boolean
  /** Adds a photo to this stop. Undefined when the stop has no stable `id` — the add button is hidden in that case. */
  onAddPhoto?: (file: File) => void
  /** Removes one of this stop's photos by id. */
  onRemovePhoto: (photoId: string) => void
  /** The trip these photos belong to, for building thumbnail URLs. */
  tripId: string
  /** True on read-only demo trips, where photo uploads are rejected server-side — hides the add button. */
  demoTrip: boolean
}) {
  const [editing, setEditing] = useState(false)
  const addPhotoRef = useRef<HTMLButtonElement>(null)
  const badge = roleFor(item)
  // Always show something in the time column: the clock time, or a soft
  // time-of-day slot ("Morning", "Evening") derived from the stop's position.
  const timeLabel = item.time?.trim() ? item.time : slotLabel(position, total)
  const day = item.day ?? 1
  return (
    <li className="chronicle-entry">
      <div className="chronicle-entry-main">
        <span data-testid={`timeline-dot-${item.type}`} style={{ background: DOT_COLOR[item.type] }} />
        <span className={`chronicle-entry-time${item.time?.trim() ? '' : ' chronicle-entry-time--soft'}`}>{timeLabel}</span>
        <span className={`chronicle-badge chronicle-badge--${badge.tone}`}>{badge.label}</span>
        {onOpen ? (
          <button type="button" className="chronicle-entry-text chronicle-entry-text--link" onClick={onOpen} title={`Details for ${item.text}`}>
            {item.text}
          </button>
        ) : (
          <span className="chronicle-entry-text">{item.text}</span>
        )}
        <a
          className="chronicle-directions-link"
          href={directionsUrl(item.q ?? item.text)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Directions to ${item.text}`}
        >
          Directions
        </a>
        <button
          type="button"
          className="chronicle-entry-edit-toggle"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={`Edit ${item.text}`}
        >
          Edit
        </button>
        <button type="button" className="chronicle-entry-remove" onClick={onRemove} aria-label={`Remove ${item.text}`}>
          ×
        </button>
      </div>

      {editing && (
        <div className="chronicle-entry-edit">
          <label className="chronicle-entry-edit-field">
            <span>Time</span>
            <input type="time" value={item.time?.trim() ? item.time : ''} onChange={(e) => onSetTime(e.target.value)} />
          </label>
          {dayCount > 1 && (
            <label className="chronicle-entry-edit-field">
              <span>Day</span>
              <select value={day} onChange={(e) => onMoveToDay(Number(e.target.value))} aria-label={`Move ${item.text} to a different day`}>
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Day {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="chronicle-move-btns">
            <button type="button" onClick={onMoveEarlier} disabled={isFirst} aria-label={`Move ${item.text} earlier`} className="chronicle-move-btn">
              ↑
            </button>
            <button type="button" onClick={onMoveLater} disabled={isLast} aria-label={`Move ${item.text} later`} className="chronicle-move-btn">
              ↓
            </button>
          </div>
        </div>
      )}

      {/* A stop without a stable id (legacy data before the store backfill ran) gets
          no photo controls — there is nowhere stable to key an upload against. */}
      {item.id && (
        <div className="chronicle-photo-row">
          {!demoTrip && onAddPhoto && (
            <StopPhotoButton ref={addPhotoRef} stopName={item.text} uploading={uploadingPhoto} onSelect={onAddPhoto} />
          )}
          {stopPhotos.length > 0 && (
            <StopPhotoStrip
              tripId={tripId}
              stopName={item.text}
              photos={stopPhotos}
              onRemove={onRemovePhoto}
              addButtonRef={addPhotoRef}
            />
          )}
        </div>
      )}
    </li>
  )
}
