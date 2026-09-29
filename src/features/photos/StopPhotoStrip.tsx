import { useEffect, useRef, useState, type RefObject } from 'react'
import { tripPhotoUrl, type TripPhoto } from './photosApi'

/** Where focus should land after the DOM settles from a confirm/cancel/delete action. */
type PendingFocus = { kind: 'remove'; photoId: string } | { kind: 'add' } | null

/**
 * One stop's photo thumbnails: lazy-loaded 64px squares cropped with
 * `object-fit: cover`. Each thumbnail's own "Remove photo" control asks for
 * confirmation inline, replacing itself with a "Remove this photo? /
 * Remove / Cancel" mini-prompt — never `window.confirm`, which blocks
 * browser automation and can't be driven by Playwright.
 *
 * Manages focus explicitly, since every path through the confirm flow
 * unmounts whatever was focused: opening the prompt focuses Cancel;
 * cancelling returns focus to that thumbnail's Remove button; confirming
 * moves focus to the next thumbnail's Remove button, or to the stop's
 * "+ Photo" button (via `addButtonRef`) when no photo is left.
 */
export function StopPhotoStrip({
  tripId,
  stopName,
  photos,
  onRemove,
  addButtonRef,
}: {
  /** The trip the photos belong to, for building each thumbnail's `<img src>`. */
  tripId: string
  /** The stop's display name, used in each thumbnail's alt text and remove label. */
  stopName: string
  /** This stop's photos, in the order they should display. */
  photos: TripPhoto[]
  /** Removes one photo by id. */
  onRemove: (photoId: string) => void
  /** The stop's "+ Photo" button — focused after the last photo here is removed. */
  addButtonRef?: RefObject<HTMLButtonElement | null>
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const removeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<PendingFocus>(null)

  // Cancel is the only thing that should receive focus the moment the inline
  // confirm prompt appears — keyed on confirmingId so it fires exactly once
  // per open, not on every render while it stays open.
  useEffect(() => {
    if (confirmingId != null) cancelButtonRef.current?.focus()
  }, [confirmingId])

  // Runs after every render (no dependency array) so it can pick up a focus
  // request regardless of whether it was set from a state update or an event
  // handler, and clears itself immediately so it only ever fires once per
  // request.
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = null
    if (pending.kind === 'add') addButtonRef?.current?.focus()
    else removeButtonRefs.current.get(pending.photoId)?.focus()
  })

  /** Opens the inline confirm prompt for one photo. */
  function startConfirm(photoId: string): void {
    setConfirmingId(photoId)
  }

  /** Closes the prompt without removing anything, returning focus to the same thumbnail's Remove button. */
  function cancelConfirm(photoId: string): void {
    setConfirmingId(null)
    pendingFocus.current = { kind: 'remove', photoId }
  }

  /**
   * Removes one photo. Focus moves to whichever thumbnail will occupy this
   * one's slot once it's gone (computed from the current list, not a
   * round trip to the server), or to "+ Photo" when none will be left.
   * @param photoId - The photo being removed
   * @param index - Its position in the current `photos` list
   */
  function confirmRemove(photoId: string, index: number): void {
    const remainingIds = photos.filter((p) => p.id !== photoId).map((p) => p.id)
    const nextId = remainingIds[index] ?? remainingIds[index - 1]
    pendingFocus.current = nextId ? { kind: 'remove', photoId: nextId } : { kind: 'add' }
    setConfirmingId(null)
    onRemove(photoId)
  }

  return (
    <ul className="chronicle-photo-strip" aria-label={`Photos at ${stopName}`}>
      {photos.map((photo, index) => {
        const confirming = confirmingId === photo.id
        const label = `Photo ${index + 1} of ${photos.length} at ${stopName}`
        return (
          <li key={photo.id} className={`chronicle-photo-thumb${confirming ? ' chronicle-photo-thumb--confirming' : ''}`}>
            <img src={tripPhotoUrl(tripId, photo.id)} alt={label} loading="lazy" className="chronicle-photo-thumb__img" width={64} height={64} />
            {confirming ? (
              <div className="chronicle-photo-thumb__confirm">
                <span>Remove this photo?</span>
                <div className="chronicle-photo-thumb__confirm-btns">
                  <button
                    type="button"
                    className="chronicle-photo-thumb__confirm-yes"
                    onClick={() => confirmRemove(photo.id, index)}
                  >
                    Remove
                  </button>
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="chronicle-photo-thumb__confirm-no"
                    onClick={() => cancelConfirm(photo.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={(el) => {
                  if (el) removeButtonRefs.current.set(photo.id, el)
                  else removeButtonRefs.current.delete(photo.id)
                }}
                type="button"
                className="chronicle-photo-thumb__remove"
                onClick={() => startConfirm(photo.id)}
                aria-label={`Remove photo ${index + 1} of ${photos.length} at ${stopName}`}
              >
                Remove
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
