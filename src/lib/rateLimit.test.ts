import { describe, it, expect } from 'vitest'
import { isUnderRateLimit, hashIp, rateLimitBucket } from './rateLimit'

describe('isUnderRateLimit', () => {
  it('allows when under the cap', () => {
    expect(isUnderRateLimit(3, 10)).toBe(true)
  })

  it('blocks when at the cap', () => {
    expect(isUnderRateLimit(10, 10)).toBe(false)
  })

  it('blocks when over the cap', () => {
    expect(isUnderRateLimit(11, 10)).toBe(false)
  })
})

describe('hashIp', () => {
  it('produces a stable, non-reversible hex hash', async () => {
    const a = await hashIp('203.0.113.1', 'test-salt')
    const b = await hashIp('203.0.113.1', 'test-salt')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain('203.0.113.1')
  })

  it('produces a different hash for a different salt', async () => {
    const a = await hashIp('203.0.113.1', 'salt-a')
    const b = await hashIp('203.0.113.1', 'salt-b')
    expect(a).not.toBe(b)
  })

  it('hashes an IPv4 address exactly as before (salt:address), so existing request_log rows still count', async () => {
    expect(await hashIp('203.0.113.1', 'test-salt')).toBe(await sha256Hex('test-salt:203.0.113.1'))
    expect(await hashIp('203.0.113.1', 'test-salt')).not.toBe(await hashIp('203.0.113.2', 'test-salt'))
  })

  it('puts two IPv6 addresses in the same /64 in one bucket, whatever their spelling', async () => {
    const a = await hashIp('2001:db8:1:2::1', 'test-salt')
    for (const sameSubnet of ['2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:0DB8:0001:0002:0:0:0:5', '2001:db8:1:2::a%eth0']) {
      expect(await hashIp(sameSubnet, 'test-salt')).toBe(a)
    }
  })

  it('keeps IPv6 addresses in different /64s apart', async () => {
    const a = await hashIp('2001:db8:1:2::1', 'test-salt')
    for (const otherSubnet of ['2001:db8:1:3::1', '2001:db8:2:2::1', '2001:db9:1:2::1']) {
      expect(await hashIp(otherSubnet, 'test-salt')).not.toBe(a)
    }
  })
})

describe('rateLimitBucket', () => {
  it.each([
    ['203.0.113.1', '203.0.113.1'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    // An IPv4-mapped address is the IPv4 address it carries, not a shared ::/64.
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    // Unparseable input is its own bucket rather than being merged with anything.
    ['unknown', 'unknown'],
    ['2001:db8:::1', '2001:db8:::1'],
    ['1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8:9'],
    ['2001:db8::zzzz', '2001:db8::zzzz'],
  ])('%s -> %s', (ip, bucket) => {
    expect(rateLimitBucket(ip)).toBe(bucket)
  })
})

/** Reference SHA-256 hex of a string, independent of the code under test. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
