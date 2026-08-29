/**
 * Random capability tokens and their stored form.
 *
 * The token in the email is the secret. The database stores only its SHA-256
 * hash, so a dump of the table is not a pile of live confirmation or reset
 * links. Comparison is on the hash; the plaintext token never comes back
 * from storage.
 */

/**
 * Hex SHA-256 of a string (Web Crypto, available in the Workers runtime).
 * @param input - The plaintext token
 * @returns 64-character lowercase hex digest
 */
export async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * URL-safe random hex token.
 * @param bytes - Number of random bytes (default 32 → 64 hex characters)
 */
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** How long a confirmation link stays valid. A day is long enough to sit in an inbox. */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

/** How long a password-reset link stays valid. Short: it changes the password. */
export const RESET_TTL_MS = 60 * 60 * 1000
