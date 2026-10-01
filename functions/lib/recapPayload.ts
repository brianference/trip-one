import type { PhotoRow, TripRow } from './db'
import { stripTripId } from './recapAccess'
import { cleanDisplayName } from '../../src/lib/location/displayName'
import type { RecapPayload } from '../../src/features/recap/types'

/**
 * Builds the public recap of a trip (GET /api/recap/:token) and maps between
 * the public stop ids it shows and the stored stop ids photos are keyed by.
 * Nothing here ever puts the trip id in its output.
 */

/** Day a stop is shown on when the itinerary does not say. */
const DEFAULT_STOP_DAY = 1

type RecapStop = RecapPayload['stops'][number]
type RecapPhoto = RecapPayload['photos'][number]

/**
 * User-written optional text with the trip id stripped; null when absent or
 * nothing is left.
 * @param value - The stored value, of unknown type
 * @param tripId - The trip id to strip
 */
function publicText(value: unknown, tripId: string): string | null {
  if (typeof value !== 'string') return null
  const cleaned = stripTripId(value, tripId)
  return cleaned === '' ? null : cleaned
}

/**
 * A finite number, or null.
 * @param value - The stored value, of unknown type
 */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A stored stop id passed through as-is: uuid-shaped, so it can never collide with a {@link positionalStopId}. */
const PASS_THROUGH_STOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The public id for a stop whose stored id cannot be passed through. It comes
 * from the stop's position in the itinerary only, so it is the same on every
 * load of the recap and carries nothing about the trip.
 * @param index - The stop's index in the stored itinerary array
 */
function positionalStopId(index: number): string {
  return `stop-${index}`
}

/**
 * Maps the itinerary to public stops, in itinerary order, keeping only the
 * recap fields (never booking links, prices or product codes).
 *
 * A stop's stored id is passed through so photos can be matched to it when it
 * is a uuid that does not contain the trip id and no earlier stop used it.
 * Otherwise (a legacy stop with no id, an id containing the trip id, a
 * non-uuid id, or a duplicate) the stop gets {@link positionalStopId}, which
 * is stable across loads. Every public stopId is therefore unique.
 *
 * Photos are keyed by stored stop id, so the returned map sends each stored
 * id to the public id of the FIRST stop that carries it: when stops share a
 * stored id, their photos all attach to the first of them.
 *
 * @param itinerary - The trip's itinerary as stored
 * @param tripId - The trip id, which must not appear in the output
 */
function toPublicStops(itinerary: unknown[], tripId: string): { stops: RecapStop[]; stopIds: Map<string, string> } {
  const stops: RecapStop[] = []
  const stopIds = new Map<string, string>()
  const tripIdLower = tripId.toLowerCase()
  itinerary.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const stop = item as Record<string, unknown>
    if (typeof stop.text !== 'string') return

    const storedId = typeof stop.id === 'string' && stop.id !== '' ? stop.id : null
    const firstUse = storedId !== null && !stopIds.has(storedId)
    const passThrough =
      firstUse && PASS_THROUGH_STOP_ID.test(storedId) && !storedId.toLowerCase().includes(tripIdLower)
    const stopId = passThrough ? storedId : positionalStopId(index)
    if (storedId !== null && firstUse) stopIds.set(storedId, stopId)

    const day = typeof stop.day === 'number' && Number.isInteger(stop.day) && stop.day >= 1 ? stop.day : DEFAULT_STOP_DAY
    stops.push({
      stopId,
      day,
      text: stripTripId(stop.text, tripId),
      lat: finiteOrNull(stop.lat),
      lng: finiteOrNull(stop.lng),
      category: publicText(stop.category, tripId),
    })
  })
  return { stops, stopIds }
}

/**
 * Maps photo rows to the public shape. A photo whose stop is no longer on the
 * itinerary is dropped (it has nowhere to show, and its stored stop id would
 * otherwise go out unfiltered).
 *
 * `mine: true` is set only on photos whose uploader is `viewerMemberId`, and
 * the key is absent otherwise, so a viewer learns nothing about who uploaded
 * anyone else's photo.
 * @param rows - The trip's photo rows
 * @param stopIds - Stored stop id to public stop id, from {@link toPublicStops}
 * @param viewerMemberId - The signed-in viewer's id when they are a member of the trip, else null
 */
function toPublicPhotos(rows: PhotoRow[], stopIds: Map<string, string>, viewerMemberId: string | null): RecapPhoto[] {
  const photos: RecapPhoto[] = []
  for (const row of rows) {
    const stopId = stopIds.get(row.stop_id)
    if (stopId === undefined) continue
    const photo: RecapPhoto = { id: row.id, stopId, width: row.width, height: row.height, createdAt: row.created_at }
    if (viewerMemberId !== null && row.uploader_user_id === viewerMemberId) photo.mine = true
    photos.push(photo)
  }
  return photos
}

/**
 * Builds the recap payload from a trip, its location name and its photos.
 * Every field is chosen explicitly; nothing from the trip row is spread in,
 * so the trip id and owner can never ride along.
 * @param trip - The trip row
 * @param rawDisplayName - The location's stored display name
 * @param photoRows - The trip's photo rows
 * @param viewerMemberId - The signed-in viewer's id when they are a member of the trip, else null
 */
export function buildRecapPayload(
  trip: TripRow,
  rawDisplayName: string,
  photoRows: PhotoRow[],
  viewerMemberId: string | null = null,
): RecapPayload {
  const { stops, stopIds } = toPublicStops(trip.itinerary, trip.id)
  return {
    title: publicText(trip.title, trip.id),
    displayName: cleanDisplayName(rawDisplayName),
    startDate: trip.start_date ?? null,
    tripLengthDays: trip.trip_length_days ?? null,
    stops,
    photos: toPublicPhotos(photoRows, stopIds, viewerMemberId),
  }
}

/**
 * The STORED stop id behind a public stop id from the recap, for a
 * contributor naming the stop a photo goes on. Null when no stop on the
 * itinerary has that public id, or when that stop has no stored id (a legacy
 * stop, which cannot hold photos from anyone).
 * @param trip - The trip row
 * @param publicStopId - A `stopId` from the recap payload
 */
export function storedStopIdFor(trip: TripRow, publicStopId: string): string | null {
  const { stopIds } = toPublicStops(trip.itinerary, trip.id)
  for (const [storedId, publicId] of stopIds) {
    if (publicId === publicStopId) return storedId
  }
  return null
}

