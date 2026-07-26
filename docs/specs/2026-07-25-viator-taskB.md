# Spec: Viator experiences — Task B (surface + day capacity)

Task A built the backend (`/api/experiences`, destination-anchored, coordinate-grounded,
cached). Nothing is visible to a traveler yet. Task B surfaces it and makes the
planner reason about experience duration.

## Hard constraints (unchanged from Task A)

- Real data only. Never invent a price, duration, rating, coordinate, or currency.
- An experience with no confirmed currency must not display a price at all — an
  unlabeled number is worse than no number ("149" reads as USD when it may be JPY).
- Fails soft: no experiences → the trip builds exactly as it does today.
- No secrets in code/logs. Do not commit, push, or deploy. Do not touch `src/themes/**`.

## 1. Duration-aware day capacity (the prerequisite)

Nothing in the planner reasons about how long a stop takes. Today a 780-minute
Yellowstone day tour would be scheduled as one stop and `balanceDayFood` would
stack three restaurants on the same day. That produces a plausible-looking,
physically impossible itinerary — the exact failure the real-data rule exists to
prevent, just expressed in time rather than in facts.

New module `src/lib/itinerary/dayCapacity.ts`, pure and fully unit-tested:

- `FULL_DAY_MINUTES = 360`, `HALF_DAY_MINUTES = 240` (named, not inline).
- A day containing an experience of `>= FULL_DAY_MINUTES` gets **no other
  attractions**. Food is still allowed but capped at 1 (a full-day tour usually
  includes or displaces meals).
- A day containing an experience of `>= HALF_DAY_MINUTES` allows at most 1
  additional attraction.
- At most one experience per day.
- Stops with unknown duration keep today's behaviour exactly — do NOT assume a
  default duration for them.

Then wire it in: `balanceDayFood` in `functions/lib/aiPlan.ts` currently forces
at least 3 food stops per day. It must respect the cap above rather than
overriding it. Find every caller before changing the signature.

## 2. Candidate pool

`src/lib/places/candidatePool.ts` selects by role (themed / general / capped
food). Experiences are a fourth role and must not distort the existing balance:

- Reserve a small allocation — at most `EXPERIENCE_CANDIDATES_PER_DAY = 1`,
  capped at a fraction of the pool, so a destination with rich Viator inventory
  cannot crowd out real POIs.
- Experiences never count toward the food budget even when the experience is a
  food tour (it is an attraction that happens to involve food).
- Respect the existing `fitsAudience` filter.
- An empty experiences list must produce byte-identical pool output to today.
  Add a test that asserts exactly this.

## 3. Client data flow

- `src/lib/api/client.ts`: add `fetchExperiences(lat, lng, currency?)` posting to
  `/api/experiences`, matching the error handling of the existing helpers.
- Fetch alongside the existing interest-places call in the trip build. It must
  never block or fail the trip: an error yields an empty list.

## 4. UI

- An experience card showing: title, rating + review count, `priceFrom` **only
  when currency is confirmed**, duration ("about 3 hours" from real minutes,
  never rounded up into a claim), free-cancellation badge when the flag is set,
  and a "Book on Viator" link.
- The link opens in a new tab with `rel="sponsored noopener noreferrer"` —
  `sponsored` is required for a paid affiliate link.
- Experiences are visually distinguishable from POIs (they cost money and leave
  the site). Do not make them look like an ordinary itinerary stop.
- Mobile-first, WCAG 2.1 AA: 44px touch targets, real contrast, focus indicators.
- Follow the Chronicle theme's existing tokens; do not introduce new colours.

## 5. Affiliate disclosure (legally required, not optional)

`src/features/legal/TermsPage.tsx` currently says "Trip One is a free
trip-planning service" with no affiliate language, and `AboutPage.tsx` has none
either. Add plain-language disclosure:

- On both pages, and adjacent to booking links (not buried in a footer).
- State plainly that Trip One earns a commission when you book through a Viator
  link, at no extra cost to you.
- FTC requires it to be clear and conspicuous. Write it in the app's existing
  plain voice — no legalese, no banned words.

## Tests

Every new module unit-tested, matching existing suite style. At minimum:

- Full-day experience → no other attractions scheduled that day.
- Half-day → at most one more attraction.
- Unknown duration → behaviour identical to today.
- Empty experiences list → pool output byte-identical to today.
- Price with no confirmed currency → no price rendered.
- Booking link carries `rel="sponsored"`.

Run `npx tsc -b`, `npx vitest run`, `npm run build`; report real verbatim output.
