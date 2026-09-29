import type { Env, PhotoRow } from './db'

/**
 * Streams a stored photo's bytes from R2 as an HTTP response. Shared by the
 * owner photo route and the recap photo route so the two cannot drift.
 *
 * The response type is the one recorded in D1 at upload time (the sniffed
 * type), never R2 metadata or anything the uploader declared. `nosniff` is set
 * here because `_headers` rules do not apply to Pages Functions responses
 * (developers.cloudflare.com/pages/configuration/headers/).
 *
 * @param env - Function env with the PHOTOS bucket
 * @param row - The photo row, already looked up with its trip scope
 * @param cacheControl - The Cache-Control value for this route
 * @returns The 200 response, or null when the row has no R2 object
 * @throws When R2 is unreachable; the caller answers 500
 */
export async function photoBytesResponse(env: Env, row: PhotoRow, cacheControl: string): Promise<Response | null> {
  const obj = await env.PHOTOS.get(row.r2_key)
  if (!obj) return null
  // The workers-types ReadableStream and the DOM one this file is typed
  // against are the same object at runtime but distinct types to tsc.
  return new Response(obj.body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
