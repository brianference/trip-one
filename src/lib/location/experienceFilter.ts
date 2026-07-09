// Google Places returns plenty of results that are real businesses but not
// somewhere a traveler plans a day around — hotels, gyms, ATMs, car rentals.
// They cluttered the Things-to-do list and, worse, the AI planner could pick
// a hotel as a "stop." These categories are dropped from the pool.
const NON_EXPERIENCE_CATEGORIES = new Set([
  'lodging',
  'gym',
  'travel_agency',
  'real_estate_agency',
  'car_rental',
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

/**
 * Whether a place category is a genuine traveler experience (an attraction,
 * restaurant, park, etc.) versus a service/utility that's just noise in a
 * "things to do" list. Anything not explicitly excluded counts as an
 * experience, so this errs toward keeping places rather than over-filtering.
 */
export function isExperienceCategory(category: string): boolean {
  return !NON_EXPERIENCE_CATEGORIES.has(category)
}
