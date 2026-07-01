import { describe, it, expect } from 'vitest'
import { isUnderRateLimit, hashIp } from './rateLimit'

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
})
