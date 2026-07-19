import { sessionCookie } from '../../lib/auth/session'

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. Always 200: logging out when already logged out
 * is not a failure, and the caller's only sensible reaction either way is to
 * show the signed-out UI.
 */
export async function onRequestPost(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('') },
  })
}
