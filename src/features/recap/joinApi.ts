/** What `POST /api/recap/:token/join` came back with, in the terms the UI acts on. */
export type JoinResult =
  | { kind: 'joined'; tripId: string }
  /** 401: nobody is signed in. */
  | { kind: 'signed-out' }
  /** 403: the signed-in email is unverified or not invited to this trip. */
  | { kind: 'not-invited' }
  /** Anything else (404 inactive link, 429, 500, offline): the message to show. */
  | { kind: 'failed'; message: string }

/** Shown when the join request fails with no usable server message. */
export const JOIN_FAILED_MESSAGE = 'We couldn’t add you to this trip. Please try again in a moment.'

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

/**
 * Asks to join the trip behind a recap link. The response body carries the
 * trip id only on a 200; every other status is mapped without reading it into
 * anything that could leak it.
 * @param token - The recap token from the URL
 * @returns The join outcome
 */
export async function joinRecapTrip(token: string): Promise<JoinResult> {
  let res: Response
  try {
    res = await fetch(`/api/recap/${encodeURIComponent(token)}/join`, {
      method: 'POST',
      credentials: 'same-origin',
    })
  } catch {
    return { kind: 'failed', message: 'Could not reach the server. Check your connection and try again.' }
  }
  const body = (await res.json().catch(() => ({}))) as { tripId?: unknown; error?: unknown }
  if (res.ok && typeof body.tripId === 'string' && body.tripId !== '') return { kind: 'joined', tripId: body.tripId }
  if (res.status === HTTP_UNAUTHORIZED) return { kind: 'signed-out' }
  if (res.status === HTTP_FORBIDDEN) return { kind: 'not-invited' }
  return { kind: 'failed', message: typeof body.error === 'string' && body.error !== '' ? body.error : JOIN_FAILED_MESSAGE }
}

/**
 * "b•••@example.com": the first character of the local part, then a fixed
 * mask, so the length of the address is not given away either.
 * @param email - The address to mask
 * @returns The masked address, or the input unchanged when it has no `@`
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at < 1) return trimmed
  return `${trimmed[0]}•••${trimmed.slice(at)}`
}
