import { z } from 'zod'
import type { Env } from '../lib/supabaseAdmin'
import { countRecentRequests, insertRequestLog } from '../lib/supabaseAdmin'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { buildChatPrompt, normalizeChatResponse } from '../lib/aiChat'
import { openAiResponseSchema } from '../lib/openAi'
import { logger } from '../../src/lib/logger'

// AI calls cost money; gated like the planner.
const RATE_LIMIT_PER_HOUR = 30
const DEFAULT_MODEL = 'gpt-4o-mini'

type ChatEnv = Env & { OPENAI_API_KEY?: string; AI_MODEL?: string }

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  days: z.number().int().min(1).max(14),
  locationName: z.string().max(200).optional(),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        category: z.string().min(1).max(100),
        rating: z.number().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      }),
    )
    .min(1)
    .max(40),
  itinerary: z
    .array(z.object({ day: z.number().int().min(1).max(14), placeNames: z.array(z.string().max(200)).max(40) }))
    .max(14)
    .optional(),
  conversation: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(600) }))
    .max(16)
    .optional(),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * POST /api/chat
 *
 * One conversational turn of the trip assistant. The model decides whether the
 * message is a plan edit or a question, then either returns an updated grounded
 * plan (indices into the real places) or just answers from the real trip data.
 * @returns `{ action: 'plan'|'answer', message, days? }`, or `{ error }`
 */
export async function onRequestPost({ env, request }: { env: ChatEnv; request: Request }): Promise<Response> {
  if (!env.OPENAI_API_KEY) return json({ error: 'AI assistant is not configured' }, 500)

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid request' }, 400)
  const { message, days, places, itinerary, conversation, locationName } = parsed.data

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    if (!isUnderRateLimit(await countRecentRequests(env, ipHash, oneHourAgo), RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }
    await insertRequestLog(env, ipHash, 'chat')

    const prompt = buildChatPrompt({ message, days, candidates: places, locationName, conversation, currentPlan: itinerary })
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 800,
      }),
    })
    if (!res.ok) {
      logger.error('openai chat request non-ok', { status: res.status })
      return json({ error: 'AI assistant unavailable, try again' }, 502)
    }

    const bodyParsed = openAiResponseSchema.safeParse(await res.json())
    if (!bodyParsed.success) return json({ error: 'AI assistant unavailable, try again' }, 502)

    let raw: unknown
    try {
      raw = JSON.parse(bodyParsed.data.choices[0].message.content)
    } catch {
      return json({ error: 'AI assistant returned an unreadable response, try again' }, 502)
    }

    const result = normalizeChatResponse(raw, places.length, days)
    if (!result) return json({ error: 'AI assistant could not respond, try again' }, 502)

    return json(result, 200)
  } catch (err) {
    logger.error('chat turn failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
