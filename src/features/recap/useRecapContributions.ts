import { useCallback, useRef, useState } from 'react'
import { resizeImage } from '../photos/resizeImage'
import { logger } from '../../lib/logger'
import { deleteRecapPhoto, uploadRecapPhoto } from './recapPhotosApi'

/** Shown when an upload fails with no usable message. */
const UPLOAD_FAILED_MESSAGE = 'We couldn’t add that photo. Please try again.'
/** Shown when a delete fails with no usable message. */
const REMOVE_FAILED_MESSAGE = 'We couldn’t remove that photo. Please try again.'
/** Shown when the change went through but the page could not be refreshed to show it. */
const REFRESH_FAILED_MESSAGE = 'Saved, but we couldn’t refresh the page. Reload it to see the change.'
/** Shown when a second removal is pressed while the first is still running. */
const REMOVE_BUSY_MESSAGE = 'Still removing the last photo. Try that one again in a moment.'

/** A contributor's photo actions on the public recap, and what they last did. */
export interface RecapContributions {
  /** Resizes and uploads one photo to a recap stop, then refreshes the recap. */
  upload: (stopId: string, stopName: string, file: File) => Promise<void>
  /** Removes one of the contributor's own photos, then refreshes the recap. */
  remove: (photoId: string) => Promise<void>
  /** True while an upload is running. */
  uploading: boolean
  /** The last failure's message (the server's own text when it sent one), or null. */
  error: string | null
  /** The last success, for a polite live region ("Photo added to …"). */
  status: string
}

/**
 * The message to show for a failed request.
 * @param err - Whatever was thrown
 * @param fallback - Used when it carries no message
 */
function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message !== '' ? err.message : fallback
}

/**
 * Upload and delete for a recap contributor, through the recap-token routes.
 * Photos go through the same client-side resize as the owner's uploads
 * (`resizeImage`), so no original bytes or EXIF leave the browser. After
 * every change the recap payload is reloaded (`refresh`) rather than patched
 * locally, so the page shows exactly what the server stored, `mine` included.
 * @param token - The recap token from the URL
 * @param refresh - Reloads the recap payload; resolves false when the reload failed
 * @param onFailure - Called after a failed upload or removal, so the page can re-check that the viewer is still a member
 */
export function useRecapContributions(
  token: string,
  refresh: () => Promise<boolean>,
  onFailure?: () => void,
): RecapContributions {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  // Refs, not state: a second press in the same tick still sees stale state.
  const uploadingRef = useRef(false)
  const removingRef = useRef(false)

  const upload = useCallback(
    async (stopId: string, stopName: string, file: File) => {
      if (uploadingRef.current) return
      uploadingRef.current = true
      setUploading(true)
      setError(null)
      setStatus(`Uploading photo to ${stopName}…`)
      try {
        const resized = await resizeImage(file)
        await uploadRecapPhoto(token, stopId, resized)
        if (await refresh()) {
          setStatus(`Photo added to ${stopName}`)
        } else {
          setStatus('')
          setError(REFRESH_FAILED_MESSAGE)
        }
      } catch (err) {
        logger.error('recap photo upload failed', err)
        setStatus('')
        setError(messageOf(err, UPLOAD_FAILED_MESSAGE))
        onFailure?.()
      } finally {
        uploadingRef.current = false
        setUploading(false)
      }
    },
    [token, refresh, onFailure],
  )

  const remove = useCallback(
    async (photoId: string) => {
      if (removingRef.current) {
        setError(REMOVE_BUSY_MESSAGE)
        return
      }
      removingRef.current = true
      setError(null)
      try {
        await deleteRecapPhoto(token, photoId)
        if (await refresh()) setStatus('Photo removed')
        else setError(REFRESH_FAILED_MESSAGE)
      } catch (err) {
        logger.error('recap photo delete failed', err)
        setError(messageOf(err, REMOVE_FAILED_MESSAGE))
        onFailure?.()
      } finally {
        removingRef.current = false
      }
    },
    [token, refresh, onFailure],
  )

  return { upload, remove, uploading, error, status }
}
