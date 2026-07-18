// Google Places returns plenty of results that are real businesses but not
// somewhere a traveler plans a day around — ATMs, dentists, plumbers. These
// are noise in a "things to do" list and were worse in the AI planner, which
// could pick one as a "stop." They're dropped from the pool everywhere.
const NEVER_EXPERIENCE_CATEGORIES = new Set([
  'real_estate_agency',
  'car_repair',
  'car_dealer',
  'atm',
  'bank',
  'finance',
  'insurance_agency',
  'accounting',
  'storage',
  'moving_company',
  'gas_station',
  'parking',
  'hospital',
  'doctor',
  'dentist',
  'pharmacy',
  'drugstore',
  'veterinary_care',
  'post_office',
  'local_government_office',
  'courthouse',
  'police',
  'fire_station',
  'laundry',
  'hair_care',
  'beauty_salon',
  'plumber',
  'electrician',
  'roofing_contractor',
  'lawyer',
])

// Categories that are noise in a GENERIC sweep of a place, but are exactly
// what the traveler wants when they asked for the activity behind them.
//
// Google files fishing guides, hunting outfitters, dive shops, and boat
// charters under `travel_agency`, and gear/bike/kayak rental often lands under
// `car_rental` or `gym`. Excluding those outright meant an activity trip threw
// away its best real results — an International Falls walleye trip dropped the
// one genuine guide service it found and planned restaurants instead. So they
// are filtered only when nobody asked for them.
const INCIDENTAL_ONLY_CATEGORIES = new Set(['lodging', 'gym', 'travel_agency', 'car_rental'])

/**
 * Whether a place category is a genuine traveler experience (an attraction,
 * restaurant, park, etc.) versus a service/utility that's just noise in a
 * "things to do" list. Anything not explicitly excluded counts as an
 * experience, so this errs toward keeping places rather than over-filtering.
 *
 * Use this for the generic nearby sweep. For results the traveler's own
 * interests asked for, use {@link isRequestedExperienceCategory}.
 */
export function isExperienceCategory(category: string): boolean {
  return !NEVER_EXPERIENCE_CATEGORIES.has(category) && !INCIDENTAL_ONLY_CATEGORIES.has(category)
}

/**
 * Whether a place found by searching the traveler's OWN stated interests is
 * worth keeping. Looser than {@link isExperienceCategory}: a guide service or
 * a kayak rental is noise in a generic list but is the entire point of the
 * trip when they asked to go fishing or paddling. Only true utility noise
 * (ATMs, dentists) is dropped here.
 */
export function isRequestedExperienceCategory(category: string): boolean {
  return !NEVER_EXPERIENCE_CATEGORIES.has(category)
}
