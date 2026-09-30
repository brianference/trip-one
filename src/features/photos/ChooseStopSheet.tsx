import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { dayHeading } from '../../lib/itinerary/tripDates'

/**
 * What the sheet needs to know about a stop. An `ItineraryItem` (the owner's
 * plan page) fits as is; the public recap maps its stops to this shape.
 */
export interface StopChoice {
  /** The id a photo upload names the stop by; stops without one are not listed. */
  id?: string
  /** 1-indexed day; a stop without one is listed under day 1. */
  day?: number
  /** The stop's display name. */
  text: string
}

/** A stop with its id confirmed present (see `groupStopsByDay`). */
type EligibleStop = StopChoice & { id: string }

/** One day's eligible stops, in the sheet's display order. */
interface DayGroup {
  day: number
  stops: EligibleStop[]
}

/** Elements the focus trap below will cycle Tab/Shift+Tab between. */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Groups itinerary stops that carry a stable id by day, ordered with
 * `selectedDay` first and the remaining days ascending after it. A stop
 * added before ids existed (or mid-write, before `ensureStopIds` runs) has
 * no id yet and is left out rather than offered as an upload target it
 * can't actually be attached to. Days with no eligible stops are omitted.
 */
function groupStopsByDay(itinerary: StopChoice[], selectedDay: number): DayGroup[] {
  const byDay = new Map<number, EligibleStop[]>()
  for (const item of itinerary) {
    if (!item.id) continue
    const day = item.day ?? 1
    const group = byDay.get(day)
    if (group) group.push(item as EligibleStop)
    else byDay.set(day, [item as EligibleStop])
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b)
  const ordered = [selectedDay, ...days.filter((d) => d !== selectedDay)]
  return ordered.filter((d) => byDay.has(d)).map((day) => ({ day, stops: byDay.get(day) as EligibleStop[] }))
}

/**
 * The "Which stop is this photo for?" sheet opened from the trip header's
 * "Add photos" button (see `TripHeaderActions`) and from the public recap's
 * contributor "Add photos" button (see `ContributorBanner`). Lists every stop
 * that has a stable id as a native radio group, grouped under "Day N"
 * headings with the currently selected day first, and defaults to that
 * day's first stop. Picking a file uploads it to the selected stop and
 * closes the sheet — the itinerary row's own `StopPhotoButton` for that stop
 * already announces the upload through its live region, so this sheet
 * doesn't need one of its own.
 *
 * An accessible modal dialog: traps Tab focus inside itself, closes on
 * Escape or a click on the overlay, and returns focus to the button that
 * opened it (`triggerRef`) when it unmounts.
 */
export function ChooseStopSheet({
  itinerary,
  startDate,
  selectedDay,
  onClose,
  onChoosePhoto,
  triggerRef,
}: {
  /** The trip's stops; only stops with an id are listed. */
  itinerary: StopChoice[]
  /** The trip's start date, so each day heading can show a real date when known. */
  startDate: string | null
  /** The day currently open on the plan page — its stops are listed, and defaulted to, first. */
  selectedDay: number
  /** Called to close the sheet, for any reason: Escape, an overlay click, or after a choice. */
  onClose: () => void
  /** Called with the chosen stop's id and the picked file. */
  onChoosePhoto: (stopId: string, file: File) => void
  /** The "Add photos" button that opened this sheet, so focus returns there on close. */
  triggerRef: RefObject<HTMLButtonElement>
}) {
  const dayGroups = useMemo(() => groupStopsByDay(itinerary, selectedDay), [itinerary, selectedDay])
  const [stopId, setStopId] = useState<string | null>(dayGroups[0]?.stops[0]?.id ?? null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // One radio name per day group: each day is its own role="radiogroup", and
  // a shared name would make arrow keys run across every day as one group.
  const radioNamePrefix = useId()

  useEffect(() => {
    /** Every enabled focusable element inside the sheet, in DOM order. */
    function focusableElements(): HTMLElement[] {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute('disabled'))
    }
    /**
     * Escape closes the sheet; Tab and Shift+Tab wrap between its first and
     * last focusable elements so focus never leaves the dialog.
     * @param event - The document-level keydown
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusableElements()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // Lock background scroll while the sheet is open, matching PlaceDetailPanel.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      triggerRef.current?.focus()
    }
    // Runs once on mount/unmount only: re-running on every stopId change
    // would reset the trap and could steal focus back off the traveler's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Opens the hidden file input's picker for the selected stop. */
  function openPicker(): void {
    fileInputRef.current?.click()
  }

  /**
   * Hands the picked file and the selected stop to `onChoosePhoto`, then
   * clears the input so picking the same file again still fires a change.
   * @param event - The file input's change event
   */
  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && stopId) onChoosePhoto(stopId, file)
  }

  const selectedStop = dayGroups.flatMap((g) => g.stops).find((s) => s.id === stopId) ?? null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="choose-stop-sheet-title"
        tabIndex={-1}
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-lifted)] sm:max-h-[80dvh] sm:rounded-[var(--radius-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--hairline)] px-5 py-4">
          <h2
            id="choose-stop-sheet-title"
            className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-lg font-semibold leading-snug"
          >
            Which stop is this photo for?
          </h2>
          <button
            type="button"
            className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-xl leading-none hover:bg-[var(--surface-muted)]"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {dayGroups.length === 0 ? (
            <p className="text-sm opacity-70">Add a stop to this trip before adding photos.</p>
          ) : (
            dayGroups.map((group) => (
              <div key={group.day} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-65">{dayHeading(startDate, group.day)}</h3>
                <div role="radiogroup" aria-label={dayHeading(startDate, group.day)} className="flex flex-col gap-1">
                  {group.stops.map((stop) => (
                    <label
                      key={stop.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
                    >
                      <input
                        type="radio"
                        name={`${radioNamePrefix}-day-${group.day}`}
                        value={stop.id}
                        checked={stopId === stop.id}
                        onChange={() => setStopId(stop.id)}
                        className="size-4"
                      />
                      {stop.text}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--hairline)] px-5 py-4">
          <button type="button" className="chronicle-photo-add-btn--primary" onClick={openPicker} disabled={!stopId}>
            Choose photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="chronicle-visually-hidden"
            tabIndex={-1}
            onChange={handleFileChange}
            aria-label={selectedStop ? `Choose a photo for ${selectedStop.text}` : 'Choose a photo'}
          />
        </div>
      </div>
    </div>
  )
}
