import { z } from 'zod'
import type { Env } from '../lib/db'
import { countRecentRequests, insertRequestLog } from '../lib/db'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { openAiResponseSchema } from '../lib/openAi'
import { buildIntentPrompt, extractedIntentSchema } from '../lib/aiIntent'
import { describeInterests } from '../lib/aiDiscover'
import { logger } from '../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 200
// Configurable via AI_MODEL env var; defaults to the low-cost gpt-4o-mini.
const DEFAULT_MODEL = 'gpt-4o-mini'

type PlanEnv = Env & { OPENAI_API_KEY?: string; AI_MODEL?: string }

const intentRequestSchema = z.object({ text: z.string().trim().min(1).max(500) })

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * POST /api/plan-intent
 *
 * Parses a free-text trip request ("a fun 9-day San Diego trip with kids")
 * into `{ destination, days, interests, foodFocused }` so the homepage can turn one
 * sentence into a real trip. Extraction only — the itinerary is built
 * separately by /api/plan against the destination's real places.
 * @returns `{ destination, days, interests, foodFocused }`, or `{ error }` with 400/429/500
 */
export async function onRequestPost({ env, request }: { env: PlanEnv; request: Request }): Promise<Response> {
  if (!env.OPENAI_API_KEY) return json({ error: 'AI planner is not configured' }, 500)

  const parsed = intentRequestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid request' }, 400)

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    if (!isUnderRateLimit(await countRecentRequests(env, ipHash, oneHourAgo, 'plan-intent'), RATE_LIMIT_PER_HOUR)) {
      return json({ error: 'rate limit exceeded, try again later' }, 429)
    }
    await insertRequestLog(env, ipHash, 'plan-intent')

    const prompt = buildIntentPrompt(parsed.data.text)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
    })
    if (!res.ok) {
      logger.error('plan-intent openai non-ok', { status: res.status })
      return json({ error: 'AI planner unavailable, try again' }, 502)
    }

    const bodyParsed = openAiResponseSchema.safeParse(await res.json())
    if (!bodyParsed.success) return json({ error: 'AI planner unavailable, try again' }, 502)

    let raw: unknown
    try {
      raw = JSON.parse(bodyParsed.data.choices[0].message.content)
    } catch {
      return json({ error: 'AI planner returned an unreadable response, try again' }, 502)
    }

    const extracted = extractedIntentSchema.safeParse(raw)
    if (!extracted.success) return json({ error: 'AI planner unavailable, try again' }, 502)

    // The model returns "" (not null) when a request names a destination and a
    // party but no activities — "12 days in Dublin for a father and son, the
    // son is turning 21". `??` doesn't catch that, so an empty intent reached
    // every downstream endpoint, all of which reject it, and the user was left
    // on the home page with "invalid request". Synthesize one from what the
    // request DID say instead.
    const audience = extracted.data.audience ?? 'general'
    const party = extracted.data.party ?? ''
    const occasion = extracted.data.occasion ?? null
    const statedInterests = (extracted.data.interests ?? '').trim()
    const interests =
      statedInterests !== ''
        ? statedInterests
        : describeInterests({ party, occasion: occasion ?? undefined, audience, interests: '', foodFocused: false })

    return json(
      {
        destination: extracted.data.destination ?? null,
        days: extracted.data.days ?? null,
        interests,
        party,
        occasion,
        season: extracted.data.season ?? null,
        audience,
        foodFocused: extracted.data.foodFocused ?? false,
      },
      200,
    )
  } catch (err) {
    logger.error('plan-intent failed', err)
    return json({ error: 'internal error' }, 500)
  }
}
