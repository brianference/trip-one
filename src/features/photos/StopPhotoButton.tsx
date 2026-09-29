import { forwardRef, useEffect, useRef, useState, type ChangeEvent } from 'react'

/**
 * The control that starts adding a photo to one itinerary stop: a real
 * `<button>` that opens a visually hidden file input. The input carries no
 * `capture` attribute, so mobile browsers offer both the camera and the
 * photo library rather than jumping straight to the camera.
 *
 * Stays focusable through an upload — `aria-disabled` plus a click guard,
 * never the `disabled` attribute, which would drop focus (and screen-reader
 * context) the instant an upload starts. A visually hidden `role="status"`
 * region announces "Uploading photo to {stop}…" and then "Photo added to
 * {stop}", since the visible label swap alone isn't announced.
 *
 * Forwards its ref to the underlying `<button>` so a sibling `StopPhotoStrip`
 * can return focus here after the last photo at this stop is removed.
 *
 * Two visual variants share the same behaviour and accessible name:
 * `compact` (default) is the small "+ Photo" pill used inline on an
 * itinerary row; `primary` is the full-width dusk pill with a camera icon
 * and visible "Add photos" text used at the top of the stop popup.
 */
export const StopPhotoButton = forwardRef<
  HTMLButtonElement,
  {
    /** The stop's display name, used in the button's accessible label and status announcements. */
    stopName: string
    /** True while a photo is uploading for this stop; keeps the control focusable but inert, and swaps its label. */
    uploading: boolean
    /** Called with the file the traveler picked; the caller resizes and uploads it. */
    onSelect: (file: File) => void
    /** 'compact' (default, an itinerary row) or 'primary' (the stop popup's full-width pill). */
    variant?: 'primary' | 'compact'
  }
>(function StopPhotoButton({ stopName, uploading, onSelect, variant = 'compact' }, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  const wasUploading = useRef(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (uploading) {
      wasUploading.current = true
      setStatus(`Uploading photo to ${stopName}…`)
    } else if (wasUploading.current) {
      wasUploading.current = false
      setStatus(`Photo added to ${stopName}`)
    }
  }, [uploading, stopName])

  /**
   * Hands the chosen file to `onSelect`, then clears the input's value so
   * picking the exact same file again still fires a change event.
   * @param event - The file input's change event
   */
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onSelect(file)
  }

  /** Opens the hidden file input, unless an upload for this stop is already in flight. */
  function handleClick(): void {
    if (uploading) return
    inputRef.current?.click()
  }

  const className =
    variant === 'primary' ? 'chronicle-photo-add-btn chronicle-photo-add-btn--primary' : 'chronicle-photo-add-btn'

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={handleClick}
        aria-disabled={uploading}
        aria-label={`Add photo to ${stopName}`}
      >
        {variant === 'primary' && !uploading && (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="chronicle-photo-add-btn__icon"
          >
            <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        )}
        {uploading ? 'Uploading…' : variant === 'primary' ? 'Add photos' : '+ Photo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="chronicle-visually-hidden"
        onChange={handleChange}
        tabIndex={-1}
        aria-label={`Choose a photo for ${stopName}`}
      />
      <span role="status" className="chronicle-visually-hidden">
        {status}
      </span>
    </>
  )
})
