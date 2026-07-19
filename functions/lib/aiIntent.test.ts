import { describe, it, expect } from 'vitest'
import { extractedIntentSchema } from './aiIntent'

// The model emits an explicit null for anything the request doesn't mention.
// A non-nullable schema rejected that and the endpoint answered 502, so
// "5 day hiking trip in Ouray Colorado" failed outright roughly two times in
// three — intermittent only because the model sometimes said "general".
describe('extractedIntentSchema with nulls for unstated fields', () => {
  it('accepts a null party, interests, audience and foodFocused', () => {
    const parsed = extractedIntentSchema.safeParse({
      destination: 'Queenstown, New Zealand',
      days: 11,
      interests: 'adventure trip',
      party: null,
      occasion: null,
      season: null,
      audience: 'general',
      foodFocused: false,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts every optional field as null at once', () => {
    const parsed = extractedIntentSchema.safeParse({
      destination: 'Ouray, Colorado',
      days: 5,
      interests: null,
      party: null,
      occasion: null,
      season: null,
      audience: null,
      foodFocused: null,
    })
    expect(parsed.success).toBe(true)
  })
})
