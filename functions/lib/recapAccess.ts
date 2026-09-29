import { z } from 'zod'
import type { Env } from './db'
import { getActiveRecapLinkForTrip, createRecapLinkIfNoneActive } from './db'

/** Random bytes in a recap token: 256 bits, so a token cannot be guessed. */
export const RECAP_TOKEN_BYTES = 32
/** Length of a base64url-encoded, unpadded 32-byte token: ceil(32 * 4 / 3). */
export const RECAP_TOKEN_LENGTH = 43

/** A recap token as it appears in a URL. Anything else cannot name a recap and is answered 404. */
export const recapTokenSchema = z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${RECAP_TOKEN_LENGTH}}$`))

/**
 * Encodes bytes as unpadded base64url (RFC 4648 section 5), safe in a URL path.
 * @param bytes - The bytes to encode
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generates a new recap share token: {@link RECAP_TOKEN_BYTES} bytes from
 * `crypto.getRandomValues`, base64url-encoded to {@link RECAP_TOKEN_LENGTH}
 * characters.
 */
export function generateRecapToken(): string {
  const bytes = new Uint8Array(RECAP_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/**
 * Per-IP hourly cap on reads of the public recap JSON (`recap-read`). Photo
 * bytes are deliberately not D1-rate-limited: see the recap photo route.
 */
export const RECAP_READS_PER_HOUR = 600

/**
 * The one 404 message for every public recap miss (unknown, revoked or
 * malformed token, a trip that is gone, a photo not on that trip), so no two
 * cases can be told apart.
 */
export const RECAP_NOT_FOUND_MESSAGE = 'This recap link isn’t active anymore.'

/**
 * The trip's active recap token, creating a link only when the trip has none,
 * so repeated calls return the same token. The caller has already checked
 * that the trip exists and is not a demo.
 * @param env - Function env (DB)
 * @param tripId - The trip
 * @throws If no active link can be read back after the create
 */
export async function ensureActiveRecapLink(env: Env, tripId: string): Promise<string> {
  const existing = await getActiveRecapLinkForTrip(env, tripId)
  if (existing) return existing.token

  await createRecapLinkIfNoneActive(env, {
    token: generateRecapToken(),
    trip_id: tripId,
    created_at: new Date().toISOString(),
  })
  // Read back rather than trusting the insert: if a concurrent request won
  // the race, its token is the one that is active.
  const active = await getActiveRecapLinkForTrip(env, tripId)
  if (!active) throw new Error('recap link missing after create')
  return active.token
}

/** Escapes a string for literal use inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes every occurrence of the trip id (any letter case) from user-written
 * text. The trip URL grants edit access, so nothing a recap viewer or an
 * invitee receives may carry the id, even if the traveler pasted their own
 * trip link into a stop or the title.
 * @param text - User-written text
 * @param tripId - The trip id to strip
 */
export function stripTripId(text: string, tripId: string): string {
  return text.replace(new RegExp(escapeRegExp(tripId), 'gi'), '').trim()
}
