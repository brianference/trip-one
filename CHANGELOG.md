# Changelog

All notable changes to Trip One. Versions follow the app's release tags; each
tag has a matching GitHub Release. Live at https://trip-one.pages.dev.

## v13.0.0 — Light by default, and a calmer palette

**Breaking (visual).** The product's default appearance changed. Anyone who had
not explicitly chosen a theme now sees the light one, and the colour that drives
every button and pill is different.

### Light is the default
Dark mode previously applied whenever the operating system preferred it, which
meant most visitors met a dark app that the design had not been tuned against.
Dark is now opt-in through the header toggle, and a saved choice still wins.

### Orange is no longer the action colour
Orange carried every button, pill, filter and chat action. It was visually
relentless, and it was the weakest contrast in the palette: white on it measures
3.18:1 and even dark text only reaches 5.89:1.

The primary action colour is now pine with white text at **8.17:1** — past AA,
and past AAA for large text. Accent text moved off orange as well. Orange
survives in the logo mark alone, where it is a graphic rather than text.

The change is driven by two tokens, so the whole app moved together and nothing
can drift back to the old pairing.

### Other
- The original route-and-pin logo is back in the header and footer.
- The homepage headline stays on one line instead of breaking mid-sentence.

## v12.2.0 — The chat stops deleting your trip

### Fixed — data loss in the itinerary chat
Asking the chat to change one day was silently deleting stops from a saved
trip. Measured before the fix: five scoped requests took a 20-stop Barcelona
trip down to 13, destroying the Sagrada Familia, Barceloneta Beach and eleven
other places nobody asked to remove. After: six requests, no losses, every
originally-planned stop preserved unless the traveler asked for it to go.

It took four attempts, and the first three each fixed a real but different
defect:

1. **Days the model omitted were wiped.** A scoped edit answers about the day
   it was asked about; applying that wholesale replaced the whole itinerary.
   Chat edits now merge, keeping days the reply doesn't mention while still
   honouring a day that comes back deliberately empty.
2. **Days the model DID return lost their stops.** It was shown the current
   itinerary as place NAMES but had to answer in INDICES, so keeping a stop
   meant reverse-engineering its index — it re-picked each day from scratch
   instead. The itinerary is now shown in the same index space the reply uses,
   and a server-side guard restores anything dropped.
3. **The real cause: the stops had no index at all.** The candidate list was
   the top 40 places BY RATING, and an unrated place sorts last — 15 of
   Barcelona's 50 places carry no rating, including the Sagrada Familia. A stop
   missing from that list cannot be referenced, so the model could not keep it
   and the guard could not restore it. The traveler's current stops now lead
   the list unconditionally, and a stop no longer in the nearby pool is rebuilt
   from the itinerary itself.

With those in place the additive requests came good on their own — the model
now echoes the indices it is keeping. Two destructive commands still misfired,
so they no longer go through the model at all:

- **"clear day 5" now clears day 5.** It previously returned one stop instead
  of none (deleting four), or answered conversationally that the day was
  cleared while leaving it untouched.
- **"remove the last stop on day 4" no longer adds one.** A response that comes
  back the same length or longer removed nothing, so the day is left exactly as
  it was and the reply says the stop couldn't be identified — rather than
  claiming a removal that never happened.

### Fixed — other
- Clearing a day was impossible even when the model got it right: empty days
  were discarded before they reached the client, and the food balancer would
  have refilled a cleared day with three restaurants.
- The place detail sheet's "Add to trip" and "Get Directions" were unreachable
  on trip pages — the sheet sat below the trip's own navigation. There is now a
  documented z-index scale, and the confirmation dialog had the same latent bug.
- An empty reply from the model rendered as a blank assistant bubble.
- Nine controls below the 44px touch target were raised.

### Changed
- The AI planner form and trip plan page are on Tailwind. Print layout classes
  are deliberately left alone; the print stylesheet targets them.

## v12.1.0 — Accessible colour, and more of the app on Tailwind

### Fixed — colour contrast
v12.0.0 shipped with text that failed WCAG AA in several places. All of it is
fixed and independently verified with computed colours on the live site.

- **Dark mode was broadly unreadable on trip pages.** Unifying the trip views
  with the site design system mapped their secondary accent to a mid-tone green
  that measured 2.92:1 on the dark surfaces — below AA — across roughly two
  dozen elements: the weather and currency badges, "Hourly" links, the current
  temperature, day distance and sight/food meta lines, and the "stops planned"
  callouts. Accent TEXT now uses tokens that flip with the theme; those
  elements measure 7.15–14.73:1.
- **Primary buttons failed AA in light mode.** White on the dusk accent is
  3.18:1, below AA for a 14px label. This affected every primary button and
  predates v12.0.0. Buttons now use dark text on the accent, 5.89:1, which
  keeps the vibrant orange rather than muddying it.
- **The first attempt at that fix only reached half the buttons.** Chronicle's
  rules coloured their labels with the PAGE BACKGROUND, which inverts with the
  theme — so they were light-on-orange in light mode and passed in dark only by
  accident. The Explore filter pill had a hardcoded white that no token could
  reach. There is now one `--color-on-accent` token, deliberately not
  theme-aware, driving every element that sits on the accent.

The logo mark keeps white on the accent by design: it is a graphic, not text,
so WCAG 1.4.11 asks for 3:1 and it measures 3.18.

### Fixed — other
- A signed-in user with a trip open could not switch theme, reach their
  account, or navigate away, because the trip layout omits the site header to
  save vertical space on a phone. The trip top bar now carries a theme toggle
  and a My trips link.

### Changed
- The homepage, the place detail sheet and the trip chat panel are rewritten in
  Tailwind, removing 93 bespoke class rules between them. Pinned headers,
  pinned footers and independent scrolling are preserved in each.
- The homepage now uses the same search component as Explore, so there is one
  search implementation rather than two — it inherits prefix search and full
  keyboard navigation, which the homepage previously lacked.
- Arriving with `?destination=` starts that trip immediately, so searching from
  Explore leads somewhere instead of only prefilling the box.

## v12.0.0 — Accounts, a premium frontend, and search that finds things

A major release. Trip One gains user accounts, a rebuilt interface on Tailwind,
five real site pages, and a destination search that works.

### Accounts, and trips that belong to you
Register and sign in to save trips and open them on any device. Password
hashing and sessions are implemented on Web Crypto rather than bcrypt and
jsonwebtoken, neither of which can run on Cloudflare Workers.

Security specifics, each addressing a concrete failure mode:
- Sessions live in an httpOnly, Secure, SameSite=Lax cookie, so page JavaScript
  cannot read a session and an XSS bug cannot exfiltrate one.
- The JWT verifier ignores the token header's `alg` and only ever checks HS256,
  so the `alg:none` and RS256-to-HS256 confusion attacks do not apply. The
  signature is verified BEFORE the payload is parsed, and compared in constant
  time.
- Login answers identically for an unknown account and a wrong password, and
  hashes anyway when the account doesn't exist, so timing doesn't reveal which
  emails are registered.
- Trip deletion enforces ownership inside the SQL rather than by a separate
  read-then-check, which cannot race and cannot be forgotten at a call site. A
  missing trip and someone else's trip both answer 404.
- Passwords are peppered with a secret held outside the database, so a stolen
  database alone cannot be attacked offline.

**Anonymous trips still work exactly as before.** Ownership is optional: every
existing share link keeps working, and signing up can claim the trip you just
planned.

### A rebuilt interface
Converted to Tailwind v4 with a single design system. The trip views derive
their colours and type from the same tokens as the rest of the app, so the
product no longer looks like two different sites stitched together.

New: a sticky header with the wordmark, an organised footer, and About,
Contact, Terms, Explore and 404 pages. Delete now asks first, in a
focus-trapped dialog that names the trip and puts focus on Cancel so a stray
Enter cannot destroy anything.

### Search that finds destinations
Type-ahead moved from Nominatim to Photon. Nominatim is a geocoder that matches
whole tokens, so "dubl" returned a private road in Luton and a Russian mountain
peak, and never Dublin. Photon does prefix search on the same data. Results are
ranked so a place you can base a trip in beats a building or a street.

### Faster on a phone
Four webfont families were being downloaded for nothing — three imported by a
stylesheet that no longer used them, two more referenced only by themes the app
never routes to. Only Sora is fetched now. Destination photos are served at the
width the device actually needs, with reserved dimensions so nothing shifts as
they load.

### SEO
Per-route titles, descriptions, canonicals, Open Graph, Twitter cards and
JSON-LD, plus robots.txt and a sitemap. Trip URLs are deliberately excluded
from indexing: they are unguessable share links, not public pages.

### Fixed
- Planned trips never reached the signed-in user's account, so "My trips"
  stayed empty and the delete flow was unreachable.
- The theme toggle was fixed to the top-right corner, where it covered the new
  header's menu button and swallowed taps meant for it. It was also the first
  Tab stop, pushing "Skip to content" to second.
- Two footers rendered on the homepage.
- Every Explore image was blocked, from two independent causes: CSP did not
  allow Wikimedia, and the URLs were guessed from slugs and only resolved for
  three of eight destinations.
- Search suggestions never rendered: the client read a `label` field the
  endpoint does not return.
- Per-endpoint rate limits shared one budget, so the effective limit was the
  smallest across all routes. Planning a trip consumed registration's allowance
  and made signing up impossible.
- Requests naming no party failed intermittently with a 502, because the intent
  schema rejected the `null` the model returns for unstated fields.
- The Privacy Policy claimed "no accounts, logins, or passwords" and named
  Supabase as the database. Both were untrue; it has been rewritten.

### Under the hood
- 584 automated tests; typecheck, tests and build gate every push.

## v11.1.0 — Audience filtering that holds, and a simulation that tells the truth

### Fixed
- **Bars reached family trips.** Audience was judged from a place's single
  `category`, but the food promotion in `places.ts` deliberately moves
  `restaurant` ahead of `bar` so meal slots get detected — so by the time a
  venue reached the filter, a saloon looked like a restaurant. Classification
  now reads the full Places `types` plus a qualified name pattern. Measured
  across 10 family and 6 adult scenarios: zero audience violations.
- **A first attempt at that filter over-fired** and was corrected before
  release: it flagged Pinky G's Pizzeria and Bar T 5, both family-friendly,
  because Google tags any restaurant with a drinks licence as `bar`. It now
  only counts `bar` when the place is not also somewhere to eat.
- **Food was chosen from up to 50km away.** The nearby search spans 50km so a
  national park's attractions are reachable; applied to restaurants that put a
  Tim Hortons 47km from Whistler on a plan. Food now has its own 15km ceiling
  while attractions keep the generous radius.
- **Requests that state no party failed intermittently with a 502.** The intent
  schema declared `party`, `interests`, `audience` and `foodFocused` optional
  but not nullable, and the model returns an explicit `null` for anything the
  request doesn't mention. "5 day hiking trip in Ouray Colorado" succeeded 1
  time in 3 before the fix and 8 of 8 after.
- **Cached places kept their old classification.** Cache entries store derived
  metadata, so fixing the classifier left stale entries returning saloons for
  family trips. Keys now carry `PLACE_CACHE_VERSION`.

### Changed
- **The simulation harness measured a pipeline nobody gets.** It ran no
  discovery, passed no traveler profile and never filled empty days, which is
  why it reported 27% food where browser QA measured 48% in production. It now
  mirrors the real flow and reports audience violations, out-of-region stops
  and thin or empty days as defects rather than folding them into an average.
  Earlier quality figures produced by it are not reliable.
- 30 new simulation scenarios on fresh destinations, weighted toward the
  failure modes real QA found. Honest current numbers on activity-led trips:
  32% food, 72% on-theme, zero audience violations, zero empty or thin days.
  See `simulations/FINDINGS.md`.

### Known open
- Small bases whose venues run out still reach a larger city nearby without
  saying so (Hallstatt scheduling Salzburg sights 50km away).
- Mean stop relevance of 1.67/3 on activity-led trips — selection quality is
  the largest remaining gap, ahead of any defect on this list.

## v11.0.1 — Fix trips that name no activities

### Fixed
- **Requests that name a destination and a party but no activities failed
  outright.** "12 day trip to Dublin for a father and son, the son is turning
  21" made `/api/plan-intent` return an empty interests string, which
  `/api/plan`, `/api/interest-places` and `/api/discover-venues` all rejected
  with a 400. The user got "invalid request" and was left on the home page with
  no trip, while an orphaned trip row stayed behind in the database. Intent is
  now synthesized from the occasion, party and audience when a request names no
  activities, and all three endpoints accept an empty intent rather than
  failing the trip. Shipped in v11.0.0 and found in browser QA immediately
  after; fixed the same day.
- Raised the Testing Library async timeout so CI stops flaking on slow runners,
  and unstubbed globals between tests so a leaked `fetch` stub can't make a
  failure depend on file order.

## v11.0.0 — Trips that match the trip you asked for

The planner used to arrange whatever Google returned near a coordinate. A
walleye-and-grouse trip in northern Minnesota came back as a restaurant tour; a
21st-birthday trip to Dublin got a zoo and a lighthouse; a 7-day Jackson Hole
family ski trip printed 2 days. This release rebuilds how a plan is sourced,
who it is sourced for, and where it is stored.

### Trips are now built from real travel guides
Every plan starts with a live web search for guides matching that specific trip
(party, season, interests), extracts the venues those guides actually name, and
verifies each one against Google Places. Anything that fails to verify is
dropped, so nothing invented reaches a plan.

A family Jackson Hole request now returns Snow King tubing, the Cowboy Coaster,
Elk Refuge sleigh rides and the Children's Museum. A 21st-birthday Dublin
request returns the Guinness Storehouse, Teeling, Jameson, The Cobblestone and
Temple Bar.

### The planner knows who is travelling
Requests are parsed into a traveler profile (party, occasion, season, and a
kids/adults/general audience). A kids trip never gets bars, breweries or
distilleries; an adults trip never gets zoos, playgrounds or aquariums. The
filter runs at the candidate-pool level, so the day-filler that tops up long
trips cannot reach for an off-audience place either.

### Fewer restaurants, more of the point of the trip
Candidates are pooled by role rather than one global rating sort, which food
always won. Incidental restaurants get a per-day budget; food the traveler
explicitly asked for is exempt, so a New Orleans eat-everything trip stays a
food trip. Across nine simulated trips, food fell from 58% to 27% of stops and
on-theme stops rose from 65% to 83%. Six held-out destinations, never used
during tuning, scored 29% food and 93% on-theme.

### Every day prints
The PDF view now renders a section per requested day instead of only the days
the planner happened to fill, and the planner is required to fill all of them.
The candidate pool and venue discovery both scale with trip length, which is
what starved days 8-12 of a long trip. A 12-day plan prints 12 days; a 7-day
plan prints 7.

### Destinations resolve to somewhere you can stay
"Jackson Hole" resolves to Jackson, Wyoming rather than Jackson Hole Airport,
and "northern Minnesota" resolves to a base town like Ely instead of a region
centroid. Airports, states, countries and wilderness areas are rejected.

### Things to do are ranked by popularity
Attraction lists are scored by rating weighted by review count, so a landmark
with 50,000 reviews outranks an obscure high-rated cafe. The list shows the top
10 with a toggle for the rest.

### Backend moved from Supabase to Cloudflare D1
**Breaking (infrastructure).** All persistence runs on Cloudflare D1, bound
directly into Pages Functions as `env.DB`. Supabase and PostgREST are gone.
D1 never pauses for inactivity, which repeatedly took the free-tier Supabase
project offline. Existing data was migrated with no loss. Deploys now require
the D1 binding in `wrangler.toml` plus the Google Places, Tripadvisor, Brave
and OpenAI secrets set on the Pages project.

### Fixed
- **Discovery no longer gives up when a request names no activities.** "12 day
  trip to Dublin for a father and son, the son is turning 21" extracts a party
  and an occasion but no interests, and the discovery endpoint rejected the
  empty string, so the whole web-grounded step silently no-opped and the trip
  fell back to the generic nearby pool. Interests are now derived from the
  occasion, party and audience when none are stated. The same request now
  returns 39 verified pub, whiskey and nightlife venues.
- Discovery failures are logged instead of swallowed, so a degraded plan is
  visible rather than looking like a bad planner.

### Under the hood
- New `functions/lib/db.ts` D1 data layer; `d1/schema.sql` ports the Postgres
  schema to SQLite.
- New `functions/lib/webSearch.ts`, `functions/lib/aiDiscover.ts` and the
  `/api/discover-venues` endpoint; results cached per destination and profile
  so repeat trips pay nothing.
- New `simulations/` harness (`npm run sim`) with tuned and held-out scenarios
  for measuring plan quality. Not part of CI, since it calls paid APIs.
- 543 automated tests; typecheck, tests and build gate every push.

## v10.0.0 — Mobile-first, end to end

A major milestone consolidating the v9.x line into a stable, phone-first
release. Everything below is live at https://trip-one.pages.dev.

### Highlights
- **A real mobile app shell.** A slim top bar (brand, live temperature, and a
  currency rate in the wordmark font), a five-tab bottom bar, and an
  **edge-to-edge map** — no more card-in-a-card boxing the map into a sliver.
  The chat is one tap away via a floating button.
- **Start a new trip from anywhere.** A "New trip" tab in the nav and a
  "＋ Start a new trip" button in the chat jump to the homepage location
  picker; your current trip stays saved at its own link.
- **A processing screen while a trip builds.** Planning from the homepage shows
  a full-screen overlay with animated map pins and a live status
  ("Finding real places in Rome…") instead of a silent disabled button.
- **Place details that behave on mobile.** The detail sheet has a pinned header
  (always-reachable close) and a pinned action footer, capped to the screen and
  scrolling inside itself.
- **Nearby search stays nearby.** On-demand chat search is hard-filtered to the
  trip's vicinity, so "add an aquarium" near Corfu never returns one in Florida.
- Refreshed navigation icons and brand-consistent chrome throughout.

### Under the hood
- Grounded generation (index-only, schema-validated LLM output) so the planner
  can only order real places, never invent them.
- Cloudflare Pages Functions proxy and cache every third-party API behind a
  Supabase cache and per-IP rate limits; keys never reach the browser.
- 469 automated tests; typecheck + tests + build gate every push via CI.

## v9.1.0 — Start a new trip + a real "building" state

### Added
- **Start a new trip from anywhere.** A "New trip" tab in the bottom/side nav
  and a "＋ Start a new trip" button in the chat both jump to the homepage to
  pick a new location — your current trip stays saved at its own link.
- **A processing screen while a trip builds.** Planning from the homepage (AI
  "Plan my trip" or "Go") now shows a full-screen overlay with animated map
  pins and a live status ("Finding real places in Rome…"), so a multi-second
  build clearly registers instead of a silent disabled button.

### Changed
- The Phrasebook nav tab is now labeled "Phrases" so five tabs sit comfortably
  on a phone.

## v9.0.2 — Full-bleed mobile map + brand chrome

### Changed
- **Full-width map on mobile.** The map was boxed inside a card inside a padded
  chapter card, wasting horizontal space. On phones the outer chapter chrome is
  now flat (no border/background) and the map bleeds edge-to-edge — the single
  biggest use of screen space — while day tabs, legend, and text keep their
  gutter.
- **Currency reads as brand chrome.** The top-bar rate now shows the real
  currency symbol in the wordmark's Sora font ("$1 = €0.87") instead of a mono
  data chip with the ISO code.
- **Refreshed navigation icons.** Lighter, cohesive line icons; Phrasebook now
  uses a translate mark so it no longer mirrors the Chat speech-bubble.

## v9.0.1 — Mobile top-bar currency fix

### Fixed
- **Currency fits the mobile top bar.** The converter rendered its editable
  input in the slim top bar, which pushed the "= 0.87 EUR" result off the right
  edge of the screen on narrower phones. The top bar now shows a compact static
  rate chip ("💱 $1 = 0.87 EUR"); the full interactive converter stays in the
  desktop header. (A mis-typed CSS class prefix had also stopped the earlier
  tightening rules from applying — corrected.)

## v9.0.0 — Mobile app shell

### Added
- **A real mobile app shell (map-forward).** On phones the trip is now framed
  by a slim top bar (brand, current temperature, currency) and a bottom tab bar,
  with the map given room to breathe between them. The layout is one cohesive
  design instead of stacked cards, and the chat is always one tap away via a
  floating button above the tabs.

### Fixed
- **Place details close and fit on mobile.** The place sheet (photos, reviews,
  hours) now has a pinned header with an always-visible close button and a
  pinned action footer, so the ✕ never scrolls away and "Add to day" / "Get
  Directions" never hide under the nav bar. The sheet is capped to the visible
  screen and scrolls inside itself.
- **Nearby search stays nearby.** Asking the chat to add a kind of place could
  return far-flung matches — a Florida or Cleveland aquarium for a Corfu trip —
  because Google's and Tripadvisor's location parameter only *biases* the search.
  Results are now hard-filtered to the trip's vicinity (within ~80 km), so an
  "added nearby" place is actually nearby.

### Changed
- Currency moved from the mobile bottom bar into the top bar, so the bottom bar
  is just navigation and the converter reads as part of the trip's chrome.

## v8.0.0 — Ask for any kind of place

### Added
- **On-demand nearby search — ask the chat for anything.** Ask for a cuisine
  (sushi, ramen, vegan), a venue type (rooftop bar, planetarium, night market),
  or a theme ("moon-related", "hidden gems") and the assistant finds real
  matching places nearby and adds them to the map and itinerary. It runs a live
  Google Places text search, with a **Tripadvisor fallback** (coordinate-enriched
  so results are map-able) for niche or thematic queries Google misses. The
  planner then places them on your days.

### Fixed
- **The chat no longer refuses.** Asking for "moon-related" or "space" stops used
  to get "I don't see any…" even when a space museum existed nearby — an old
  guardrail fought the search. Now any "add a kind of place" request always
  searches (translating themes to real place types) and never refuses; a real
  search finds it or confirms none exist. It still won't fake or substitute
  unrelated places.

### Changed
- **Unified header.** The nav links and the currency converter now live in one
  card (not two mismatched pills), with the current temperature on one line.
- Raised all API rate limits 10× for smoother use.

Chat routing was validated with a live eval across ~90 travel inputs
(`docs/CHAT-EVAL.md`) — ~96% classified as expected.

## v7.0.0 — Currency converter, live temp, real coffee, new wordmark

### Added
- **Currency converter in the header.** On non-US destinations, a compact
  USD → local converter sits in the trip header — type an amount, see the live
  local total (e.g. $1 = 6.77 CNY). Hidden for US/USD trips and when the rate
  can't be fetched.
- **Live temperature in the nav.** The Weather nav item now shows the
  destination's current temperature, so conditions are visible from any page
  without opening Weather.

### Fixed
- **"Add coffee shops" actually adds coffee shops.** Dedicated coffee shops
  carry Google's `cafe` type and rarely surfaced in the restaurant search, so
  they were never in the grounded candidate pool — the assistant would claim it
  added them while nothing changed. The Places search now includes cafes, and
  the chat is fenced from claiming it added a kind of place that isn't in the
  real nearby list.

### Changed
- **New wordmark** — the logo is now set in Sora with the emphasis carried by
  weight (light "Trip", bold "One") beside the Route Pin mark.

## v6.2.0 — Logo, chat length fix, hardening

### Fixed
- **"Change it to N days" in chat now actually works.** The chat prompt was
  hard-coded to the current day count and the plan was clamped back to it, so
  asking for 9 days kept 3. The chat now detects an explicit length request and
  re-plans for it, updating the day tabs and the length dropdown — not just the
  reply text.
- **Footer** — spacing between the Privacy and GitHub links (they were mashed
  together).

### Added
- **A real logo** — a route of stops leading into a destination pin, plus the
  wordmark; used in the homepage hero, footer, and favicon.
- **CI** — a GitHub Actions workflow runs typecheck + tests + build on every
  push and PR, with a status badge in the README.
- **Rate limits** on the previously-open endpoints: trip creation (30/hr),
  autocomplete (240/hr), and currency (120/hr), via a shared fail-open guard.
- A LinkedIn launch post draft in `docs/LAUNCH-POST.md`.

## v6.1.0 — Export and safer chat relocate

### Added
- **Export your trip.** A Print / PDF view (clean, chrome-free, full multi-day
  itinerary) and a downloadable **.ics calendar** file — timed stops become
  one-hour events, untimed stops become all-day events on their real date. The
  calendar export appears once a start date is set (an event needs a real date).

### Changed
- **Chat confirms before relocating.** When the assistant detects a destination
  change ("actually, make it Rome"), it now asks "Start a new trip to Rome?"
  with Yes/No instead of silently rebuilding and navigating away — your current
  plan stays put unless you confirm.

## v6.0.0 — Mobile shell, neural phrasebook audio, shareable metadata

A mobile-first pass and a much better phrasebook, plus the metadata a public site
needs to look right when shared.

### Added
- **Mobile bottom tab bar.** On phones the trip nav becomes a fixed bottom tab
  bar in the thumb zone — a real app shell — with safe-area padding; the chat FAB
  and toast lift above it and it hides behind the full-screen chat sheet.
- **Neural phrasebook audio.** The speaker button now plays a pre-generated
  Microsoft Edge neural-TTS clip per phrase (the same approach as the tokyo-one
  site) — far clearer than the browser's built-in voice, especially for CJK,
  Thai, Arabic, and other non-Latin scripts. Falls back to SpeechSynthesis if a
  clip can't load.
- **More phrases.** Each language's phrasebook grew from 8 to 15 phrases
  (goodbye, good morning, sorry, "I don't understand", "do you speak English?",
  cheers, "the check, please"), consistent across all 33 languages.
- **Shareable metadata.** Real page title + description, canonical URL, Open
  Graph and Twitter tags with a generated 1200×630 image, an SVG favicon, and a
  per-trip live title (`<destination> — Trip One`).
- **Per-day summary chips** on the Plan page ("3 sights · 2 food · 1 outdoors").
- **Loading skeletons** (shimmer map + rows) instead of a bare "Loading…".

### Changed
- **Tighter homepage.** Removed the dead vertical space between sections and the
  void above the "browse a place" column — the landing page uses its space far
  more efficiently.

## v5.1.0 — Tappable places, spoken phrasebook

### Added
- **Itinerary stops are links.** Every stop name — in the day list, under the map,
  and in the Overview "up next" and "nearby" previews — opens the rich place
  detail (photos, rating, reviews, hours, directions) instead of being plain text.
- **Spoken phrasebook.** Each phrase has a speaker button that pronounces it in
  the destination language's voice via the browser's speech synthesis (no audio
  files, works across all 30+ languages); the romanization is stripped so the
  native script is spoken. Hidden when the device has no speech support.

## v5.0.0 — Plan surfaces, editable itinerary, UTF-8 integrity

The trip page becomes a real planning tool: you can build and edit the
itinerary from anywhere in the app, not only through chat, and every AI change
is reviewable. A data-integrity fix repairs garbled non-Latin place names
across every destination.

### Added
- **Add to Day N from place detail.** The place sheet is a planning surface: add
  a place to a chosen day, or see "On Day N" with a remove control when it's
  already on the trip.
- **Editable itinerary rows.** A per-row editor sets a real clock time (`<input
  type="time">`), moves a stop to another day, and reorders it within the day —
  disclosed on demand so the list stays clean on mobile.
- **Things-to-do quality.** Filter nearby places by type (Food / Sights /
  Outdoors / Museums), sort by rating, hide unrated low-signal places by default,
  and badge places already on the trip.
- **Optional start date.** Unlocks day-date labels ("Day 2 · Sat, Jul 18") and
  date-aligned weather when the trip falls inside the forecast window.
- **Per-day walking effort.** Each day shows straight-line walking distance and
  time (haversine) and warns when it's spread across town.
- **Chat undo.** A chat-driven plan change lists what it added and offers one-tap
  Undo from the toast, restoring the exact prior itinerary.
- **Role badges and soft time slots** (Attraction / Meal / Break / Transit;
  Morning / Midday / Afternoon / Evening) so rows read as a plan, not raw data.
- **Share and recent trips** on the homepage.

### Fixed
- **Mojibake place names self-heal.** Some cached locations held place names
  mangled by an earlier UTF-8-lossy import (lone surrogates, e.g.
  `故宫\uDC8D物院`). Corrupt cached rows are now detected and re-fetched from
  Google Places, and any still-corrupt name is dropped before caching — fixing
  garbled names systemically for every affected city. The Beijing demo trip was
  repaired with the real names.

### Changed
- Chat is the single AI surface once a trip exists; the duplicate AI planner was
  removed. Homepage copy now matches what the app does.

## v4.1.0 — Portfolio metadata
Repository and site metadata polish for public release.

## v4.0.0 — Consolidated Plan page + real hourly weather
Map, day stops, and things-to-do unified into one Plan page; real hourly
weather links.

## v3.1.0 — Chat everywhere, pre-created trips
Persistent chat dock on every trip page; one-tap demo trips.

## v3.0.0 — Conversational assistant
Natural-language planning assistant with grounded generation.

## v2.0.0 — AI trip planning
Grounded, day-by-day itinerary generation from real places.

## v1.0.0 — Initial public release
