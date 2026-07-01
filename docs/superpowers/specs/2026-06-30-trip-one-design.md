# trip-one — generalized trip planner: design spec

**Date:** 2026-06-30
**Status:** approved for planning

## Purpose

A public, open-source trip-planning web app. A visitor enters any US state or
country/city and gets weather, an interactive map, an editable itinerary, and
real "things to do" search (Tripadvisor + Google Places), without an account.
Yellowstone and Tokyo ship as pre-built, explorable demo trips. The app offers
5 selectable visual designs, generalized and improved from `yellowstone-one`
and `tokyo-one` (both private, untouched by this work).

## Non-goals (v1)

- No user accounts / login. Trips are anonymous, identified by a shareable link.
- No offline-first / service-worker behavior — yellowstone's offline PWA model
  doesn't generalize cleanly to dynamic, user-supplied locations.
- No payment, booking, or checkout flows.

## Architecture

### Frontend
Vite + React 18 + TypeScript (strict mode), generalizing `yellowstone-one`'s
stack. Deployed to Cloudflare Pages, **Type B** (direct `wrangler pages deploy`
upload — matches the existing deploy pattern for both source projects; `git
push` does not deploy). Uses the existing `NewCloudFlareAccountToken` /
account `dd01b432f0329f87bb1cc1a3fad590ee`.

File structure is feature-split, not monolithic:
```
src/
  components/          shared UI (Nav, Header, LocationSearch, DesignSwitcher)
  themes/
    bento/              theme-scoped components + styles
    chronicle/
    field-guide/
    liquid-glass/
    trail-ledger/
  features/
    itinerary/          itinerary CRUD, drag-reorder
    map/                Leaflet + OSM tiles, marker logic
    weather/            Open-Meteo client, hooks
    things-to-do/       cached search results UI, add-to-itinerary
  lib/
    api/                typed clients for /api/* Worker endpoints
    supabase/           typed Supabase client (anon key only, read-scoped)
    validation/         Zod schemas for all user input
  hooks/
  data/
    demo-yellowstone.ts generalized, anonymized demo seed
    demo-tokyo.ts        generalized, anonymized demo seed
```

### Backend — Cloudflare Pages Functions
All calls to keyed/paid APIs (Tripadvisor, Google Places) go through Cloudflare
Pages Functions (`functions/api/*`). The frontend never holds these keys.

- `GET /api/location?q=<query>` — geocode via OSM Nominatim (free), normalize
  to a slug (e.g. `dublin-ireland`), check Supabase `locations` table.
  - Cache hit → return cached payload, no external API calls, no rate-limit
    check needed.
  - Cache miss → check `request_log` rate limit for the caller's hashed IP; if
    under the cap, call Tripadvisor (things to do) + Google Places
    (supplementary POIs/photos), merge results, upsert into `locations`,
    return payload. If over the cap, return 429 with a friendly message.
- `POST /api/trips` / `GET /api/trips/:id` / `PATCH /api/trips/:id` — thin
  CRUD over the `trips` table via the Supabase service-role key (server-side
  only, never exposed to the client).

Weather (Open-Meteo) and map tiles (Leaflet + OpenStreetMap) are free and
keyless — the frontend calls Open-Meteo directly; no proxy needed.

### Data model (Supabase — new, dedicated project)

- `locations` — `slug` (PK), `lat`, `lng`, `display_name`, `weather_baseline`
  (jsonb), `things_to_do` (jsonb, cached Tripadvisor + Places results),
  `last_refreshed` (timestamptz).
- `trips` — `id` (UUID PK, shareable), `location_slug` (FK), `itinerary`
  (jsonb — array of `{ time, text, type: 'fixed'|'travel'|'option', q?,
  inout? }`, mirroring yellowstone's itinerary item shape), `design_style`
  (enum of the 5 themes), `created_at`.
- `request_log` — `ip_hash`, `endpoint`, `created_at` — used only to compute
  rate-limit windows; IPs are hashed (HMAC with a server-side secret), never
  stored raw.

Row-level security: `locations` and `trips` are readable by the anon key
(needed for direct client reads where useful); all writes go through Pages
Functions using the service-role key, never the anon key.

### Anti-abuse
Cache-hit lookups are unlimited and free. Cache-miss (new-location generation)
is capped per hashed-IP per hour via `request_log`, enforced in the
`/api/location` Function before any external API call is made.

### Reliability: Supabase inactivity pause + backups
Supabase free-tier projects auto-pause after ~7 days with no activity, which
would silently break the cache and trips backend.

- **Keep-alive workflow** (`.github/workflows/supabase-keepalive.yml`): daily
  GitHub Actions cron runs a trivial query (e.g. `select 1 from locations
  limit 1`) against the project using a read-only key from GitHub secrets.
- **Backup workflow** (`.github/workflows/supabase-backup.yml`): weekly GitHub
  Actions cron exports `locations`, `trips`, and `request_log` to a
  timestamped JSON file under `backups/`, committed to the repo, using the
  Supabase service-role key from GitHub secrets. Keeps the last 8 weekly
  backups (~2 months); older ones are pruned to avoid unbounded repo growth.
- Both workflows follow the existing secrets rule: keys live only in GitHub
  repo secrets, never printed, logged, or committed in plaintext.

## Design system — 5 selectable themes

All five are mobile-first and built to the same component contract (a theme
implements the same set of screens: home/search, location overview, itinerary,
map, things-to-do) so switching themes never loses functionality.

1. **Bento** — generalized from yellowstone-one's "Old Faithful Bento": dense
   2-column tile grid, glanceable modules.
2. **Chronicle** — generalized from yellowstone-one's "Thermal Chronicle":
   vertical day-by-day timeline, editorial tone.
3. **Field Guide** — generalized from yellowstone-one's "Ranger Field Guide":
   map-hero with overlay cards, vintage-poster feel.
4. **Liquid Glass** — generalized and mobile-optimization-refined from
   tokyo-one's "iOS 26 Liquid Glass": frosted glassmorphism, blue gradient,
   light/dark.
5. **Trail Ledger** (new) — dense, minimal, list/table-driven, no card chrome;
   fills the structural gap since the other four are card/visual-based.

Theme choice is saved per-trip (`trips.design_style`) and switchable from a
picker; demo trips are viewable in any theme.

## Anonymization plan for demo content

`demo-yellowstone.ts` and `demo-tokyo.ts` are rebuilt from the source repos'
data with:
- All real family member names removed (e.g. names appearing in
  yellowstone-one's design docs and itinerary).
- All real confirmation/booking numbers removed (including the literal
  `2104874794COUNT` Enterprise confirmation — real but personal, not reused).
- All addresses tied to actual personal lodging bookings replaced with
  general, publicly-known reference points (e.g. "West Yellowstone area"
  rather than a specific rented address).
- All hostess-bar / adult-venue entries from tokyo-one's data removed
  entirely — demo Tokyo content keeps only general-audience POIs (Shibuya
  Crossing, Dotonbori, sumo, temples, general restaurant categories).
- Dates generalized or clearly marked as sample/demo dates, not tied to real
  travel dates.

## Feature inventory carried forward (generalized)

From yellowstone-one: overview/summary card, itinerary with directions links
(`gmapsDir`-equivalent), interactive Leaflet map with an offline-safe static
fallback, drive-time/logistics view, live weather (Open-Meteo) with seasonal
offline fallback, printable itinerary export.

From tokyo-one: interactive map with category-colored markers and photo
galleries, day-by-day walkthrough/playback mode, currency reference, transit
station info, common-phrases reference, "things to do" search (now backed by
real Tripadvisor/Places data instead of hand-curated JSON).

## Testing / verification plan

- Unit tests (Vitest) for: itinerary reducer logic, Zod validation schemas,
  the rate-limit window calculation, the location-slug normalizer.
- Integration test for the `/api/location` Function against a mocked
  Supabase + mocked Tripadvisor/Places response (cache-hit and cache-miss
  paths, and the 429 rate-limit path).
- Manual QA pass (per project's deployment rules): verify on the live
  Cloudflare Pages URL, not a preview URL; screenshot each of the 5 themes at
  mobile width; check browser console is clean; confirm the two GitHub Actions
  crons run green after first deploy.

## Open assumptions (flagged, not blocking)

- Repo name/path: `trip-one` at `C:/Users/brian/workspace/projects/trip-one`.
- New dedicated Supabase project will need to be created and its URL/keys
  added to Cloudflare Pages env bindings + GitHub repo secrets during
  implementation.
- Exact Tripadvisor/Google Places response fields to cache will be finalized
  against the real API responses during implementation (both keys already
  exist in the shared `.env`).
