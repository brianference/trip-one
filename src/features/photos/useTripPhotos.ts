import { useCallback, useEffect, useState } from 'react'
import { resizeImage } from './resizeImage'
import { listTripPhotos, uploadStopPhoto, deleteTripPhoto, type TripPhoto } from './photosApi'
import { logger } from '../../lib/logger'

/** A trip's photos grouped by itinerary stop, plus the actions to mutate them. */
export interface UseTripPhotosResult {
  byStop: Map<string, TripPhoto[]>
  upload: (stopId: string, file: File) => Promise<void>
  remove: (photoId: string) => Promise<void>
  uploading: Set<string>
  error: string | null
}

/**
 * Groups a flat photo list by the stop it belongs to.
 * @param photos - The trip's photos, in server order
 */
function groupByStop(photos: TripPhoto[]): Map<string, TripPhoto[]> {
  const byStop = new Map<string, TripPhoto[]>()
  for (const photo of photos) {
    const existing = byStop.get(photo.stopId)
    if (existing) existing.push(photo)
    else byStop.set(photo.stopId, [photo])
  }
  return byStop
}

/**
 * Loads and manages a trip's photos, grouped by itinerary stop. `upload`
 * resizes the file client-side (see `resizeImage`) before it ever reaches the
 * network. Both `upload` and `remove` update local state from the server's
 * own response rather than assuming success, and surface a failure's message
 * in `error` (the server's own text) instead of a generic one.
 * @param tripId - The trip whose photos this hook manages
 */
export function useTripPhotos(tripId: string): UseTripPhotosResult {
  const [byStop, setByStop] = useState<Map<string, TripPhoto[]>>(new Map())
  const [uploading, setUploading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Reset before fetching so a stale error or a previous trip's photos
    // never linger under a new tripId while (or after) this load settles.
    setError(null)
    setByStop(new Map())
    listTripPhotos(tripId)
      .then((photos) => {
        if (!cancelled) setByStop(groupByStop(photos))
      })
      .catch((err) => {
        logger.error('failed to load trip photos', err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  const upload = useCallback(
    async (stopId: string, file: File) => {
      setUploading((prev) => new Set(prev).add(stopId))
      setError(null)
      try {
        const resized = await resizeImage(file)
        const photo = await uploadStopPhoto(tripId, stopId, resized)
        setByStop((prev) => {
          const next = new Map(prev)
          next.set(stopId, [...(next.get(stopId) ?? []), photo])
          return next
        })
      } catch (err) {
        logger.error('photo upload failed', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setUploading((prev) => {
          const next = new Set(prev)
          next.delete(stopId)
          return next
        })
      }
    },
    [tripId],
  )

  const remove = useCallback(
    async (photoId: string) => {
      setError(null)
      try {
        await deleteTripPhoto(tripId, photoId)
        setByStop((prev) => {
          const next = new Map<string, TripPhoto[]>()
          for (const [stopId, photos] of prev) next.set(stopId, photos.filter((p) => p.id !== photoId))
          return next
        })
      } catch (err) {
        logger.error('photo delete failed', err)
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [tripId],
  )

  return { byStop, upload, remove, uploading, error }
}
