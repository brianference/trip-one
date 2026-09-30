import { useEffect, useId, useMemo, useState, type RefObject } from 'react'
import { ChooseStopSheet, type StopChoice } from '../photos/ChooseStopSheet'
import { CameraIcon } from './JoinTripSheet'
import type { RecapContributions } from './useRecapContributions'
import type { RecapPayload } from './types'

/**
 * A recap stop id the server passed through from the stored stop (a uuid).
 * The others are positional (`stop-<index>`): the stop may have no stored id,
 * and the upload route answers 400 for those, so they are never offered.
 */
const UPLOADABLE_STOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the banner does when it first appears. */
export type ContributorEntry = 'open-sheet' | 'focus-button' | 'none'

interface Props {
  /** The loaded recap: its stops are what photos can be added to. */
  payload: RecapPayload
  /** Upload state and actions, shared with the photo strips' remove controls. */
  contributions: RecapContributions
  /** The "Add photos" button; the sheet returns focus here, and so does removing the last own photo. */
  addButtonRef: RefObject<HTMLButtonElement>
  /**
   * `open-sheet` right after joining with "Add your photos", `focus-button`
   * after joining and closing the join sheet (whose trigger is gone), `none`
   * for a member arriving on the page.
   */
  entry: ContributorEntry
}

/**
 * The recap's stops a contributor can add a photo to, in the sheet's shape.
 * @param stops - The recap payload's stops
 */
export function uploadableStops(stops: RecapPayload['stops']): StopChoice[] {
  return stops
    .filter((stop) => UPLOADABLE_STOP_ID.test(stop.stopId))
    .map((stop) => ({ id: stop.stopId, day: stop.day, text: stop.text }))
}

/**
 * Contributor mode's banner on the public recap, in place of "Were you on
 * this trip?" for a signed-in member of the trip (design section 5's banner
 * and photo accent). "Add photos" opens {@link ChooseStopSheet} with the
 * recap's stops, grouped by day; the chosen file is resized and uploaded
 * through the recap-token route. Failures show in an alert, progress and
 * success in a polite status line.
 */
export function ContributorBanner({ payload, contributions, addButtonRef, entry }: Props) {
  const [sheetOpen, setSheetOpen] = useState(entry === 'open-sheet')
  const headingId = useId()
  const stops = useMemo(() => uploadableStops(payload.stops), [payload.stops])
  const firstDay = stops.reduce((min, stop) => Math.min(min, stop.day ?? 1), Number.POSITIVE_INFINITY)
  const { upload, uploading, error, status } = contributions

  // Focus lands on "Add photos" when the join sheet that led here has closed.
  useEffect(() => {
    if (entry === 'focus-button') addButtonRef.current?.focus()
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Opens the stop picker, unless an upload is still running. */
  function openSheet(): void {
    if (uploading) return
    setSheetOpen(true)
  }

  return (
    <section className="chronicle-recap-join-banner" aria-labelledby={headingId}>
      <div className="chronicle-recap-join-banner-top">
        <span className="chronicle-recap-join-banner-icon" aria-hidden="true">
          <CameraIcon size={18} />
        </span>
        <h2 id={headingId} className="chronicle-recap-join-banner-title">
          You’re on this trip
        </h2>
      </div>
      <p className="chronicle-recap-join-banner-text">
        Add your photos to any stop. You can remove the ones you added.
      </p>
      {stops.length === 0 ? (
        <p className="chronicle-recap-join-banner-text">This recap has no stops to add photos to yet.</p>
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          className="chronicle-recap-join-banner-btn"
          onClick={openSheet}
          aria-disabled={uploading || undefined}
        >
          <CameraIcon size={15} />
          {uploading ? 'Uploading…' : 'Add photos'}
        </button>
      )}
      {error && (
        <p role="alert" className="chronicle-recap-join-banner-error">
          {error}
        </p>
      )}
      <p role="status" className="chronicle-visually-hidden">
        {status}
      </p>
      {sheetOpen && (
        <ChooseStopSheet
          itinerary={stops}
          startDate={payload.startDate}
          selectedDay={Number.isFinite(firstDay) ? firstDay : 1}
          triggerRef={addButtonRef}
          onClose={() => setSheetOpen(false)}
          onChoosePhoto={(stopId, file) => {
            const stopName = stops.find((stop) => stop.id === stopId)?.text ?? 'this stop'
            setSheetOpen(false)
            void upload(stopId, stopName, file)
          }}
        />
      )}
    </section>
  )
}
