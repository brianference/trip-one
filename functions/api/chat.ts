import { z } from 'zod'
import type { Env } from '../lib/db'
import { countRecentRequests, insertRequestLog } from '../lib/db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { buildChatPrompt, normalizeChatResponse, parseDayCommand, enforceDayCommand } from '../lib/aiChat'
import { balanceDayFood } from '../lib/aiPlan'
import { openAiResponseSchema } from '../lib/openAi'
import { logger } from '../../src/lib/logger'

// AI calls cost money; gated like the planner.
const RATE_LIMIT_PER_HOUR = 300
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
        // Set when the place came from searching the traveler's own stated
        // interests, so the planner can prioritise it and the food balancer
        // knows it isn't incidental filler.
        themed: z.boolean().optional(),
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
    if (!isUnderRateLimit(await countRecentRequests(env, ipHash, oneHourAgo, 'chat'), RATE_LIMIT_PER_HOUR)) {
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
        max_tokens: 1200,
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

    // currentPlan + places let the normalizer put back any existing stop the
    // model dropped without being asked (see protectExistingStops).
    const result = normalizeChatResponse(raw, places.length, days, itinerary, places)
    if (!result) return json({ error: 'AI assistant could not respond, try again' }, 502)

    // An explicit "clear day 3" or "remove ... day 4" is carried out here
    // rather than trusted to the model, which repeatedly did the opposite and
    // then claimed success. Only fires on an explicit day number and verb.
    if (result.action === 'plan' && result.days && itinerary && itinerary.length > 0) {
      const command = parseDayCommand(message)
      if (command) {
        const enforced = enforceDayCommand(command, result.days, itinerary, places)
        result.days = enforced.days
        if (enforced.failed) {
          // Never repeat the model's claim that it removed something when the
          // day is unchanged. Say what actually happened.
          result.message = `I couldn't work out which stop to remove from day ${command.day}, so I've left it as it was. Tell me the place by name and I'll remove it.`
        }
      }
    }

    // A blank message renders as an empty assistant bubble, which reads as the
    // assistant having failed silently.
    if (!result.message.trim()) {
      result.message = result.action === 'plan' ? 'Done — your itinerary is updated.' : 'Sorry, could you say that another way?'
    }

    // On a re-plan, guarantee ≥3 food stops per day near each day's stops.
    if (result.action === 'plan' && result.days) {
      result.days = balanceDayFood(result.days, places)
    }
    return json(result, 200)
  } catch (err) {
    logger.error('chat turn failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
