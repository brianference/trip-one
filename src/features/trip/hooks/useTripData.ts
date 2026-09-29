import { useEffect, useState } from 'react'
import {
  getTrip,
  fetchLocation,
  fetchExperiences,
  type Trip,
  type LocationResult,
  type ThingToDo,
} from '../../../lib/api/client'
import { useTripStore } from '../../../store/tripStore'
import { queueTripWrite } from '../../../lib/api/tripWriteQueue'
import { dedupeItinerary } from '../../../lib/itinerary/dedupeItinerary'
import { ensureStopIds } from '../../../lib/itinerary/stopIds'
import { logger } from '../../../lib/logger'

/**
 * Merges bookable experiences into the nearby places list without duplicating
 * names. Experiences are independent of Places/Tripadvisor — an empty nearby
 * pool must not hide real Viator products.
 * @param nearby - Places/Tripadvisor things-to-do from /api/location
 * @param experiences - Bookable Viator rows from /api/experiences
 */
function mergeThingsWithExperiences(nearby: ThingToDo[], experiences: ThingToDo[]): ThingToDo[] {
  if (experiences.length === 0) return nearby
  const seen = new Set(nearby.map((p) => p.name.trim().toLowerCase()))
  const extras = experiences.filter((e) => {
    const key = e.name.trim().toLowerCase()
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return extras.length === 0 ? nearby : [...nearby, ...extras]
}

/**
 * Loads a trip and its location once per `tripId`, and rehydrates the
 * shared itinerary store from the fetched trip — without this, revisiting
 * or reloading a trip URL directly (rather than arriving from the search
 * flow, which already populates the store) would show an empty itinerary
 * even though stops were saved, since the store resets on every fresh page
 * load. Shared by every page under `TripShell` so the fetch happens once
 * per trip visit, not once per page.
 *
 * Also loads bookable experiences and merges them into `location.thingsToDo`
 * so ThingsToDoList can render them. Experiences must load on every trip
 * open — not only during createTripForDestination — because a trip created
 * via POST /api/trips (or any path that skipped the planner) still needs
 * experience cards when the page loads, even if the Places pool is empty.
 *
 * @param tripId - The trip id from the route param
 * @returns The loaded trip, its resolved location, a loading flag, and an
 * `error` flag. `trip`/`location` stay `null` until the fetch resolves;
 * `error` is true if the trip fetch failed (so the shell can show a real
 * error state instead of an infinite spinner).
 */
export function useTripData(tripId: string) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [location, setLocation] = useState<LocationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let tripLoaded = false
    setLoading(true)
    setError(false)
    getTrip(tripId)
      .then((loadedTrip) => {
        if (cancelled) return
        tripLoaded = true
        // Self-heal legacy rows that drifted, or predate stop ids, before
        // today's write paths existed.
        // WHY dedupe: the live Tokyo demo (00000000-0000-4000-8000-000000000002)
        // stored 25 stops with three exact pairs (Odaiba Beach, Odaiba Marine
        // Park, Isshiki Beach) while its seed file has 6 unique stops.
        // WHY ids: a row saved before stop ids existed has none, and a later
        // feature attaches uploaded photos to a stop by `id` — an id that
        // gets regenerated on every reload (rather than assigned once and
        // persisted) would silently detach that photo.
        // Both heals write through the queue at most once per load: only
        // when dedupe actually dropped something, or ensureStopIds actually
        // added an id, so a clean/already-ided row never re-fires on every
        // visit and never fights a traveler's own later edits.
        const cleanedItinerary = dedupeItinerary(loadedTrip.itinerary)
        const idedItinerary = ensureStopIds(cleanedItinerary)
        const healed: Trip = { ...loadedTrip, itinerary: idedItinerary }
        setTrip(healed)
        useTripStore.setState({
          tripId: healed.id,
          locationSlug: healed.locationSlug,
          itinerary: idedItinerary,
          tripLengthDays: healed.tripLengthDays,
          startDate: healed.startDate ?? null,
        })
        const dedupeRemovedStops = cleanedItinerary.length !== loadedTrip.itinerary.length
        const idsWereAdded = idedItinerary !== cleanedItinerary
        if (dedupeRemovedStops || idsWereAdded) {
          queueTripWrite(healed.id, { itinerary: idedItinerary }, (err) => {
            logger.error('failed to persist legacy itinerary self-heal (dedupe/stable ids)', err)
            useTripStore.getState().setSaveError(true)
          })
        }
        return fetchLocation(loadedTrip.locationSlug).then(async (loc) => {
          if (cancelled) return
          // Experiences do not depend on Places. Always fetch on load so a
          // destination with zero things_to_do (or a trip that never went
          // through createTripForDestination) still shows bookable tours.
          // fetchExperiences fails soft to [] — never blocks the trip page.
          const experiences = await fetchExperiences(loc.lat, loc.lng)
          if (cancelled) return
          setLocation({
            ...loc,
            thingsToDo: mergeThingsWithExperiences(loc.thingsToDo, experiences),
          })
        })
      })
      .catch((err) => {
        logger.error('failed to load trip data', err)
        // Only the trip fetch failing is fatal to the page; a failed
        // location fetch still leaves a usable trip (itinerary works, the
        // map just won't render), so don't flip error for that.
        if (!cancelled && !tripLoaded) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  return { trip, location, loading, error }
}
