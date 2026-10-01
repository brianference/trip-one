import { countRecentRequests, insertRequestLog, purgeRequestLogBefore, type Env } from './db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { logger } from '../../src/lib/logger'

/** The window every per-IP limit counts over. */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
/**
 * How long request_log rows are kept. Every limit in the app counts one hour,
 * so two hours keeps a full margin and drops everything no count can read.
 */
export const REQUEST_LOG_RETENTION_MS = 2 * 60 * 60 * 1000
/**
 * About one in this many allowed requests also purges old request_log rows.
 * Purging on every request would add a write-heavy statement to each one; this
 * spreads the cost while still keeping the table to a few hours of traffic.
 */
export const REQUEST_LOG_PURGE_ONE_IN = 50

/**
 * Deletes request_log rows older than {@link REQUEST_LOG_RETENTION_MS}. Never
 * throws: a failed purge only means the rows go on a later request.
 * @param env - Function env (DB)
 * @param nowMs - Current time
 */
async function purgeOldRequestLog(env: Env, nowMs: number): Promise<void> {
  try {
    await purgeRequestLogBefore(env, new Date(nowMs - REQUEST_LOG_RETENTION_MS).toISOString())
  } catch {
    logger.warn('request_log purge failed; will retry on a later request')
  }
}

/**
 * Shared per-IP hourly rate limit for an endpoint, backed by the D1
 * `request_log` (the same mechanism `/api/location` uses inline). Returns true
 * when the caller is OVER the limit — the endpoint should then return 429.
 *
 * Fails OPEN: if the rate-limit bookkeeping itself errors (e.g. a D1 blip),
 * the request is allowed rather than blocked, since these are best-effort abuse
 * guards on endpoints that should stay available.
 *
 * On roughly one in {@link REQUEST_LOG_PURGE_ONE_IN} allowed requests it also
 * purges request_log rows past {@link REQUEST_LOG_RETENTION_MS}, so the table
 * stays bounded.
 *
 * @param env - Function env (needs the DB binding and RATE_LIMIT_SALT)
 * @param request - The incoming request (for the client IP header)
 * @param endpoint - Label stored in the request log
 * @param perHour - Allowed requests per rolling hour per IP
 */
export async function isRateLimited(env: Env, request: Request, endpoint: string, perHour: number): Promise<boolean> {
  try {
    const nowMs = Date.now()
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const windowStart = new Date(nowMs - RATE_LIMIT_WINDOW_MS).toISOString()
    // Scoped to THIS endpoint; see countRecentRequests for why.
    const recent = await countRecentRequests(env, ipHash, windowStart, endpoint)
    if (!isUnderRateLimit(recent, perHour)) return true
    await insertRequestLog(env, ipHash, endpoint)
    if (Math.random() * REQUEST_LOG_PURGE_ONE_IN < 1) await purgeOldRequestLog(env, nowMs)
    return false
  } catch (err) {
    logger.warn('rate limit check failed; allowing request', { endpoint })
    return false
  }
}
