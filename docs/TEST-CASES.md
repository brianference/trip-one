# Trip One — Test-Case List

All tests: `npx vitest run` (364 passing at time of writing). Below are the
cases covering the features in `FEATURES.md`, grouped by feature.

## F1 — Configurable AI model
Covered indirectly: `plan.ts` / `plan-intent.ts` read `env.AI_MODEL ?? 'gpt-4o-mini'`.
- Existing endpoint tests exercise the default path.

## F2 — Homepage two-column hero
`src/themes/chronicle/SearchScreen.test.tsx`
- Renders the "Describe your trip. We build it." hero heading.
- Location search still creates a trip with the chronicle design style (Go button).
- Autocomplete selection still creates a trip.
- Trip-creation failure surfaces an error.

## F3 — Weather page + nav
`src/features/trip/pages/WeatherPage.test.tsx`
- Shows current conditions, a multi-day forecast, a forecast-derived packing tip, and folds in local info (transit link).
- Requests at least a week of forecast even for a 2-day trip.

`src/features/trip/TripNav.test.tsx`
- Nav links to `/weather` (not the removed `/local-info`).

`src/App.test.tsx`
- `/trip/:id/weather` renders the weather page with local info.
- `/trip/:id/local-info` still resolves (weather alias).

## F4 — Place detail on click
`functions/lib/placeDetails.test.ts` (pure normalizer)
- Maps real Google fields into the compact shape.
- Keeps only reviews with text, caps at three.
- Derives `serves` flags and photo refs; never invents a menu.
- Falls back to top review text when there's no editorial summary.
- Uses the fallback place id when the result omits one.
- Returns null when there's no name.
- Requests the real fields it reads.

`src/features/trip/place/PlaceDetailPanel.test.tsx`
- Shows the query label while loading.
- Renders rating, review count, address, phone (tel: link), a review, a proxied photo.
- Directions use the canonical Maps URL, falling back to a Maps search.
- Closes on the close button.
- Surfaces a lookup error.

`src/features/trip/components/ThingsToDoList.test.tsx`
- Clicking a suggestion name opens the detail panel (onSelect).

`src/features/map/MapView.test.tsx`, `TripMap.test.tsx`
- Marker click wiring compiles/renders (mocked Leaflet `.on`).

## F5 — Conversational itinerary chat
`functions/lib/aiPlan.test.ts`
- Prompt asks for a friendly `message` alongside grounded days.
- Prompt includes the current itinerary + edit instruction when editing.
- Prompt includes recent conversation turns as fenced data.
- `extractPlanMessage` trims / caps / rejects blank & non-string.

`src/features/trip/chat/useTripChat.test.ts`
- Opens with a greeting when there's no handoff.
- Opens from the homepage handoff exchange when present.
- Sends a message, applies the grounded plan, appends the reply.
- Passes prior turns + current itinerary so edits build on context.
- Surfaces a friendly assistant message on failure (no throw).
- Does nothing when there are no places to ground on.

`src/features/trip/chat/TripChatPanel.test.tsx`
- Renders messages; shows starters before the first user turn.
- Sends composer text; taps a starter; hides starters after first user turn.
- Shows the thinking indicator and blocks sending while thinking.
- Surfaces an error.

`src/features/trip/components/HomeAiPlanner.test.tsx`
- One sentence → real trip → opens the itinerary (unchanged, now stashes the opening chat).

## Gaps / follow-ups for the review team
- No live integration test hits the real Google Place Details endpoint (mocked only).
- Map marker → panel is unit-covered at the component level; end-to-end click is verified manually in the browser.
