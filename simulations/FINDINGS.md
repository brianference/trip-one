# Simulation sweep v2 — findings

30 scenarios on destinations none of the earlier work touched, run against the
real pipeline (real intent extraction, real web-grounded discovery, real Google
Places verification, real planner). July 2026, build `768bcd4`.

Run it with `npm run sim -- --sweep`. It calls paid APIs, so it is not in CI.

## The headline: the previous numbers were measuring the wrong thing

The harness did not run discovery, passed no traveler profile, and never filled
empty days. It measured a pipeline no traveler actually gets, which is why it
reported **27% food** while browser QA measured **48%** on the same request in
production. Any earlier quality claim sourced from it should be discarded.

Fixed. It now mirrors production and reports defects separately from averages,
because a mean hides the one trip that put a bar in front of someone's children.

## Results (28 of 30 scenarios completed)

| Metric | Activity-led (24) | Food-led (4) |
|---|---|---|
| Food share of stops | 32.3% | 59.8% |
| On-theme share | 71.6% | 86.7% |
| Mean relevance (0-3) | 1.67 | 2.03 |
| Stops per trip | 27.7 | 18.8 |

| Defect | Count |
|---|---|
| Audience violations | **0 / 28** |
| Empty days | **0 / 28** |
| Thin days (<3 stops) | **0 / 28** |
| Scenarios with a stop >30km out | 17 / 28 |
| Hard failures | 2 / 30 |

Food at 32% on activity-led trips is the honest figure and is higher than the
27% previously claimed. On-theme at 72% is lower than the 83% previously
claimed. Both differences are the harness fix, not a regression.

## Bugs this sweep found

### 1. Intermittent 502 on any request that states no party — FIXED

`extractedIntentSchema` declared `party`, `interests`, `audience` and
`foodFocused` as optional but **not nullable**. The model emits an explicit
`null` for a field the request doesn't mention, so "5 day hiking trip in Ouray
Colorado" returned `"party": null`, Zod rejected it, `/api/plan-intent`
answered 502, and the whole trip failed before it started.

It looked intermittent only because the model sometimes chose the string
`"general"` for the same input. Measured on production: **1 of 3** attempts
succeeded for Queenstown. After the fix: **8 of 8**.

This is the third bug in the same family, after the empty-interests failures in
v11.0.0/v11.0.1. See "Recurring cause" below.

### 2. Food selected from up to 50km away — FIXED

The nearby search deliberately spans 50km so a national park's spread-out
attractions are reachable. Applied to restaurants and cafes, that put a Tim
Hortons **47km** from Whistler on a family plan. Food now has its own 15km
ceiling in both the nearby search and text search; attractions keep the
generous radius.

### 3. Stale cached classifications — FIXED

Cached entries store derived metadata (`adultVenue`, `category`), so correcting
the classifier left every existing entry stale — a family Jackson trip kept
getting saloons back from cache long after the filter was fixed. Cache keys now
carry `PLACE_CACHE_VERSION`, which must be bumped whenever classification logic
changes.

### 4. Out-of-region stops — PARTLY OPEN

17 of 28 scenarios still place a stop more than 30km from the destination
centre. The 30km threshold **conflates two different things** and should not be
read as 17 defects:

- **Legitimate.** Bardstown's bourbon distilleries, Skye's Neist Point, Banff's
  Moraine Lake, Sicily's Segesta. These are the actual reason for the trip and
  no local alternative exists.
- **Genuine defects.** Hallstatt scheduling seven Salzburg sights 50km away
  while Hallstatt's own sights go unused; Carlsbad reaching 50km to San Diego
  for nine stops.

The pattern in the genuine cases is a **small base whose venues run out**,
after which the planner silently substitutes a bigger city nearby. A distance
cap alone would break the legitimate cases. The real fix is to prefer local
venues until they are exhausted and to surface the reach explicitly rather than
hiding it. Not attempted here.

### 5. Ranking quality is the weakest remaining area — OPEN

Mean relevance of 1.67 out of 3 on activity-led trips means the average stop is
only loosely connected to what was asked for. Zero audience violations and zero
empty days say the hard failures are gone; 72% on-theme says the *selection*
still has real headroom. This, not the defect list, is where the next
meaningful gain is.

## Recurring cause worth naming

Three separate production failures had one shape: **a schema stricter than what
the model legitimately returns, failing closed on the entire trip.**

- v11.0.0 — empty `interests` string rejected by three endpoints
- v11.0.1 — same field, fixed at the source
- this sweep — `null` for unstated fields rejected by the intent schema

Each produced a hard user-facing failure ("invalid request", or a 502) for a
perfectly reasonable request. The lesson is not "add more nullable" but that
**a validation failure on an optional field should degrade the trip, never fail
it.** The endpoints that now accept an empty intent and plan the destination's
highlights are the correct pattern.

## What the fixes demonstrably achieved

Measured across 10 family trips and 6 adult/occasion trips, the audience traps
the sweep was designed to catch:

- **0 audience violations.** No bar, pub or saloon on any family trip; no zoo
  or playground on any adult trip.
- **0 empty and 0 thin days**, including five trips of 10-14 days, which is
  where days used to run dry.

The audience classifier needed a correction after live testing: the first
version flagged Pinky G's Pizzeria and Bar T 5 — both family-friendly — because
Google tags any restaurant with a drinks licence as type `bar`. Unit tests
passed; only production data exposed it. Worth remembering that a filter's
false positives are invisible in a green test suite.
