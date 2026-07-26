import { z } from 'zod'
import type { ThingToDo } from './mergeThingsToDo'
import { distanceKm } from './places'
import { logger } from '../../src/lib/logger'

/**
 * Viator Partner API (v2) client — bookable experiences as a fourth place source.
 *
 * Destination-anchored, never free-text. Live-tested free-text search for
 * "canoe trips near Ely, Minnesota" returned Juneau, Alaska and Finnish Lapland;
 * "Jackson, Wyoming" returned a Percy Jackson tour in Rome. Anchoring on the
 * destination taxonomy (nearest `center` within {@link VIATOR_MAX_DESTINATION_KM})
 * makes that class of failure structurally impossible.
 *
 * Fails soft everywhere: no key, API error, timeout, bad shape, or no nearby
 * destination → empty list to the traveler. `searchViatorExperiences` returns a
 * discriminated result so callers can refuse to cache transient failures (an
 * empty success is real and cacheable; a failure must not poison D1). Never
 * fabricates prices, durations, ratings, or coordinates. An experience whose
 * own coordinates cannot be resolved is dropped — never pin the destination
 * centre as a stand-in.
 */

/**
 * Production Partner API base. Sandbox keys only work against
 * `https://api.sandbox.viator.com/partner` — set optional `VIATOR_API_BASE`
 * in the env to point at sandbox (or any other https partner host).
 * Not a secret; safe to log when diagnosing base selection.
 */
export const VIATOR_API_BASE = 'https://api.viator.com/partner'

/**
 * Resolves the Partner API base URL from an optional env override.
 *
 * WHY: sandbox API keys only authenticate against api.sandbox.viator.com;
 * production keys only against api.viator.com. A missing/blank override must
 * keep production behaviour unchanged. Non-https or unparseable values fall
 * back to production (never throw) so a typo in env cannot take the feature
 * offline. Trailing slashes are stripped so `.../partner/` and `.../partner`
 * build the same request paths.
 *
 * The base URL is not a secret and may appear in warning logs. Never log the
 * API key from this path (or any other).
 *
 * @param raw - Optional `env.VIATOR_API_BASE` (absent/blank → production)
 * @returns A usable https base with no trailing slash
 */
export function resolveViatorApiBase(raw?: string): string {
  if (raw == null) return VIATOR_API_BASE
  const trimmed = raw.trim()
  if (trimmed === '') return VIATOR_API_BASE

  try {
    const parsed = new URL(trimmed)
    // Only https — never allow http:// or non-URL schemes to hit the wire.
    if (parsed.protocol !== 'https:') {
      logger.warn('viator API base is not https; using production default', {
        provided: trimmed,
        fallback: VIATOR_API_BASE,
      })
      return VIATOR_API_BASE
    }
    // Normalize trailing slash so path joins never produce `//destinations`.
    return trimmed.replace(/\/+$/, '')
  } catch {
    logger.warn('viator API base is malformed; using production default', {
      provided: trimmed,
      fallback: VIATOR_API_BASE,
    })
    return VIATOR_API_BASE
  }
}

/**
 * Mandatory Accept header. Omitting `;version=2.0` returns
 * `400 INVALID_HEADER_VALUE` (official v2 versioning strategy).
 */
export const VIATOR_ACCEPT_HEADER = 'application/json;version=2.0'

/**
 * Max distance (km) from trip coords to a destination `center` before we
 * honestly report "no Viator coverage". Rural trips (e.g. Ely MN with no local
 * destination) must get `[]`, not Alaska/Finland free-text junk.
 */
export const VIATOR_MAX_DESTINATION_KM = 60

/** Cap on experiences returned to the traveler (survivors after pin filter). */
export const VIATOR_RESULT_LIMIT = 8

/**
 * How many product summaries to request from `/products/search` per destination.
 * Summaries are one cheap call. Live Tokyo measurement: of the top 8 products,
 * only 4 had any location ref with coordinates (GOOGLE-provider rows never
 * include `center` — 0 of 15 measured; TRIPADVISOR usually does — 44 of 45).
 * Fetching exactly {@link VIATOR_RESULT_LIMIT} made every coordinate-drop a
 * permanent loss instead of a backfill opportunity in a destination with
 * 4,078 products. Over-fetch so lower-ranked pinnable products can replace
 * unpinnable top ranks.
 */
export const VIATOR_SEARCH_OVERFETCH = 24

/**
 * Hard cap on `/products/{code}` detail calls per search. Basic Partner access
 * has no products/bulk, so each code is one request. Without a cap, a
 * destination where nothing resolves would burn detail quota equal to the
 * over-fetched pool. When the cap is hit, log how many survivors were kept.
 */
export const VIATOR_MAX_DETAIL_CALLS = 20

/** `/locations/bulk` max references per request (official docs). */
export const LOCATION_BATCH_MAX = 500

/**
 * Bump when the shape or semantics of cached experiences/destinations change
 * so stale D1 rows are retired (same reason as PLACE_CACHE_VERSION).
 */
export const VIATOR_CACHE_VERSION = 'v1'

/**
 * When several destinations are within this band of the nearest, prefer a
 * `CITY` over a broad region so a trip to Seminyak does not anchor on Bali.
 */
const CITY_PREFERENCE_BAND_KM = 5

/** Destinations taxonomy refresh interval — Viator says cache and refresh monthly. */
export const DESTINATIONS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Experiences cache TTL. Prices, availability, and inventory move; a permanent
 * row would serve stale (or empty) lists forever after one successful write.
 * 24h matches the need for real price data without hammering products/search
 * on every trip page view.
 */
export const EXPERIENCES_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Default traveler-facing currency when the request omits one. */
export const VIATOR_DEFAULT_CURRENCY = 'USD'

/**
 * Affiliate tracking params applied when productUrl lacks `pid`.
 * Production search results are CONFIRMED to pre-tag productUrl with pid and
 * mcid; this fallback is defensive only and never overwrites an existing pid.
 * A bare productUrl would send every booking click unattributed.
 */
const VIATOR_AFFILIATE_MCID = '42383'
const VIATOR_AFFILIATE_MEDIUM = 'api'
const VIATOR_AFFILIATE_API_VERSION = '2.0'

/**
 * Result of a Viator products/search attempt.
 *
 * Distinguishes a real empty answer (`ok: true, experiences: []`) from a
 * transient failure (`ok: false`). Callers must only write the experiences
 * cache on `ok: true` — caching a failure as [] permanently poisons that
 * destination (every later request hits the empty row and never retries).
 * Same hazard as interest-places: a one-off hiccup must not poison the cache.
 *
 * `ok: false` also covers the enrichment-outage case: search returned products
 * but every product was dropped because detail was null or locations/bulk
 * failed. Caching that empty list disabled experiences for 24h (defect 1).
 */
export type ViatorSearchResult =
  | { ok: true; experiences: ThingToDo[] }
  | { ok: false }

/**
 * Result of resolving location refs via `/locations/bulk`.
 * `ok: false` means bulk was attempted and failed — callers must not treat
 * an empty coords map as "products genuinely have no pins" (cache poison).
 */
export type ExperienceCoordsResult = {
  ok: boolean
  coords: Map<string, { lat: number; lng: number; address?: string }>
}

const centerSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
})

const destinationSchema = z.object({
  destinationId: z.union([z.number(), z.string()]),
  name: z.string(),
  type: z.string().optional(),
  parentDestinationId: z.union([z.number(), z.string()]).nullable().optional(),
  center: centerSchema.optional(),
})

/** Schema for a destinations list (D1 cache re-validation on read). */
const destinationsListSchema = z.array(destinationSchema)

/** Full `/destinations` payload — object wrapper or bare array (both seen in partner docs). */
const destinationsResponseSchema = z.union([
  z.object({ destinations: z.array(destinationSchema) }).passthrough(),
  z.array(destinationSchema),
])

const durationSchema = z
  .object({
    fixedDurationInMinutes: z.number().finite().optional(),
    variableDurationFromMinutes: z.number().finite().optional(),
    variableDurationToMinutes: z.number().finite().optional(),
  })
  .passthrough()

const pricingSchema = z
  .object({
    summary: z
      .object({
        fromPrice: z.number().finite().optional(),
      })
      .passthrough()
      .optional(),
    currency: z.string().optional(),
  })
  .passthrough()

const reviewsSchema = z
  .object({
    combinedAverageRating: z.number().finite().optional(),
    totalReviews: z.number().finite().optional(),
  })
  .passthrough()

const productSummarySchema = z
  .object({
    productCode: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    productUrl: z.string().optional(),
    duration: durationSchema.optional(),
    pricing: pricingSchema.optional(),
    reviews: reviewsSchema.optional(),
    flags: z.array(z.string()).optional(),
  })
  .passthrough()

const productsSearchResponseSchema = z
  .object({
    products: z.array(productSummarySchema).optional(),
    totalCount: z.number().optional(),
  })
  .passthrough()

const locationRefSchema = z
  .object({
    ref: z.string().min(1).optional(),
  })
  .passthrough()

/**
 * One logistics row that may carry a location ref
 * (`logistics.start[]`, `end[]`, `travelerPickup.locations[]`).
 * Wrong shapes are dropped via `.catch` so a bad branch never fails the product.
 */
const logisticsLocationRowSchema = z
  .object({
    location: locationRefSchema.optional(),
  })
  .passthrough()

/** Optional array of location-bearing logistics rows; bad shape → undefined. */
const logisticsLocationListSchema = z
  .array(logisticsLocationRowSchema)
  .optional()
  .catch(undefined)

/**
 * Product- or option-level logistics block. Every sub-path is optional and
 * tolerant so missing/malformed start/end/pickup never throw or reject the
 * whole detail payload (extractLocationRefs then simply yields no refs there).
 */
const productLogisticsSchema = z
  .object({
    start: logisticsLocationListSchema,
    end: logisticsLocationListSchema,
    travelerPickup: z
      .object({
        locations: logisticsLocationListSchema,
      })
      .passthrough()
      .optional()
      .catch(undefined),
  })
  .passthrough()

/**
 * Itinerary item that may pin a POI via pointOfInterestLocation.location.ref —
 * the productive path in live Tokyo payloads (see extractLocationRefs).
 */
const itineraryItemSchema = z
  .object({
    pointOfInterestLocation: z
      .object({
        location: locationRefSchema.optional(),
      })
      .passthrough()
      .optional()
      .catch(undefined),
  })
  .passthrough()

/**
 * Defensive shape for itinerary.pointsOfInterest[] — seen in real payloads;
 * only location.ref is used. Bad items are ignored via catch on the array.
 */
const itineraryPoiSchema = z
  .object({
    location: locationRefSchema.optional(),
  })
  .passthrough()

const productDetailSchema = z
  .object({
    productCode: z.string().min(1).optional(),
    title: z.string().optional(),
    productUrl: z.string().optional(),
    duration: durationSchema.optional(),
    pricing: pricingSchema.optional(),
    reviews: reviewsSchema.optional(),
    flags: z.array(z.string()).optional(),
    logistics: productLogisticsSchema.optional().catch(undefined),
    itinerary: z
      .object({
        activityInfo: z
          .object({
            location: locationRefSchema.optional(),
          })
          .passthrough()
          .optional()
          .catch(undefined),
        // Productive path: itinerary.itineraryItems[].pointOfInterestLocation.location.ref
        itineraryItems: z.array(itineraryItemSchema).optional().catch(undefined),
        // Seen in real payloads; exact nesting confirmed defensively via optional ref.
        pointsOfInterest: z.array(itineraryPoiSchema).optional().catch(undefined),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    // Root pointOfInterestLocation does NOT appear in real product payloads
    // (Tokyo measurement); kept optional for tolerance only — not extracted.
    pointOfInterestLocation: z
      .object({
        location: locationRefSchema.optional(),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    productOptions: z
      .array(
        z
          .object({
            logistics: productLogisticsSchema.optional().catch(undefined),
          })
          .passthrough(),
      )
      .optional()
      .catch(undefined),
  })
  .passthrough()

const bulkLocationSchema = z
  .object({
    reference: z.string().optional(),
    name: z.string().optional(),
    address: z
      .object({
        street: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        countryCode: z.string().optional(),
      })
      .passthrough()
      .optional(),
    center: centerSchema.optional(),
  })
  .passthrough()

const locationsBulkResponseSchema = z
  .object({
    locations: z.array(bulkLocationSchema).optional(),
  })
  .passthrough()

export type ViatorDestination = z.infer<typeof destinationSchema>

/**
 * Builds the stable D1 key for a destination-scoped experiences cache entry.
 * Destination id + currency is already short; the version prefix retires stale
 * rows after mapping changes (same idea as PLACE_CACHE_VERSION).
 *
 * partnerId is part of the key so rotating `VIATOR_PARTNER_ID` does not serve
 * 24h of booking URLs still tagged with the previous pid.
 *
 * @param destinationId - Viator destination id used in `/products/search`
 * @param currency - ISO currency code for prices
 * @param partnerId - Affiliate partner id embedded in booking URLs, if any
 */
export function buildViatorExperiencesCacheKey(
  destinationId: string,
  currency: string,
  partnerId?: string,
): string {
  const pidSegment = partnerId && partnerId.trim() !== '' ? partnerId.trim() : 'none'
  return `${VIATOR_CACHE_VERSION}:${destinationId}:${currency.toUpperCase()}:${pidSegment}`
}

/**
 * Destinations taxonomy cache key (single global row, versioned).
 */
export function buildViatorDestinationsCacheKey(): string {
  return `${VIATOR_CACHE_VERSION}:destinations`
}

/**
 * Re-validates a destinations list from D1 (or any untrusted source) with the
 * same Zod schema as the live `/destinations` response.
 *
 * WHY: the D1 cache path used to cast with `as ViatorDestination[]` without
 * re-validating. A corrupt cached row (non-finite center) reached
 * `findNearestDestination` unvalidated and beat a real city (defect 4).
 * A row that fails validation is a cache miss.
 *
 * @param raw - Parsed JSON from the destinations cache row
 * @returns Valid destinations, or null when the payload is not trustworthy
 */
export function parseViatorDestinationsList(raw: unknown): ViatorDestination[] | null {
  const parsed = destinationsListSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

/**
 * Geographic bounds for a destination `center`. Non-finite or out-of-range
 * coordinates must never participate in nearest-destination scoring.
 *
 * WHY: `NaN > VIATOR_MAX_DESTINATION_KM` is false, so a NaN-distance destination
 * survived the range guard, sorted to the front, and beat real Juneau (defect 4).
 *
 * @param latitude - Candidate latitude
 * @param longitude - Candidate longitude
 */
function isValidDestinationCenter(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

/**
 * Picks a coherent price+currency pair from search and detail pricing.
 *
 * Rules (defects 2 and 3):
 * - Prefer SEARCH summary pricing: `/products/search` is called WITH a currency
 *   parameter; `fetchProductDetail` sends none. A truthy-but-partial detail
 *   object used to clobber the correctly-denominated search price with an
 *   amount in an unspecified currency (cross-currency clobber, up to 100x).
 * - Never mix a price from one source with a currency from the other.
 * - Never infer currency from the request. If the API omits `pricing.currency`,
 *   omit BOTH price and currency — an unlabeled number is worse than no number
 *   (IDR-scale amount rendered with a USD badge).
 *
 * @param summaryPricing - Pricing from `/products/search` (currency-parameterized)
 * @param detailPricing - Pricing from `/products/{code}` (currency unspecified)
 */
function pickConfirmedPricing(
  summaryPricing:
    | {
        summary?: { fromPrice?: number }
        currency?: string
      }
    | undefined,
  detailPricing:
    | {
        summary?: { fromPrice?: number }
        currency?: string
      }
    | undefined,
): { priceFrom: number; currency: string } | undefined {
  const fromSource = (
    pricing:
      | {
          summary?: { fromPrice?: number }
          currency?: string
        }
      | undefined,
  ): { priceFrom: number; currency: string } | undefined => {
    if (!pricing) return undefined
    const price = pricing.summary?.fromPrice
    const currency = pricing.currency
    if (price == null || !Number.isFinite(price)) return undefined
    if (!currency || currency.trim() === '') return undefined
    return { priceFrom: price, currency: currency.trim() }
  }

  // Search pricing wins when it is a complete confirmed pair.
  return fromSource(summaryPricing) ?? fromSource(detailPricing)
}

function viatorHeaders(apiKey: string): HeadersInit {
  return {
    'exp-api-key': apiKey,
    'Accept-Language': 'en-US',
    Accept: VIATOR_ACCEPT_HEADER,
  }
}

/**
 * Normalizes a destination id from the taxonomy into the string form
 * `/products/search` expects (`filtering.destination: "732"`).
 * @param id - Numeric or string id from `/destinations`
 */
export function destinationIdString(id: number | string): string {
  return String(id)
}

/**
 * GET `/destinations` — full taxonomy with `center` coords for nearest-match.
 * Zod-validated; shape mismatch or non-200 → `[]` (never throws).
 * @param apiKey - `env.VIATOR_API_KEY` (never logged)
 * @param apiBase - Optional Partner API base override (see {@link resolveViatorApiBase})
 * @returns Parsed destinations, or empty on any failure
 */
export async function fetchViatorDestinations(
  apiKey: string,
  apiBase?: string,
): Promise<ViatorDestination[]> {
  const base = resolveViatorApiBase(apiBase)
  try {
    const res = await fetch(`${base}/destinations`, {
      method: 'GET',
      headers: viatorHeaders(apiKey),
    })
    if (!res.ok) {
      logger.warn('viator destinations non-ok', { status: res.status })
      return []
    }
    let raw: unknown
    try {
      raw = await res.json()
    } catch {
      logger.warn('viator destinations malformed JSON')
      return []
    }
    const parsed = destinationsResponseSchema.safeParse(raw)
    if (!parsed.success) {
      logger.warn('viator destinations shape mismatch')
      return []
    }
    return Array.isArray(parsed.data) ? parsed.data : parsed.data.destinations
  } catch (err) {
    logger.error('viator destinations failed', err)
    return []
  }
}

/**
 * Pure nearest-destination picker. Compares trip lat/lng against each
 * destination's `center` via {@link distanceKm}. Returns null when none is
 * within {@link VIATOR_MAX_DESTINATION_KM} — the correct answer for rural
 * coverage gaps (Ely MN must not match Juneau AK or Rovaniemi FI).
 *
 * Among destinations within range, prefers the nearest; when distances are
 * within {@link CITY_PREFERENCE_BAND_KM} of the nearest, prefers `type: "CITY"`
 * over a broad region.
 *
 * @param destinations - Taxonomy from `/destinations` (or cache)
 * @param lat - Trip latitude
 * @param lng - Trip longitude
 * @returns Nearest in-range destination, or null
 */
export function findNearestDestination(
  destinations: ViatorDestination[],
  lat: number,
  lng: number,
): ViatorDestination | null {
  type Scored = { dest: ViatorDestination; dist: number }
  const scored: Scored[] = []
  for (const dest of destinations) {
    const center = dest.center
    if (!center) continue
    // Skip non-finite / out-of-range centers. NaN distances pass `dist > max`
    // (NaN > N is false), sort ahead of real cities, and win the pick (defect 4).
    if (!isValidDestinationCenter(center.latitude, center.longitude)) continue
    const dist = distanceKm(lat, lng, center.latitude, center.longitude)
    if (!Number.isFinite(dist) || dist > VIATOR_MAX_DESTINATION_KM) continue
    scored.push({ dest, dist })
  }
  if (scored.length === 0) return null

  scored.sort((a, b) => a.dist - b.dist)
  const nearestDist = scored[0].dist
  const comparable = scored.filter((s) => s.dist <= nearestDist + CITY_PREFERENCE_BAND_KM)
  const city = comparable.find((s) => (s.dest.type ?? '').toUpperCase() === 'CITY')
  return (city ?? scored[0]).dest
}

/**
 * Duration in minutes for day budgeting. Fixed when present; for a variable
 * range uses the UPPER bound so a day budgets the worst case, never the best.
 * Omits when neither is available — never invents a duration.
 * @param duration - Product duration object from search or detail
 */
export function durationMinutesFromProduct(
  duration:
    | {
        fixedDurationInMinutes?: number
        variableDurationFromMinutes?: number
        variableDurationToMinutes?: number
      }
    | undefined,
): number | undefined {
  if (!duration) return undefined
  if (duration.fixedDurationInMinutes != null && Number.isFinite(duration.fixedDurationInMinutes)) {
    return duration.fixedDurationInMinutes
  }
  if (duration.variableDurationToMinutes != null && Number.isFinite(duration.variableDurationToMinutes)) {
    return duration.variableDurationToMinutes
  }
  return undefined
}

/**
 * Collects location reference strings from a product detail payload, in
 * priority order (first resolvable ref with real coordinates wins downstream).
 *
 * Measured against the real API (5 top-rated Tokyo products, refs resolved via
 * `/locations/bulk`) — "resolved with coordinates / total refs":
 *
 *   0/5    logistics.start[].location.ref                            provider: GOOGLE
 *   0/5    logistics.end[].location.ref                              provider: GOOGLE
 *   0/3    itinerary.activityInfo.location.ref                       provider: GOOGLE
 *   11/15  itinerary.itineraryItems[].pointOfInterestLocation.location.ref   provider: TRIPADVISOR/GOOGLE
 *   1/3    logistics.travelerPickup.locations[].location.ref         provider: TRIPADVISOR
 *
 * WHY: meeting points (start/end/activityInfo) are GOOGLE-backed and almost
 * never carry `center` or `name`. Itinerary POIs are Tripadvisor-backed and
 * usually resolve. That is not guessable from the docs. The old extractor read
 * logistics.start, activityInfo, and a root `pointOfInterestLocation` (which
 * does not exist in real payloads), so Tokyo kept 0 of 8 experiences. Priority
 * prefers where the experience actually happens over where you meet.
 *
 * Hard rule unchanged: no resolvable coordinates → product is still dropped;
 * destination centre is never substituted.
 *
 * @param detail - Parsed product detail
 * @returns Unique non-empty refs in priority order
 */
export function extractLocationRefs(detail: z.infer<typeof productDetailSchema>): string[] {
  const refs: string[] = []
  const push = (ref: string | undefined) => {
    if (ref && ref.length > 0 && !refs.includes(ref)) refs.push(ref)
  }

  // 1. Productive path — actual experience pin (best measured resolve rate).
  for (const item of detail.itinerary?.itineraryItems ?? []) {
    push(item.pointOfInterestLocation?.location?.ref)
  }
  // 2. Alternate itinerary POI list (seen in real payloads; shape optional).
  for (const poi of detail.itinerary?.pointsOfInterest ?? []) {
    push(poi.location?.ref)
  }
  // 3. Traveler pickup (sometimes Tripadvisor-backed).
  for (const loc of detail.logistics?.travelerPickup?.locations ?? []) {
    push(loc.location?.ref)
  }
  // 4–5. Meeting points — usually GOOGLE, coordinate-less (kept as fallback).
  for (const start of detail.logistics?.start ?? []) {
    push(start.location?.ref)
  }
  for (const end of detail.logistics?.end ?? []) {
    push(end.location?.ref)
  }
  // 6. Activity info location — also GOOGLE-backed in Tokyo sample.
  push(detail.itinerary?.activityInfo?.location?.ref)
  // 7. Per-option logistics start/end.
  for (const option of detail.productOptions ?? []) {
    for (const start of option.logistics?.start ?? []) {
      push(start.location?.ref)
    }
    for (const end of option.logistics?.end ?? []) {
      push(end.location?.ref)
    }
  }

  return refs
}

/**
 * Resolves location references via ONE `POST /locations/bulk` call (never
 * one call per product). Caps at {@link LOCATION_BATCH_MAX}. A reference with
 * no entry means the location was removed — disregarded. Only entries with a
 * finite `center` are returned; Google-provider rows without coords are not
 * usable as map pins.
 *
 * Returns `{ ok: false }` when bulk was attempted and failed (non-200, bad
 * JSON, shape mismatch, network throw). Callers must treat that as enrichment
 * failure and refuse to cache an empty experiences list — otherwise a bulk
 * outage looks like "no products" for 24h (defect 1 incomplete cache-poison fix).
 * `ok: true` with an empty map means bulk succeeded (or no refs needed a call)
 * and products genuinely lack usable pins.
 *
 * @param refs - Location refs collected from product details
 * @param apiKey - Viator API key
 * @param apiBase - Optional Partner API base override (see {@link resolveViatorApiBase})
 * @returns `{ ok, coords }` — coords is reference → { lat, lng, address? }
 */
export async function resolveExperienceCoordinates(
  refs: string[],
  apiKey: string,
  apiBase?: string,
): Promise<ExperienceCoordsResult> {
  const out = new Map<string, { lat: number; lng: number; address?: string }>()
  const unique = [...new Set(refs.filter((r) => r.length > 0))].slice(0, LOCATION_BATCH_MAX)
  // No refs → no bulk call needed; not an enrichment failure.
  if (unique.length === 0) return { ok: true, coords: out }

  const base = resolveViatorApiBase(apiBase)
  try {
    const res = await fetch(`${base}/locations/bulk`, {
      method: 'POST',
      headers: {
        ...viatorHeaders(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locations: unique }),
    })
    if (!res.ok) {
      logger.warn('viator locations/bulk non-ok', { status: res.status })
      return { ok: false, coords: out }
    }
    let raw: unknown
    try {
      raw = await res.json()
    } catch {
      logger.warn('viator locations/bulk malformed JSON')
      return { ok: false, coords: out }
    }
    const parsed = locationsBulkResponseSchema.safeParse(raw)
    if (!parsed.success) {
      logger.warn('viator locations/bulk shape mismatch')
      return { ok: false, coords: out }
    }
    for (const loc of parsed.data.locations ?? []) {
      if (!loc.reference || !loc.center) continue
      const { latitude, longitude } = loc.center
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
      const addressParts = [loc.address?.street, loc.address?.state, loc.address?.country].filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      )
      // Prefer structured address; fall back to the location name (real data
      // from bulk, not invented). Never the trip/destination centre.
      const address =
        addressParts.length > 0 ? addressParts.join(', ') : typeof loc.name === 'string' && loc.name ? loc.name : undefined
      out.set(loc.reference, {
        lat: latitude,
        lng: longitude,
        address,
      })
    }
    return { ok: true, coords: out }
  } catch (err) {
    logger.error('viator locations/bulk failed', err)
    return { ok: false, coords: out }
  }
}

/**
 * GET `/products/{code}` for location refs and detail enrichment.
 * @param productCode - Viator product code from search
 * @param apiKey - Viator API key (never logged)
 * @param apiBase - Resolved Partner API base (no trailing slash)
 */
async function fetchProductDetail(
  productCode: string,
  apiKey: string,
  apiBase: string,
): Promise<z.infer<typeof productDetailSchema> | null> {
  try {
    const res = await fetch(`${apiBase}/products/${encodeURIComponent(productCode)}`, {
      method: 'GET',
      headers: viatorHeaders(apiKey),
    })
    if (!res.ok) {
      logger.warn('viator product detail non-ok', { status: res.status, productCode })
      return null
    }
    let raw: unknown
    try {
      raw = await res.json()
    } catch {
      return null
    }
    const parsed = productDetailSchema.safeParse(raw)
    if (!parsed.success) return null
    return parsed.data
  } catch (err) {
    logger.error('viator product detail failed', err)
    return null
  }
}

/**
 * Picks a bookable URL. Prefers the API's `productUrl` (do not hand-assemble a
 * path from productCode). If the returned URL has no `pid` and `partnerId` is
 * provided, append affiliate tracking so booking clicks are attributed.
 *
 * Production search results are CONFIRMED to pre-tag productUrl with pid and
 * mcid, so the primary path is leave-as-returned. The pid fallback is defensive
 * only (never overwrites an existing pid). A bare productUrl would send every
 * booking click unattributed, with nothing to surface it.
 *
 * @param productUrl - Affiliate URL from search or detail, if any
 * @param partnerId - `env.VIATOR_PARTNER_ID`; only used when productUrl lacks pid
 */
function bookingUrlFrom(productUrl: string | undefined, partnerId?: string): string | undefined {
  if (!productUrl || productUrl.trim() === '') return undefined
  if (!partnerId) return productUrl
  try {
    const url = new URL(productUrl)
    // Never overwrite a pid the API already set — prefer the API's tagging.
    if (url.searchParams.has('pid')) return productUrl
    // Append tracking; URL API preserves any other existing params.
    url.searchParams.set('pid', partnerId)
    url.searchParams.set('mcid', VIATOR_AFFILIATE_MCID)
    url.searchParams.set('medium', VIATOR_AFFILIATE_MEDIUM)
    url.searchParams.set('api_version', VIATOR_AFFILIATE_API_VERSION)
    return url.toString()
  } catch {
    // Unparseable absolute URL — leave as returned rather than invent a path.
    return productUrl
  }
}

/**
 * Search bookable experiences for a Viator destination id, enrich with product
 * detail + one bulk location resolve, map to {@link ThingToDo}. Products without
 * resolvable coordinates are dropped (never destination-centre pinned).
 *
 * Coverage backfill: `/products/search` requests {@link VIATOR_SEARCH_OVERFETCH}
 * summaries (one cheap call), then detail is fetched for up to
 * {@link VIATOR_MAX_DETAIL_CALLS} products in ranked order. Refs from those
 * details go into ONE `/locations/bulk` call; survivors with real centers are
 * selected in ranking order until {@link VIATOR_RESULT_LIMIT} (or the pool is
 * exhausted). Returning fewer than 8 — or zero — is a legitimate success.
 *
 * WHY over-fetch: live Tokyo top-8 had only 4 products with any ref that
 * resolved to coordinates. GOOGLE-provider location rows never include
 * `center` (0 of 15 measured); TRIPADVISOR usually does (44 of 45). Fetching
 * exactly RESULT_LIMIT made every drop a permanent loss in a destination with
 * 4,078 products. The drop rule itself is correct — never fabricate a pin and
 * never substitute the destination centre.
 *
 * Returns a discriminated result so callers can refuse to cache transient
 * failures. A genuine empty search (`ok: true, experiences: []`) is a real
 * stable answer and SHOULD be cached; a non-200 / timeout / bad JSON / shape
 * mismatch / fetch throw is `ok: false` and must NOT be written to D1 — that
 * would permanently poison the destination with an empty list (same rule as
 * interest-places.ts: a one-off hiccup never poisons the cache).
 *
 * Enrichment outage is also `ok: false`: when search returns products but every
 * product is dropped because detail was null or locations/bulk failed, returning
 * `{ ok: true, experiences: [] }` would cache that empty list for 24h and
 * silently disable experiences for the destination (defect 1 — incomplete
 * cache-poison fix). Legitimate drops (no title, bulk ok but ref has no center)
 * remain cacheable empty answers — including after backfill exhausts the pool.
 *
 * @param opts.destinationId - Taxonomy id string for `filtering.destination`
 * @param opts.apiKey - Viator API key
 * @param opts.partnerId - Partner id for affiliate tagging when productUrl lacks pid
 * @param opts.currency - ISO currency for prices (sent on search only)
 * @param opts.limit - Max products to keep (capped at {@link VIATOR_RESULT_LIMIT})
 * @param opts.apiBase - Optional Partner API base override (see {@link resolveViatorApiBase})
 * @returns `{ ok: true, experiences }` on a successful search (possibly empty),
 *   or `{ ok: false }` on any upstream/transient/enrichment failure
 */
export async function searchViatorExperiences(opts: {
  destinationId: string
  apiKey: string
  partnerId?: string
  currency?: string
  limit?: number
  apiBase?: string
}): Promise<ViatorSearchResult> {
  const { destinationId, apiKey, partnerId } = opts
  const currency = (opts.currency ?? VIATOR_DEFAULT_CURRENCY).toUpperCase()
  const limit = Math.min(Math.max(opts.limit ?? VIATOR_RESULT_LIMIT, 0), VIATOR_RESULT_LIMIT)
  if (limit === 0) return { ok: true, experiences: [] }
  // Resolve once so search, product detail, and locations/bulk share one host.
  const base = resolveViatorApiBase(opts.apiBase)
  // Over-fetch summaries so coordinate drops can be backfilled from lower ranks.
  const searchCount = Math.max(limit, VIATOR_SEARCH_OVERFETCH)

  try {
    const res = await fetch(`${base}/products/search`, {
      method: 'POST',
      headers: {
        ...viatorHeaders(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filtering: {
          destination: destinationId,
          tags: [],
          flags: [],
          includeAutomaticTranslations: true,
        },
        sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
        pagination: { start: 1, count: searchCount },
        currency,
      }),
    })
    if (!res.ok) {
      logger.warn('viator products/search non-ok', { status: res.status })
      return { ok: false }
    }
    let raw: unknown
    try {
      raw = await res.json()
    } catch {
      logger.warn('viator products/search malformed JSON')
      return { ok: false }
    }
    const parsed = productsSearchResponseSchema.safeParse(raw)
    if (!parsed.success) {
      logger.warn('viator products/search shape mismatch')
      return { ok: false }
    }
    // Successful search with zero products is a real empty answer — cacheable.
    const products = (parsed.data.products ?? []).slice(0, searchCount)
    if (products.length === 0) return { ok: true, experiences: [] }

    // Detail in ranked order, hard-capped so an all-unresolvable destination
    // cannot spin. Survivors are chosen AFTER one bulk resolve (refs are only
    // known from detail; bulk must stay a single call for the whole set).
    const detailBudget = Math.min(products.length, VIATOR_MAX_DETAIL_CALLS)
    const detailCapHit = products.length > VIATOR_MAX_DETAIL_CALLS
    const candidates = products.slice(0, detailBudget)
    const details = await Promise.all(
      candidates.map((p) => fetchProductDetail(p.productCode, apiKey, base)),
    )

    const allRefs: string[] = []
    const productRefs: string[][] = []
    for (let i = 0; i < candidates.length; i += 1) {
      const detail = details[i]
      const refs = detail ? extractLocationRefs(detail) : []
      productRefs.push(refs)
      for (const r of refs) {
        if (!allRefs.includes(r)) allRefs.push(r)
      }
    }

    // ONE bulk call for every ref collected from the detailed pool — never N
    // calls per product, and never a bulk-per-survivor loop.
    // Pass the already-resolved base so bulk cannot drift from search/detail.
    const coordsResult = await resolveExperienceCoordinates(allRefs, apiKey, base)
    const coordsByRef = coordsResult.coords

    const results: ThingToDo[] = []
    for (let i = 0; i < candidates.length; i += 1) {
      if (results.length >= limit) break

      const summary = candidates[i]
      const detail = details[i]
      const refs = productRefs[i]
      // First ref that resolves with real coordinates wins. No coords → drop
      // and try the next ranked product (backfill). Never substitute the
      // destination centre — that would fabricate a pin. GOOGLE-provider rows
      // without center never enter coordsByRef (measured 0 of 15 had center).
      let resolved: { lat: number; lng: number; address?: string } | undefined
      for (const ref of refs) {
        const c = coordsByRef.get(ref)
        if (c) {
          resolved = c
          break
        }
      }
      if (!resolved) continue

      const title = detail?.title ?? summary.title
      if (!title || title.trim() === '') continue

      const duration = detail?.duration ?? summary.duration
      // Prefer search pricing (currency-parameterized) over detail pricing
      // (currency unspecified). Never mix sources; never infer currency.
      // Production confirms pricing.currency is present at pricing.currency on
      // search results; when absent we still omit both (never infer).
      const confirmedPrice = pickConfirmedPricing(summary.pricing, detail?.pricing)
      const reviews = detail?.reviews ?? summary.reviews
      const flags = detail?.flags ?? summary.flags ?? []
      const productUrl = detail?.productUrl ?? summary.productUrl

      const item: ThingToDo = {
        name: title.trim(),
        category: 'experience',
        source: 'viator',
        productCode: summary.productCode,
        lat: resolved.lat,
        lng: resolved.lng,
      }
      if (resolved.address) item.address = resolved.address
      // reviews.combinedAverageRating / totalReviews confirmed present in production.
      if (reviews?.combinedAverageRating != null) item.rating = reviews.combinedAverageRating
      if (reviews?.totalReviews != null) item.numReviews = reviews.totalReviews
      // Only set price when currency is confirmed from the same API source.
      // Never stamp the request currency onto an unlabeled amount (defect 2).
      if (confirmedPrice) {
        item.priceFrom = confirmedPrice.priceFrom
        item.currency = confirmedPrice.currency
      }
      const mins = durationMinutesFromProduct(duration)
      if (mins != null) item.durationMinutes = mins
      const bookingUrl = bookingUrlFrom(productUrl, partnerId)
      if (bookingUrl) item.bookingUrl = bookingUrl
      if (flags.includes('FREE_CANCELLATION')) item.freeCancellation = true

      results.push(item)
    }

    if (detailCapHit) {
      logger.info('viator detail cap hit', {
        destinationId,
        detailBudget: VIATOR_MAX_DETAIL_CALLS,
        poolSize: products.length,
        kept: results.length,
      })
    }

    // Search returned products but every product was dropped. Only treat that
    // as a cacheable empty success when drops were legitimate (no pin after a
    // successful bulk, missing title, etc.). If enrichment itself failed —
    // every detail null, or bulk non-200 — return ok:false so nothing is
    // cached for 24h (defect 1 incomplete cache-poison fix). Fewer than
    // RESULT_LIMIT (or zero) after a successful bulk is still ok:true.
    if (results.length === 0) {
      const everyDetailFailed = details.every((d) => d == null)
      if (everyDetailFailed || !coordsResult.ok) {
        logger.warn('viator enrichment failed; refusing empty cacheable success', {
          destinationId,
          searched: products.length,
          detailed: candidates.length,
          everyDetailFailed,
          bulkOk: coordsResult.ok,
        })
        return { ok: false }
      }
    }

    logger.info('viator experiences mapped', {
      destinationId,
      searched: products.length,
      detailed: candidates.length,
      kept: results.length,
    })
    return { ok: true, experiences: results }
  } catch (err) {
    logger.error('viator products/search failed', err)
    return { ok: false }
  }
}
