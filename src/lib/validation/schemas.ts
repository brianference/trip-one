import { z } from 'zod'

export const locationQuerySchema = z.string().trim().min(1).max(200)

export const autocompleteQuerySchema = z.string().trim().min(2).max(200)

export const itineraryItemSchema = z.object({
  time: z.string(),
  text: z.string().min(1).max(300),
  type: z.enum(['fixed', 'travel', 'option']),
  q: z.string().max(200).optional(),
  inout: z.string().max(100).optional(),
  /** 1-indexed day this stop is assigned to, used to group and order a multi-day itinerary. */
  day: z.number().int().min(1).optional(),
  /** Real coordinates, when known (e.g. carried over from a Places-sourced suggestion, or
   * geocoded from a manually-entered location) — used for day clustering and the map route line. */
  lat: z.number().optional(),
  lng: z.number().optional(),
  /** Free-text category (e.g. "restaurant", "tourist_attraction"), used to recognize meal stops
   * when ordering a day (breakfast/lunch/dinner slots) rather than treating everything as a
   * generic activity. */
  category: z.string().max(100).optional(),
  /**
   * Upstream source when known. `viator` marks a bookable paid experience that
   * should render distinctly (booking link, duration, price only with currency).
   */
  source: z.enum(['tripadvisor', 'places', 'viator']).optional(),
  /** Viator product code, when source is viator. */
  productCode: z.string().max(80).optional(),
  /**
   * Traveler-facing "from" price. Never invent — omit when unknown.
   * UI must not render this without a confirmed {@link currency}.
   */
  priceFrom: z.number().optional(),
  /** ISO 4217 currency of priceFrom. Required for any price display. */
  currency: z.string().max(3).optional(),
  /** Real duration in minutes; absent when unknown (never defaulted). */
  durationMinutes: z.number().int().positive().optional(),
  /** Affiliate-tagged booking URL (Viator). Opens with rel=sponsored. */
  bookingUrl: z.string().max(2000).optional(),
  /** True when free cancellation is confirmed; omit when unknown. */
  freeCancellation: z.boolean().optional(),
})

export type ItineraryItem = z.infer<typeof itineraryItemSchema>
