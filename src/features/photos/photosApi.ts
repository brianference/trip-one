/** A photo attached to one itinerary stop, exactly as the photos API returns it. */
export interface TripPhoto {
  id: string
  stopId: string
  width: number
  height: number
  createdAt: string
}

/** Multipart field name the upload endpoint reads the image bytes from. */
const FILE_FIELD = 'file'

/**
 * The server's own `error` text from a failed response, or `fallback` when the
 * body is not JSON (a platform 413 or 502 page, for example) or has no `error`.
 * Shared with the recap photo client (`recap/recapPhotosApi.ts`).
 * @param res - A response that is not ok
 * @param fallback - The message to use when the body carries none
 * @returns The message to throw
 */
export async function errorMessageFrom(res: Response, fallback: string): Promise<string> {
  const body: { error?: unknown } = await res.json().catch(() => ({}))
  return typeof body.error === 'string' ? body.error : fallback
}

/**
 * POSTs an already-resized photo for one stop as the multipart form both
 * upload routes read (`file`, `stop_id`, `width`, `height`): the owner's trip
 * route and the contributor's recap-token route. Callers resize and
 * re-encode with `resizeImage` first, so the server never sees the original.
 * @param url - The upload endpoint
 * @param stopId - The stop's id as that endpoint names it
 * @param photo - The resized JPEG blob and the pixel dimensions it was resized to
 * @returns The response body, typed by the caller
 * @throws If the upload is rejected; the thrown message is the server's own `error` text
 */
export async function postStopPhoto<T>(
  url: string,
  stopId: string,
  photo: { blob: Blob; width: number; height: number },
): Promise<T> {
  const form = new FormData()
  form.append(FILE_FIELD, photo.blob)
  form.append('stop_id', stopId)
  form.append('width', String(photo.width))
  form.append('height', String(photo.height))

  const res = await fetch(url, { method: 'POST', body: form, credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to upload photo'))
  return (await res.json()) as T
}

/**
 * Uploads an already-resized photo for one itinerary stop. Callers resize and
 * re-encode with `resizeImage` before calling this — the server never sees
 * the original, unresized bytes.
 * @param tripId - The trip the stop belongs to
 * @param stopId - The itinerary stop's stable id
 * @param photo - The resized JPEG blob and the pixel dimensions it was resized to
 * @returns The stored photo's public metadata
 * @throws If the upload is rejected; the thrown message is the server's own `error` text
 */
export async function uploadStopPhoto(
  tripId: string,
  stopId: string,
  photo: { blob: Blob; width: number; height: number },
): Promise<TripPhoto> {
  return postStopPhoto<TripPhoto>(`/api/trips/${tripId}/photos`, stopId, photo)
}

/**
 * Lists every photo on a trip.
 * @param tripId - The trip to list photos for
 * @throws If the request fails; the thrown message is the server's own `error` text
 */
export async function listTripPhotos(tripId: string): Promise<TripPhoto[]> {
  const res = await fetch(`/api/trips/${tripId}/photos`)
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to load photos'))
  const body: { photos?: TripPhoto[] } = await res.json()
  return body.photos ?? []
}

/**
 * Deletes one photo.
 * @param tripId - The trip the photo belongs to
 * @param photoId - The photo to delete
 * @throws If the request fails; the thrown message is the server's own `error` text
 */
export async function deleteTripPhoto(tripId: string, photoId: string): Promise<void> {
  const res = await fetch(`/api/trips/${tripId}/photos/${photoId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to delete photo'))
}

/**
 * URL for a photo's raw bytes, for use as an `<img src>`.
 * @param tripId - The trip the photo belongs to
 * @param photoId - The photo to fetch
 */
export function tripPhotoUrl(tripId: string, photoId: string): string {
  return `/api/trips/${tripId}/photos/${photoId}`
}
