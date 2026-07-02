import { z } from 'zod'

export const locationQuerySchema = z.string().trim().min(1).max(200)

export const autocompleteQuerySchema = z.string().trim().min(2).max(200)

export const itineraryItemSchema = z.object({
  time: z.string(),
  text: z.string().min(1).max(300),
  type: z.enum(['fixed', 'travel', 'option']),
  q: z.string().max(200).optional(),
  inout: z.string().max(100).optional(),
})

export type ItineraryItem = z.infer<typeof itineraryItemSchema>
