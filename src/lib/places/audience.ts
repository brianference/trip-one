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

/**
 * Types that make a venue adults-only on their own. `bar` is deliberately NOT
 * here: Google tags any restaurant with a drinks licence as `bar`, so treating
 * it as decisive flagged Pinky G's Pizzeria — a family pizza place — as a
 * drinking venue. See {@link isAdultVenue} for how `bar` is actually used.
 */
export const ADULT_PLACE_TYPES: readonly string[] = ['night_club', 'casino', 'liquor_store']

/** Types that mean the place also serves as somewhere to eat. */
const EATERY_TYPES: readonly string[] = ['restaurant', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery']

/** Places types that only make sense on a trip that includes children. */
export const KID_PLACE_TYPES: readonly string[] = ['zoo', 'aquarium', 'amusement_park', 'playground']

/**
 * Name tokens that mark a place as primarily a drinking venue.
 *
 * A bare "bar" is NOT a token here. It fires on far too much that has nothing
 * to do with drinking — "Bar T 5" (a family chuckwagon show), "Bar Harbor",
 * "Sushi Bar", "Juice Bar", "Snack Bar" — and a false positive silently
 * deletes a place a family would have enjoyed. "bar" only counts in a
 * qualified form ("wine bar", "cocktail bar", "Restaurant & Bar"), where it
 * genuinely describes the venue.
 *
 * Word boundaries throughout, so "pub" can't fire on "Public Library" and
 * "brewing" can't fire on a coffee roaster's tagline.
 */
const ADULT_NAME_PATTERN = new RegExp(
  [
    // Unambiguous drinking words.
    String.raw`\b(pubs?|tavern|saloon|brewery|brewpub|taproom|tap\s?house|ale\s?house|distillery|whiskey|whisky|speakeasy|night\s?club|wine\s?bar|cocktail\s?bar|sports\s?bar|beer\s?garden|beer\s?hall)\b`,
    // "… & Bar", "… and Bar" — the bar is billed as half the venue.
    String.raw`([&+]|\band)\s*bar\b`,
    // "Bar & Grill", "Bar and Restaurant" — same billing, words reversed.
    String.raw`\bbar\s*([&+]|and)\s*(grill|restaurant|kitchen|lounge|eatery)\b`,
  ].join('|'),
  'i',
)

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
  if (ADULT_PLACE_TYPES.includes(place.category) || place.category === 'bar') return true

  // A `bar` type only means "adults only" when the place ISN'T also somewhere
  // to eat. A pub that serves food is still a pub; a pizzeria that serves beer
  // is still a pizzeria, and excluding it would rob a family trip of a
  // perfectly good dinner.
  const types = place.types
  if (types?.includes('bar') && !types.some((t) => EATERY_TYPES.includes(t))) return true

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
