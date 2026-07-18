import { z } from 'zod'
import type { Env } from '../lib/db'
import { countRecentRequests, insertRequestLog } from '../lib/db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { buildPlanPrompt, normalizePlan, extractPlanMessage, balanceDayFood, ensureAllDays } from '../lib/aiPlan'
import { openAiResponseSchema } from '../lib/openAi'
import { logger } from '../../src/lib/logger'

// A short, friendly default when the model omits its own reply, so the chat
// never shows an empty assistant bubble.
const DEFAULT_PLAN_MESSAGE = 'Here’s your updated plan — every stop is a real place nearby.'

// AI calls cost real money per request, so this is gated tighter than the
// free-ish location cache endpoint.
const RATE_LIMIT_PER_HOUR = 150
// The model is configurable via the AI_MODEL env var so it can be tuned or
// upgraded without a code change; it defaults to the low-cost gpt-4o-mini.
const DEFAULT_MODEL = 'gpt-4o-mini'

type PlanEnv = Env & { OPENAI_API_KEY?: string; AI_MODEL?: string }

const planRequestSchema = z.object({
  intent: z.string().trim().min(1).max(500),
  days: z.number().int().min(1).max(14),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        category: z.string().min(1).max(100),
        rating: z.number().optional(),
        numReviews: z.number().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        // Set when the place came from searching the traveler's own stated
        // interests, so the planner can prioritise it and the food balancer
        // knows it isn't incidental filler.
        themed: z.boolean().optional(),
      }),
    )
    .min(1)
    // Long trips need a bigger pool to fill all their days, so this cap scales
    // above the old 40.
    .max(120),
  // Who the trip is for and when, so the plan is audience/season-appropriate.
  party: z.string().max(120).optional(),
  occasion: z.string().max(120).nullable().optional(),
  season: z.string().max(40).nullable().optional(),
  audience: z.enum(['kids', 'adults', 'general']).optional(),
  // Optional conversational context (the itinerary chat). Absent for the
  // one-shot planner, present when the traveler is refining a plan by chat.
  conversation: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(600) }))
    .max(16)
    .optional(),
  currentPlan: z
    .array(z.object({ day: z.number().int().min(1).max(14), placeNames: z.array(z.string().max(200)).max(40) }))
    .max(14)
    .optional(),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * POST /api/plan
 *
 * The grounded natural-language trip planner. Given the traveler's free-text
 * request, a day count, and the REAL candidate places already fetched for the
 * trip, it asks an LLM to select and sequence a day-by-day plan — but only by
 * index into the supplied places, so the model can never invent a place.
 * `normalizePlan` drops anything out of range, so a hallucinated or malformed
 * response degrades to a smaller (or rejected) plan, never a fake one.
 * @returns `{ days: [{ day, placeIndexes }] }` on success, or `{ error }` with
 * 400 (bad request), 429 (rate limited), 500 (not configured), 502 (no usable plan)
 */
export async function onRequestPost({ env, request }: { env: PlanEnv; request: Request }): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    logger.error('AI planner called without OPENAI_API_KEY configured')
    return json({ error: 'AI planner is not configured' }, 500)
  }

  const parsed = planRequestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid request' }, 400)
  const { intent, days, places, party, occasion, season, audience, conversation, currentPlan } = parsed.data

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentCount = await countRecentRequests(env, ipHash, oneHourAgo)
    if (!isUnderRateLimit(recentCount, RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }
    await insertRequestLog(env, ipHash, 'plan')

    const prompt = buildPlanPrompt({
      intent,
      days,
      candidates: places,
      profile: { party, occasion, season, audience },
      conversation,
      currentPlan,
    })
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 1200,
      }),
    })
    if (!res.ok) {
      logger.error('openai plan request non-ok', { status: res.status })
      return json({ error: 'AI planner unavailable, try again' }, 502)
    }

    const bodyParsed = openAiResponseSchema.safeParse(await res.json())
    if (!bodyParsed.success) {
      logger.error('openai response shape unexpected')
      return json({ error: 'AI planner unavailable, try again' }, 502)
    }

    let rawPlan: unknown
    try {
      rawPlan = JSON.parse(bodyParsed.data.choices[0].message.content)
    } catch {
      return json({ error: 'AI planner returned an unreadable plan, try again' }, 502)
    }

    const plan = normalizePlan(rawPlan, places.length, days)
    if (!plan) return json({ error: 'AI planner could not build a plan from nearby places, try again' }, 502)

    // Deterministically guarantee each day has a meal, and trim any incidental
    // food the model padded the day with beyond its share.
    const withFood = balanceDayFood(plan, places)
    // For a fresh plan, guarantee the itinerary spans all requested days
    // (the model front-loads and leaves long trips short). Skip this for a
    // conversational EDIT — re-filling days the traveler just trimmed would
    // undo their change.
    const isEdit = Boolean(currentPlan && currentPlan.length > 0)
    const finalDays = isEdit ? withFood : ensureAllDays(withFood, places, days)
    return json({ days: finalDays, message: extractPlanMessage(rawPlan) ?? DEFAULT_PLAN_MESSAGE }, 200)
  } catch (err) {
    logger.error('AI plan generation failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
