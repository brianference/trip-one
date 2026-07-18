import {
  fetchLocation,
  fetchDiscoveredVenues,
  fetchInterestPlaces,
  createTrip,
  updateTrip,
  generatePlan,
  type ThingToDo,
  type TripIntent,
} from '../../../lib/api/client'
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

/** What createTripForDestination needs: a destination plus the traveler profile. */
export interface TripRequest {
  destination: string
  interests: string
  requestedDays: number | null
  party?: string
  occasion?: string | null
  season?: string | null
  audience?: 'kids' | 'adults' | 'general'
  foodFocused?: boolean
}

/**
 * Build a complete grounded trip for a destination: geocode it, discover the
 * real venues a travel guide would recommend for THIS traveler, create the
 * trip, plan a day-by-day itinerary from those plus the destination's nearby
 * places, and persist it. Shared by the homepage planner and the chat's
 * "relocate" path. Trip length is clamped to {@link MIN_TRIP_DAYS}.
 *
 * Web-grounded discovery is what makes the plan feel curated rather than a
 * proximity dump: it searches real guides for the party/season/interests and
 * returns the specific named venues they recommend (each verified against real
 * Places). It runs alongside the location fetch and fails soft, so a themed
 * trip gets its real venues while an ordinary city break still works.
 *
 * @param req - Destination and traveler profile (see {@link TripRequest})
 * @throws If the place can't be found or has no things to do
 */
export async function createTripForDestination(req: TripRequest): Promise<BuiltTrip> {
  const { destination, interests, requestedDays } = req
  const location = await fetchLocation(destination)
  if (location.thingsToDo.length === 0) {
    throw new Error(`I couldn’t find things to do in ${destination}. Try a nearby city.`)
  }

  const days = Math.max(requestedDays ?? MIN_TRIP_DAYS, MIN_TRIP_DAYS)
  const intent: TripIntent = {
    destination: location.displayName,
    days,
    interests,
    party: req.party,
    occasion: req.occasion,
    season: req.season,
    audience: req.audience,
    foodFocused: req.foodFocused,
  }

  // Discovery (web-grounded, curated) and the interest search (cheap query
  // expansion) both surface themed venues; running them together broadens
  // coverage, and both are cached so a repeat trip pays nothing.
  const [trip, discovered, interestPlaces] = await Promise.all([
    createTrip(location.slug, 'chronicle'),
    fetchDiscoveredVenues(intent, location.lat, location.lng),
    fetchInterestPlaces(interests, location.displayName, location.lat, location.lng),
  ])

  const themed = dedupeByName([...discovered, ...interestPlaces])
  const candidatePlaces: ThingToDo[] = buildCandidatePool(location.thingsToDo, themed, days, {
    foodFocused: req.foodFocused,
  })

  const plan = await generatePlan(interests, days, candidatePlaces.map(toPlanPlace), {
    party: req.party,
    occasion: req.occasion,
    season: req.season,
    audience: req.audience,
  })
  const itinerary = planToItinerary(plan.days, candidatePlaces)
  await updateTrip(trip.id, { itinerary, tripLengthDays: days })

  return { tripId: trip.id, destinationName: location.displayName, message: plan.message, days }
}

/** Case-insensitive dedupe by name, first occurrence wins (discovery before interest). */
function dedupeByName(places: ThingToDo[]): ThingToDo[] {
  const seen = new Set<string>()
  const out: ThingToDo[] = []
  for (const p of places) {
    const key = p.name.trim().toLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function toPlanPlace(p: ThingToDo) {
  return { name: p.name, category: p.category, rating: p.rating, numReviews: p.numReviews, lat: p.lat, lng: p.lng, themed: p.themed }
}
