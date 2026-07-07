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
})

export type ItineraryItem = z.infer<typeof itineraryItemSchema>
