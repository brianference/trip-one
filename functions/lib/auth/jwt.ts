/**
 * Minimal HS256 JWT sign/verify on Web Crypto.
 *
 * `jsonwebtoken` depends on Node's crypto module and cannot run on Workers.
 * This implements exactly the subset the app needs — HS256, with `exp`, `iat`
 * and a token version — rather than pulling in a library for it.
 *
 * Security notes, each of which is a real-world JWT failure this avoids:
 *  - The algorithm is FIXED at HS256. The header's `alg` is never trusted, so
 *    the classic `alg: none` and RS256->HS256 confusion attacks don't apply.
 *  - Signature comparison is constant-time.
 *  - `exp` is mandatory and always checked; a token without one is rejected.
 */

export interface TokenPayload {
  /** User id. */
  sub: string
  /** Token version at issue time; must still match the user's row. */
  ver: number
  /** Issued-at, seconds since epoch. */
  iat: number
  /** Expiry, seconds since epoch. */
  exp: number
}

/** How long a freshly issued token lasts. */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Signs a token for a user.
 * @param userId - The user's id, becomes `sub`
 * @param tokenVersion - The user's current token_version
 * @param secret - The signing secret (JWT_SECRET)
 * @param nowSeconds - Current time; injectable so tests don't depend on the clock
 */
export async function signToken(
  userId: string,
  tokenVersion: number,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload: TokenPayload = { sub: userId, ver: tokenVersion, iat: nowSeconds, exp: nowSeconds + TOKEN_TTL_SECONDS }
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const data = `${header}.${body}`
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), new TextEncoder().encode(data))
  return `${data}.${base64UrlEncode(new Uint8Array(sig))}`
}

/**
 * Verifies a token and returns its payload, or null if it is invalid for any
 * reason (bad shape, bad signature, expired, unparseable).
 *
 * Never throws and never distinguishes between failure modes to the caller —
 * an attacker learning "signature valid but expired" versus "bad signature" is
 * a small oracle, and the endpoint's answer is 401 either way.
 *
 * @param token - The raw token string
 * @param secret - The signing secret (JWT_SECRET)
 * @param nowSeconds - Current time; injectable for tests
 */
export async function verifyToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts

    // The signature is checked BEFORE the payload is parsed, so unverified
    // attacker-controlled JSON is never handed to JSON.parse.
    const expected = await crypto.subtle.sign('HMAC', await importKey(secret), new TextEncoder().encode(`${header}.${body}`))
    const provided = base64UrlDecode(sig)
    const expectedBytes = new Uint8Array(expected)
    if (provided.length !== expectedBytes.length) return null
    let diff = 0
    for (let i = 0; i < provided.length; i += 1) diff |= provided[i] ^ expectedBytes[i]
    if (diff !== 0) return null

    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as Partial<TokenPayload>
    if (typeof parsed.sub !== 'string' || parsed.sub === '') return null
    if (typeof parsed.ver !== 'number') return null
    if (typeof parsed.exp !== 'number' || parsed.exp <= nowSeconds) return null
    if (typeof parsed.iat !== 'number') return null
    return parsed as TokenPayload
  } catch {
    return null
  }
}
