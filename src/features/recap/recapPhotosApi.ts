import { errorMessageFrom, postStopPhoto } from '../photos/photosApi'
import type { ResizedImage } from '../photos/resizeImage'
import type { RecapPayload } from './types'

/** A photo on the public recap, as the recap photo routes return it. */
export type RecapPhoto = RecapPayload['photos'][number]

/** What `GET /api/recap/:token/me` says about the viewer. */
export type RecapMembership = 'member' | 'not-member'

/** Shown when the membership check fails with no usable server message. */
const MEMBERSHIP_FAILED_MESSAGE = 'failed to check trip membership'

/**
 * The URL of the recap-token route for a token, with the token encoded.
 * @param token - The recap token from the URL
 */
function recapBase(token: string): string {
  return `/api/recap/${encodeURIComponent(token)}`
}

/**
 * Asks whether the signed-in viewer is a member (a photo contributor) of the
 * trip behind this recap. Signed out, or signed in but not a member, both
 * come back as `not-member`.
 * @param token - The recap token from the URL
 * @returns `member` or `not-member`
 * @throws If the request fails or the link is inactive; the thrown message is the server's own `error` text
 */
export async function fetchRecapMembership(token: string): Promise<RecapMembership> {
  const res = await fetch(`${recapBase(token)}/me`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessageFrom(res, MEMBERSHIP_FAILED_MESSAGE))
  const body = (await res.json().catch(() => ({}))) as { member?: unknown }
  return body.member === true ? 'member' : 'not-member'
}

/**
 * Adds an already-resized photo to a recap stop as a contributor. Goes
 * through the same multipart form as the owner upload (`postStopPhoto`).
 * @param token - The recap token from the URL
 * @param stopId - The stop's public `stopId` from the recap payload
 * @param photo - The resized JPEG and its pixel dimensions (from `resizeImage`)
 * @returns The stored photo, marked `mine`
 * @throws If the upload is refused (401, 403, 400 unknown stop, 409 full, 413, 429); the thrown message is the server's own `error` text
 */
export async function uploadRecapPhoto(token: string, stopId: string, photo: ResizedImage): Promise<RecapPhoto> {
  return postStopPhoto<RecapPhoto>(`${recapBase(token)}/photos`, stopId, photo)
}

/**
 * Removes one of the contributor's own photos from a recap.
 * @param token - The recap token from the URL
 * @param photoId - The photo to remove; the server refuses anyone else's
 * @throws If the request fails (401, 403 not yours, 404, 429); the thrown message is the server's own `error` text
 */
export async function deleteRecapPhoto(token: string, photoId: string): Promise<void> {
  const res = await fetch(`${recapBase(token)}/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!res.ok) throw new Error(await errorMessageFrom(res, 'failed to delete photo'))
}
