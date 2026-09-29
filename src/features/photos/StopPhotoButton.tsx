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
  }
>(function StopPhotoButton({ stopName, uploading, onSelect }, ref) {
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

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="chronicle-photo-add-btn"
        onClick={handleClick}
        aria-disabled={uploading}
        aria-label={`Add photo to ${stopName}`}
      >
        {uploading ? 'Uploading…' : '+ Photo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="chronicle-visually-hidden"
        onChange={handleChange}
        tabIndex={-1}
      />
      <span role="status" className="chronicle-visually-hidden">
        {status}
      </span>
    </>
  )
})
