# Planner simulations

Measures what the trip planner actually produces, end to end, against real APIs.

It exists because "the plan is mostly restaurants" is not a bug you can unit
test. The planner's quality is an emergent property of a geocode, two place
searches, a prompt, and a model — so the only honest way to know whether a
change helps is to run the real pipeline over real destinations and count.

```bash
npm run sim                        # every scenario
npm run sim -- --only moab-biking  # one scenario
npm run sim -- --out report.json   # also write the raw per-stop data
```

## This costs real money

It is **not** part of `npm test` and never runs in CI. Each scenario makes
several OpenAI calls and up to a dozen paid Google Places calls. A full
9-scenario run is on the order of a few dollars. Run it when you change the
planner, not on every commit.

Keys are read from `.dev.vars` and the shared workspace env; they are never
logged.

## What it measures

| metric | meaning |
| --- | --- |
| `pool food` | share of the candidate pool that is food — the planner can only pick what it's given |
| `plan food` | share of the finished itinerary that is food — the number the traveler feels |
| `on-theme` | share of non-food stops the judge scores 2+ against the stated theme |
| `relevance` | mean 0–3 judge score across every stop |
| `stops` | total stops — a low-food trip that is also an empty trip is not a win |

Results are grouped into **activity-led** and **food-led** trips. Food *should*
dominate a Napa wine trip, so averaging the two together would hide both a
regression and an improvement. The food-led scenarios are the control group: a
change that drives food down everywhere is breaking them, not fixing anything.

`on-theme` reads `n/a` for food-led trips, which have few non-food stops to
score.

## Known limits

- The judge is an LLM, so scores move a little run to run. Treat a 1–2 point
  shift as noise; the food shares are deterministic and don't move.
- Bars count as food, so a Nashville honky-tonk trip reads ~50% "food" even
  though the bars *are* the live-music venues it asked for.
- Scenarios hit the live Supabase location cache, so the nearby pool for a
  destination is whatever was cached for it.
