import type { ItineraryItem } from '../../../lib/validation/schemas'
import { buildIcs } from '../../../lib/itinerary/exportIcs'

function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip'
  )
}

/**
 * Itinerary export: a print-friendly view (the browser's own print/save-as-PDF)
 * and a downloadable .ics calendar file. The calendar needs real dates, so it's
 * only offered once a start date is set — otherwise a short hint points there.
 *
 * @param itinerary - The trip's stops
 * @param startDate - Trip start date (YYYY-MM-DD), or null
 * @param destinationName - Used in the calendar name, event locations, and filename
 */
export function TripExport({
  itinerary,
  startDate,
  destinationName,
}: {
  itinerary: ItineraryItem[]
  startDate: string | null
  destinationName: string
}) {
  const canExportCalendar = !!startDate && itinerary.length > 0

  function downloadIcs() {
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
    <div className="chronicle-export" aria-label="Export trip">
      <button type="button" className="chronicle-export-btn" onClick={() => window.print()}>
        Print / PDF
      </button>
      {canExportCalendar ? (
        <button type="button" className="chronicle-export-btn" onClick={downloadIcs}>
          Add to calendar
        </button>
      ) : (
        <span className="chronicle-export-hint">Set a start date to add to your calendar</span>
      )}
    </div>
  )
}
