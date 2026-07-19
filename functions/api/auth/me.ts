import { getAuthedUser, type AuthEnv } from '../../lib/auth/session'

/**
 * GET /api/auth/me
 *
 * The signed-in user, or `{ user: null }` for a visitor. Answers 200 either
 * way: "nobody is signed in" is a normal state for this app, not an error, and
 * the client uses it on every load to decide what to render.
 */
export async function onRequestGet({ env, request }: { env: AuthEnv; request: Request }): Promise<Response> {
  const user = await getAuthedUser(env, request)
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Never let a shared cache hold one user's identity.
      'Cache-Control': 'private, no-store',
    },
  })
}
