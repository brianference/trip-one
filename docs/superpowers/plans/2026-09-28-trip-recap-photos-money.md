# Trip recap, stop photos, and the money page: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveler can attach photos to each itinerary stop, then open a shareable recap of the trip: an animated map walkthrough of the stops in itinerary order, a photo slideshow in the same order, and a "Plan your next trip with us" link at the bottom. International trips reliably get a phrasebook and a money page that converts $10, $25, $50, $100, $300 and $1,000 into the local currency.

**Architecture:** Photos go to a private R2 bucket behind Pages Functions, with metadata in a new D1 table keyed by a stable per-stop id that the itinerary does not have today. The recap is computed live from the trip plus its photos, so it is always current and "generated" whenever it is opened. It is shared through a separate read-only token, because the trip URL itself grants edit access [VERIFIED: functions/api/trips/[id].ts onRequestPatch has no auth check, read 2026-09-28]. Currency moves to a single cached source that covers all 45 currencies in the app's table.

**Tech stack:** React 18.3 + react-router-dom 6.28, Vite 5, TypeScript strict, Tailwind v4 alongside the Chronicle CSS, Leaflet 1.9, zustand 5, zod 3.23, Vitest 2.1 + Testing Library, Cloudflare Pages Functions, D1, R2 (new).

**Spec:** the owner's request of 2026-09-28 (quoted in the appendix at the end of this plan) plus the verified findings in "Facts this plan rests on" below. The executor reads both.

## Facts this plan rests on (each checked on 2026-09-28)

| Fact | Evidence |
|---|---|
| Itinerary stops have no stable id. Code identifies them by array index or `text`. | `src/lib/validation/schemas.ts` `itineraryItemSchema`; `TripPlanPage.tsx` uses `findIndex(it => it.text === ...)` |
| The trip URL is a write capability. `PATCH /api/trips/:id` has no auth check. | [VERIFIED: `functions/api/trips/[id].ts` onRequestPatch, comment "Unauthenticated write (URL is the capability)", read 2026-09-28] |
| `ShareTrip` shares the edit URL `/trip/:id`. | `src/features/trip/components/ShareTrip.tsx` |
| There is no R2 binding or multipart handling anywhere. | `wrangler.toml` has only `[[d1_databases]]`; grep for FormData finds nothing |
| R2 buckets are private unless public access is explicitly enabled (https://developers.cloudflare.com/r2/buckets/public-buckets/). | https://developers.cloudflare.com/r2/buckets/public-buckets/ : "By default, buckets are never publicly accessible and will always require explicit user permission to enable." |
| The deploy token reaches Pages (200) but not R2 (403 from the API; wrangler `r2 bucket list` also fails). | Probed 2026-09-28: `GET /accounts/{acct}/pages/projects/trip-one` 200, `GET /accounts/{acct}/r2/buckets` 403 |
| Frankfurter returns no rate for 16 of the 45 currencies in `currencyByCountry.ts`: AED ARS CLP COP EGP JOD KES LKR MAD NPR PEN RUB SAR TZS UAH VND. | Live `GET api.frankfurter.dev/v1/currencies` (30 codes) diffed against the table |
| open.er-api.com covers all 16 (166 currencies), needs no key, allows caching and commercial use, and REQUIRES the credit "Rates By Exchange Rate API" linking to https://www.exchangerate-api.com. Data refreshes once per 24h, and a 429 clears after 20 minutes. | Live `GET open.er-api.com/v6/latest/USD`; exchangerate-api.com/docs/free |
| Language and currency come from the last comma segment of `location.displayName`. When `location` is null, pages fall back to `trip.locationSlug` (e.g. `tokyo-japan`). | `languageByCountry.ts`, `currencyByCountry.ts`, `PhrasebookPage.tsx` |
| PhrasebookPage says "{place} is English-speaking" for ANY country missing from the language table (Slovenia, Kenya, Philippines, Cuba...) and for the slug fallback. | `PhrasebookPage.tsx` else-branch |
| The Phrases nav tab shows on every trip, US trips included. | `TripNav.tsx` `tripPages()` |
| The currency endpoint has no cache, and a non-USD trip page fetches the rate twice. | `functions/api/currency.ts`; `TripShell` and `LocalInfoCard` both call `useCurrencyRate` |
| There is no walkthrough, slideshow or recap feature. One was planned in June and never built. | `docs/superpowers/plans/2026-06-30-trip-one-secondary-features.md` Task 5 |
| Tokyo One's walkthrough: dashed full route, a solid "traveled" line that grows over 60 interpolated points per leg, ease-in-out cubic, 2500 ms per leg (Slow 4000 / Fast 1200), stop chips. Its quick amounts are buttons, not a table. | tokyo-one `walkthrough-feature.js`, `pages/currency.html` |
| The Leaflet map is built with `zoomAnimation: false` (fix for the `_onZoomTransitionEnd` crash), and a test pins it. | `src/features/map/MapView.tsx:141`, `MapView.test.tsx:138` |
| Cloudflare's routing docs do not say whether `trips/[id].ts` and a `trips/[id]/` directory can coexist. Unverified, so Task 6 tests it first and names a fallback path. | developers.cloudflare.com/pages/functions/routing |
| Demo trip ids live in `src/lib/api/demoIds.ts` `DEMO_TRIP_IDS`, and Functions already import from `src/`. | `functions/api/trips/[id].ts` imports `../../../src/lib/logger` |
| The app has a light/dark theme toggle. | `src/components/ThemeToggle.tsx`, `src/lib/theme.ts` |
| Playwright is not installed. `scripts/regression.mjs` imports `playwright` and runs against a URL. | agent audit of `package.json` |
| There is no migration runner. SQL files in `d1/migrations/` are applied by hand; `scripts/verify-schema.mjs` checks `EXPECTED_TABLES`. | agent audit |

## Decisions made without asking (change any before execution starts)

1. **Who can upload.** Anyone holding the trip link, the same rule as editing the itinerary today. Uploads are rate-limited per IP and capped per stop and per trip. Demo trips refuse uploads. Owner-only uploads would require sign-in for photos while the itinerary stays open, which is inconsistent. Say so if you want it anyway.
2. **What gets shared.** A separate recap link (`/recap/<token>`). It must be read-only and must never reveal the trip id; the Task 9 test pins this. Sharing the existing trip link would hand edit rights to everyone who sees the slideshow.
3. **"At the end of the trip."** The recap is live and can be opened any time. When `start_date + trip_length_days` has passed, the Home page swaps in a prominent "Your trip is over, here's your recap" card. Before that, it shows a quieter "Recap (N photos so far)" entry.
4. **Photo processing.** The browser resizes to a 1600 px long edge and re-encodes as JPEG before upload. That keeps uploads small on phone data (Task 13 measures the real size). It also strips EXIF, including GPS coordinates, because a canvas carries no metadata. The server still sniffs magic bytes and enforces a 4 MB ceiling.
5. **Currency source.** One source for every currency (open.er-api.com), cached in D1 for 6 hours, with the required credit on the money page. Two sources would mean two failure modes for no gain.
6. **Phrasebook gaps.** No new languages are added in this plan, because writing 15 phrases per language without a verified source is invention. Countries whose language is already covered get mapped: Cyprus → Greek, Luxembourg → French. Malta joins the English-speaking set. Every other uncovered country gets an honest "no phrasebook yet" message instead of the false "English-speaking" one. Adding Slovenian, Slovak, Estonian, Latvian, Lithuanian, Swahili and Filipino is a follow-up that needs a verified translation source.
7. **Nav.** Phrases and Money appear only for international trips, and only once the destination has loaded. Recap does not get a nav slot, since the mobile bottom bar already holds five. It is reached from Home and from the Plan page.

## Global constraints

- TypeScript strict. Every function has a JSDoc comment. No `console.*`; use `logger` from `src/lib/logger.ts` (Functions import it as `'../../src/lib/logger'` with the right depth).
- Every request body and param is Zod-validated. SQL is parameterized (`.bind(...)`), never concatenated.
- Named constants for every limit (sizes, counts, TTLs, durations). No magic numbers.
- Every endpoint uses a local `json(body, status)` helper and user-facing error text, matching `functions/api/trips/index.ts`.
- Every new write endpoint calls `isRateLimited(env, request, '<endpoint>', PER_HOUR)`.
- No fake data. Test fixtures are either real values captured from the live app (Task 3 captures them) or clearly synthetic unit-test values that never render in the product.
- Touch targets are at least 44 px. WCAG 2.1 AA. Contrast is checked with axe-core, never computed by hand.
- UI uses the existing Chronicle classes (`chronicle-chapter`, `chronicle-rate-line`, `chronicle-tap-target`...) and theme tokens in `src/styles/theme.css`. Read the class in the CSS before using it. Never invent a class name.
- Mobile first: build at 375 px, then 768 and 1280.
- Each migration file is applied to remote D1 by hand in Task 14 and added to `EXPECTED_TABLES` in `scripts/verify-schema.mjs` in the task that creates it.
- `npm test`, `npx tsc -b` and `npm run build` pass at the end of every task (the pre-push hook runs all three).

## Review focus

The five inputs most likely to hurt a real user that no happy-path test hits. Each one has a pinned test in the task named.

1. **An iPhone HEIC photo, or a 12 MB camera original.** Expect it to be accepted, rotated upright, resized and uploaded. If the browser truly cannot decode it, show a plain "This photo format isn't supported, try a JPEG or PNG" message, never a silent failure. Test: Task 7 `resizeImage` (decode failure → typed error; orientation option passed).
2. **A stop deleted, renamed, reordered or moved to another day after photos were attached.** Photos follow the stop id, so a rename or move keeps them. A deleted stop's photos disappear from the recap and never throw. Tests: Task 5 (ids survive organize, dedupe, reorder, move), Task 10 (`buildRecap` drops orphans).
3. **A recap link opened by a stranger.** They see names, map and photos. They must never receive the trip id, and must not be able to fetch a photo from another trip by guessing an id. Test: Task 9 (response body does not contain the trip id; cross-trip photo id → 404).
4. **Trips that are not simple "City, Country" strings.** US trips, English-speaking countries, countries missing from the tables, and the null-location slug fallback. Expect the correct phrasebook state and no Money tab for US trips. Tests: Task 3 (real Nominatim strings from live prod), Task 4 (null location never says "English-speaking").
5. **Currencies with no minor unit, or huge numbers.** JPY and VND must not show `.00`, and $1,000 in VND runs to eight digits. Test: Task 2 (`Intl` formatting for JPY, VND, EUR).

---

## Part A: money page and phrasebook correctness

### Task 1: cached multi-currency rate source

**Files:**
- Create: `d1/migrations/0005_fx_rates.sql`
- Create: `functions/lib/fxRates.ts`, `functions/lib/fxRates.test.ts`
- Modify: `functions/api/currency.ts`, `functions/api/currency.test.ts`
- Modify: `scripts/verify-schema.mjs` (add `fx_rates` to `EXPECTED_TABLES`)

**Interfaces:**
- Produces: `getUsdRates(env: Env, now?: number): Promise<UsdRates | null>` where `UsdRates = { rates: Record<string, number>; updatedAt: string; fetchedAt: number }`.
- Produces: `GET /api/currency?to=XXX` now returns `{ rate: number | null, updatedAt: string | null }`. The existing `rate` key is kept, so current callers still work.

- [ ] **Step 1: Write the migration**

```sql
-- 0005: cached USD exchange rates (one row per base currency).
-- open.er-api.com refreshes once per 24h; we cache for 6h.
create table if not exists fx_rates (
  base text primary key,
  rates text not null,          -- JSON object { "EUR": 0.92, ... }
  provider_updated text not null, -- provider's time_last_update_utc
  fetched_at integer not null     -- epoch ms when we fetched it
);
```

- [ ] **Step 2: Write the failing tests** in `functions/lib/fxRates.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fakeD1 } from './testD1'
import { getUsdRates, FX_CACHE_TTL_MS } from './fxRates'

const NOW = 1_800_000_000_000
const UPSTREAM = { result: 'success', time_last_update_utc: 'Tue, 29 Sep 2026 00:02:31 +0000', rates: { USD: 1, EUR: 0.9, VND: 25000, MAD: 9.9 } }

afterEach(() => vi.unstubAllGlobals())

describe('getUsdRates', () => {
  it('serves a fresh cached row without calling upstream', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { env } = fakeD1({ first: () => ({ rates: JSON.stringify({ EUR: 0.9 }), provider_updated: 'x', fetched_at: NOW - 1000 }) })
    const out = await getUsdRates(env, NOW)
    expect(out?.rates.EUR).toBe(0.9)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refetches when the cached row is older than the TTL and stores it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(UPSTREAM))))
    const { env, calls } = fakeD1({ first: () => ({ rates: '{}', provider_updated: 'x', fetched_at: NOW - FX_CACHE_TTL_MS - 1 }) })
    const out = await getUsdRates(env, NOW)
    expect(out?.rates.VND).toBe(25000)
    expect(calls.some((c) => /insert into fx_rates/i.test(c.sql))).toBe(true)
  })

  it('falls back to a stale row when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    const { env } = fakeD1({ first: () => ({ rates: JSON.stringify({ EUR: 0.8 }), provider_updated: 'x', fetched_at: 0 }) })
    expect((await getUsdRates(env, NOW))?.rates.EUR).toBe(0.8)
  })

  it('returns null when upstream fails and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { env } = fakeD1({ first: () => null })
    expect(await getUsdRates(env, NOW)).toBeNull()
  })

  it('rejects an upstream body whose result is not success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'error' }))))
    const { env } = fakeD1({ first: () => null })
    expect(await getUsdRates(env, NOW)).toBeNull()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run functions/lib/fxRates.test.ts`
Expected: FAIL, "Cannot find module './fxRates'".

- [ ] **Step 4: Implement `functions/lib/fxRates.ts`**

```ts
import { z } from 'zod'
import type { Env } from './db'
import { logger } from '../../src/lib/logger'

/** How long a fetched rate table is served before we ask upstream again. */
export const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** Keyless open endpoint; terms require the on-page credit rendered by MoneyPage. */
const FX_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD'
const BASE_CURRENCY = 'USD'

const upstreamSchema = z.object({
  result: z.literal('success'),
  time_last_update_utc: z.string(),
  rates: z.record(z.number().positive()),
})

export interface UsdRates {
  rates: Record<string, number>
  updatedAt: string
  fetchedAt: number
}

/**
 * Reads the cached USD rate table from D1.
 * @param env - Function bindings
 * @returns The cached row, or null when absent or unparseable
 */
async function readCached(env: Env): Promise<UsdRates | null> {
  const row = await env.DB.prepare('SELECT rates, provider_updated, fetched_at FROM fx_rates WHERE base = ?')
    .bind(BASE_CURRENCY)
    .first<{ rates: string; provider_updated: string; fetched_at: number }>()
  if (!row) return null
  try {
    return { rates: JSON.parse(row.rates) as Record<string, number>, updatedAt: row.provider_updated, fetchedAt: row.fetched_at }
  } catch {
    return null
  }
}

/**
 * Fetches the live USD rate table from open.er-api.com.
 * @returns The parsed table, or null on any network, status or shape failure
 */
async function fetchUpstream(now: number): Promise<UsdRates | null> {
  try {
    const res = await fetch(FX_SOURCE_URL)
    if (!res.ok) {
      logger.warn('fx upstream non-ok', { status: res.status })
      return null
    }
    const parsed = upstreamSchema.safeParse(await res.json())
    if (!parsed.success) return null
    return { rates: parsed.data.rates, updatedAt: parsed.data.time_last_update_utc, fetchedAt: now }
  } catch (err) {
    logger.error('fx upstream fetch failed', err)
    return null
  }
}

/**
 * USD → every currency, cached in D1 for {@link FX_CACHE_TTL_MS}. A stale
 * cached table beats no table when upstream is down or rate-limiting us.
 * @param env - Function bindings
 * @param now - Clock injection for tests
 * @returns The rate table, or null when nothing is cached and upstream failed
 */
export async function getUsdRates(env: Env, now: number = Date.now()): Promise<UsdRates | null> {
  const cached = await readCached(env)
  if (cached && now - cached.fetchedAt < FX_CACHE_TTL_MS) return cached

  const fresh = await fetchUpstream(now)
  if (!fresh) return cached
  await env.DB.prepare(
    'INSERT INTO fx_rates (base, rates, provider_updated, fetched_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(base) DO UPDATE SET rates = excluded.rates, provider_updated = excluded.provider_updated, fetched_at = excluded.fetched_at',
  )
    .bind(BASE_CURRENCY, JSON.stringify(fresh.rates), fresh.updatedAt, fresh.fetchedAt)
    .run()
  return fresh
}
```

- [ ] **Step 5: Point `functions/api/currency.ts` at it.** Replace the Frankfurter `try` block with:

```ts
  const table = await getUsdRates(env)
  return json({ rate: table?.rates[parsed.data] ?? null, updatedAt: table?.updatedAt ?? null }, 200)
```

Update the JSDoc to name open.er-api.com and the D1 cache. `getUsdRates` never throws for upstream failures, but a D1 error can, so keep the outer `try/catch` returning `{ rate: null, updatedAt: null }`.

- [ ] **Step 6: Update `functions/api/currency.test.ts`.** The two Frankfurter-specific cases become: (a) `to=VND` returns the cached VND rate, which proves the formerly unsupported codes now work; (b) upstream failure with an empty cache returns `{ rate: null, updatedAt: null }`. Keep the two 400 cases.

- [ ] **Step 7: Run the tests.** `npx vitest run functions/lib/fxRates.test.ts functions/api/currency.test.ts`, expected PASS. Then prove the stale-fallback test can fail: in a TEMP COPY of `fxRates.ts`, change `if (!fresh) return cached` to `return null`, run the suite against the copy, and confirm "falls back to a stale row" fails. Delete the copy.

- [ ] **Step 8: Commit.** Write the message to a file and use `git commit -F`, because backticks in `-m` get executed.

### Task 2: preset conversion rows

**Files:**
- Create: `src/features/localinfo/moneyAmounts.ts`, `src/features/localinfo/moneyAmounts.test.ts`

**Interfaces:**
- Produces: `PRESET_USD_AMOUNTS: readonly [10, 25, 50, 100, 300, 1000]`
- Produces: `presetRows(rate: number, currency: string): { usd: string; local: string }[]`
- Produces: `formatMoney(amount: number, currency: string): string`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { presetRows, formatMoney, PRESET_USD_AMOUNTS } from './moneyAmounts'

describe('presetRows', () => {
  it('returns exactly the six requested amounts in order', () => {
    expect(PRESET_USD_AMOUNTS).toEqual([10, 25, 50, 100, 300, 1000])
    expect(presetRows(0.9, 'EUR').map((r) => r.usd)).toEqual(['$10', '$25', '$50', '$100', '$300', '$1,000'])
  })
  it('uses no decimals for zero-minor-unit currencies', () => {
    expect(presetRows(150.4, 'JPY')[0].local).toBe('¥1,504')
    expect(presetRows(25000, 'VND')[5].local).toMatch(/25,000,000/)
    expect(presetRows(25000, 'VND')[5].local).not.toMatch(/\.00/)
  })
  it('keeps two decimals for euro', () => {
    expect(presetRows(0.9, 'EUR')[0].local).toBe('€9.00')
  })
  it('does not throw on a code Intl does not know', () => {
    expect(formatMoney(12.5, 'XXZ')).toBe('12.50 XXZ')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/features/localinfo/moneyAmounts.test.ts`

- [ ] **Step 3: Implement**

```ts
/** The USD amounts the money page converts, as the owner specified. */
export const PRESET_USD_AMOUNTS = [10, 25, 50, 100, 300, 1000] as const
const USD_FORMAT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const FALLBACK_DECIMALS = 2

/**
 * Formats an amount in its own currency, letting Intl pick the minor units
 * (JPY and VND get none, EUR gets two).
 * @param amount - Value in `currency`
 * @param currency - ISO 4217 code
 * @returns Display string such as "¥1,504" or "€9.00"
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(FALLBACK_DECIMALS)} ${currency}`
  }
}

/**
 * One row per preset USD amount, converted at `rate`.
 * @param rate - Units of `currency` per 1 USD
 * @param currency - ISO 4217 code of the destination
 * @returns Rows of formatted USD and local amounts
 */
export function presetRows(rate: number, currency: string): { usd: string; local: string }[] {
  return PRESET_USD_AMOUNTS.map((usd) => ({ usd: USD_FORMAT.format(usd), local: formatMoney(usd * rate, currency) }))
}
```

If the `¥1,504` expectation fails because this Node ICU renders a different yen glyph, print the real output, match the test to it, and note that in the commit.

- [ ] **Step 4: Run it (PASS), then commit.**

### Task 3: one destination resolver, pinned to real Nominatim strings

**Files:**
- Create: `src/features/localinfo/destination.ts`, `src/features/localinfo/destination.test.ts`
- Create: `src/features/localinfo/__fixtures__/liveDisplayNames.json` (captured in Step 1)
- Modify: `src/features/localinfo/languageByCountry.ts` (add `cyprus: 'greek'`, `luxembourg: 'french'`, export `countryForDisplayName`)

**Interfaces:**
- Produces: `type DestinationInfo = { status: 'loading' } | { status: 'known'; country: string; international: boolean; englishSpeaking: boolean; language: string | null; currency: string }`
- Produces: `destinationFor(displayName: string | null | undefined): DestinationInfo`. Null or undefined means "loading or failed", never "English-speaking".

- [ ] **Step 1: Capture real fixtures from production.** These go in the fixture file exactly as served, never typed by hand:

```bash
for q in "Tokyo, Japan" "Barcelona, Spain" "Marrakesh, Morocco" "Miami, Florida" "Dublin, Ireland" "Ljubljana, Slovenia" "Nicosia, Cyprus" "Hanoi, Vietnam" "Valletta, Malta"; do
  curl -s "https://trip-one.pages.dev/api/location?q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$q")"; echo
done > /tmp/live-locations.ndjson
```

Then run the client's `cleanDisplayName` over each `display_name` and write `[{ "query", "raw", "clean" }]` to the fixture file. Open `functions/api/location.ts` first to confirm the query parameter name and response field. If a query fails or geocodes somewhere else, drop it and say so in the commit. Never repair a value by hand.

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import fixtures from './__fixtures__/liveDisplayNames.json'
import { destinationFor } from './destination'

const byQuery = (q: string) => fixtures.find((f: { query: string }) => f.query === q)!.clean as string

describe('destinationFor (real Nominatim names from prod)', () => {
  it('Tokyo is international, Japanese, JPY', () => {
    expect(destinationFor(byQuery('Tokyo, Japan'))).toMatchObject({ status: 'known', international: true, language: 'japanese', currency: 'JPY' })
  })
  it('Miami is domestic, so no phrasebook and no money page', () => {
    expect(destinationFor(byQuery('Miami, Florida'))).toMatchObject({ status: 'known', international: false })
  })
  it('Dublin is international and English-speaking', () => {
    expect(destinationFor(byQuery('Dublin, Ireland'))).toMatchObject({ international: true, englishSpeaking: true, language: null, currency: 'EUR' })
  })
  it('Ljubljana is international, not English-speaking, and has no phrasebook yet', () => {
    expect(destinationFor(byQuery('Ljubljana, Slovenia'))).toMatchObject({ international: true, englishSpeaking: false, language: null })
  })
  it('Nicosia maps to Greek', () => {
    expect(destinationFor(byQuery('Nicosia, Cyprus'))).toMatchObject({ language: 'greek' })
  })
  it('null means loading, never English-speaking', () => {
    expect(destinationFor(null)).toEqual({ status: 'loading' })
  })
})
```

Match each expectation to what the captured fixture actually says. If Nominatim names the country differently (for example "Türkiye"), fix the lookup table, not the fixture.

- [ ] **Step 3: Implement `destination.ts`**

```ts
import { languageForDisplayName, countryForDisplayName } from './languageByCountry'
import { currencyForDisplayName } from './currencyByCountry'

/** Countries where a visitor gets by in English, so no phrasebook is offered. */
const ENGLISH_SPEAKING = new Set([
  'united states', 'united kingdom', 'ireland', 'australia', 'new zealand', 'canada', 'malta', 'jamaica', 'bahamas', 'singapore',
])
/** cleanDisplayName drops the country for US trips, leaving "City, State". */
const US_CURRENCY = 'USD'

export type DestinationInfo =
  | { status: 'loading' }
  | { status: 'known'; country: string; international: boolean; englishSpeaking: boolean; language: string | null; currency: string }

/**
 * Everything the trip UI needs to know about where the trip is, from one place.
 * @param displayName - Cleaned location name ("Barcelona, Spain" / "Miami, Florida"); null while loading or after a failed fetch
 * @returns Destination facts, or `loading` when the name is not available yet
 */
export function destinationFor(displayName: string | null | undefined): DestinationInfo {
  if (!displayName) return { status: 'loading' }
  const country = countryForDisplayName(displayName)
  const currency = currencyForDisplayName(displayName)
  const language = languageForDisplayName(displayName)
  const international = !(currency === US_CURRENCY && language === null && !ENGLISH_SPEAKING.has(country))
  return { status: 'known', country, international, englishSpeaking: ENGLISH_SPEAKING.has(country), language, currency }
}
```

Before relying on the `international` rule, check it against Step 1's fixtures. A country missing from both tables (Cuba, say) currently resolves to USD with no language, and this rule would call it domestic. If a real fixture shows that, add an explicit `US_STATES` check using the state list from `src/lib/location/displayName.ts` if one exists there (read it first). Pin the case with a test.

- [ ] **Step 4: Run tests (PASS), `npx tsc -b`, commit.**

### Task 4: phrasebook states, conditional tabs, money page

**Files:**
- Modify: `src/features/trip/pages/PhrasebookPage.tsx`, `src/features/trip/TripNav.tsx`, `src/features/trip/TripNav.test.tsx`, `src/features/trip/TripShell.tsx` (pass `destination` to `TripNav`), `src/App.tsx` (route `money`), `src/features/localinfo/useCurrencyRate.ts`
- Create: `src/features/trip/pages/MoneyPage.tsx`, `src/features/trip/pages/MoneyPage.test.tsx`, `src/features/trip/pages/PhrasebookPage.test.tsx`

**Interfaces:**
- Consumes: `destinationFor` (Task 3), `presetRows`, `formatMoney` (Task 2), `/api/currency` `{rate, updatedAt}` (Task 1)
- Produces: `useCurrencyRate(code)` returns `{ rate, updatedAt, loading }`, with one in-flight request per code shared across components (module-level `Map<string, Promise<...>>`)
- Produces: `TripNav` prop `destination: DestinationInfo`. Phrases shows when `known && international && !englishSpeaking`. Money shows when `known && international && currency !== 'USD'`.

- [ ] **Step 1: Failing tests**
  - `PhrasebookPage.test.tsx`, four states rendered through a `MemoryRouter` + `Outlet` context like `App.test.tsx:108`:
    - Tokyo lists at least one phrase.
    - Dublin says "English-speaking".
    - Ljubljana says "don't have a phrasebook for Slovenia yet" and does NOT contain "English-speaking".
    - `location: null` shows "Loading" and does NOT contain "English-speaking".
  - `TripNav.test.tsx`:
    - With Tokyo, Phrases and Money are both present.
    - With Miami, neither is.
    - With Dublin, Money is present and Phrases is not.
    - With loading, neither is.
  - `MoneyPage.test.tsx`, stubbing `fetch` to return `{ rate: 150.4, updatedAt: 'Tue, 29 Sep 2026 00:02:31 +0000' }`. Assert:
    - A table with 6 body rows and `$1,000` in the last row.
    - A "Rates By Exchange Rate API" link to `https://www.exchangerate-api.com`.
    - The updated date is shown.
    - Typing `2000` into the reverse input ("¥ to $") shows `$13.30`.
    - With `rate: null`, it shows "Currency rate unavailable right now" and no table.
  - `useCurrencyRate`: two hooks mounted for the same code make exactly one `fetch` call.

- [ ] **Step 2: Run the tests and confirm they fail.**

- [ ] **Step 3: Implement.**
  - **PhrasebookPage** uses `destinationFor(location?.displayName)` and has four branches: loading, phrases, English-speaking, and "We don't have a phrasebook for {country} yet." Drop the `trip.locationSlug` fallback, which is the source of the "tokyo-japan is English-speaking" bug.
  - **MoneyPage:**
    - `<h1>Money</h1>`, then "$1 ≈ {formatMoney(rate)}" and "Rates updated {date}".
    - A semantic `<table>` with a caption: header row `US dollars | {currency}`, one row per preset.
    - A labelled reverse converter (`<label>` + `<input inputMode="decimal">`) giving local → USD.
    - The attribution link with `rel="noopener"`.
    - Use `chronicle-chapter` for the wrapper. Before styling the table, check `src/themes/chronicle/chronicle.css` for an existing table class. If none exists, add `.chronicle-money-table` there using the existing tokens.
  - **Route:** `<Route path="money" element={<MoneyPage />} />` under `TripShell` in `App.tsx`.
  - **Nav:** a new `MoneyIcon` in the Lucide style of the existing icons (a banknote: rect + circle). Order: Home · Plan · Weather · Phrases · Money · New trip.

- [ ] **Step 4: Check mobile bottom-bar fit.** A Tokyo trip now has six nav items. Render `/trip/<tokyo demo>/money` at 375 px in the dev server, screenshot light and dark, and open the images. If labels truncate or targets drop under 44 px, shorten labels or move "New trip" out of the bottom bar into the header. Decide from the screenshot, not from the CSS.

- [ ] **Step 5: Run the whole suite, tsc and build, then commit.**

---

## Part B: photos on each stop

### Task 5: stable stop ids

**Files:**
- Create: `src/lib/itinerary/stopIds.ts`, `src/lib/itinerary/stopIds.test.ts`
- Modify: `src/lib/validation/schemas.ts` (add `id: z.string().uuid().optional()` with JSDoc)
- Modify: `src/store/tripStore.ts` (`setTrip`, `setItinerary` and `addItem` pass items through `ensureStopIds`)
- Modify: `functions/api/trips/[id].ts` PATCH (run `ensureStopIds` on `parsed.data.itinerary` before `updateTrip`), and the create or plan path wherever `createTripForDestination` persists an itinerary

**Interfaces:**
- Produces: `ensureStopIds(items: ItineraryItem[]): ItineraryItem[]`. It returns a new array in which every item has `id`, keeps existing ids, and returns the SAME array reference when nothing changed, so the store does not re-render for nothing.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { ensureStopIds } from './stopIds'
import { organizeItinerary } from './organizeItinerary'
import { dedupeItinerary } from './dedupeItinerary'
import { reorderItinerary } from './reorderItinerary'
import type { ItineraryItem } from '../validation/schemas'

const stop = (text: string, day = 1): ItineraryItem => ({ time: '', text, type: 'option', day, lat: 1, lng: 1 })

describe('ensureStopIds', () => {
  it('adds a uuid to items without one and keeps existing ids', () => {
    const out = ensureStopIds([stop('A'), { ...stop('B'), id: '11111111-1111-4111-8111-111111111111' }])
    expect(out[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(out[1].id).toBe('11111111-1111-4111-8111-111111111111')
  })
  it('returns the same reference when every item already has an id', () => {
    const items = ensureStopIds([stop('A')])
    expect(ensureStopIds(items)).toBe(items)
  })
  it('ids survive organize, dedupe and reorder', () => {
    const items = ensureStopIds([stop('A', 1), stop('B', 2), stop('C', 1)])
    const ids = new Set(items.map((i) => i.id))
    for (const out of [organizeItinerary(items, 2), dedupeItinerary(items), reorderItinerary(items, 0, 'down')]) {
      expect(new Set(out.map((i) => i.id))).toEqual(ids)
    }
  })
})
```

Open `reorderItinerary.ts` and fix the call to its real signature before running. If any of the three drops `id`, because it rebuilds items field by field instead of spreading, fix that function. That failure is the reason this test exists.

- [ ] **Step 2: Run it and confirm it fails. Implement with `crypto.randomUUID()`, which exists in browsers, Workers and Node 20. Run it and confirm it passes.**

- [ ] **Step 3: Check the planner path.** `planToItinerary` and the chat dock's `applyPlan` build fresh items. Those items pass through `setItinerary`, or through PATCH when created server-side, so both get ids. Add one test proving an itinerary saved via PATCH without ids comes back from `getTrip` with ids.

- [ ] **Step 4: Full suite, tsc, commit.**

### Task 6: storage, schema and photo endpoints

**Prerequisite (owner action, one time):** add **Account → Workers R2 Storage → Edit** to the Cloudflare API token `NewCloudFlareAccountToken` [VERIFIED: measured 2026-09-28, the token returns 403 on /r2/buckets and 200 on /pages/projects/trip-one]. If R2 has never been enabled on the account, the dashboard asks to enable it once (R2 has a free tier; confirm current limits on the Cloudflare pricing page before quoting any). Until this is done, Tasks 6 to 9 can still be built and unit-tested against the fake bindings, but Task 14 cannot deploy them.

**Files:**
- Create: `d1/migrations/0006_trip_photos.sql`
- Modify: `wrangler.toml` (add `[[r2_buckets]] binding = "PHOTOS"`, `bucket_name = "trip-one-photos"`)
- Modify: `functions/lib/db.ts` (`Env` gains `PHOTOS: R2Bucket`; add photo and recap-link queries)
- Create: `functions/lib/imageSniff.ts` + test
- Create: `functions/api/trips/[id]/photos/index.ts` (GET list, POST upload), `functions/api/trips/[id]/photos/[photoId].ts` (GET bytes, DELETE)
- Create: tests alongside each; extend `functions/lib/testD1.ts` with a `fakeR2()` Map-backed `put/get/delete`
- Modify: `scripts/verify-schema.mjs` (`trip_photos`, `trip_recap_links`)

Check first that `functions/api/trips/[id].ts` and a directory `functions/api/trips/[id]/` can coexist under Pages routing. If they cannot, use `functions/api/trip-photos/[tripId]/...` and update every path in Tasks 6 to 9.

- [ ] **Step 1: Migration**

```sql
-- 0006: per-stop photos and read-only recap share links.
create table if not exists trip_photos (
  id text primary key,
  trip_id text not null references trips(id),
  stop_id text not null,
  r2_key text not null,
  content_type text not null,
  width integer not null,
  height integer not null,
  bytes integer not null,
  created_at text not null
);
create index if not exists trip_photos_trip_stop_idx on trip_photos (trip_id, stop_id);

create table if not exists trip_recap_links (
  token text primary key,
  trip_id text not null references trips(id),
  created_at text not null,
  revoked_at text
);
create index if not exists trip_recap_links_trip_idx on trip_recap_links (trip_id);
```

- [ ] **Step 2: Failing tests for `imageSniff.ts`.**
  - JPEG `FF D8 FF` → `image/jpeg`.
  - PNG `89 50 4E 47 0D 0A 1A 0A` → `image/png`.
  - WEBP `RIFF....WEBP` → `image/webp`.
  - An HTML file renamed `.jpg` → null.
  - Empty → null.
  - Implement `sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null`.

- [ ] **Step 3: Failing endpoint tests.** Each one names the input that must fail:
  - Upload without a `stop_id` → 400.
  - A `stop_id` not in the trip's itinerary → 400.
  - Upload to a `DEMO_TRIP_IDS` trip → 403 with "Demo trips can't hold photos. Start your own trip to add some."
  - A body over `MAX_PHOTO_BYTES = 4 * 1024 * 1024` → 413.
  - HTML bytes with a declared `image/jpeg` → 415.
  - `MAX_PHOTOS_PER_STOP = 6` already reached → 409.
  - `MAX_PHOTOS_PER_TRIP = 300` already reached → 409.
  - Rate-limited → 429.
  - Unknown trip → 404.
  - A valid JPEG → 201, `{ id, stopId, width, height, createdAt }`, with an R2 put under `trips/<tripId>/<photoId>` and a D1 insert.
  - GET bytes for a photo id belonging to a DIFFERENT trip → 404.
  - DELETE removes both the R2 object and the row.
  - Width and height come from form fields sent by the client (Task 7 knows them after resizing), validated with Zod as integers 1 to 10000.

- [ ] **Step 4: Implement.**
  - The upload handler reads `await request.formData()` and takes the `file` (a `File`), `stop_id`, `width` and `height`.
  - Check the size before reading the bytes: `file.size > MAX_PHOTO_BYTES`.
  - Sniff the first 12 bytes, then `env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: sniffed } })`.
  - GET bytes: `const obj = await env.PHOTOS.get(row.r2_key)`, then `new Response(obj.body, { headers: { 'Content-Type': row.content_type, 'Cache-Control': 'private, max-age=86400' } })`.
  - Rate-limit keys and limits: `photos-upload` 120/h, `photos-delete` 120/h, `photos-read` 3000/h.
  - Extend the existing owner-only trip DELETE so it deletes the trip's photos (R2 objects, then rows) and recap links before deleting the trip. Add a test for that.

- [ ] **Step 5: Full suite, tsc, build, commit.**

### Task 7: client upload pipeline

**Files:**
- Create: `src/features/photos/resizeImage.ts` + test, `src/features/photos/photosApi.ts` + test, `src/features/photos/useTripPhotos.ts` + test

**Interfaces:**
- Produces: `resizeImage(file: File, maxEdge?: number): Promise<{ blob: Blob; width: number; height: number }>`. It throws `UnsupportedImageError` when the browser cannot decode the file.
- Produces: `uploadStopPhoto(tripId, stopId, file)`, `listTripPhotos(tripId)`, `deleteTripPhoto(tripId, photoId)`, and `tripPhotoUrl(tripId, photoId)`
- Produces: `useTripPhotos(tripId)` returning `{ byStop: Map<string, TripPhoto[]>, upload(stopId, file), remove(photoId), uploading: Set<string>, error: string | null }`
- Type: `TripPhoto = { id: string; stopId: string; width: number; height: number; createdAt: string }`

- [ ] **Step 1: Failing tests.**
  - `resizeImage`, with `createImageBitmap` and `OffscreenCanvas`/`HTMLCanvasElement.toBlob` stubbed since jsdom has neither:
    - A 4000×3000 source becomes 1600×1200.
    - An 800×600 source stays 800×600.
    - Output is `image/jpeg` at quality `0.82`.
    - `createImageBitmap` is called with `{ imageOrientation: 'from-image' }`.
    - A rejected decode throws `UnsupportedImageError`.
  - `photosApi`: the upload posts a `FormData` holding `file`, `stop_id`, `width` and `height`, and a 409 surfaces the server's error text.
  - `useTripPhotos`: it groups by `stopId`, an upload adds the returned photo to its stop, and a failed upload sets `error` and clears `uploading`.

- [ ] **Step 2: Implement with named constants** `MAX_EDGE_PX = 1600`, `JPEG_QUALITY = 0.82`. Close the `ImageBitmap` after drawing.

- [ ] **Step 3: Run the tests (PASS), commit.**

### Task 8: photo controls on each stop

**Files:**
- Create: `src/features/photos/StopPhotoButton.tsx` + test, `src/features/photos/StopPhotoStrip.tsx` + test
- Modify: `src/features/trip/components/ItineraryDayGroup.tsx` (row gains the button and strip; change its React `key` to `item.id ?? <old key>`), `src/features/trip/place/PlaceDetailPanel.tsx` (when the open place is on the plan, show the strip and button), `src/features/trip/pages/TripPlanPage.tsx` (call `useTripPhotos(trip.id)` once and pass it down)

- [ ] **Step 1: Failing tests.**
  - The button is a real `<button>` labelled "Add photo to {stop name}". It opens a visually hidden `<input type="file" accept="image/*">` with no `capture`, so phones offer both camera and library. It shows "Uploading…" while in flight.
  - The strip renders `<img alt="Photo 1 of 3 at {stop}" loading="lazy">` thumbnails. Each has a "Remove photo" button that asks for confirmation inline rather than through `window.confirm`, since browser dialogs block automation.
  - A stop without an `id` (legacy data before the store backfill ran) renders no button.

- [ ] **Step 2: Implement.** Thumbnails are 64 px squares with `object-fit: cover`. The button is at least 44×44. Use existing Chronicle classes, and add any new class to `chronicle.css` using theme tokens.

- [ ] **Step 3: Visual check.** Dev server, create a real trip, and upload a real photo from the phone camera roll (or any real JPEG on disk) to a stop. Screenshot the Plan page at 375, 768 and 1280 in light and dark. Open every image. Check the thumbnails, that the row doesn't overflow at 375, and that the target sizes hold.

- [ ] **Step 4: Full suite, commit.**

---

## Part C: the recap

### Task 9: recap share link and public read API

**Files:**
- Create: `functions/api/trips/[id]/recap-link.ts` (POST get-or-create, DELETE revoke)
- Create: `functions/api/recap/[token].ts` (GET recap data), `functions/api/recap/[token]/photos/[photoId].ts` (GET bytes)
- Tests alongside

**Interfaces:**
- Produces: `POST /api/trips/:id/recap-link` returns `{ token }`. It must be idempotent and return the active token if one exists.
- Produces: `GET /api/recap/:token` returns `RecapPayload`:

```ts
export interface RecapPayload {
  title: string | null
  displayName: string
  startDate: string | null
  tripLengthDays: number | null
  stops: { stopId: string; day: number; text: string; lat: number | null; lng: number | null; category: string | null }[]
  photos: { id: string; stopId: string; width: number; height: number; createdAt: string }[]
}
```

Put this type in `src/features/recap/types.ts` so client and server share it.

- [ ] **Step 1: Failing tests.**
  - The token must be 32 random bytes from `crypto.getRandomValues`, base64url-encoded (43 characters).
  - A second POST returns the same token.
  - After DELETE, the next POST returns a different token and the old one → 404.
  - The recap GET body, stringified, does NOT contain the trip id. This is the core privacy assertion.
  - Stops come back in itinerary order with no trip id and no `bookingUrl`.
  - A photo id from another trip → 404.
  - A revoked token → 404.
  - Unknown token → 404, with the same response as revoked.
  - Rate limits: `recap-read` 600/h and `recap-link` 60/h.

- [ ] **Step 2: Implement.** The display name comes from `getLocationBySlug(env, trip.location_slug)` run through the same `cleanDisplayName`, which Functions can import from `src/lib/location/displayName.ts`. Photo bytes use `Cache-Control: private, max-age=3600`: only the viewer's browser may store them, for at most an hour after generation (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

- [ ] **Step 3: Full suite, commit.**

### Task 10: recap model

**Files:**
- Create: `src/features/recap/buildRecap.ts` + test

**Interfaces:**
- Produces: `buildRecap(payload: RecapPayload): Recap` where

```ts
export interface RecapStop { stopId: string; day: number; order: number; text: string; lat: number | null; lng: number | null; photos: RecapPayload['photos'] }
export interface RecapSlide { photoId: string; stopId: string; day: number; stopText: string; stopOrder: number }
export interface Recap { days: { day: number; date: string | null; stops: RecapStop[] }[]; slides: RecapSlide[]; route: RecapStop[] }
```

- [ ] **Step 1: Failing tests.**
  - Stops are grouped by day ascending and keep itinerary order within a day.
  - `order` numbers run 1..N across the whole trip.
  - `slides` follow stop order, and within a stop go oldest photo first.
  - A photo whose `stopId` is not in `stops` (the stop was deleted) is dropped.
  - Stops without coordinates stay in `days` but are left out of `route`.
  - `date` is `startDate + (day - 1)` when `startDate` is set, computed in UTC so a timezone cannot shift it a day.
  - A trip with zero photos gives `slides: []`.

- [ ] **Step 2: Implement, run, commit.**

### Task 11: walkthrough map

**Files:**
- Create: `src/features/recap/RecapMap.tsx` + test, `src/features/recap/animateRoute.ts` + test

**Interfaces:**
- Consumes: `Recap['route']`
- Produces: `<RecapMap route activeStopId onStopSelect playing speedMs />`
- Produces: `easeInOutCubic(t)`, `interpolateLeg(a, b, steps)`, and `legDurationMs(speed: 'slow' | 'normal' | 'fast')`, matching Tokyo One: 4000 / 2500 / 1200 ms with `SUBSEGMENTS_PER_LEG = 60`

- [ ] **Step 1: Read `src/features/map/MapView.tsx`.** Confirm `zoomAnimation: false` and how tiles, markers and the CARTO key are set up. Reuse its tile setup: extract a `createBaseMap(el)` helper if that is cleaner than copying, and keep the zoom-crash fix.

- [ ] **Step 2: Failing tests for `animateRoute.ts`.** Easing endpoints are 0→0, 0.5→0.5, 1→1. `interpolateLeg` returns `steps + 1` points starting at `a` and ending at `b`. The speed map values are as above.

- [ ] **Step 3: Implement `RecapMap`.**
  - Numbered circle markers in route order, with each marker's accessible name set to "Stop 3: {name}".
  - A dashed full route, plus a solid "traveled" polyline that grows by `requestAnimationFrame` along each leg.
  - The map pans to the active stop with `setView(latlng, zoom, { animate: false })`.
  - Play/Pause and speed controls are real buttons.
  - With `prefers-reduced-motion: reduce`, it draws the full traveled line at once and steps stop to stop with no animation.
  - The rAF loop is cancelled on unmount and on pause. Add a test that unmounting mid-animation calls `cancelAnimationFrame`.

- [ ] **Step 4: Commit.**

### Task 12: slideshow, recap page, share and next-trip link

**Files:**
- Create: `src/features/recap/RecapSlideshow.tsx` + test, `src/features/recap/RecapView.tsx` + test (presentational, used by both routes), `src/features/recap/RecapPublicPage.tsx` (route `/recap/:token`), `src/features/recap/TripRecapPage.tsx` (route `/trip/:id/recap`, owner view with a Share button), `src/features/recap/ShareRecap.tsx` + test
- Modify: `src/App.tsx` (both routes), `src/features/trip/pages/OverviewPage.tsx` (recap card, see Decision 3), `src/features/trip/pages/TripPlanPage.tsx` ("View trip recap" link)

- [ ] **Step 1: Failing tests.**
  - `RecapSlideshow`:
    - It shows one slide with the caption "Day 2 · Stop 5 · {name}".
    - Next and Previous are buttons, and ArrowRight/ArrowLeft work when the region is focused.
    - Autoplay advances every `SLIDE_INTERVAL_MS = 4000` using fake timers, and pauses on the Pause button and on hover or focus.
    - With reduced motion there is no autoplay.
    - `onSlideChange(stopId)` fires so the map follows along.
    - With zero slides it shows "No photos yet. Add photos to your stops on the Plan page." in the owner view, and nothing in the public view.
  - `RecapView` renders, in order:
    - A header with the trip title or "{displayName} trip" and the date range.
    - `RecapMap`.
    - `RecapSlideshow`.
    - A day-by-day list of stops with their thumbnails.
    - A footer holding a link whose accessible name is exactly "Plan your next trip with us" and whose href is `/`.
  - `ShareRecap`:
    - It POSTs recap-link, then shares `${origin}/recap/${token}` via `navigator.share`.
    - It falls back to the clipboard, then to showing the link in a read-only input. No `window.prompt`, since dialogs block automation.
    - It never shares a `/trip/` URL. Assert this.
  - `OverviewPage`:
    - A trip with a `start_date` and length already past today shows "Your trip is over" with a link to the recap.
    - A future trip shows the smaller "Recap" entry.
    - Use a fixed clock with `vi.setSystemTime`.

- [ ] **Step 2: Implement.**
  - `RecapPublicPage` fetches `/api/recap/:token`. On 404 it shows "This recap link isn't active anymore."
  - `TripRecapPage` builds the same `RecapPayload` shape on the client from the trip context plus `listTripPhotos`, so one `RecapView` serves both routes. Photo `src` differs: `/api/recap/:token/photos/:id` on the public route, `/api/trips/:id/photos/:id` on the owner route. Pass a `photoUrl(photoId)` function prop.
  - Slides use `<img>` with `width`/`height` attributes to prevent layout shift, `object-fit: contain`, and `alt` "{stop name}, day {n}".

- [ ] **Step 3: Full suite, tsc, build, commit.**

### Task 13: end-to-end regression against a real deploy

**Files:**
- Modify: `package.json` (devDependency `playwright`, pinned to the current version from `npm view playwright version`)
- Create: `scripts/regression-recap.mjs`; extend `scripts/regression.mjs` if its structure allows

Follow the `playwright-qa` skill: role locators, web-first assertions, waiting on real responses, a trace on every run, and axe-core for contrast. Name the engine: this script runs Chromium desktop plus Chromium at 375 px. If a WebKit project is added, label it WebKit.

- [ ] **Step 1: Write the script against a URL argument.**
  1. Plan "3 days in Lisbon" from the home page and wait for `/trip/<id>` with the Plan tab visible.
  2. Phrases tab: at least one phrase row visible, no "English-speaking" text.
  3. Money tab: the table has 6 body rows, the last row starts with "$1,000", and the attribution link is present.
  4. Plan page: upload a real JPEG to stop 1 via `setInputFiles`, wait for the POST `/photos` 201, and wait for a thumbnail with the stop's name in its alt.
  5. Recap: open `/trip/<id>/recap`, click Share, read the link from the fallback input, and open it in a NEW browser context with no cookies. Assert the slideshow image loads (naturalWidth > 0 via `expect.poll`), the page HTML does not contain the trip id, and the "Plan your next trip with us" link exists.
  6. Plan "4 days in Miami": no Phrases tab, no Money tab.
  7. axe-core on Money, Plan and the public recap, in light and dark: zero serious or critical violations.
  8. Zero console errors on every page visited.
  9. Delete the test trip photos at the end.

- [ ] **Step 2: Prove the script can fail.** In a TEMP COPY of the script, point the Money assertion at 7 rows and confirm it exits non-zero. Point the recap-link check at the trip URL and confirm the "no trip id" assertion fails.

- [ ] **Step 3: Commit.** The script runs in Task 14 against the deploy. It is not added to CI, because it creates trips and spends paid AI planner calls.

### Task 14: ship

- [ ] **Step 1: Confirm the owner has added the R2 scope.** Probe the endpoint the work needs, `GET /accounts/dd01b432f0329f87bb1cc1a3fad590ee/r2/buckets`, and expect 200. Also run `npx wrangler r2 bucket list`.
- [ ] **Step 2: Create the bucket.** `npx wrangler r2 bucket create trip-one-photos`. Do NOT enable r2.dev or a custom domain. Photos are served only through Functions.
- [ ] **Step 3: Apply migrations to remote D1 in order.** `npx wrangler d1 execute trip-one-db --remote --file d1/migrations/0005_fx_rates.sql`, then `0006`. Then run `node scripts/verify-schema.mjs` and read its output.
- [ ] **Step 4: Confirm the Pages project has the R2 binding and all existing secrets.** Call `GET /accounts/{acct}/pages/projects/trip-one` and check that `deployment_configs.production` lists `DB`, `PHOTOS`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TRIPADVISOR_API_KEY` and `RATE_LIMIT_SALT`. Stop and ask the owner if any are missing. Do not deploy without them.
- [ ] **Step 5: Bump the version to 18.0.0, write the CHANGELOG entry, and build.** Then `npx wrangler pages deploy dist --project-name trip-one --branch main`.
- [ ] **Step 6: Verify production.**
  - The bare `trip-one.pages.dev` serves an `assets/index-*.js` that matches local `dist/`.
  - `curl /api/health` returns 200.
  - `curl "/api/currency?to=VND"` returns a non-null rate. It was always null before.
  - `curl "/api/currency?to=EUR"` returns a non-null rate.
- [ ] **Step 7: Run `node scripts/regression-recap.mjs https://trip-one.pages.dev` and read the output and trace.** Capture screenshots of Money, Phrases, Plan with photos, and the public recap at 375, 768 and 1280 in light and dark, and open every image.
- [ ] **Step 8: Get a fresh-context review.** Have a separate Claude subagent that did not write the code review the diff from `v17.0.0..HEAD`. Verify every finding before accepting or dismissing it.
- [ ] **Step 9: Tag, push and release.**
  - Tag `v18.0.0`, plus `restore-point-<date>` and branch `backup/v18.0.0-<date>`.
  - Push, then create the GitHub Release.
  - Run `gh run list` until CI completes, and read `--log-failed` on any red job.

---

## Self-review

- Coverage of the request:
  - Photo per stop: Tasks 5 to 8.
  - End-of-trip walkthrough in itinerary order: Tasks 10 and 11, plus Decision 3.
  - Slideshow of photos in itinerary order: Tasks 10 and 12.
  - Shareable: Tasks 9 and 12.
  - "Plan your next trip with us" link at the bottom: Task 12.
  - International trips still get phrases: Tasks 3, 4 and 13.
  - Currency pages with $10/$25/$50/$100/$300/$1000: Tasks 1, 2, 4 and 13.
  - Tokyo One as inspiration: Task 11 timing and Task 4 reverse converter. Yellowstone One has none of these features, so nothing was taken from it.
- Placeholders: none. Every open question is either a decision above or an explicit "read X first, then do Y" step with the fallback named.
- Name consistency: `ensureStopIds`, `TripPhoto`, `RecapPayload`, `buildRecap`, `RecapView` and `photoUrl` are used with the same signatures everywhere.
- Known gaps, deliberately out of scope:
  - Per-recap Open Graph preview images, which would need server-rendered meta.
  - Phrasebooks for the 7 missing languages (Decision 6).
  - Video uploads.

## Appendix: the request, verbatim

> make a smart plan using /ultraplan to add a feature where the map and walkthrough that is generated on each stop has the ability to upload a photo for that location so that at the end of the trip it will generate a walkthrough and slideshop of the trip in order by itinerary and show the photos of the trip (this can be shared) at the bottom is a link (plan your next trip with us), also make sure that the generated trips are still generating a common phrases in the local language if international trip and currency conversion pages with helpful values in currency from us in amounts $10 $25 $50 $100 $300 $1000 (you can use https://yellowstone-one.pages.dev/ as inspiration or https://tokyo-one.pages.dev/ as inspiration if needed
