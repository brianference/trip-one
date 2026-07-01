/**
 * Check if the recent request count is under the rate limit cap.
 * @param recentCount - The number of requests in the current window
 * @param limitPerHour - The maximum allowed requests per hour
 * @returns true if the count is strictly less than the limit, false otherwise
 */
export function isUnderRateLimit(recentCount: number, limitPerHour: number): boolean {
  return recentCount < limitPerHour
}

/**
 * Hash an IP address with a salt using SHA-256 via Web Crypto API.
 * The hash is stable (same input always produces same output) and non-reversible.
 * @param ip - The IP address to hash
 * @param salt - A salt value to prevent rainbow table attacks
 * @returns A promise resolving to a 64-character hex string (SHA-256 digest)
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
