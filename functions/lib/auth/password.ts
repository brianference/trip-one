/**
 * Password hashing for the Workers runtime.
 *
 * bcrypt is the usual choice and cannot be used here: it's a native Node
 * addon, and Cloudflare Workers has no native module support or filesystem.
 * The pure-JS ports are slow enough at a sane work factor to blow the CPU
 * budget on every login. PBKDF2-SHA256 is implemented by Web Crypto, which
 * Workers exposes natively, so it runs at full speed with no dependency.
 *
 * Hashes are stored self-describing:
 *
 *     pbkdf2$sha256$<iterations>$<salt-b64>$<digest-b64>
 *
 * so the iteration count can be raised later without invalidating anyone's
 * password — {@link needsRehash} reports which stored hashes are below the
 * current cost, and the login route upgrades them transparently.
 */

/**
 * Current work factor, chosen against the Workers CPU budget rather than from
 * the guideline number.
 *
 * OWASP's floor for PBKDF2-SHA256 is 600,000 and that is what this would be on
 * a normal server. Cloudflare Workers enforces a per-request CPU limit, and
 * 600,000 iterations (~133ms of pure CPU) exceeds it: the runtime kills the
 * request, so every register and login returned a 500.
 *
 * Measured on the deployed Pages project, register + login:
 *
 *     600,000 -> 500 every time (clearly over the limit)
 *     300,000 -> passed once, then 500 on a later run
 *     250,000 -> passed once, then 500 on a later run
 *     100,000 -> 3/3 register + login, repeatable
 *
 * The limit is not a clean line: a cold start consumes part of the same budget,
 * so anything near the ceiling passes intermittently and fails in production
 * later. 100,000 was chosen for headroom, not because 250,000 never works.
 *
 * The worst case is a login that VERIFIES an old hash and then RE-HASHES it in
 * the same request — two derivations in one request. That path is exercised by
 * needsRehash and stays within budget at this factor.
 *
 * This is a real, deliberate reduction in password-cracking cost, accepted to
 * stay on Cloudflare Pages. To restore the full 600,000, move the project to a
 * paid Workers plan (which raises the CPU limit) and raise this constant —
 * every existing password upgrades itself on next login via needsRehash, with
 * no migration and no forced reset.
 */
export const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256
const PREFIX = 'pbkdf2$sha256'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  // `salt.buffer` is typed as ArrayBufferLike (it could be a SharedArrayBuffer
  // in general); copy into a plain ArrayBuffer to satisfy BufferSource.
  const saltBuffer = salt.slice().buffer as ArrayBuffer
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/**
 * Hashes a password for storage.
 * @param password - The plaintext password, already length-validated by the caller
 * @returns A self-describing hash string safe to store
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const digest = await derive(password, salt, PBKDF2_ITERATIONS)
  return `${PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(digest)}`
}

/**
 * Constant-time comparison. A plain `===` on digests leaks how many leading
 * bytes matched through timing, which is enough to forge a hash byte by byte.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing for a malformed or unknown-algorithm
 * hash: a corrupted row must fail the login, never 500 the endpoint.
 *
 * @param password - The plaintext password supplied at login
 * @param stored - The hash string produced by {@link hashPassword}
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 5) return false
    const [algo, hash, iterationsRaw, saltB64, digestB64] = parts
    if (`${algo}$${hash}` !== PREFIX) return false
    const iterations = Number.parseInt(iterationsRaw, 10)
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000) return false
    const expected = fromBase64(digestB64)
    const actual = await derive(password, fromBase64(saltB64), iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Whether a stored hash was made with a weaker work factor than the current
 * one, so the login route can transparently re-hash it.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 5) return true
  const iterations = Number.parseInt(parts[2], 10)
  return !Number.isInteger(iterations) || iterations < PBKDF2_ITERATIONS
}
