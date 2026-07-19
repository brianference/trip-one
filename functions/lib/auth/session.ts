/**
 * Turning a request into a signed-in user, and the shared auth error shapes.
 *
 * The token is read from an httpOnly cookie first and the Authorization header
 * second. The cookie is what the browser app uses — httpOnly means page
 * JavaScript cannot read it, so an XSS bug cannot exfiltrate a session — while
 * the header path keeps the API usable from a script or a test.
 */

import type { Env } from '../db'
import { getUserById } from '../db'
import { verifyToken } from './jwt'
import { TOKEN_TTL_SECONDS } from './jwt'

export interface AuthedUser {
  id: string
  email: string
  displayName: string | null
}

export type AuthEnv = Env & {
  JWT_SECRET?: string
  /**
   * Server-side pepper for password hashing. Optional: without it the app
   * still works and hashes are stored un-peppered, which is what local dev and
   * the test suite use.
   */
  PASSWORD_PEPPER?: string
}

/** The cookie the browser app authenticates with. */
export const SESSION_COOKIE = 'trip_one_session'

/**
 * Builds the Set-Cookie header for a session.
 *
 * `HttpOnly` blocks JS access, `Secure` keeps it off plaintext connections,
 * `SameSite=Lax` stops it riding along on cross-site POSTs (the CSRF vector)
 * while still surviving a normal top-level navigation back into the app.
 *
 * @param token - The signed JWT, or '' to clear the cookie
 */
export function sessionCookie(token: string): string {
  const base = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`
  return token === '' ? `${base}; Max-Age=0` : `${base}; Max-Age=${TOKEN_TTL_SECONDS}`
}

/** Reads a named cookie out of a Cookie header. */
function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    if (part.slice(0, eq).trim() !== name) continue
    return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * Resolves the signed-in user for a request, or null.
 *
 * Returns null — never throws — for every failure: no token, bad signature,
 * expired, user deleted, or a token whose version the user has since bumped
 * (password change / sign out everywhere). Callers decide whether that's a 401
 * or simply an anonymous visitor.
 *
 * @param env - Worker env, needs DB and JWT_SECRET
 * @param request - The incoming request
 */
export async function getAuthedUser(env: AuthEnv, request: Request): Promise<AuthedUser | null> {
  if (!env.JWT_SECRET) return null

  const header = request.headers.get('Authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  const token = readCookie(request.headers.get('Cookie'), SESSION_COOKIE) ?? bearer
  if (!token) return null

  const payload = await verifyToken(token, env.JWT_SECRET)
  if (!payload) return null

  const user = await getUserById(env, payload.sub)
  if (!user) return null
  // A token minted before the user's version was bumped is dead, even though
  // its signature is still valid and it hasn't expired.
  if (user.token_version !== payload.ver) return null

  return { id: user.id, email: user.email, displayName: user.display_name }
}
