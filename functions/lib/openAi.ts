import { z } from 'zod'

/**
 * Shape we actually read out of an OpenAI Chat Completions response. Validated
 * rather than trusted, and shared by every endpoint that calls the API so the
 * contract lives in one place.
 */
export const openAiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
})
