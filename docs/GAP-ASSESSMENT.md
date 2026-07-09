# Trip One — Gap Assessment (v2.0.0)

Comparison of the current app against four references, plus a focused look at
user experience and agent-chat interactivity. Grounded in the Daisy Dog source
(read directly: `useChatState`, `MessageBubble`, the services list), the
Tripadvisor "Plan with AI" screens, and the tokyo-one / yellowstone-one
patterns. Ordered by impact.

## The biggest gap: the chat only plans, it can't answer

Today every chat message runs the grounded **planner** — it re-plans the
itinerary and replies about what changed. There is no question-answering path.
Ask "is Balboa Park good for toddlers?", "what's the weather Friday?", or "how
far is the aquarium from downtown?" and the agent will try to reshape the trip
instead of answering.

This is the single largest divergence from both Tripadvisor Plan with AI ("Ask
anything", open Q&A) and the Daisy Dog chat (free conversation with intent
routing). The fix is an **intent router**: classify each message as
*plan-edit* vs *question* vs *smalltalk*, and answer questions from the trip's
real data (places, ratings, weather, distances) rather than re-planning. This
is the highest-leverage next step for "agent-like interactivity."

## Versus Daisy Dog (chat interactivity)

Daisy Dog's chat has several interaction affordances Trip One lacks:

| Daisy Dog has | Trip One | Worth porting? |
|---|---|---|
| Typing/thinking indicator | ✅ ported | done |
| Animated message bubbles | ✅ ported | done |
| Quick-action buttons / starters | ✅ (destination-aware) | done |
| Intent routing to different behaviors (chat, games, feed) | ❌ only planning | **yes — the open-question gap above** |
| Persisted chat state (CheckpointService) | ❌ chat resets on reload | yes — persist the conversation per trip |
| Streaming/token-by-token responses | ❌ single reply | maybe — current typing-indicator reads fine |
| Voice / video / emotion avatars | ❌ | no — not relevant to trip planning |

The two that matter for Trip One: **intent routing** and **persisted chat**.
The rest (voice, video, emotions, games) are Daisy-specific and out of scope.

## Versus Tripadvisor "Plan with AI"

From the shared screens, Tripadvisor's assistant offers:

- **Open Q&A** ("Ask anything", suggested questions like "Quiet stays in Cancun walkable to top sights") — Trip One can't yet (see top gap).
- **Structured trip context chips** — Dates, Travelers, Recents — Trip One has trip length but no dates or party-size as first-class inputs.
- **A shareable, revisitable trip** with Invite/Share and Saves/Itinerary/For-you tabs — Trip One trips are shareable by URL but there's no save/share affordance or "for you" suggestions surface.
- **Chat available across the experience**, not one page — Trip One's chat is itinerary-only. (Tracked as G5: chat on every page.)

## Versus tokyo-one / yellowstone-one

- **Rich place detail (reviews, photos, hours, directions)** — ✅ now built (v2.0.0), matching the reference pattern; the one deliberate difference is no invented "menu" (real `serves_*`/reviews instead).
- **Hourly weather link** — ❌ not yet (requested; tracked in G3).
- **Offline / PWA behavior** — not assessed here; Trip One is online-first.

## Open UX gaps still tracked as backlog

- **Pre-created trip links on the homepage** (Tokyo, Yellowstone, Dublin, Beijing) with the demos merged in, and "What you get" moved up. (G2)
- **Autocomplete disambiguation** — typing "hawaii" returns "Hawaii" five times instead of distinct islands/places. (G4)
- **Things-to-do visual redesign** — currently a plain list; should be cards with rating and cleaner actions. (G5)
- **Chat on every page**, not just the itinerary. (G5)
- **Hourly weather** on the Weather page. (G3)

## Recommended next order

1. Intent router so the chat answers open questions from real trip data (biggest interactivity win).
2. Persist chat per trip (survives reload; enables "revisit your plan").
3. Chat available on every page (G5) — pairs naturally with 1–2.
4. Homepage pre-created trips + "What you get" reorder (G2) — strongest first-impression win.
5. Autocomplete disambiguation (G4), things-to-do redesign (G5), hourly weather (G3).
