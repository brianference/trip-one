# Trip One — Feature Reference

Real, public trip planner. Chronicle is the only theme. Every place shown is a
real place (Google Places / Tripadvisor); the AI may only **select and order**
real places, never invent one. Backend is Cloudflare Pages Functions; data is
Supabase Postgres. This document describes the features added in the
"describe-your-trip + rich detail" work.

## F1 — Configurable AI model

The OpenAI model is read from the `AI_MODEL` env var, defaulting to the
low-cost `gpt-4o-mini`, in both `functions/api/plan.ts` and
`functions/api/plan-intent.ts`. Change the model without a code change; kept at
`gpt-4o-mini` for now.

## F2 — Homepage two-column hero

The landing page (`src/themes/chronicle/SearchScreen.tsx`) presents two paths
side by side: **Describe your trip** (the AI planner) on the left, **or just
browse a place** (location search) on the right. Stacks to one column under
860px.

## F3 — Weather in the nav; Weather page replaces Info

`Info` is gone from the trip nav, replaced by **Weather**
(`src/features/trip/pages/WeatherPage.tsx`): current conditions, a 7–14 day
forecast, and forecast-derived packing tips (all real Open-Meteo data), with the
still-useful local info (currency, phrasebook, transit) folded in as a secondary
section. The old `/trip/:id/local-info` URL still resolves (aliased to the
weather page) so existing links don't break.

## F4 — Place detail on click

Clicking a place — a Things-to-do card name, or a map pin — opens a bottom-sheet
detail panel (`src/features/trip/place/PlaceDetailPanel.tsx`): photos, rating +
review count, price, open-now, address, phone (tap to call), a real
summary/reviews, "serves" tags, opening hours, website, and a **Get Directions**
button.

- Backend `functions/api/place-details.ts` calls Google Place Details, cached in
  a new Supabase `place_details` table so the paid call runs at most once per
  place per 30 days. Resolves `name`+coords via Find Place when no `place_id`.
- `functions/api/place-photo.ts` proxies photos so the Google API key never
  reaches the browser.
- Real data only: there is **no invented "menu"** — we surface Google's real
  `serves_*` / price / hours / reviews instead.

## F5 — Conversational AI chat on the itinerary

The itinerary page (`src/features/trip/pages/ItineraryPage.tsx`) has a persistent
left chat rail (`src/features/trip/chat/`). Build and refine the trip in plain
language ("make day 2 relaxed", "add more food stops"); each message re-plans the
itinerary **grounded on the trip's real places** given the running conversation
and current plan, and the AI replies in natural language. Borrowed from the
daisydog chat: an animated three-dot **thinking indicator**, animated message
bubbles, and tappable starters. The homepage planner hands its opening exchange
off so the conversation continues seamlessly on the itinerary page.

- Backend `functions/api/plan.ts` now returns a friendly `message` alongside the
  grounded `days`, and accepts optional `conversation` + `currentPlan` for edits.
- Grounding is unchanged: the model returns indices into the real candidate
  list; `normalizePlan` drops anything out of range, so no fabricated stop can
  appear.

## Architecture notes

- Small files by responsibility: chat lives in `features/trip/chat/`, place
  detail in `features/trip/place/`, weather in `features/weather/`.
- Pure, network-free cores are unit-tested directly: `aiPlan.ts`
  (prompt + normalize + message extract), `placeDetails.ts` (normalize),
  `planToItinerary.ts`, `experienceFilter.ts`.
- Reuse over duplication: the chat reuses `generatePlan` + `applyPlan`; the
  weather page reuses the existing weather hooks/components; the detail panel
  reuses `directionsUrl`.
- Cost control: grounded prompts, capped tokens, rate limits per endpoint, and
  Supabase caching for both locations and place details.
