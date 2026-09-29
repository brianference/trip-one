// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  MAX_CODES_PER_EMAIL_PER_HOUR,
  UNBIASED_LIMIT,
  constantTimeEqual,
  generateCode,
  hashEmailCode,
  issueEmailCode,
  redeemEmailCode,
} from './emailCode'
import { sha256hex } from './tokens'
import { codeStore } from '../testEmailCodes'

afterEach(() => {
  vi.restoreAllMocks()
})

const ALEX = 'alex@example.com'
const BLAIR = 'blair@example.com'
const HOUR_MS = 60 * 60 * 1000

/** A 6-digit code guaranteed to differ from `code`. */
function wrongCode(code: string): string {
  return code === '000000' ? '000001' : '000000'
}

describe('generateCode', () => {
  it('returns exactly six digits', () => {
    for (let i = 0; i < 200; i += 1) expect(generateCode()).toMatch(/^\d{6}$/)
  })

  it('uses the largest multiple of 1,000,000 below 2^32 as the rejection bound', () => {
    expect(UNBIASED_LIMIT).toBe(4_294_000_000)
  })

  it('discards draws at or above the bound instead of reducing them (no modulo bias)', () => {
    const draws = [UNBIASED_LIMIT, 2 ** 32 - 1, 123]
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((arr: Uint32Array) => {
      arr[0] = draws.shift() as number
      return arr
    }) as typeof crypto.getRandomValues)
    expect(generateCode()).toBe('000123')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('accepts the last value below the bound', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((arr: Uint32Array) => {
      arr[0] = UNBIASED_LIMIT - 1
      return arr
    }) as typeof crypto.getRandomValues)
    expect(generateCode()).toBe('999999')
  })
})

describe('hashEmailCode', () => {
  it('is sha256 of the normalized email, a colon, and the code', async () => {
    expect(await hashEmailCode(' Alex@Example.com ', '123456')).toBe(await sha256hex('alex@example.com:123456'))
  })

  it('binds the email: the same code hashes differently for another address', async () => {
    expect(await hashEmailCode(ALEX, '123456')).not.toBe(await hashEmailCode(BLAIR, '123456'))
  })
})

describe('constantTimeEqual', () => {
  it('is true only for identical strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('issueEmailCode', () => {
  it('stores only the email-bound hash with a 10-minute expiry', async () => {
    const store = codeStore()
    const now = Date.now()
    const code = await issueEmailCode(store.fake.env, 'Alex@Example.com', now)
    expect(code).toMatch(/^\d{6}$/)
    expect(store.codes).toHaveLength(1)
    const row = store.codes[0]
    expect(row.email).toBe(ALEX)
    expect(row.code_hash).toBe(await sha256hex(`${ALEX}:${code}`))
    expect(JSON.stringify(row)).not.toContain(`"${code}"`)
    expect(row.expires_at).toBe(now + CODE_TTL_MS)
    expect(row.attempts).toBe(0)
  })

  it('keeps one active code per email: a new request kills the earlier unused one', async () => {
    const store = codeStore()
    const first = (await issueEmailCode(store.fake.env, ALEX)) as string
    const second = (await issueEmailCode(store.fake.env, ALEX)) as string
    expect(await redeemEmailCode(store.fake.env, ALEX, first)).toBe(first === second)
    expect(await redeemEmailCode(store.fake.env, ALEX, second)).toBe(first !== second)
  })

  it('does not touch another email’s active code', async () => {
    const store = codeStore()
    const blairCode = (await issueEmailCode(store.fake.env, BLAIR)) as string
    await issueEmailCode(store.fake.env, ALEX)
    expect(await redeemEmailCode(store.fake.env, BLAIR, blairCode)).toBe(true)
  })

  it('issues at most 5 codes per email per hour and stores nothing past the cap', async () => {
    const store = codeStore()
    const now = Date.now()
    for (let i = 0; i < MAX_CODES_PER_EMAIL_PER_HOUR; i += 1) {
      expect(await issueEmailCode(store.fake.env, ALEX, now + i)).not.toBeNull()
    }
    expect(await issueEmailCode(store.fake.env, ALEX, now + 10)).toBeNull()
    expect(store.codes).toHaveLength(MAX_CODES_PER_EMAIL_PER_HOUR)
    // Other addresses are unaffected.
    expect(await issueEmailCode(store.fake.env, BLAIR, now + 10)).not.toBeNull()
    // Once the first codes leave the rolling hour, a new one is allowed and the old rows are purged.
    expect(await issueEmailCode(store.fake.env, ALEX, now + HOUR_MS + 5)).not.toBeNull()
    expect(store.codes.filter((c) => c.email === ALEX)).toHaveLength(1)
  })
})

describe('redeemEmailCode', () => {
  it('accepts the right code once (one-time use)', async () => {
    const store = codeStore()
    const code = (await issueEmailCode(store.fake.env, ALEX)) as string
    expect(await redeemEmailCode(store.fake.env, ALEX, code)).toBe(true)
    expect(store.codes[0].used_at).not.toBeNull()
    expect(await redeemEmailCode(store.fake.env, ALEX, code)).toBe(false)
  })

  it('counts a wrong code as an attempt', async () => {
    const store = codeStore()
    const code = (await issueEmailCode(store.fake.env, ALEX)) as string
    expect(await redeemEmailCode(store.fake.env, ALEX, wrongCode(code))).toBe(false)
    expect(store.codes[0].attempts).toBe(1)
    expect(store.codes[0].used_at).toBeNull()
  })

  it('allows the right code on the 5th attempt', async () => {
    const store = codeStore()
    const code = (await issueEmailCode(store.fake.env, ALEX)) as string
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i += 1) {
      expect(await redeemEmailCode(store.fake.env, ALEX, wrongCode(code))).toBe(false)
    }
    expect(await redeemEmailCode(store.fake.env, ALEX, code)).toBe(true)
  })

  it('fails the 6th attempt even with the right code', async () => {
    const store = codeStore()
    const code = (await issueEmailCode(store.fake.env, ALEX)) as string
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      expect(await redeemEmailCode(store.fake.env, ALEX, wrongCode(code))).toBe(false)
    }
    expect(await redeemEmailCode(store.fake.env, ALEX, code)).toBe(false)
    expect(store.codes[0].attempts).toBe(MAX_CODE_ATTEMPTS)
    expect(store.codes[0].used_at).toBeNull()
  })

  it('rejects an expired code', async () => {
    const store = codeStore()
    const issuedAt = Date.now() - CODE_TTL_MS - 1
    const code = (await issueEmailCode(store.fake.env, ALEX, issuedAt)) as string
    expect(await redeemEmailCode(store.fake.env, ALEX, code)).toBe(false)
    // Still valid one millisecond before expiry.
    expect(await redeemEmailCode(store.fake.env, ALEX, code, issuedAt + CODE_TTL_MS - 1)).toBe(true)
  })

  it('rejects a code sent to email A when used for email B', async () => {
    const store = codeStore()
    const alexCode = (await issueEmailCode(store.fake.env, ALEX)) as string
    // B has no code at all.
    expect(await redeemEmailCode(store.fake.env, BLAIR, alexCode)).toBe(false)
    // B has its own live code; A's code still does not open it.
    const blairCode = (await issueEmailCode(store.fake.env, BLAIR)) as string
    if (blairCode !== alexCode) expect(await redeemEmailCode(store.fake.env, BLAIR, alexCode)).toBe(false)
    // A's code is untouched and still works for A.
    expect(await redeemEmailCode(store.fake.env, ALEX, alexCode)).toBe(true)
  })

  it('rejects a row whose hash was made for another email, even if a lookup returned it', async () => {
    const store = codeStore()
    const alexCode = (await issueEmailCode(store.fake.env, ALEX)) as string
    // Simulate a widened lookup: move A's row under B's address without rehashing.
    store.codes[0].email = BLAIR
    expect(await redeemEmailCode(store.fake.env, BLAIR, alexCode)).toBe(false)
  })
})
