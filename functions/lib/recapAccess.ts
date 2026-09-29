import { z } from 'zod'

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

/** Per-IP hourly cap on reads of the public recap JSON (`recap-read`). Photo bytes have their own budget. */
export const RECAP_READS_PER_HOUR = 600

/**
 * Per-IP hourly cap on public recap photo fetches (`recap-photo-read`), kept
 * apart from {@link RECAP_READS_PER_HOUR} because one recap view fetches every
 * photo. A trip holds at most MAX_PHOTOS_PER_TRIP = 300 photos, so 3000 lets a
 * full recap be viewed about 10 times an hour from one IP.
 */
export const RECAP_PHOTO_READS_PER_HOUR = 3000

/**
 * The one 404 message for every public recap miss (unknown, revoked or
 * malformed token, a trip that is gone, a photo not on that trip), so no two
 * cases can be told apart.
 */
export const RECAP_NOT_FOUND_MESSAGE = 'This recap link isn’t active anymore.'
