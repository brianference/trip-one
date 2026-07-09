import { z } from 'zod'
import type { Env } from '../lib/supabaseAdmin'
import { countRecentRequests, insertRequestLog } from '../lib/supabaseAdmin'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { buildPlanPrompt, normalizePlan, extractPlanMessage } from '../lib/aiPlan'
import { logger } from '../../src/lib/logger'

// A short, friendly default when the model omits its own reply, so the chat
// never shows an empty assistant bubble.
const DEFAULT_PLAN_MESSAGE = 'Here’s your updated plan — every stop is a real place nearby.'

// AI calls cost real money per request, so this is gated tighter than the
// free-ish location cache endpoint.
const RATE_LIMIT_PER_HOUR = 15
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
      }),
    )
    .min(1)
    .max(40),
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

// Validate the shape we actually read out of OpenAI rather than trusting it.
const openAiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
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
  const { intent, days, places, conversation, currentPlan } = parsed.data

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentCount = await countRecentRequests(env, ipHash, oneHourAgo)
    if (!isUnderRateLimit(recentCount, RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }
    await insertRequestLog(env, ipHash, 'plan')

    const prompt = buildPlanPrompt({ intent, days, candidates: places, conversation, currentPlan })
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 800,
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

    return json({ days: plan, message: extractPlanMessage(rawPlan) ?? DEFAULT_PLAN_MESSAGE }, 200)
  } catch (err) {
    logger.error('AI plan generation failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
