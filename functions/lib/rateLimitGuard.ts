import { countRecentRequests, insertRequestLog, type Env } from './db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { logger } from '../../src/lib/logger'

/**
 * Shared per-IP hourly rate limit for an endpoint, backed by the D1
 * `request_log` (the same mechanism `/api/location` uses inline). Returns true
 * when the caller is OVER the limit — the endpoint should then return 429.
 *
 * Fails OPEN: if the rate-limit bookkeeping itself errors (e.g. a D1 blip),
 * the request is allowed rather than blocked, since these are best-effort abuse
 * guards on endpoints that should stay available.
 *
 * @param env - Function env (needs the DB binding and RATE_LIMIT_SALT)
 * @param request - The incoming request (for the client IP header)
 * @param endpoint - Label stored in the request log
 * @param perHour - Allowed requests per rolling hour per IP
 */
export async function isRateLimited(env: Env, request: Request, endpoint: string, perHour: number): Promise<boolean> {
  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recent = await countRecentRequests(env, ipHash, oneHourAgo)
    if (!isUnderRateLimit(recent, perHour)) return true
    await insertRequestLog(env, ipHash, endpoint)
    return false
  } catch (err) {
    logger.warn('rate limit check failed; allowing request', { endpoint })
    return false
  }
}
