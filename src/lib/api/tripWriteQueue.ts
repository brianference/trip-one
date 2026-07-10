import { updateTrip } from './client'
import type { ItineraryItem } from '../validation/schemas'
import { logger } from '../logger'

/**
 * The write-through save coordinator for a trip's itinerary/length.
 *
 * The bug this fixes: every itinerary mutation used to call
 * `updateTrip(id, patch).catch(logger.error)` fire-and-forget. Two rapid
 * edits fire two PATCHes with no ordering guarantee — if the older one's
 * response lands last, it overwrites the newer state server-side, and any
 * failure was swallowed while the UI still looked "saved."
 *
 * This serializes writes per trip: at most one PATCH is in flight, and while
 * one is running, further edits coalesce into a single `pending` patch that
 * always holds the LATEST state. When the in-flight write finishes, the
 * newest pending state (if any) is sent. Last-write-wins by construction, so
 * a stale response can never clobber newer data. Failures are reported via
 * the caller's `onError` so the UI can surface them.
 */

type Patch = { itinerary?: ItineraryItem[]; tripLengthDays?: number | null; startDate?: string | null }
type Queue = { inFlight: boolean; pending: Patch | null; onError?: (err: unknown) => void }

const queues = new Map<string, Queue>()

async function flush(tripId: string): Promise<void> {
  const q = queues.get(tripId)
  if (!q || q.inFlight || !q.pending) return
  q.inFlight = true
  const patch = q.pending
  q.pending = null
  try {
    await updateTrip(tripId, patch)
  } catch (err) {
    logger.error('failed to persist trip write', err)
    q.onError?.(err)
  } finally {
    q.inFlight = false
    if (q.pending) {
      void flush(tripId)
    } else {
      // No more pending writes — drop the queue entry so old trips don't
      // accumulate (and so test runs don't leak state between cases).
      queues.delete(tripId)
    }
  }
}

/**
 * Queues a trip patch for persistence. Coalesces with any pending patch
 * (latest value per key wins) and kicks off a flush. Never rejects; failures
 * are routed to `onError`.
 * @param tripId - The trip to persist to
 * @param patch - Partial trip state to save (itinerary and/or trip length)
 * @param onError - Called if the underlying PATCH fails
 */
export function queueTripWrite(tripId: string, patch: Patch, onError?: (err: unknown) => void): void {
  const q = queues.get(tripId) ?? { inFlight: false, pending: null }
  q.pending = { ...q.pending, ...patch }
  q.onError = onError
  queues.set(tripId, q)
  void flush(tripId)
}

/** Test-only: clears all queued state so cases don't leak into each other. */
export function __resetTripWriteQueues(): void {
  queues.clear()
}
