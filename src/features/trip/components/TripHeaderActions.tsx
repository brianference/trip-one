import { useRef, useState } from 'react'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { buildIcs } from '../../../lib/itinerary/exportIcs'
import { ChooseStopSheet } from '../../photos/ChooseStopSheet'
import type { UseTripPhotosResult } from '../../photos/useTripPhotos'

/** Turns a destination name into a safe filename fragment for the downloaded .ics file. */
function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip'
  )
}

/**
 * The "Your trip" header's action toolbar: a joined [Print / PDF | Add
 * photos] pill (design: docs/design/photo-controls-option-a.html sections
 * 3-4), plus the calendar export button or its hint when no start date is
 * set yet.
 *
 * Print/PDF uses the browser's own print/save-as-PDF. Add photos opens
 * `ChooseStopSheet` so the traveler can pick which stop a photo belongs to,
 * then hands the file to `photos.upload`. Add photos (and the sheet it
 * opens) is omitted entirely on demo trips, which reject photo writes
 * server-side — showing a control that always fails would be worse than not
 * showing one.
 *
 * @param itinerary - The trip's stops: exported to print and the calendar file, and listed in the stop-picker sheet
 * @param startDate - Trip start date (YYYY-MM-DD), or null — gates the calendar export
 * @param destinationName - Used in the calendar name, event locations, and filename
 * @param demoTrip - True on read-only demo trips — hides Add photos entirely
 * @param selectedDay - The day currently open on the plan page — its stops are offered first in the sheet
 * @param photos - The trip's photos hook result; `upload` is called with the chosen stop and file
 */
export function TripHeaderActions({
  itinerary,
  startDate,
  destinationName,
  demoTrip,
  selectedDay,
  photos,
}: {
  itinerary: ItineraryItem[]
  startDate: string | null
  destinationName: string
  demoTrip: boolean
  selectedDay: number
  photos: UseTripPhotosResult
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const addPhotosRef = useRef<HTMLButtonElement>(null)
  const canExportCalendar = !!startDate && itinerary.length > 0

  /** Builds the trip's .ics calendar file and triggers a browser download of it. */
  function downloadIcs(): void {
    const ics = buildIcs(itinerary, startDate, destinationName, new Date())
    if (!ics) return
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trip-to-${fileSlug(destinationName)}.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="chronicle-export" aria-label="Trip actions">
      <div className="chronicle-split-group">
        <button type="button" className="chronicle-split-seg chronicle-split-seg--left" onClick={() => window.print()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V3h12v6" />
            <path d="M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
            <path d="M6 14h12v7H6z" />
          </svg>
          Print / PDF
        </button>
        {!demoTrip && (
          <button
            ref={addPhotosRef}
            type="button"
            className="chronicle-split-seg chronicle-split-seg--right"
            onClick={() => setSheetOpen(true)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Add photos
          </button>
        )}
      </div>
      {canExportCalendar ? (
        <button type="button" className="chronicle-export-btn" onClick={downloadIcs}>
          Add to calendar
        </button>
      ) : (
        <span className="chronicle-export-hint">Set a start date to add to your calendar</span>
      )}
      {sheetOpen && !demoTrip && (
        <ChooseStopSheet
          itinerary={itinerary}
          startDate={startDate}
          selectedDay={selectedDay}
          triggerRef={addPhotosRef}
          onClose={() => setSheetOpen(false)}
          onChoosePhoto={(stopId, file) => {
            photos.upload(stopId, file)
            setSheetOpen(false)
          }}
        />
      )}
    </div>
  )
}
