# Chat classification eval + fixes

A record of how the itinerary chat routes user messages, the bugs found, and a
simulated eval across ~100 likely travel inputs.

## How the chat routes a message

The model classifies each message into one action:

- **plan** — change the itinerary using places already in the nearby pool
- **search** — add/find a specific KIND or THEME of place not in the pool (a
  cuisine, a venue type, or a theme like "moon-related"); returns a `searchQuery`
- **relocate** — switch the trip to a different destination
- **answer** — a question or comment

For **search**, the client calls `/api/places-search` (Google Places Text
Search, with a Tripadvisor fallback for niche/thematic queries), adds the real
results to the map + candidate pool, and re-plans so they land on the itinerary.

## Bugs found and fixed

1. **"Change it to N days" did nothing** (kept the old day count). The chat
   prompt hard-coded the current count and the plan was clamped back to it.
   Fix: detect an explicit length request client-side (`requestedDayCount`) and
   plan for it, so the day tabs + dropdown actually change.

2. **"Add coffee shops" claimed success but added nothing.** Dedicated coffee
   shops carry Google's `cafe` type, which wasn't searched. Fix: added a `cafe`
   search to the Places pool.

3. **"Add sushi" swapped in unrelated places and called them sushi.** The pool
   only has generic categories, so the model couldn't identify cuisine and faked
   it. Fix: the on-demand nearby search tool (any cuisine/venue/theme).

4. **"Add moon-related / space / telescope stops" was refused** ("I don't see
   any…") even though Space Expo exists nearby. An over-eager guardrail told the
   model to say a kind of place "isn't among the nearby places," which fought the
   search action. Fix: the model must ALWAYS search for a requested kind/theme
   and never refuse — a real search finds it or confirms none exist. Themes are
   translated to real place types ("moon-related" → "space museum").

## Simulated eval (live, ~90 scored inputs + 10 ambiguous)

Ran categorized inputs against the deployed `/api/chat` and checked the action:

- Cuisine adds (sushi, ramen, vegan, tacos, …) → **search** ✓
- Venue/theme adds (rooftop bar, planetarium, space museum, night market,
  moon-related, …) → **search** ✓ (with sensible queries)
- Destination changes (Rome, Tokyo, Barcelona, …) → **relocate** ✓
- Questions/smalltalk (kid-friendly? weather? walkable? thanks!) → **answer** ✓
- Generic plan edits (relax day 2, add a rest afternoon, reorder) → **plan** ✓

Result: **77/80 scored inputs matched the expected action (~96%)**, and all 10
ambiguous "vibe" inputs ("I love history", "hidden gems", "rainy day") produced
a sensible search or answer. The 3 apparent misses were acceptable behaviors or
eval artifacts (e.g. "remove the aquarium" answered because the eval passed an
empty itinerary; "add another museum" searched for more real museums).

## Learnings

- With a grounded planner, **prompt guardrails can conflict**: a "don't claim
  you have it" rule silently defeated a "search for it" action. When adding a
  capability, re-read existing guardrails for the opposite instruction.
- **Translate themes to place types in the prompt** — the model reliably maps
  "moon-related" → "space museum", "telescope" → "planetarium or observatory".
- **Text search + a details enrichment** is how Tripadvisor becomes a usable
  fallback (its search endpoint returns ids/names only; coordinates come from a
  per-result details call, needed to plot on the map).
- Eval fidelity matters: day-length and "remove X" cases need the client's
  day-count adjustment and a real current itinerary to classify the way the
  live app does.
