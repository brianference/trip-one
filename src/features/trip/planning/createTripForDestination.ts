import { fetchLocation, fetchInterestPlaces, createTrip, updateTrip, generatePlan, type ThingToDo } from '../../../lib/api/client'
import { planToItinerary } from '../../../lib/itinerary/planToItinerary'
import { buildCandidatePool } from '../../../lib/places/candidatePool'

/** Every auto-built trip is at least this long — a one- or two-day trip feels too thin. */
export const MIN_TRIP_DAYS = 3

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
 * Build a complete grounded trip for a destination: geocode it, find real
 * places matching the traveler's interests, create the trip, plan a day-by-day
 * itinerary from those plus the destination's nearby places, and persist it.
 * Shared by the homepage planner and the chat's "relocate" path so both behave
 * identically. Trip length is clamped to {@link MIN_TRIP_DAYS}.
 *
 * The interest search is what makes a themed trip work. The nearby pool alone
 * is a fixed attractions-plus-food sweep, so a request like "walleye fishing
 * and ruffed grouse hunting" had nothing on-theme to plan around and filled up
 * with restaurants instead. It runs alongside the location fetch and fails
 * soft, so a themed trip gets its guides and launches while an ordinary city
 * break is unaffected.
 *
 * @param destination - Where to go (already normalized to a full place name)
 * @param interests - Free-text preferences, used to steer the plan AND to find on-theme places
 * @param requestedDays - Desired length, or null to use the minimum
 * @param foodFocused - True when eating/drinking is a main point of the trip, so
 * restaurants count as on-theme rather than as filler to be capped
 * @throws If the place can't be found or has no things to do
 */
export async function createTripForDestination(
  destination: string,
  interests: string,
  requestedDays: number | null,
  foodFocused = false,
): Promise<BuiltTrip> {
  const location = await fetchLocation(destination)
  if (location.thingsToDo.length === 0) {
    throw new Error(`I couldn’t find things to do in ${destination}. Try a nearby city.`)
  }

  const days = Math.max(requestedDays ?? MIN_TRIP_DAYS, MIN_TRIP_DAYS)
  const [trip, interestPlaces] = await Promise.all([
    createTrip(location.slug, 'chronicle'),
    fetchInterestPlaces(interests, location.displayName, location.lat, location.lng),
  ])

  const candidatePlaces: ThingToDo[] = buildCandidatePool(location.thingsToDo, interestPlaces, days, { foodFocused })

  const plan = await generatePlan(
    interests,
    days,
    candidatePlaces.map((p) => ({ name: p.name, category: p.category, rating: p.rating, lat: p.lat, lng: p.lng, themed: p.themed })),
  )
  const itinerary = planToItinerary(plan.days, candidatePlaces)
  await updateTrip(trip.id, { itinerary, tripLengthDays: days })

  return { tripId: trip.id, destinationName: location.displayName, message: plan.message, days }
}
