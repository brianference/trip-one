# trip-one Demo Content & Reliability Implementation Plan (Plan C of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship anonymized, explorable Yellowstone and Tokyo demo trips, plus
the operational safety net: Cloudflare security headers, a GitHub Actions
keep-alive cron (prevents Supabase's free-tier inactivity pause), a weekly
backup cron, and Dependabot.

**Architecture:** Demo content is plain TypeScript data seeded into the same
Supabase `locations`/`trips` tables Plan A defined, at two fixed, well-known
trip IDs so they're linkable from the search screen without a database
round-trip to discover them. Reliability is entirely GitHub Actions +
static Cloudflare config — no new runtime code paths.

**Tech Stack:** Same as Plans A/B, plus GitHub Actions YAML and one Node
seed script using `@supabase/supabase-js` (already a dependency from Plan A
context, added here for the script).

## Global Constraints

- Depends on Plan A (`itineraryItemSchema`, Supabase schema, `/api/health`)
  and Plan B (all 5 themes) being merged.
- No real personal data: no family names, no real confirmation/booking
  numbers, no addresses tied to actual personal bookings, no adult-venue
  entries. See the spec's "Anonymization plan for demo content" section.
- Secrets only via GitHub repo secrets — never printed, logged, or committed.
- Demo trips are read-only in the UI (editing a demo forks it into a new
  trip rather than mutating the shared demo row) — enforced in Task 3.

---

## Task 1: Anonymized Yellowstone demo data

**Files:**
- Create: `src/data/demo-yellowstone.ts`
- Create: `src/data/demo-yellowstone.test.ts`

**Interfaces:**
- Produces: `DEMO_YELLOWSTONE: { slug: string; lat: number; lng: number;
  displayName: string; itinerary: ItineraryItem[] }` — consumed by Task 3's
  seed script.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { itineraryItemSchema } from '../lib/validation/schemas'
import { DEMO_YELLOWSTONE } from './demo-yellowstone'

describe('DEMO_YELLOWSTONE', () => {
  it('every itinerary item passes validation', () => {
    for (const item of DEMO_YELLOWSTONE.itinerary) {
      expect(() => itineraryItemSchema.parse(item)).not.toThrow()
    }
  })

  it('contains no adult-venue or personal-booking content', () => {
    const text = JSON.stringify(DEMO_YELLOWSTONE).toLowerCase()
    for (const banned of ['confirmation', 'enterprise', 'count', 'nathan', 'lena']) {
      expect(text).not.toContain(banned)
    }
  })

  it('has a stable slug and coordinates', () => {
    expect(DEMO_YELLOWSTONE.slug).toBe('yellowstone-demo')
    expect(DEMO_YELLOWSTONE.lat).toBeCloseTo(44.6, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- demo-yellowstone`
Expected: FAIL — `Cannot find module './demo-yellowstone'`

- [ ] **Step 3: Implement `src/data/demo-yellowstone.ts`** (generalized —
  public park landmarks only, no real family names, no real confirmation
  numbers, no personal lodging address)

```ts
import type { ItineraryItem } from '../lib/validation/schemas'

export const DEMO_YELLOWSTONE: {
  slug: string
  lat: number
  lng: number
  displayName: string
  itinerary: ItineraryItem[]
} = {
  slug: 'yellowstone-demo',
  lat: 44.6,
  lng: -110.5,
  displayName: 'Yellowstone National Park, Wyoming',
  itinerary: [
    { time: '08:00', text: 'Breakfast near West Yellowstone', type: 'fixed' },
    { time: '09:30', text: 'Drive to Old Faithful', type: 'travel', q: 'Old Faithful, Yellowstone National Park' },
    { time: '10:30', text: 'Watch Old Faithful erupt', type: 'fixed', q: 'Old Faithful, Yellowstone National Park' },
    { time: '12:00', text: 'Lunch at Old Faithful Inn', type: 'option' },
    { time: '14:00', text: 'Hayden Valley wildlife viewing', type: 'option', q: 'Hayden Valley, Yellowstone' },
    { time: '17:00', text: 'Sunset at Grand Prismatic overlook', type: 'option', q: 'Grand Prismatic Spring' },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- demo-yellowstone`
Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/data/demo-yellowstone.ts src/data/demo-yellowstone.test.ts
git commit -m "Add anonymized Yellowstone demo data"
```

---

## Task 2: Anonymized Tokyo demo data

**Files:**
- Create: `src/data/demo-tokyo.ts`
- Create: `src/data/demo-tokyo.test.ts`

**Interfaces:** same shape as Task 1's `DEMO_YELLOWSTONE`, exported as
`DEMO_TOKYO`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { itineraryItemSchema } from '../lib/validation/schemas'
import { DEMO_TOKYO } from './demo-tokyo'

describe('DEMO_TOKYO', () => {
  it('every itinerary item passes validation', () => {
    for (const item of DEMO_TOKYO.itinerary) {
      expect(() => itineraryItemSchema.parse(item)).not.toThrow()
    }
  })

  it('contains no adult-venue, hostess-bar, or personal-address content', () => {
    const text = JSON.stringify(DEMO_TOKYO).toLowerCase()
    for (const banned of ['hostess', 'luxe shinjuku', 'origin hostess', 'vrbo', 'okubo']) {
      expect(text).not.toContain(banned)
    }
  })

  it('has a stable slug and coordinates', () => {
    expect(DEMO_TOKYO.slug).toBe('tokyo-demo')
    expect(DEMO_TOKYO.lat).toBeCloseTo(35.68, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- demo-tokyo`
Expected: FAIL — `Cannot find module './demo-tokyo'`

- [ ] **Step 3: Implement `src/data/demo-tokyo.ts`** (general-audience POIs
  only — no hostess bars, no real personal lodging address)

```ts
import type { ItineraryItem } from '../lib/validation/schemas'

export const DEMO_TOKYO: {
  slug: string
  lat: number
  lng: number
  displayName: string
  itinerary: ItineraryItem[]
} = {
  slug: 'tokyo-demo',
  lat: 35.6812,
  lng: 139.7671,
  displayName: 'Tokyo, Japan',
  itinerary: [
    { time: '08:00', text: 'Breakfast near Shinjuku', type: 'fixed' },
    { time: '10:00', text: 'Shibuya Crossing', type: 'fixed', q: 'Shibuya Crossing, Tokyo' },
    { time: '12:00', text: 'Ramen lunch in Shibuya', type: 'option' },
    { time: '14:00', text: 'Meiji Jingu Shrine', type: 'option', q: 'Meiji Jingu, Tokyo' },
    { time: '16:00', text: 'Samurai Museum', type: 'option', q: 'Samurai Museum Shinjuku' },
    { time: '19:00', text: 'Dinner in Shinjuku', type: 'fixed' },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- demo-tokyo`
Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/data/demo-tokyo.ts src/data/demo-tokyo.test.ts
git commit -m "Add anonymized Tokyo demo data"
```

---

## Task 3: Seed script + read-only demo forking + "Explore a demo" entry point

**Files:**
- Create: `scripts/seed-demos.mjs`
- Create: `src/lib/api/demoIds.ts` + `.test.ts`
- Modify: `src/themes/bento/SearchScreen.tsx` (representative theme; the
  same two-link addition applies to the other 4 themes' `SearchScreen`s from
  Plan B, each getting the identical `DEMO_LINKS` block)
- Modify: `src/lib/api/client.ts` (fork-on-edit helper)
- Create: `src/lib/api/client.test.ts` additions (new test cases in the
  existing file)

**Interfaces:**
- Consumes: `DEMO_YELLOWSTONE`, `DEMO_TOKYO` (Tasks 1-2), `createTrip`
  (Plan A Task 12).
- Produces: `DEMO_TRIP_IDS: { yellowstone: string; tokyo: string }` (fixed
  UUIDs, `src/lib/api/demoIds.ts`) and `forkTrip(sourceTripId: string):
  Promise<Trip>` added to `src/lib/api/client.ts` — creates a new trip
  copying the source's location and itinerary, used whenever a user edits a
  demo.

- [ ] **Step 1: Write the failing test for `demoIds.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { DEMO_TRIP_IDS } from './demoIds'

describe('DEMO_TRIP_IDS', () => {
  it('has a fixed UUID for each demo', () => {
    expect(DEMO_TRIP_IDS.yellowstone).toMatch(/^[0-9a-f-]{36}$/)
    expect(DEMO_TRIP_IDS.tokyo).toMatch(/^[0-9a-f-]{36}$/)
    expect(DEMO_TRIP_IDS.yellowstone).not.toBe(DEMO_TRIP_IDS.tokyo)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- demoIds`
Expected: FAIL — `Cannot find module './demoIds'`

- [ ] **Step 3: Implement `src/lib/api/demoIds.ts`**

```ts
export const DEMO_TRIP_IDS = {
  yellowstone: '00000000-0000-4000-8000-000000000001',
  tokyo: '00000000-0000-4000-8000-000000000002',
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- demoIds`
Expected: PASS — 1 test passed

- [ ] **Step 5: Write the failing test for `forkTrip` (add to existing
  `src/lib/api/client.test.ts`)**

```ts
it('forkTrip creates a new trip copying the source location and itinerary', async () => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith('/api/trips/demo-1') && (!init || init.method === undefined)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'demo-1', location_slug: 'tokyo-demo', itinerary: [{ time: '08:00', text: 'X', type: 'fixed' }], design_style: 'bento' }),
      })
    }
    if (String(url) === '/api/trips' && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'new-trip', location_slug: 'tokyo-demo', itinerary: [{ time: '08:00', text: 'X', type: 'fixed' }], design_style: 'bento' }),
      })
    }
    throw new Error(`unexpected call to ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const forked = await forkTrip('demo-1')
  expect(forked.id).toBe('new-trip')
  expect(forked.itinerary).toEqual([{ time: '08:00', text: 'X', type: 'fixed' }])
})
```

Also add `forkTrip` to the existing imports line at the top of the test file.

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- lib/api/client`
Expected: FAIL — `forkTrip is not exported`

- [ ] **Step 7: Add `forkTrip` to `src/lib/api/client.ts`**

```ts
export async function forkTrip(sourceTripId: string): Promise<Trip> {
  const source = await getTrip(sourceTripId)
  const forked = await createTrip(source.locationSlug)
  return updateTrip(forked.id, { itinerary: source.itinerary, designStyle: source.designStyle })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- lib/api/client`
Expected: PASS — 6 tests passed (5 from Plan A + this one)

- [ ] **Step 9: Add demo links to `src/themes/bento/SearchScreen.tsx`**
  (append below the existing form; the same block is copied verbatim into
  the other 4 themes' `SearchScreen.tsx` from Plan B)

```tsx
import { DEMO_TRIP_IDS } from '../../lib/api/demoIds'
```

Add inside the returned JSX, after the closing `</form>`:

```tsx
<nav aria-label="Explore a demo">
  <p>Or explore a demo:</p>
  <Link to={`/trip/${DEMO_TRIP_IDS.yellowstone}`}>Yellowstone</Link>
  <Link to={`/trip/${DEMO_TRIP_IDS.tokyo}`}>Tokyo</Link>
</nav>
```

(Add `import { Link } from 'react-router-dom'` to the existing import list.)

- [ ] **Step 10: Write `scripts/seed-demos.mjs`**

```js
import { createClient } from '@supabase/supabase-js'
import { DEMO_TRIP_IDS } from '../src/lib/api/demoIds.ts'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(url, serviceKey)

const demos = [
  {
    id: DEMO_TRIP_IDS.yellowstone,
    module: './src/data/demo-yellowstone.ts',
    exportName: 'DEMO_YELLOWSTONE',
  },
  {
    id: DEMO_TRIP_IDS.tokyo,
    module: './src/data/demo-tokyo.ts',
    exportName: 'DEMO_TOKYO',
  },
]

for (const demo of demos) {
  const mod = await import(demo.module)
  const data = mod[demo.exportName]

  const { error: locError } = await supabase.from('locations').upsert({
    slug: data.slug,
    lat: data.lat,
    lng: data.lng,
    display_name: data.displayName,
    things_to_do: [],
  })
  if (locError) throw locError

  const { error: tripError } = await supabase.from('trips').upsert({
    id: demo.id,
    location_slug: data.slug,
    itinerary: data.itinerary,
    design_style: 'bento',
  })
  if (tripError) throw tripError

  console.log(`Seeded ${data.slug} at trip id ${demo.id}`)
}
```

- [ ] **Step 11: Run the seed script against the real Supabase project**

Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demos.mjs`
Expected: `Seeded yellowstone-demo at trip id 00000000-...0001` and the same
for tokyo-demo

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 13: Commit**

```bash
git add scripts/seed-demos.mjs src/lib/api/demoIds.ts src/lib/api/demoIds.test.ts \
        src/lib/api/client.ts src/lib/api/client.test.ts src/themes/bento/SearchScreen.tsx
git commit -m "Add demo seed script, forkTrip, and demo entry links"
```

- [ ] **Step 14: Repeat Step 9's demo-links addition** in
  `src/themes/chronicle/SearchScreen.tsx`,
  `src/themes/field-guide/SearchScreen.tsx`,
  `src/themes/liquid-glass/SearchScreen.tsx`, and
  `src/themes/trail-ledger/SearchScreen.tsx`, then commit:

```bash
git add src/themes/chronicle/SearchScreen.tsx src/themes/field-guide/SearchScreen.tsx \
        src/themes/liquid-glass/SearchScreen.tsx src/themes/trail-ledger/SearchScreen.tsx
git commit -m "Add demo entry links to remaining 4 themes' search screens"
```

---

## Task 4: Cloudflare `_headers` security file

**Files:**
- Create: `public/_headers`

- [ ] **Step 1: Create `public/_headers`**

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.open-meteo.com https://nominatim.openstreetmap.org; img-src 'self' https://*.tile.openstreetmap.org data:; style-src 'self' 'unsafe-inline'
```

- [ ] **Step 2: Verify after the next deploy**

Run: `curl -sI https://trip-one.pages.dev/ | grep -i x-frame-options`
Expected: `x-frame-options: DENY`

- [ ] **Step 3: Commit**

```bash
git add public/_headers
git commit -m "Add Cloudflare Pages security headers"
```

---

## Task 5: GitHub Actions keep-alive workflow

**Files:**
- Create: `.github/workflows/supabase-keepalive.yml`

- [ ] **Step 1: Create `.github/workflows/supabase-keepalive.yml`**

```yaml
name: Supabase keep-alive

on:
  schedule:
    - cron: '0 14 * * *'
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping /api/health
        run: |
          status=$(curl -s -o /dev/null -w "%{http_code}" https://trip-one.pages.dev/api/health)
          echo "Health check returned $status"
          if [ "$status" != "200" ]; then
            echo "::error::Health check failed with status $status"
            exit 1
          fi
```

- [ ] **Step 2: Verify it runs**

Run: `gh workflow run supabase-keepalive.yml && gh run watch`
Expected: workflow completes with conclusion `success`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/supabase-keepalive.yml
git commit -m "Add daily Supabase keep-alive workflow"
```

---

## Task 6: GitHub Actions weekly backup workflow

**Files:**
- Create: `.github/workflows/supabase-backup.yml`
- Create: `.github/scripts/backup-supabase.mjs`

**Constraint:** no heredocs inside the workflow's `run:` blocks — the script
lives in `.github/scripts/` and is invoked directly, per this project's
CI/CD convention.

- [ ] **Step 1: Create `.github/scripts/backup-supabase.mjs`**

```js
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, serviceKey)

const tables = ['locations', 'trips', 'request_log']
const dump = {}
for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw error
  dump[table] = data
}

const timestamp = process.env.BACKUP_TIMESTAMP
const filename = `backups/${timestamp}.json`
writeFileSync(filename, JSON.stringify(dump, null, 2))
console.log(`Wrote ${filename}`)

const files = readdirSync('backups')
  .filter((f) => f.endsWith('.json'))
  .sort()
const KEEP = 8
if (files.length > KEEP) {
  for (const file of files.slice(0, files.length - KEEP)) {
    unlinkSync(`backups/${file}`)
    console.log(`Pruned backups/${file}`)
  }
}
```

- [ ] **Step 2: Create `.github/workflows/supabase-backup.yml`**

```yaml
name: Supabase weekly backup

on:
  schedule:
    - cron: '0 5 * * 1'
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install @supabase/supabase-js
      - run: mkdir -p backups
      - name: Run backup script
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          BACKUP_TIMESTAMP: ${{ github.run_id }}
        run: node .github/scripts/backup-supabase.mjs
      - name: Commit backup
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add backups/
          git diff --cached --quiet || git commit -m "Weekly Supabase backup"
          git push
```

- [ ] **Step 3: Add repo secrets** (via GitHub API/CLI, mirroring the
  project's existing secrets-to-GitHub rule)

Run: `gh secret set SUPABASE_URL --body "<value>"` and
`gh secret set SUPABASE_SERVICE_ROLE_KEY --body "<value>"`
(values come from the same Supabase project created in Plan A Task 16 —
never printed to logs or committed)

- [ ] **Step 4: Verify it runs**

Run: `gh workflow run supabase-backup.yml && gh run watch`
Expected: workflow completes, a new file appears under `backups/`

- [ ] **Step 5: Commit the workflow + script**

```bash
git add .github/workflows/supabase-backup.yml .github/scripts/backup-supabase.mjs
git commit -m "Add weekly Supabase backup workflow with 8-backup retention"
```

---

## Task 7: GitHub Dependabot

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "Enable Dependabot for npm and GitHub Actions dependencies"
```

---

## Task 8: Full-app verification

**Files:** none created — verification task only.

- [ ] **Step 1: Deploy the complete app**

Run: `npm run build && npx wrangler pages deploy dist --project-name=trip-one --branch=main`

- [ ] **Step 2: Verify both demos load** — visit
  `https://trip-one.pages.dev/trip/00000000-0000-4000-8000-000000000001`
  (Yellowstone) and `.../000000000002` (Tokyo); confirm itinerary, map, and
  weather render for each.

- [ ] **Step 3: Verify a fresh location end-to-end** — search a location not
  yet cached (e.g. a small city), confirm it geocodes, populates things-to-do
  from Tripadvisor/Places, and re-searching the same location is instant
  (cache hit, check via Network tab that `/api/location` is fast and no
  external calls are re-triggered server-side).

- [ ] **Step 4: Verify each of the 5 themes** via the theme switcher, at
  375px width, with a clean browser console.

- [ ] **Step 5: Verify the security headers**

Run: `curl -sI https://trip-one.pages.dev/`
Expected: response includes `x-frame-options: deny` and
`content-security-policy: ...`

- [ ] **Step 6: Confirm both GitHub Actions workflows are green** in the
  Actions tab, and Dependabot is enabled under repo Settings → Security.

- [ ] **Step 7: This is the "project is created" checkpoint** — per the
  design spec's Post-implementation QA phase, report completion and wait for
  explicit go-ahead before spinning up the 6-agent review team (System
  Architect, UX Designer, 2 Customer Simulators covering 5 journeys, Bug/Code
  Reviewer, Best-Practices Author).
