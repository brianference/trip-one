/**
 * Check if the recent request count is under the rate limit cap.
 * @param recentCount - The number of requests in the current window
 * @param limitPerHour - The maximum allowed requests per hour
 * @returns true if the count is strictly less than the limit, false otherwise
 */
export function isUnderRateLimit(recentCount: number, limitPerHour: number): boolean {
  return recentCount < limitPerHour
}

/** 16-bit groups in an IPv6 address. */
const IPV6_GROUPS = 8
/** Groups in a /64 prefix: 64 / 16. */
const IPV6_PREFIX_GROUPS = 4
/** Largest value of one 16-bit group. */
const MAX_GROUP = 0xffff
/** The fixed group that marks an IPv4-mapped address (::ffff:a.b.c.d). */
const IPV4_MAPPED_MARKER = 0xffff
/** Index of that marker group. */
const IPV4_MAPPED_MARKER_INDEX = 5
const BYTE_BITS = 8
const BYTE_MASK = 0xff

/**
 * Converts dotted IPv4 text into two 16-bit groups, or null if it is not one.
 * @param text - For example `192.0.2.1`
 */
function ipv4ToGroups(text: string): [number, number] | null {
  const parts = text.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= BYTE_MASK)) return null
  const [a, b, c, d] = parts.map(Number)
  return [(a << BYTE_BITS) | b, (c << BYTE_BITS) | d]
}

/**
 * Expands IPv6 text (with `::` compression, an optional zone id and an
 * optional embedded IPv4 tail) into its 8 groups, or null if it is not valid.
 * @param text - For example `2001:db8::1`
 */
function ipv6ToGroups(text: string): number[] | null {
  const address = text.split('%')[0]
  const halves = address.split('::')
  if (halves.length > 2) return null

  const parseHalf = (half: string): number[] | null => {
    if (half === '') return []
    const groups: number[] = []
    const pieces = half.split(':')
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]
      if (index === pieces.length - 1 && piece.includes('.')) {
        const tail = ipv4ToGroups(piece)
        if (!tail) return null
        groups.push(...tail)
      } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
        groups.push(parseInt(piece, 16))
      } else {
        return null
      }
    }
    return groups
  }

  const head = parseHalf(halves[0])
  const tail = halves.length === 2 ? parseHalf(halves[1]) : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === IPV6_GROUPS ? head : null
  const missing = IPV6_GROUPS - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...new Array<number>(missing).fill(0), ...tail]
}

/**
 * The rate-limit bucket for a client address. IPv4 addresses are their own
 * bucket, unchanged. An IPv6 address is bucketed by its /64 prefix: an IPv6
 * subnet is a /64 whose low 64 bits the host picks itself (RFC 4291 section
 * 2.5.1), so bucketing by full address would let one client rotate addresses
 * and get a fresh budget each time. An IPv4-mapped IPv6
 * address counts as the IPv4 address it carries. Anything unparseable is used
 * as-is.
 * @param ip - The client address, e.g. from `CF-Connecting-IP`
 */
export function rateLimitBucket(ip: string): string {
  const trimmed = ip.trim()
  if (!trimmed.includes(':')) return trimmed
  const groups = ipv6ToGroups(trimmed)
  if (!groups || groups.some((group) => group > MAX_GROUP)) return trimmed

  const isIpv4Mapped =
    groups.slice(0, IPV4_MAPPED_MARKER_INDEX).every((group) => group === 0) &&
    groups[IPV4_MAPPED_MARKER_INDEX] === IPV4_MAPPED_MARKER
  if (isIpv4Mapped) {
    const [high, low] = groups.slice(IPV4_MAPPED_MARKER_INDEX + 1)
    return [high >> BYTE_BITS, high & BYTE_MASK, low >> BYTE_BITS, low & BYTE_MASK].join('.')
  }
  return `${groups.slice(0, IPV6_PREFIX_GROUPS).map((group) => group.toString(16)).join(':')}::/64`
}

/**
 * Hash a client address's rate-limit bucket ({@link rateLimitBucket}: the
 * IPv4 address itself, or an IPv6 address's /64) with a salt using SHA-256 via
 * the Web Crypto API. Stable and non-reversible.
 * @param ip - The client address to hash
 * @param salt - A salt value to prevent rainbow table attacks
 * @returns A promise resolving to a 64-character hex string (SHA-256 digest)
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${rateLimitBucket(ip)}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
