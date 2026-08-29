// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { randomToken, sha256hex } from './tokens'

describe('tokens', () => {
  it('produces URL-safe hex of the requested length', () => {
    const token = randomToken(32)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes a token to 64 hex chars and never equals the input', async () => {
    const token = 'abc'
    const hash = await sha256hex(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(token)
    expect(await sha256hex(token)).toBe(hash)
  })
})
