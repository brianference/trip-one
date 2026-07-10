# Changelog

All notable changes to Trip One. Versions follow the app's release tags; each
tag has a matching GitHub Release. Live at https://trip-one.pages.dev.

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
