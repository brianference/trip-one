import { useState } from 'react'
import { tripPhotoUrl, type TripPhoto } from './photosApi'

/**
 * One stop's photo thumbnails: lazy-loaded 64px squares cropped with
 * `object-fit: cover`. Each thumbnail's own "Remove photo" control asks for
 * confirmation inline, replacing itself with a "Remove this photo? /
 * Remove / Cancel" mini-prompt — never `window.confirm`, which blocks
 * browser automation and can't be driven by Playwright.
 */
export function StopPhotoStrip({
  tripId,
  stopName,
  photos,
  onRemove,
}: {
  /** The trip the photos belong to, for building each thumbnail's `<img src>`. */
  tripId: string
  /** The stop's display name, used in each thumbnail's alt text and remove label. */
  stopName: string
  /** This stop's photos, in the order they should display. */
  photos: TripPhoto[]
  /** Removes one photo by id. */
  onRemove: (photoId: string) => void
}) {
  return (
    <ul className="chronicle-photo-strip" aria-label={`Photos at ${stopName}`}>
      {photos.map((photo, index) => (
        <StopPhotoThumb
          key={photo.id}
          src={tripPhotoUrl(tripId, photo.id)}
          index={index}
          total={photos.length}
          stopName={stopName}
          onRemove={() => onRemove(photo.id)}
        />
      ))}
    </ul>
  )
}

/**
 * One removable thumbnail. Clicking "Remove photo …" swaps the remove
 * button for an inline confirm/cancel prompt rather than firing `onRemove`
 * (or a browser `confirm()` dialog) immediately.
 */
function StopPhotoThumb({
  src,
  index,
  total,
  stopName,
  onRemove,
}: {
  src: string
  index: number
  total: number
  stopName: string
  onRemove: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const label = `Photo ${index + 1} of ${total} at ${stopName}`

  return (
    <li className={`chronicle-photo-thumb${confirming ? ' chronicle-photo-thumb--confirming' : ''}`}>
      <img src={src} alt={label} loading="lazy" className="chronicle-photo-thumb__img" width={64} height={64} />
      {confirming ? (
        <div className="chronicle-photo-thumb__confirm">
          <span>Remove this photo?</span>
          <div className="chronicle-photo-thumb__confirm-btns">
            <button type="button" className="chronicle-photo-thumb__confirm-yes" onClick={onRemove}>
              Remove
            </button>
            <button type="button" className="chronicle-photo-thumb__confirm-no" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="chronicle-photo-thumb__remove"
          onClick={() => setConfirming(true)}
          aria-label={`Remove photo ${index + 1} of ${total} at ${stopName}`}
        >
          Remove
        </button>
      )}
    </li>
  )
}
