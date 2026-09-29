/**
 * Passwordless sign-in: one-time 6-digit codes sent by email.
 *
 * A 6-digit code has only 1,000,000 values, so everything that makes it safe
 * is in the limits around it rather than in the code itself:
 *
 * - each code allows {@link MAX_CODE_ATTEMPTS} guesses, then it is dead even
 *   for the right value;
 * - only {@link MAX_CODES_PER_EMAIL_PER_HOUR} codes are issued per email per
 *   hour, so one address gets at most 25 guesses an hour (1 in 40,000);
 * - a code lives {@link CODE_TTL_MS} and works once.
 *
 * The database stores only sha256(`email:code`). Binding the email into the
 * hash means a code issued to one address can never verify for another, even
 * if a lookup were ever widened.
 */
import {
  countEmailCodesSince,
  deleteEmailCodesCreatedBefore,
  expireActiveEmailCodes,
  getActiveEmailCode,
  insertEmailCode,
  markEmailCodeUsed,
  normalizeEmail,
  takeEmailCodeAttempt,
  type Env,
} from '../db'
import { sha256hex } from './tokens'

/** Digits in a code. */
export const CODE_DIGITS = 6
/** 10^CODE_DIGITS: the number of distinct codes. */
const CODE_SPACE = 10 ** CODE_DIGITS
/** 2^32, the range of one Uint32 draw. */
const UINT32_RANGE = 2 ** 32
/**
 * Largest multiple of CODE_SPACE that fits in a Uint32. Draws at or above it
 * are discarded: keeping them would make the low codes slightly more likely
 * than the high ones (modulo bias).
 */
export const UNBIASED_LIMIT = Math.floor(UINT32_RANGE / CODE_SPACE) * CODE_SPACE

/** How long a code stays valid. */
export const CODE_TTL_MS = 10 * 60 * 1000
/** Guesses allowed per code; the next one fails even with the right code. */
export const MAX_CODE_ATTEMPTS = 5
/** Codes issued per email per rolling hour. */
export const MAX_CODES_PER_EMAIL_PER_HOUR = 5
/** The rolling window for the per-email cap. */
const HOUR_MS = 60 * 60 * 1000

/**
 * A uniformly random 6-digit code (leading zeros kept) from
 * `crypto.getRandomValues`, using rejection sampling so no code is more likely
 * than another.
 * @returns A string of exactly {@link CODE_DIGITS} digits
 */
export function generateCode(): string {
  const draw = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(draw)
    if (draw[0] < UNBIASED_LIMIT) return String(draw[0] % CODE_SPACE).padStart(CODE_DIGITS, '0')
  }
}

/**
 * The stored form of a code: sha256 of the normalized email, a colon, and the code.
 * @param email - The address the code was sent to (normalized here)
 * @param code - The plaintext code
 * @returns 64-character lowercase hex digest
 */
export function hashEmailCode(email: string, code: string): Promise<string> {
  return sha256hex(`${normalizeEmail(email)}:${code}`)
}

/**
 * Compares two strings in time that depends only on their length, so a wrong
 * guess does not reveal how many leading characters of the hash matched.
 * @param a - First string
 * @param b - Second string
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Issues a new code for an email, invalidating any earlier unused one.
 *
 * Returns null, and stores nothing, when the email has already had
 * {@link MAX_CODES_PER_EMAIL_PER_HOUR} codes this hour. The caller must answer
 * exactly as it does on success so the cap is not observable.
 *
 * @param env - D1 env
 * @param email - Recipient address (normalized here)
 * @param nowMs - Current time, injectable for tests
 * @returns The plaintext code to email, or null when capped
 */
export async function issueEmailCode(env: Env, email: string, nowMs: number = Date.now()): Promise<string | null> {
  const normalized = normalizeEmail(email)
  const windowStart = nowMs - HOUR_MS
  if ((await countEmailCodesSince(env, normalized, windowStart)) >= MAX_CODES_PER_EMAIL_PER_HOUR) return null

  // Rows older than the window no longer count toward the cap; drop them so the
  // table stays bounded. Newer superseded rows are expired, not deleted, because
  // deleting them would reset the count and let the cap be walked around.
  await deleteEmailCodesCreatedBefore(env, normalized, windowStart)
  await expireActiveEmailCodes(env, normalized, nowMs)

  const code = generateCode()
  await insertEmailCode(env, {
    id: crypto.randomUUID(),
    email: normalized,
    code_hash: await hashEmailCode(normalized, code),
    expires_at: nowMs + CODE_TTL_MS,
    created_at: nowMs,
  })
  return code
}

/**
 * Checks a code for an email and, when it is right, consumes it.
 *
 * An attempt is spent BEFORE the comparison, atomically and only while the
 * code has attempts left, so the sixth try fails even with the right code and
 * parallel guesses cannot exceed the cap. Every failure returns the same
 * `false`: missing, expired, used, locked and wrong are indistinguishable.
 *
 * @param env - D1 env
 * @param email - The address the user typed (normalized here)
 * @param code - The code the user typed
 * @param nowMs - Current time, injectable for tests
 * @returns true only for the first correct use of a live code
 */
export async function redeemEmailCode(env: Env, email: string, code: string, nowMs: number = Date.now()): Promise<boolean> {
  const normalized = normalizeEmail(email)
  const submittedHash = await hashEmailCode(normalized, code)
  const row = await getActiveEmailCode(env, normalized, nowMs)
  if (!row) return false
  if (!(await takeEmailCodeAttempt(env, row.id, MAX_CODE_ATTEMPTS))) return false
  if (!constantTimeEqual(submittedHash, row.code_hash)) return false
  return markEmailCodeUsed(env, row.id, nowMs)
}
