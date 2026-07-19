/**
 * Planner simulation harness.
 *
 * Drives the REAL planning pipeline — real Nominatim geocode, real Google
 * Places + Tripadvisor searches, real OpenAI calls, and the real prompt,
 * pool-building, normalization and food-balancing functions the Pages
 * Functions and client use — so what it measures is what production does.
 * Nothing here mocks or re-implements the pipeline; a change to the libs
 * changes the simulation.
 *
 * It exists to answer one question with numbers rather than vibes: how much of
 * a generated itinerary is places to EAT versus places that match what the
 * traveler actually asked for?
 */
import { buildIntentPrompt, extractedIntentSchema } from '../functions/lib/aiIntent'
import { buildInterestQueriesPrompt, normalizeInterestQueries } from '../functions/lib/aiInterestQueries'
import { buildPlanPrompt, normalizePlan, balanceDayFood, ensureAllDays, type PlanDay } from '../functions/lib/aiPlan'
import {
  buildDiscoverPrompt,
  normalizeDiscoveredVenues,
  discoveredVenuesForDays,
  describeInterests,
  type TravelerProfile,
} from '../functions/lib/aiDiscover'
import { gatherGuideContent } from '../functions/lib/webSearch'
import { fitsAudience } from '../src/lib/places/audience'
import { distanceKm, findPlaceByName } from '../functions/lib/places'
import { openAiResponseSchema } from '../functions/lib/openAi'
import { geocode } from '../functions/lib/geocode'
import { searchPlaces, textSearchPlaces } from '../functions/lib/places'
import { searchThingsToDo, textSearchThingsToDo } from '../functions/lib/tripadvisor'
import { mergeThingsToDo, type ThingToDo } from '../functions/lib/mergeThingsToDo'
import { dropCorruptNames } from '../functions/lib/textIntegrity'
import { isExperienceCategory, isRequestedExperienceCategory } from '../src/lib/location/experienceFilter'
import { buildCandidatePool } from '../src/lib/places/candidatePool'
import { isFoodCategory } from '../src/lib/places/foodCategories'
import type { Scenario } from './scenarios'

/** Mirrors createTripForDestination.ts — every auto-built trip is at least this long. */
const MIN_TRIP_DAYS = 3
/** Mirrors interest-places.ts. */
const RESULTS_PER_QUERY = 6
const GOOGLE_ENOUGH = 3
/** Nominatim's usage policy allows at most 1 request/second. */
const NOMINATIM_DELAY_MS = 1200

export interface SimKeys {
  openAi: string
  googlePlaces: string
  tripadvisor?: string
  /** Brave Search key for web-grounded discovery; optional. */
  brave?: string
}

export interface StopReport {
  name: string
  category: string
  isFood: boolean
  themed: boolean
  /** 0–3 relevance to the traveler's stated theme, from the LLM judge. */
  relevance: number
}

export interface ScenarioReport {
  id: string
  request: string
  destination: string
  days: number
  interests: string
  /** Whether the intent step judged food to be a main point of the trip. */
  foodFocused: boolean
  /** The searches the interests expanded into — empty on the old pipeline. */
  queries: string[]
  poolSize: number
  poolFoodShare: number
  stops: StopReport[]
  itineraryFoodShare: number
  /** Share of non-food stops that clearly match the theme (relevance >= 2). */
  onThemeShare: number
  /**
   * Stops that don't suit the trip's audience (a saloon on a family trip).
   * Any value above zero is a bug, not a quality score.
   */
  audienceViolations?: string[]
  /** Stops farther from the destination centre than a traveler would drive. */
  farStops?: { name: string; km: number }[]
  /** Days that ended up with fewer than 3 stops. */
  thinDays?: number
  /** Days with no stops at all — always a bug. */
  emptyDays?: number
  /** Mean relevance across every stop, food included — the "is this my trip?" number. */
  meanRelevance: number
  error?: string
}

/**
 * How far a stop may sit from the destination centre before it counts as
 * out-of-region. Generous enough for a national park's spread, tight enough to
 * flag a cafe across a state border.
 */
const FAR_STOP_KM = 30

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One JSON-mode OpenAI chat call, returning the parsed object. */
async function askJson(prompt: string, apiKey: string, maxTokens: number, temperature: number): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const parsed = openAiResponseSchema.safeParse(await res.json())
  if (!parsed.success) throw new Error('openai response shape unexpected')
  return JSON.parse(parsed.data.choices[0].message.content)
}

/**
 * Scores each stop 0–3 for how well it serves the traveler's stated theme.
 * An LLM judge is used because "is a boat launch relevant to a walleye trip?"
 * has no lookup table — but the scale is anchored so scores stay comparable
 * between the baseline and post-fix runs.
 */
async function judgeRelevance(theme: string, stops: ThingToDo[], apiKey: string): Promise<number[]> {
  if (stops.length === 0) return []
  const list = stops.map((s, i) => `${i}) ${s.name} [${s.category}]`).join('\n')
  const prompt = [
    `A traveler's trip is about: "${theme}".`,
    'Score how well each numbered place below serves THAT purpose, on this exact scale:',
    '3 = directly enables the activity (the thing they came to do, or essential gear/access/permits for it)',
    '2 = strongly related to the activity or the setting they came for',
    '1 = generic local amenity that any trip anywhere would have (an ordinary restaurant, cafe, chain store)',
    '0 = irrelevant or contrary to the purpose',
    'A place is scored on what it IS, not on whether people need to eat.',
    'Return ONLY JSON: {"scores":[{"index":0,"score":3}, ...]} covering every index exactly once.',
    '',
    'PLACES:',
    list,
  ].join('\n')

  const raw = (await askJson(prompt, apiKey, 1500, 0)) as { scores?: Array<{ index?: number; score?: number }> }
  const scores = new Array<number>(stops.length).fill(0)
  for (const entry of raw.scores ?? []) {
    if (typeof entry?.index !== 'number' || typeof entry?.score !== 'number') continue
    if (entry.index < 0 || entry.index >= stops.length) continue
    scores[entry.index] = Math.max(0, Math.min(3, entry.score))
  }
  return scores
}

/** The real /api/interest-places pipeline: interests -> queries -> real places. */
async function findInterestPlaces(
  interests: string,
  destination: string,
  lat: number,
  lng: number,
  keys: SimKeys,
): Promise<{ places: ThingToDo[]; queries: string[] }> {
  const raw = await askJson(buildInterestQueriesPrompt(interests, destination), keys.openAi, 300, 0.2)
  const queries = normalizeInterestQueries(raw)
  if (queries.length === 0) return { places: [], queries: [] }

  const perQuery = await Promise.all(
    queries.map(async (q) => {
      const found = await textSearchPlaces(q, lat, lng, keys.googlePlaces)
      if (found.length >= GOOGLE_ENOUGH || !keys.tripadvisor) return found.slice(0, RESULTS_PER_QUERY)
      const fromTa = await textSearchThingsToDo(q, lat, lng, keys.tripadvisor)
      return mergeThingsToDo(fromTa, found).slice(0, RESULTS_PER_QUERY)
    }),
  )

  const seen = new Set<string>()
  const places: ThingToDo[] = []
  const depth = Math.max(0, ...perQuery.map((r) => r.length))
  for (let rank = 0; rank < depth; rank += 1) {
    for (const results of perQuery) {
      const item = results[rank]
      if (!item) continue
      const key = item.name.trim().toLowerCase()
      if (key === '' || seen.has(key)) continue
      seen.add(key)
      places.push(item)
    }
  }
  return { places: dropCorruptNames(places).filter((p) => isRequestedExperienceCategory(p.category)), queries }
}

/** Runs one scenario through the real pipeline and reports what came out. */

/**
 * Web-grounded discovery, mirroring /api/discover-venues: search real guides,
 * have the model name the venues they recommend, then verify each against
 * Google Places so only real ones survive. Fails soft to [].
 */
async function discoverVenues(
  profile: TravelerProfile,
  destination: string,
  lat: number,
  lng: number,
  days: number,
  keys: SimKeys,
): Promise<ThingToDo[]> {
  try {
    const maxVenues = discoveredVenuesForDays(days)
    const query = [destination, profile.season ?? '', profile.party, describeInterests(profile), 'best things to do itinerary']
      .filter(Boolean)
      .join(' ')
      .slice(0, 200)
    const guideContent = keys.brave ? await gatherGuideContent(query, keys.brave) : ''
    const raw = await askJson(
      buildDiscoverPrompt(profile, destination, guideContent, maxVenues),
      keys.openAi,
      Math.min(2600, maxVenues * 55 + 200),
      0.3,
    )
    const venues = normalizeDiscoveredVenues(raw, maxVenues)
    if (venues.length === 0) return []
    const verified = await Promise.all(venues.map((v) => findPlaceByName(v.name, lat, lng, keys.googlePlaces)))
    const seen = new Set<string>()
    const out: ThingToDo[] = []
    for (const p of verified) {
      if (!p || !isRequestedExperienceCategory(p.category)) continue
      const key = p.name.trim().toLowerCase()
      if (key === '' || seen.has(key)) continue
      seen.add(key)
      out.push({ ...p, themed: true })
    }
    return dropCorruptNames(out)
  } catch {
    return []
  }
}

/** Case-insensitive dedupe by name, first occurrence wins. */
function dedupeByName(places: ThingToDo[]): ThingToDo[] {
  const seen = new Set<string>()
  const out: ThingToDo[] = []
  for (const p of places) {
    const key = p.name.trim().toLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export async function runScenario(scenario: Scenario, keys: SimKeys): Promise<ScenarioReport> {
  const base: ScenarioReport = {
    id: scenario.id,
    request: scenario.request,
    destination: '',
    days: 0,
    interests: '',
    foodFocused: false,
    queries: [],
    poolSize: 0,
    poolFoodShare: 0,
    stops: [],
    itineraryFoodShare: 0,
    onThemeShare: 0,
    meanRelevance: 0,
  }

  try {
    // 1. Free text -> destination / days / interests (real /api/plan-intent logic).
    const intentRaw = await askJson(buildIntentPrompt(scenario.request), keys.openAi, 200, 0)
    const intent = extractedIntentSchema.safeParse(intentRaw)
    if (!intent.success) return { ...base, error: 'intent extraction failed' }
    const destination = intent.data.destination ?? null
    if (!destination) return { ...base, error: 'no destination resolved' }
    const interests = intent.data.interests ?? scenario.request
    const foodFocused = intent.data.foodFocused ?? false
    const days = Math.max(intent.data.days ?? MIN_TRIP_DAYS, MIN_TRIP_DAYS)
    // The full traveler profile drives audience filtering and discovery in
    // production. The harness ignored it, which is why its food share read far
    // lower than what QA measured on the real site.
    const audience = intent.data.audience ?? 'general'
    const party = intent.data.party ?? ''
    const occasion = intent.data.occasion ?? null
    const season = intent.data.season ?? null
    const effectiveInterests =
      interests.trim() !== ''
        ? interests
        : describeInterests({ party, occasion: occasion ?? undefined, audience, interests: '', foodFocused })

    // 2. Geocode (real Nominatim; rate-limited per their policy).
    await sleep(NOMINATIM_DELAY_MS)
    const geo = await geocode(destination)
    if (!geo) return { ...base, destination, days, interests, foodFocused, error: 'geocode failed' }

    // 3. The real nearby pool (real Tripadvisor + Google Places), filtered the
    //    way fetchLocation filters it before anything sees it.
    const [taResults, placesResults] = await Promise.all([
      keys.tripadvisor ? searchThingsToDo(scenario.id, geo.lat, geo.lng, keys.tripadvisor) : Promise.resolve([]),
      searchPlaces(geo.lat, geo.lng, keys.googlePlaces),
    ])
    const nearby = dropCorruptNames(mergeThingsToDo(taResults, placesResults)).filter((t) =>
      isExperienceCategory(t.category),
    )
    if (nearby.length === 0) return { ...base, destination, days, interests, foodFocused, error: 'no things to do found' }

    // 4. Real places matching what they actually asked for (real /api/interest-places).
    const { places: interestPlaces, queries } = await findInterestPlaces(
      effectiveInterests,
      destination,
      geo.lat,
      geo.lng,
      keys,
    )

    // 4b. Web-grounded discovery — the step that makes a plan read like a
    //     guide. Production runs this on every trip; omitting it here made the
    //     simulation measure a pipeline no traveler actually gets.
    const discovered = await discoverVenues(
      { party, occasion: occasion ?? undefined, season: season ?? undefined, audience, interests: effectiveInterests, foodFocused },
      destination,
      geo.lat,
      geo.lng,
      days,
      keys,
    )

    const themed = dedupeByName([...discovered, ...interestPlaces])
    const pool = buildCandidatePool(nearby, themed, days, { foodFocused, audience })
    const poolFoodShare = pool.filter((p) => isFoodCategory(p.category)).length / pool.length

    // 5. The real grounded planner (real prompt, real model, real normalization).
    const prompt = buildPlanPrompt({
      intent: effectiveInterests,
      days,
      profile: { party, occasion, season, audience },
      candidates: pool.map((p) => ({
        name: p.name,
        category: p.category,
        rating: p.rating,
        lat: p.lat,
        lng: p.lng,
        themed: p.themed,
      })),
    })
    const planRaw = await askJson(prompt, keys.openAi, 1200, 0.4)
    const plan: PlanDay[] | null = normalizePlan(planRaw, pool.length, days)
    if (!plan) {
      return { ...base, destination, days, interests, foodFocused, queries, poolSize: pool.length, poolFoodShare, error: 'no usable plan' }
    }
    const planCandidates = pool.map((p) => ({
      name: p.name,
      category: p.category,
      rating: p.rating,
      lat: p.lat,
      lng: p.lng,
      themed: p.themed,
    }))
    const balanced = ensureAllDays(balanceDayFood(plan, planCandidates), planCandidates, days)

    // 6. Measure what the traveler would actually see.
    const stopPlaces = balanced.flatMap((d) => d.placeIndexes.map((i) => pool[i])).filter(Boolean)
    const relevance = await judgeRelevance(scenario.theme, stopPlaces, keys.openAi)
    const stops: StopReport[] = stopPlaces.map((p, i) => ({
      name: p.name,
      category: p.category,
      isFood: isFoodCategory(p.category),
      themed: p.themed === true,
      relevance: relevance[i] ?? 0,
    }))

    // Bug detectors. These are pass/fail, not quality scores: a nonzero value
    // is a defect the pipeline shipped, and the simulation exists to catch
    // them before a traveler does.
    const audienceViolations = stopPlaces.filter((p) => !fitsAudience(p, audience)).map((p) => p.name)
    const farStops = stopPlaces
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ name: p.name, km: distanceKm(geo.lat, geo.lng, p.lat as number, p.lng as number) }))
      .filter((p) => p.km > FAR_STOP_KM)
      .sort((a, b) => b.km - a.km)
    const perDayCounts = balanced.map((d) => d.placeIndexes.length)
    const thinDays = perDayCounts.filter((n) => n > 0 && n < 3).length
    const emptyDays = Math.max(0, days - perDayCounts.length) + perDayCounts.filter((n) => n === 0).length

    const nonFood = stops.filter((s) => !s.isFood)
    return {
      ...base,
      destination,
      days,
      interests,
      foodFocused,
      queries,
      poolSize: pool.length,
      poolFoodShare,
      stops,
      audienceViolations,
      farStops,
      thinDays,
      emptyDays,
      itineraryFoodShare: stops.length > 0 ? stops.filter((s) => s.isFood).length / stops.length : 0,
      onThemeShare: nonFood.length > 0 ? nonFood.filter((s) => s.relevance >= 2).length / nonFood.length : 0,
      meanRelevance: stops.length > 0 ? stops.reduce((sum, s) => sum + s.relevance, 0) / stops.length : 0,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
