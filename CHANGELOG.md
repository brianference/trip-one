# Changelog

All notable changes to Trip One. Versions follow the app's release tags; each
tag has a matching GitHub Release. Live at https://trip-one.pages.dev.

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
