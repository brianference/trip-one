import { useRef, type ChangeEvent } from 'react'

/**
 * The control that starts adding a photo to one itinerary stop: a real
 * `<button>` that opens a visually hidden file input. The input carries no
 * `capture` attribute, so mobile browsers offer both the camera and the
 * photo library rather than jumping straight to the camera.
 */
export function StopPhotoButton({
  stopName,
  uploading,
  onSelect,
}: {
  /** The stop's display name, used in the button's accessible label. */
  stopName: string
  /** True while a photo is uploading for this stop; disables the control and swaps its label. */
  uploading: boolean
  /** Called with the file the traveler picked; the caller resizes and uploads it. */
  onSelect: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

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

  return (
    <>
      <button
        type="button"
        className="chronicle-photo-add-btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
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
    </>
  )
}
