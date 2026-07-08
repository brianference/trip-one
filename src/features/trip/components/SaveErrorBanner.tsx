import { useTripStore } from '../../../store/tripStore'
import { queueTripWrite } from '../../../lib/api/tripWriteQueue'

/**
 * Surfaces a failed save (previously swallowed) and offers a one-tap retry
 * that re-queues the current itinerary + trip length. Renders nothing while
 * saves are succeeding.
 */
export function SaveErrorBanner() {
  const saveError = useTripStore((s) => s.saveError)
  const tripId = useTripStore((s) => s.tripId)

  if (!saveError || !tripId) return null

  function handleRetry() {
    const { itinerary, tripLengthDays, setSaveError } = useTripStore.getState()
    setSaveError(false)
    queueTripWrite(tripId as string, { itinerary, tripLengthDays }, () => useTripStore.getState().setSaveError(true))
  }

  return (
    <div className="chronicle-save-error" role="alert">
      <span>Your last change didn’t save.</span>
      <button type="button" onClick={handleRetry} className="chronicle-save-error-retry">
        Retry
      </button>
    </div>
  )
}
