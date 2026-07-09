import { fetchLocation, createTrip, updateTrip, generatePlan, type ThingToDo } from '../../../lib/api/client'
import { planToItinerary } from '../../../lib/itinerary/planToItinerary'

/** Every auto-built trip is at least this long — a one- or two-day trip feels too thin. */
export const MIN_TRIP_DAYS = 3
const MAX_CANDIDATES = 40

export interface BuiltTrip {
  tripId: string
  /** The real, resolved destination name (e.g. "Las Vegas, Nevada"). */
  destinationName: string
  /** The planner's opening message. */
  message: string
  /** Trip length actually used (clamped to the minimum). */
  days: number
}

/**
 * Build a complete grounded trip for a destination: geocode it, create the
 * trip, plan a day-by-day itinerary from its real nearby places, and persist
 * it. Shared by the homepage planner and the chat's "relocate" path so both
 * behave identically. Trip length is clamped to {@link MIN_TRIP_DAYS}.
 *
 * @param destination - Where to go (already normalized to a full place name)
 * @param interests - Free-text preferences to steer the plan
 * @param requestedDays - Desired length, or null to use the minimum
 * @throws If the place can't be found or has no things to do
 */
export async function createTripForDestination(destination: string, interests: string, requestedDays: number | null): Promise<BuiltTrip> {
  const location = await fetchLocation(destination)
  if (location.thingsToDo.length === 0) {
    throw new Error(`I couldn’t find things to do in ${destination}. Try a nearby city.`)
  }

  const trip = await createTrip(location.slug, 'chronicle')
  const days = Math.max(requestedDays ?? MIN_TRIP_DAYS, MIN_TRIP_DAYS)
  const candidatePlaces: ThingToDo[] = [...location.thingsToDo]
    .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
    .slice(0, MAX_CANDIDATES)

  const plan = await generatePlan(
    interests,
    days,
    candidatePlaces.map((p) => ({ name: p.name, category: p.category, rating: p.rating })),
  )
  const itinerary = planToItinerary(plan.days, candidatePlaces)
  await updateTrip(trip.id, { itinerary, tripLengthDays: days })

  return { tripId: trip.id, destinationName: location.displayName, message: plan.message, days }
}
