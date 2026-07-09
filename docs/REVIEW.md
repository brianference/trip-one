# Review — QA, Architecture, Design (v3.0.0)

Wrap-up review after the conversational-assistant work. Combines the automated
QA sweep, an architecture pass, and a visual design pass across desktop and
mobile in both themes.

## QA sweep

- **378 automated tests pass**; `tsc` strict and production build clean.
- **Live smoke, zero console errors** on: homepage, itinerary (chat), weather,
  things-to-do (place detail), across the fixed CSP.
- **Verified behaviors live:**
  - "vegas" → destination normalizes to "Las Vegas, Nevada" (no more geocoding
    to an obscure town).
  - Chat relocate: "it should be las vegas" switches the trip's destination.
  - Chat answer: "is X good for kids?" replies without changing the plan.
  - Weather: 7-day forecast wraps with no scrollbar; transit is a card;
    non-USD currency shown, US currency hidden.
  - Theme: light is the default; the toggle persists and overrides the OS.
  - Destination-aware chat starters ("A foodie trip … in Kyoto").

## Design review (desktop + mobile, light + dark)

Verified pages: homepage (2-column hero), itinerary (chat rail), weather,
things-to-do (detail sheet), privacy. Both themes read as one cohesive system
— same type scale, spacing, teal accent, and card treatment throughout.

Open design items (tracked as backlog, not regressions):
- Things-to-do is still a plain list; it should become rating-first cards. (G5)
- The homepage right column is search-only; pre-created trip links + moving
  "What you get" up would strengthen the first impression. (G2)
- The chat lives only on the itinerary page; a shared rail/drawer on every page
  (map included) is requested. (G5)
- Map lacks in-place route/day editing from chat. (G5)

## Architecture recommendations

Current state is clean: small files by responsibility, pure cores unit-tested
(`aiPlan`, `aiChat`, `placeDetails`, `planToItinerary`), one shared
trip-creation path (`createTripForDestination`), one shared OpenAI schema.

Recommended next improvements, in order:

1. **Lift chat state to `TripShell`** so the assistant persists across page
   navigation and can render on every page (enables the "chat everywhere"
   request without duplicating state). Pairs with a shared `TripChatDrawer`.
2. **Persist the conversation per trip** (Supabase or localStorage keyed by
   trip id) so a reload doesn't reset the chat — the Daisy Dog checkpoint
   pattern.
3. **Share frontend/backend planner types** via a single source to remove the
   small `PlanDay`/`PlanTurn` drift between `client.ts` and `aiPlan.ts`.
4. **Confidence-gated geocoding**: when a resolved place looks low-confidence
   (Nominatim importance/type), ask the traveler to confirm before building —
   the "seek clarity before a weird place" request, beyond the name
   normalization already shipped.
5. **A shared weather/currency cache** keyed by coordinates so Overview and
   Weather don't refetch the same data on navigation.

## Priority for the next iteration

Chat everywhere (1) + persistence (2) is the highest-leverage pairing — it
turns the assistant from a single-page tool into the app's spine, which is the
biggest remaining gap versus Tripadvisor Plan with AI. The homepage
pre-created trips (G2) is the strongest first-impression win. Things-to-do
cards (G5) and confidence-gated geocoding (4) follow.
