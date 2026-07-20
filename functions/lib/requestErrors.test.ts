import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { describeRequestError } from './requestErrors'

/** Produces a real ZodError for a given schema and input. */
function errorFor(schema: z.ZodTypeAny, input: unknown): z.ZodError {
  const r = schema.safeParse(input)
  if (r.success) throw new Error('expected a validation failure')
  return r.error
}

// A 15-day trip was rejected because the endpoint capped days at 14, and the
// traveler saw only "invalid request" — no hint that LENGTH was the problem or
// that a shorter trip would work.
describe('describeRequestError', () => {
  const schema = z.object({
    days: z.number().int().min(1).max(30),
    places: z.array(z.string()).min(1),
    intent: z.string().max(500),
  })

  it('names the trip length and the allowed range', () => {
    const msg = describeRequestError(errorFor(schema, { days: 45, places: ['a'], intent: '' }))
    expect(msg).toContain('30 days')
    expect(msg).not.toContain('invalid')
  })

  it('explains an empty place list in terms the traveler can act on', () => {
    const msg = describeRequestError(errorFor(schema, { days: 3, places: [], intent: '' }))
    expect(msg).toContain('nearby city')
  })

  it('explains an over-long message', () => {
    const msg = describeRequestError(errorFor(schema, { days: 3, places: ['a'], intent: 'x'.repeat(900) }))
    expect(msg).toContain('briefly')
  })

  // Every message must read as a sentence to a person, never as a field name.
  it('never leaks developer shorthand', () => {
    for (const input of [{ days: 99 }, { days: 3, places: [] }, {}]) {
      const msg = describeRequestError(errorFor(schema, input))
      expect(msg).toMatch(/^[A-Z]/)
      expect(msg).toMatch(/[.!]$/)
      expect(msg.toLowerCase()).not.toContain('invalid request')
      expect(msg).not.toMatch(/_|placeIndexes|zod/i)
    }
  })
})
