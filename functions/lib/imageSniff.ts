/**
 * Identifies an uploaded image by its leading "magic" bytes.
 *
 * The client-declared type (the multipart part's Content-Type, the file
 * extension) is attacker-controlled and is never consulted: an HTML file
 * renamed `.jpg` and declared `image/jpeg` would otherwise be stored and later
 * served back with a type the browser might render as a page. Only the three
 * formats the recap displays are accepted; anything else is null.
 */

/** The image types an upload may be stored as. */
export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp'

/** How many leading bytes the sniffer needs (the WEBP check reads 12). */
export const SNIFF_BYTES = 12

/** JPEG SOI marker plus the first byte of the next marker. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
/** The full eight-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** "RIFF" at offset 0 of a WEBP container. */
const RIFF_TAG = [0x52, 0x49, 0x46, 0x46]
/** "WEBP" at offset 8 of a WEBP container (offset 4 holds the chunk size). */
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]
/** Offset of the form tag inside a RIFF container. */
const RIFF_FORM_OFFSET = 8

/**
 * True when `bytes` holds `signature` starting at `offset`.
 * @param bytes - The data to inspect
 * @param signature - The expected byte values
 * @param offset - Where in `bytes` the signature must start
 */
function hasBytesAt(bytes: Uint8Array, signature: readonly number[], offset: number): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

/**
 * Returns the image type the bytes actually are, or null when they are not a
 * JPEG, PNG or WEBP.
 * @param bytes - The upload's leading bytes (at least SNIFF_BYTES for WEBP)
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (hasBytesAt(bytes, JPEG_SIGNATURE, 0)) return 'image/jpeg'
  if (hasBytesAt(bytes, PNG_SIGNATURE, 0)) return 'image/png'
  if (hasBytesAt(bytes, RIFF_TAG, 0) && hasBytesAt(bytes, WEBP_TAG, RIFF_FORM_OFFSET)) return 'image/webp'
  return null
}
