# Spec: Viator experiences as a fourth place source (Task A — backend)

## Why

trip-one's place pool comes from Google Places (nearby + text search) and
Tripadvisor. Both return POIs: a museum, a trailhead, a restaurant. Neither
returns a **bookable, time-boxed, priced experience** — a sushi-making class, a
guided day trip, a horseback ride. Travelers ask the chat for exactly those and
today there is nothing real to ground the answer to.

Viator's Partner API supplies that category. This task adds it as an ADDITIVE
fourth source. It must never replace or crowd out the existing pool, and it must
contribute nothing at all when there is no local inventory.

## Verified API facts — use these, do not re-derive them

These were read directly from the official v2 spec at
`https://docs.viator.com/partner-api/technical/` on 2026-07-25 and are
authoritative for this build. Do NOT use `docs.viator.com/partner-api/affiliate/technical/`
— that page documents the **legacy v1 API** (`/search/products`,
`/taxonomy/destinations`) and its endpoints do not exist in v2.

**Base URL:** `https://api.viator.com/partner` (production),
`https://api.sandbox.viator.com/partner` (sandbox).

**Required headers on every call:**
- `exp-api-key: <key>`
- `Accept-Language: en-US`
- `Accept: application/json;version=2.0` — **mandatory**; omitting the version
  parameter returns `400 INVALID_HEADER_VALUE`.

**Basic-access Affiliate endpoint availability** (from the official access
matrix — the tier we will be on):

| Endpoint | Basic access |
|---|---|
| `/destinations` | available |
| `/products/search` | available |
| `/products/{product-code}` | available |
| `/locations/bulk` | available |
| `/search/freetext` | available |
| `/exchange-rates` | available |
| `/products/bulk`, `/products/modified-since` | NOT available |
| `/availability/check`, `/reviews/product` | NOT available |

**`/destinations`** returns the full destination taxonomy, each entry shaped:

```json
{
  "destinationId": 34198,
  "name": "Seminyak",
  "type": "CITY",
  "parentDestinationId": 98,
  "lookupId": "2.15.98.34198",
  "defaultCurrencyCode": "IDR",
  "timeZone": "Asia/Makassar",
  "center": { "latitude": -8.68877, "longitude": 115.161267 }
}
```

Note `center` — destinations carry real coordinates. This is the key to the
whole design (see below).

**`POST /products/search`** request:

```json
{
  "filtering": { "destination": "732", "tags": [], "flags": [],
                 "lowestPrice": 5, "highestPrice": 500,
                 "startDate": "2023-01-30", "endDate": "2023-02-28",
                 "includeAutomaticTranslations": true },
  "sorting": { "sort": "TRAVELER_RATING", "order": "DESCENDING" },
  "pagination": { "start": 1, "count": 5 },
  "currency": "USD"
}
```

Response: `{ "products": [ ... ], "totalCount": 14 }`.

**`POST /locations/bulk`** takes location references and returns:

```json
{ "locations": [ {
    "provider": "TRIPADVISOR",
    "reference": "LOC-5620ab70-c813-4904-ad13-bcf527540d3e",
    "name": "Seppeltsfield",
    "address": { "street": "...", "state": "...", "country": "...", "countryCode": "AU" },
    "center": { "latitude": -34.489162, "longitude": 138.91866 }
} ] }
```

Max 500 references per request. Viator's docs say locations should be cached and
refreshed monthly. A reference with no entry in the response means the location
was removed — disregard that product.

**Affiliate tracking format**, from a `destinationUrl` in the live docs:
`?mcid=42383&pid=<PARTNER_ID>&medium=api&api_version=2.0`. Build booking URLs
with the partner id from `env.VIATOR_PARTNER_ID`.

## The core design decision: destination-anchored, never free-text

**Do NOT free-text search and then filter by distance.** Viator's relevance
ranking is not geographic. Live-tested: "canoe trips near Ely, Minnesota"
returned results in Juneau, Alaska and Finnish Lapland; "Jackson, Wyoming"
returned a Percy Jackson tour in Rome.

Instead, anchor on the destination taxonomy, which makes that failure
structurally impossible:

1. Fetch `/destinations` once and cache it in D1 (refresh monthly, per Viator's
   own caching guidance). It is a large but static-ish list.
2. Given the trip's `lat`/`lng`, find the **nearest destination** by comparing
   against each destination's `center`, using the existing `distanceKm` from
   `functions/lib/places.ts`.
3. If the nearest destination is farther than `VIATOR_MAX_DESTINATION_KM`,
   **there is no Viator coverage for this trip** — return an empty list. This is
   the correct, honest answer for rural destinations and it must be the common
   case, not an error.
4. Otherwise call `/products/search` with `filtering.destination` set to that
   `destinationId`. Results are then guaranteed to belong to that destination.

Prefer the most specific matching destination: if several are within range,
choose the nearest; prefer `type: "CITY"` over a broad region when distances are
comparable.

## Hard constraints (violating any of these fails review)

1. **Real data only.** Never fabricate an experience, price, duration, rating,
   or coordinate. If a field is absent, omit it — never default it to a
   plausible-looking value.
2. **No coordinates, no entry.** trip-one's itinerary engine is
   coordinate-driven (day clustering, map markers, day polylines, haversine
   walking effort, distance filters). An experience whose own coordinates cannot
   be resolved MUST be dropped. **Never substitute the destination centre as a
   stand-in coordinate** — that is fabricated data and would put a pin on a spot
   the experience does not occur at.
3. **Fails soft, always.** No key, an API error, a timeout, a bad shape, or no
   nearby destination → empty list, HTTP 200. A Viator outage degrades the trip,
   never breaks it. Mirror `functions/api/interest-places.ts`.
4. **No secrets in code, logs, or output.** Read `env.VIATOR_API_KEY` and
   `env.VIATOR_PARTNER_ID` only. Never log them. Do not create, read, or modify
   `.env` or `.dev.vars`.
5. **Do not commit, push, tag, or deploy.** Leave the work uncommitted. No
   `git add`/`commit`/`push`, no `wrangler`.

## Implement

### `functions/lib/viator.ts`

- `fetchViatorDestinations(apiKey)` — GET `/destinations`, Zod-validated.
- `findNearestDestination(destinations, lat, lng)` — pure, no network, fully
  unit-testable. Returns the destination or `null` when none is within
  `VIATOR_MAX_DESTINATION_KM`.
- `searchViatorExperiences({ destinationId, apiKey, partnerId, currency, limit })`
  → `ThingToDo[]`.
- `resolveExperienceCoordinates(...)` — batch location refs into ONE
  `/locations/bulk` call (never one call per product), respecting
  `LOCATION_BATCH_MAX = 500`.
- Named constants, no magic numbers: `VIATOR_MAX_DESTINATION_KM = 60`,
  `VIATOR_RESULT_LIMIT = 8`, `LOCATION_BATCH_MAX = 500`, `VIATOR_API_BASE`,
  `VIATOR_ACCEPT_HEADER`.
- **Zod for every external response.** A shape mismatch yields `[]`, never a
  throw and never a partial object.
- JSDoc on every export. Log via `logger` from `src/lib/logger`, never
  `console.*`.

Getting per-product coordinates: `/products/search` returns summaries. Fetch
`/products/{product-code}` for each kept result (available at basic access) to
read its location reference(s) from the itinerary/logistics object, collect all
refs, then resolve them in a single `/locations/bulk` call. Confirm the exact
field path for the location ref from the docs and cite it in your findings —
candidates seen in the spec include `itinerary.activityInfo.location.ref`,
`pointOfInterestLocation.location.ref`, and `logistics.start[].location.ref`.
Cap the number of detail calls at `VIATOR_RESULT_LIMIT`.

### `functions/lib/mergeThingsToDo.ts`

Extend `ThingToDo` (every new field optional, each with a JSDoc comment naming
which source populates it, matching the existing style):

- `source: 'tripadvisor' | 'places' | 'viator'`
- `productCode?: string`
- `priceFrom?: number`, `currency?: string`
- `durationMinutes?: number` — fixed duration, or the **upper** bound of a
  variable range (a day must budget the worst case, not the best)
- `bookingUrl?: string` — affiliate-tagged product URL
- `freeCancellation?: boolean`

### `functions/api/experiences.ts`

`POST /api/experiences`, modeled on `functions/api/interest-places.ts`:

- Zod request: `{ lat: number, lng: number, currency?: string }`.
- **D1 cache before the rate-limit gate** (a hit costs nothing so it must not
  spend the traveler's hourly budget — same reasoning and ordering as
  interest-places).
- Rate limit via existing `isRateLimited(env, request, 'experiences', 120)`.
- Missing `env.VIATOR_API_KEY` → `{ experiences: [] }` status **200**, not 500.
  This is what lets the feature ship before the key exists.
- Response: `{ experiences: ThingToDo[], cached?: boolean }`.

### D1

Migration `d1/migrations/0003_viator_cache.sql` plus the same tables in
`d1/schema.sql`, following existing conventions (`create table if not exists`,
TEXT for JSON, `strftime` default timestamps). Two caches: the destination
taxonomy, and per-destination search results. Add `get*`/`upsert*` functions to
`functions/lib/db.ts` matching the style of
`getInterestPlacesCache`/`upsertInterestPlacesCache`, and add them to the fake
D1 in `functions/lib/testD1.ts` so endpoint tests work. Reuse the
`buildInterestCacheKey` pattern from `functions/lib/interestCache.ts` with a
`VIATOR_CACHE_VERSION` constant.

## Tests (required)

`functions/lib/viator.test.ts` and `functions/api/experiences.test.ts`, matching
the existing suites' style (they mock `fetch`). Cover at minimum:

- `findNearestDestination` picks the nearest and returns `null` beyond the
  threshold. **Use the real observed case:** a trip at Ely, Minnesota
  (47.9032, -91.8671) must NOT match Juneau, Alaska (58.3019, -134.4197) or
  Rovaniemi, Finland (66.5039, 25.7294).
- A normal search maps to `ThingToDo[]` with real prices and durations.
- A product whose location ref does not resolve is DROPPED, not centre-pinned.
- A variable-duration product uses the UPPER bound.
- Malformed JSON, wrong shape, and non-200 upstream each yield `[]`, no throw.
- Missing `VIATOR_API_KEY` → 200 with an empty list.
- A cache hit calls neither `fetch` nor the rate limiter.
- Location refs are batched into ONE `/locations/bulk` call, not N.

Tests must be non-vacuous. To prove a test fails when the implementation is
broken, **break it in a temporary copy of the file, never in place.**

## Verify and report

Run and report the real, verbatim output of:

```
npx tsc -b
npx vitest run
npm run build
```

All three must be clean. If something fails and you cannot fix it, say so
plainly — do not report success you did not observe.

Also write `docs/specs/viator-api-findings.md` recording anything you confirmed
or contradicted in the "Verified API facts" section above, with a direct doc URL
next to each claim, and `UNCONFIRMED` next to anything you could not verify.
Note: `docs.viator.com` blocks plain HTTP fetchers with 403; if you cannot read
it, say so and mark the affected items UNCONFIRMED rather than guessing.

## Out of scope (do NOT build)

- Candidate-pool integration, duration-aware day capacity, planner prompt
  changes, any React/UI component, affiliate disclosure copy. Those are Task B.
- Booking, availability checks, anything transactional.
- Any change to `src/themes/**` (unrelated in-flight CSS work).
