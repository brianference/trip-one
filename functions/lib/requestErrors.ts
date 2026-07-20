import type { z } from 'zod'
import { MAX_TRIP_DAYS } from './tripLimits'

/**
 * Turns a schema failure into something the traveler can act on.
 *
 * A validation error used to surface as the literal string "invalid request",
 * which the client renders verbatim. A 15-day trip was rejected because the
 * endpoint capped days at 14, and all the traveler saw was "invalid request"
 * with no hint that the LENGTH was the problem or that a shorter trip would
 * work. Naming the offending field costs nothing and is the difference between
 * a dead end and a fix the traveler can make themselves.
 *
 * Falls back to a plain sentence for fields a traveler has no control over.
 */
export function describeRequestError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Something in that request didn’t look right. Please try again.'
  const field = String(issue.path[0] ?? '')

  if (field === 'days') {
    return `Trips can be between 1 and ${MAX_TRIP_DAYS} days. Try asking for a shorter trip.`
  }
  if (field === 'places') {
    return 'We couldn’t find enough places there to plan a trip. Try a nearby city.'
  }
  if (field === 'message' || field === 'intent' || field === 'text') {
    return 'That message was too long. Try saying it more briefly.'
  }
  if (field === 'destination') {
    return 'We need a destination to plan a trip.'
  }
  return 'Something in that request didn’t look right. Please try again.'
}
