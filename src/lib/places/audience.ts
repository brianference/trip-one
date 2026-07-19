/**
 * Who a place is actually suitable for.
 *
 * Audience used to be inferred from a place's single `category`, which loses
 * the signal. Places' `types` for a saloon are typically
 * `['bar', 'restaurant', ...]`, and the food-category promotion in `places.ts`
 * deliberately moves `restaurant` to the front so meal slots get detected — so
 * by the time a place reached the audience filter it looked like an ordinary
 * restaurant. That is how the Mangy Moose, a Teton Village saloon, landed on
 * day 4 of a family ski trip with two kids.
 *
 * So classify from the FULL type list where it's available, and fall back to
 * name tokens where it isn't (Tripadvisor results carry no types, and a place
 * literally called "Local Restaurant & Bar" is self-describing).
 */

/** Places types that make a venue adults-only in practice. */
export const ADULT_PLACE_TYPES: readonly string[] = ['bar', 'night_club', 'casino', 'liquor_store']

/** Places types that only make sense on a trip that includes children. */
export const KID_PLACE_TYPES: readonly string[] = ['zoo', 'aquarium', 'amusement_park', 'playground']

/**
 * Name tokens that mark a drinking venue when the type list doesn't.
 *
 * Matched on word boundaries: "bar" must not fire on "Barbecue", "Barn" or
 * "Barista", and "pub" must not fire on "Public Library". Ordered loosely by
 * how unambiguous each token is.
 */
const ADULT_NAME_PATTERN =
  /\b(bar|bars|pub|pubs|tavern|saloon|brewery|brewing|brewpub|taproom|tap\s?house|alehouse|ale\s?house|distillery|whiskey|whisky|cocktails?|speakeasy|nightclub|night\s?club|wine\s?bar|beer\s?garden)\b/i

/**
 * Name tokens that mark a children's attraction. Kept deliberately narrow —
 * this only ever ADDS a kid signal, and a false positive would wrongly exclude
 * a place from an adults trip.
 */
const KID_NAME_PATTERN = /\b(playground|petting\s?zoo|water\s?park|amusement\s?park|children'?s\s+museum|kids'?\s+club)\b/i

/** The minimum a place must expose for us to judge its audience. */
export interface AudienceCandidate {
  name: string
  category: string
  /** Full Places `types`, when the source provided them. */
  types?: readonly string[]
  /** Precomputed adult flag, when a caller already resolved it from `types`. */
  adultVenue?: boolean
}

/**
 * Whether a place is a drinking venue, judged from types first and name second.
 * @param place - The place to classify
 */
export function isAdultVenue(place: AudienceCandidate): boolean {
  if (place.adultVenue === true) return true
  if (place.types?.some((t) => ADULT_PLACE_TYPES.includes(t))) return true
  if (ADULT_PLACE_TYPES.includes(place.category)) return true
  return ADULT_NAME_PATTERN.test(place.name)
}

/**
 * Whether a place is a children's attraction, judged from types first and name
 * second.
 * @param place - The place to classify
 */
export function isKidVenue(place: AudienceCandidate): boolean {
  if (place.types?.some((t) => KID_PLACE_TYPES.includes(t))) return true
  if (KID_PLACE_TYPES.includes(place.category)) return true
  return KID_NAME_PATTERN.test(place.name)
}

/**
 * Whether a place suits the trip's audience.
 *
 * `general` applies no filter — a mixed trip can include either.
 *
 * @param place - The place to judge
 * @param audience - The trip's audience
 * @returns False only when the place clearly belongs to the other audience
 */
export function fitsAudience(place: AudienceCandidate, audience: 'kids' | 'adults' | 'general' | undefined): boolean {
  if (audience === 'kids') return !isAdultVenue(place)
  if (audience === 'adults') return !isKidVenue(place)
  return true
}
