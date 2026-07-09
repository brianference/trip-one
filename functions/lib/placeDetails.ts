/**
 * Pure, network-free normalization of Google Place Details into the compact,
 * real-data-only shape the app renders. Everything here comes straight from
 * Google's response — nothing is invented (in particular there is no fabricated
 * "menu": we surface Google's real `serves_*`/price/hours/reviews instead).
 */

/** Fields requested from the Place Details API (comma-joined by the caller). */
export const PLACE_DETAILS_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'formatted_phone_number',
  'rating',
  'user_ratings_total',
  'price_level',
  'website',
  'url',
  'opening_hours',
  'editorial_summary',
  'reviews',
  'photos',
  'types',
  'serves_breakfast',
  'serves_lunch',
  'serves_dinner',
  'serves_brunch',
  'serves_vegetarian_food',
].join(',')

export interface PlaceReview {
  author: string
  rating: number | null
  text: string
  relativeTime: string
}

export interface PlaceDetail {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  rating: number | null
  reviewCount: number | null
  priceLevel: number | null
  website: string | null
  mapsUrl: string | null
  openNow: boolean | null
  hours: string[]
  summary: string | null
  reviews: PlaceReview[]
  photoRefs: string[]
  serves: string[]
  types: string[]
}

const MAX_REVIEWS = 3
const MAX_PHOTOS = 3

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Normalizes a raw Google Place Details `result` object into a `PlaceDetail`.
 * Returns null when there isn't even a name/place_id to show, so the caller
 * can 404 rather than render an empty panel.
 * @param raw - The `result` object from the Place Details response
 * @param fallbackPlaceId - The place_id used in the request, if the result omits one
 */
export function normalizePlaceDetail(raw: unknown, fallbackPlaceId: string): PlaceDetail | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const placeId = str(r.place_id) ?? fallbackPlaceId
  const name = str(r.name)
  if (!name || !placeId) return null

  const openingHours = (r.opening_hours ?? null) as { open_now?: unknown; weekday_text?: unknown } | null
  const weekday = Array.isArray(openingHours?.weekday_text)
    ? (openingHours?.weekday_text as unknown[]).filter((t): t is string => typeof t === 'string')
    : []

  const reviewsRaw = Array.isArray(r.reviews) ? (r.reviews as Record<string, unknown>[]) : []
  const reviews: PlaceReview[] = reviewsRaw
    .map((rev) => ({
      author: str(rev.author_name) ?? 'Google reviewer',
      rating: num(rev.rating),
      text: str(rev.text) ?? '',
      relativeTime: str(rev.relative_time_description) ?? '',
    }))
    .filter((rev) => rev.text.length > 0)
    .slice(0, MAX_REVIEWS)

  const photosRaw = Array.isArray(r.photos) ? (r.photos as Record<string, unknown>[]) : []
  const photoRefs = photosRaw
    .map((p) => str(p.photo_reference))
    .filter((ref): ref is string => ref !== null)
    .slice(0, MAX_PHOTOS)

  const editorial = (r.editorial_summary ?? null) as { overview?: unknown } | null
  const summary = str(editorial?.overview) ?? (reviews[0]?.text ?? null)

  const serves: string[] = []
  if (r.serves_breakfast === true) serves.push('breakfast')
  if (r.serves_brunch === true) serves.push('brunch')
  if (r.serves_lunch === true) serves.push('lunch')
  if (r.serves_dinner === true) serves.push('dinner')
  if (r.serves_vegetarian_food === true) serves.push('vegetarian')

  const types = Array.isArray(r.types) ? (r.types as unknown[]).filter((t): t is string => typeof t === 'string') : []

  return {
    placeId,
    name,
    address: str(r.formatted_address),
    phone: str(r.formatted_phone_number),
    rating: num(r.rating),
    reviewCount: num(r.user_ratings_total),
    priceLevel: num(r.price_level),
    website: str(r.website),
    mapsUrl: str(r.url),
    openNow: typeof openingHours?.open_now === 'boolean' ? openingHours.open_now : null,
    hours: weekday,
    summary,
    reviews,
    photoRefs,
    serves,
    types,
  }
}
