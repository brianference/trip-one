# trip-one Foundation Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working, deployable trip-one: Supabase schema, Cloudflare
Pages Functions backend (health, location cache/rate-limit proxy, trips
CRUD), the shared frontend shell (store, error boundaries, routing), and one
fully working theme (Bento) end to end — search a location, view weather,
map, itinerary, and things-to-do.

**Architecture:** Vite + React 18 + TypeScript (strict) frontend, Cloudflare
Pages Functions backend proxying Tripadvisor/Google Places behind a Supabase
cache with per-IP rate limiting on cache misses. Zustand holds trip/itinerary
state shared across themes. Plan B adds the other 4 themes against the
contract this plan establishes; Plan C adds anonymized demo content and
reliability workflows.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + @testing-library/react,
Zustand, Zod, Leaflet (plain, not react-leaflet — matches yellowstone-one's
pattern), Cloudflare Pages Functions, Supabase JS v2, Open-Meteo (keyless),
OSM Nominatim (keyless geocoding).

## Global Constraints

- TypeScript strict mode (`"strict": true`) everywhere.
- No hardcoded secrets — Cloudflare env bindings locally via `.dev.vars`
  (gitignored), production secrets set via `wrangler pages secret put`.
- Zod validation on every external input (API query params, request bodies).
- No `console.log` in shipped code — use `src/lib/logger.ts` (Task 1).
- Feature-split files: `components/`, `features/<name>/`, `lib/`, `store/`,
  `hooks/` — no file grows into a catch-all.
- Cache-hit location lookups: unlimited, free, no rate-limit check.
- Cache-miss location lookups: capped per hashed-IP per hour via
  `request_log`, checked before any external API call.
- Cloudflare Pages deploy is **Type B**: `wrangler pages deploy`, `git push`
  does not deploy.
- All UI is mobile-first (test at 375px minimum).

---

## Task 1: Project scaffold + logger + smoke test

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/lib/logger.ts`
- Create: `src/lib/logger.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: `logger.info(msg: string, meta?: Record<string, unknown>): void`,
  `logger.warn(...)`, `logger.error(msg: string, err?: unknown): void` — used
  by every later task instead of `console.log`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "trip-one",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.1",
    "zod": "^3.23.8",
    "leaflet": "^1.9.4",
    "@supabase/supabase-js": "^2.45.4"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.12",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src", "functions"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

Also create `src/test-setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>trip-one</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Write the failing smoke test — `src/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByText(/trip-one/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm install && npm test`
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 8: Create minimal `src/App.tsx`**

```tsx
export default function App() {
  return <div>trip-one</div>
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 1 test passed

- [ ] **Step 10: Write the failing logger test — `src/lib/logger.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('info writes a structured line to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    logger.info('hello', { foo: 'bar' })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(line).toMatchObject({ level: 'info', msg: 'hello', foo: 'bar' })
  })

  it('error includes the error message', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logger.error('failed', new Error('boom'))
    const line = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(line).toMatchObject({ level: 'error', msg: 'failed', error: 'boom' })
  })
})
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npm test -- logger`
Expected: FAIL — `Cannot find module './logger'`

- [ ] **Step 12: Implement `src/lib/logger.ts`**

```ts
type Level = 'info' | 'warn' | 'error'

function write(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta })
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(line + '\n')
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, err?: unknown) =>
    write('error', msg, { error: err instanceof Error ? err.message : String(err) }),
}
```

- [ ] **Step 13: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 3 tests passed

- [ ] **Step 14: Create `.gitignore`**

```
node_modules/
dist/
.dev.vars
.env
*.local
```

- [ ] **Step 15: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src .gitignore
git commit -m "Scaffold Vite+React+TS project with structured logger"
```

---

## Task 2: Zod validation schemas

**Files:**
- Create: `src/lib/validation/schemas.ts`
- Create: `src/lib/validation/schemas.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module)
- Produces: `locationQuerySchema: z.ZodSchema<string>`,
  `itineraryItemSchema: z.ZodSchema<ItineraryItem>`, and the TS type
  `ItineraryItem = { time: string; text: string; type: 'fixed' | 'travel' |
  'option'; q?: string; inout?: string }`. Later tasks import both the
  schemas and the `ItineraryItem` type from this file.

- [ ] **Step 1: Write the failing tests — `src/lib/validation/schemas.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { locationQuerySchema, itineraryItemSchema } from './schemas'

describe('locationQuerySchema', () => {
  it('accepts a normal location string', () => {
    expect(locationQuerySchema.parse('Dublin, Ireland')).toBe('Dublin, Ireland')
  })

  it('rejects an empty string', () => {
    expect(() => locationQuerySchema.parse('')).toThrow()
  })

  it('rejects a string over 200 chars', () => {
    expect(() => locationQuerySchema.parse('a'.repeat(201))).toThrow()
  })
})

describe('itineraryItemSchema', () => {
  it('accepts a minimal fixed item', () => {
    const item = { time: '09:00', text: 'Breakfast', type: 'fixed' as const }
    expect(itineraryItemSchema.parse(item)).toEqual(item)
  })

  it('accepts optional q and inout', () => {
    const item = {
      time: '09:00',
      text: 'Museum',
      type: 'option' as const,
      q: 'National Museum Dublin',
      inout: '9:00a · 11:00a',
    }
    expect(itineraryItemSchema.parse(item)).toEqual(item)
  })

  it('rejects an invalid type', () => {
    const bad = { time: '09:00', text: 'X', type: 'nonsense' }
    expect(() => itineraryItemSchema.parse(bad)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- schemas`
Expected: FAIL — `Cannot find module './schemas'`

- [ ] **Step 3: Implement `src/lib/validation/schemas.ts`**

```ts
import { z } from 'zod'

export const locationQuerySchema = z.string().trim().min(1).max(200)

export const itineraryItemSchema = z.object({
  time: z.string(),
  text: z.string().min(1).max(300),
  type: z.enum(['fixed', 'travel', 'option']),
  q: z.string().max(200).optional(),
  inout: z.string().max(100).optional(),
})

export type ItineraryItem = z.infer<typeof itineraryItemSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- schemas`
Expected: PASS — 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation
git commit -m "Add Zod schemas for location query and itinerary items"
```

---

## Task 3: Location slug normalizer

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/lib/slug.test.ts`

**Interfaces:**
- Produces: `normalizeLocationSlug(input: string): string` — used by
  Task 8 (backend `/api/location`) and Task 12 (frontend API client) as the
  cache key for the `locations` table.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeLocationSlug } from './slug'

describe('normalizeLocationSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(normalizeLocationSlug('Dublin, Ireland')).toBe('dublin-ireland')
  })

  it('collapses repeated whitespace', () => {
    expect(normalizeLocationSlug('New   York,   USA')).toBe('new-york-usa')
  })

  it('strips diacritics', () => {
    expect(normalizeLocationSlug('São Paulo, Brazil')).toBe('sao-paulo-brazil')
  })

  it('strips punctuation other than hyphens', () => {
    expect(normalizeLocationSlug("Cœur d'Alene, Idaho!")).toBe('coeur-d-alene-idaho')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- slug`
Expected: FAIL — `Cannot find module './slug'`

- [ ] **Step 3: Implement `src/lib/slug.ts`**

```ts
export function normalizeLocationSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- slug`
Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "Add location slug normalizer"
```

---

## Task 4: Rate-limit window helper

**Files:**
- Create: `src/lib/rateLimit.ts`
- Create: `src/lib/rateLimit.test.ts`

**Interfaces:**
- Produces: `isUnderRateLimit(recentCount: number, limitPerHour: number):
  boolean` and `hashIp(ip: string, salt: string): string` (sync, uses Web
  Crypto-compatible SHA-256 via `crypto.subtle` — available in both browser
  and Cloudflare Workers runtime). Used by Task 8's `/api/location` Function.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { isUnderRateLimit, hashIp } from './rateLimit'

describe('isUnderRateLimit', () => {
  it('allows when under the cap', () => {
    expect(isUnderRateLimit(3, 10)).toBe(true)
  })

  it('blocks when at the cap', () => {
    expect(isUnderRateLimit(10, 10)).toBe(false)
  })

  it('blocks when over the cap', () => {
    expect(isUnderRateLimit(11, 10)).toBe(false)
  })
})

describe('hashIp', () => {
  it('produces a stable, non-reversible hex hash', async () => {
    const a = await hashIp('203.0.113.1', 'test-salt')
    const b = await hashIp('203.0.113.1', 'test-salt')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain('203.0.113.1')
  })

  it('produces a different hash for a different salt', async () => {
    const a = await hashIp('203.0.113.1', 'salt-a')
    const b = await hashIp('203.0.113.1', 'salt-b')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rateLimit`
Expected: FAIL — `Cannot find module './rateLimit'`

- [ ] **Step 3: Implement `src/lib/rateLimit.ts`**

```ts
export function isUnderRateLimit(recentCount: number, limitPerHour: number): boolean {
  return recentCount < limitPerHour
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rateLimit`
Expected: PASS — 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rateLimit.ts src/lib/rateLimit.test.ts
git commit -m "Add rate-limit window check and IP hashing helper"
```

---

## Task 5: Supabase schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `scripts/verify-schema.mjs`

**Interfaces:**
- Produces: Postgres tables `locations`, `trips`, `request_log` — exact
  column names below are relied on by Task 6 (`supabaseAdmin.ts`) and Task 8.

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql`**

```sql
create table if not exists locations (
  slug text primary key,
  lat double precision not null,
  lng double precision not null,
  display_name text not null,
  weather_baseline jsonb,
  things_to_do jsonb,
  last_refreshed timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null references locations(slug),
  itinerary jsonb not null default '[]',
  design_style text not null default 'bento'
    check (design_style in ('bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger')),
  created_at timestamptz not null default now()
);

create table if not exists request_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_log_ip_hash_created_at_idx
  on request_log (ip_hash, created_at);

alter table locations enable row level security;
alter table trips enable row level security;
alter table request_log enable row level security;

create policy "locations readable by anon" on locations
  for select using (true);

create policy "trips readable by anon" on trips
  for select using (true);

-- request_log has no anon policy: only the service role (Functions) reads/writes it.
```

- [ ] **Step 2: Write `scripts/verify-schema.mjs`** (manual verification script,
  run once against the real Supabase project after creating it)

```js
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in the environment first.')
  process.exit(1)
}

const supabase = createClient(url, key)

for (const table of ['locations', 'trips']) {
  const { error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.error(`FAIL: ${table} —`, error.message)
    process.exit(1)
  }
  console.log(`OK: ${table} reachable`)
}
```

- [ ] **Step 3: Apply the migration against the new dedicated Supabase project**

Run (after creating the project in the Supabase dashboard and getting its
connection string):
```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```
Expected: `Applying migration 0001_init.sql... done`

- [ ] **Step 4: Verify the schema**

Run: `SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/verify-schema.mjs`
Expected: `OK: locations reachable` and `OK: trips reachable`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql scripts/verify-schema.mjs
git commit -m "Add initial Supabase schema migration"
```

---

## Task 6: Supabase admin client for Functions

**Files:**
- Create: `functions/lib/supabaseAdmin.ts`
- Create: `functions/lib/supabaseAdmin.test.ts`

**Interfaces:**
- Consumes: `Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY:
  string; RATE_LIMIT_SALT: string }` (Cloudflare Pages Function env bindings)
- Produces: `getLocationBySlug(env, slug): Promise<LocationRow | null>`,
  `upsertLocation(env, row: LocationRow): Promise<void>`,
  `countRecentRequests(env, ipHash: string, sinceIso: string):
  Promise<number>`, `insertRequestLog(env, ipHash: string, endpoint:
  string): Promise<void>`, `createTrip(env, row): Promise<TripRow>`,
  `getTrip(env, id): Promise<TripRow | null>`, `updateTrip(env, id,
  patch): Promise<TripRow>`. `LocationRow` and `TripRow` types are exported
  from this file and imported by Tasks 8 and 9.

- [ ] **Step 1: Write the failing tests — `functions/lib/supabaseAdmin.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLocationBySlug, upsertLocation, countRecentRequests } from './supabaseAdmin'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RATE_LIMIT_SALT: 'salt',
}

describe('supabaseAdmin', () => {
  afterEach(() => vi.restoreAllMocks())

  it('getLocationBySlug returns null on empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    )
    const result = await getLocationBySlug(env, 'nowhere')
    expect(result).toBeNull()
  })

  it('getLocationBySlug returns the row when found', async () => {
    const row = { slug: 'dublin-ireland', lat: 53.35, lng: -6.26, display_name: 'Dublin, Ireland' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [row] }))
    const result = await getLocationBySlug(env, 'dublin-ireland')
    expect(result).toEqual(row)
  })

  it('upsertLocation posts with the Prefer merge header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    await upsertLocation(env, {
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      display_name: 'Dublin, Ireland',
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Prefer).toContain('resolution=merge-duplicates')
  })

  it('countRecentRequests returns the count from Content-Range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-range': '*/7' }),
        json: async () => [],
      }),
    )
    const count = await countRecentRequests(env, 'somehash', new Date().toISOString())
    expect(count).toBe(7)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- supabaseAdmin`
Expected: FAIL — `Cannot find module './supabaseAdmin'`

- [ ] **Step 3: Implement `functions/lib/supabaseAdmin.ts`**

```ts
export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  RATE_LIMIT_SALT: string
}

export interface LocationRow {
  slug: string
  lat: number
  lng: number
  display_name: string
  weather_baseline?: unknown
  things_to_do?: unknown
  last_refreshed?: string
}

export interface TripRow {
  id: string
  location_slug: string
  itinerary: unknown[]
  design_style: string
  created_at: string
}

function headers(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export async function getLocationBySlug(env: Env, slug: string): Promise<LocationRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/locations?slug=eq.${encodeURIComponent(slug)}&select=*`,
    { headers: headers(env) },
  )
  const rows = (await res.json()) as LocationRow[]
  return rows[0] ?? null
}

export async function upsertLocation(env: Env, row: LocationRow): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/locations`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(row),
  })
}

export async function countRecentRequests(
  env: Env,
  ipHash: string,
  sinceIso: string,
): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/request_log?ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
    { headers: headers(env, { Prefer: 'count=exact' }) },
  )
  const range = res.headers.get('content-range') ?? '*/0'
  return Number(range.split('/')[1] ?? 0)
}

export async function insertRequestLog(env: Env, ipHash: string, endpoint: string): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/request_log`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ ip_hash: ipHash, endpoint }),
  })
}

export async function createTrip(
  env: Env,
  row: Pick<TripRow, 'location_slug' | 'itinerary' | 'design_style'>,
): Promise<TripRow> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}

export async function getTrip(env: Env, id: string): Promise<TripRow | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`, {
    headers: headers(env),
  })
  const rows = (await res.json()) as TripRow[]
  return rows[0] ?? null
}

export async function updateTrip(
  env: Env,
  id: string,
  patch: Partial<Pick<TripRow, 'itinerary' | 'design_style'>>,
): Promise<TripRow> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- supabaseAdmin`
Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add functions/lib/supabaseAdmin.ts functions/lib/supabaseAdmin.test.ts
git commit -m "Add Supabase admin client for Cloudflare Functions"
```

---

## Task 7: `/api/health` Function

**Files:**
- Create: `functions/api/health.ts`
- Create: `functions/api/health.test.ts`

**Interfaces:**
- Consumes: `Env` from Task 6.
- Produces: `onRequestGet(context: { env: Env }): Promise<Response>` — the
  route Cloudflare Pages Functions maps to `GET /api/health`. Also the target
  Plan C's keep-alive workflow pings.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './health'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  RATE_LIMIT_SALT: 'salt',
}

describe('GET /api/health', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 200 when Supabase responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('returns 503 when Supabase errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const res = await onRequestGet({ env } as never)
    expect(res.status).toBe(503)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- functions/api/health`
Expected: FAIL — `Cannot find module './health'`

- [ ] **Step 3: Implement `functions/api/health.ts`**

```ts
import type { Env } from '../lib/supabaseAdmin'
import { getLocationBySlug } from '../lib/supabaseAdmin'
import { logger } from '../../src/lib/logger'

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  try {
    await getLocationBySlug(env, '__healthcheck__')
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    logger.error('health check failed', err)
    return new Response(JSON.stringify({ status: 'error' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- functions/api/health`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add functions/api/health.ts functions/api/health.test.ts
git commit -m "Add /api/health Function"
```

---

## Task 8: `/api/location` Function (geocode, cache, rate-limit, Tripadvisor + Places)

**Files:**
- Create: `functions/lib/geocode.ts` + `.test.ts`
- Create: `functions/lib/tripadvisor.ts` + `.test.ts`
- Create: `functions/lib/places.ts` + `.test.ts`
- Create: `functions/lib/mergeThingsToDo.ts` + `.test.ts`
- Create: `functions/api/location.ts` + `.test.ts`

**Interfaces:**
- Consumes: `Env` (Task 6) extended with `TRIPADVISOR_API_KEY:
  string; GOOGLE_PLACES_API_KEY: string`; `normalizeLocationSlug` (Task 3);
  `isUnderRateLimit`, `hashIp` (Task 4); `getLocationBySlug`,
  `upsertLocation`, `countRecentRequests`, `insertRequestLog` (Task 6).
- Produces: `onRequestGet(context): Promise<Response>` for `GET
  /api/location?q=<query>`. Response body: `{ slug, lat, lng, displayName,
  thingsToDo: ThingToDo[] }` where `ThingToDo = { name: string; category:
  string; source: 'tripadvisor' | 'places'; rating?: number; address?:
  string }`. Consumed by Task 12 (frontend API client).

- [ ] **Step 1: Write the failing test for `functions/lib/geocode.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocode } from './geocode'

describe('geocode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns lat/lng/displayName for the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '53.3498', lon: '-6.2603', display_name: 'Dublin, Ireland' }],
      }),
    )
    const result = await geocode('Dublin, Ireland')
    expect(result).toEqual({ lat: 53.3498, lng: -6.2603, displayName: 'Dublin, Ireland' })
  })

  it('returns null when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await geocode('asdfghjkl')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- functions/lib/geocode`
Expected: FAIL — `Cannot find module './geocode'`

- [ ] **Step 3: Implement `functions/lib/geocode.ts`**

```ts
export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'trip-one (https://github.com)' } })
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  const first = rows[0]
  if (!first) return null
  return { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- functions/lib/geocode`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Write the failing test for `functions/lib/tripadvisor.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchThingsToDo } from './tripadvisor'

describe('tripadvisor searchThingsToDo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps results into the shared ThingToDo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ name: 'Trinity College', category: { name: 'attraction' }, rating: '4.6' }],
        }),
      }),
    )
    const results = await searchThingsToDo('dublin-ireland', 53.35, -6.26, 'test-key')
    expect(results).toEqual([
      { name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 },
    ])
  })

  it('returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await searchThingsToDo('x', 0, 0, 'k')).toEqual([])
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- functions/lib/tripadvisor`
Expected: FAIL — `Cannot find module './tripadvisor'`

- [ ] **Step 7: Implement `functions/lib/tripadvisor.ts`**

```ts
import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

export async function searchThingsToDo(
  slug: string,
  lat: number,
  lng: number,
  apiKey: string,
): Promise<ThingToDo[]> {
  try {
    const url = `https://api.content.tripadvisor.com/api/v1/location/search?key=${apiKey}&latLong=${lat}%2C${lng}&category=attractions`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      logger.warn('tripadvisor search non-ok response', { slug, status: res.status })
      return []
    }
    const body = (await res.json()) as { data: Array<{ name: string; category?: { name: string }; rating?: string }> }
    return (body.data ?? []).map((item) => ({
      name: item.name,
      category: item.category?.name ?? 'attraction',
      source: 'tripadvisor' as const,
      rating: item.rating ? Number(item.rating) : undefined,
    }))
  } catch (err) {
    logger.error('tripadvisor search failed', err)
    return []
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- functions/lib/tripadvisor`
Expected: PASS — 2 tests passed

- [ ] **Step 9: Write the failing test for `functions/lib/places.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces } from './places'

describe('places searchPlaces', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps results into the shared ThingToDo shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ name: 'Guinness Storehouse', types: ['tourist_attraction'], rating: 4.5, vicinity: 'St James Gate' }],
        }),
      }),
    )
    const results = await searchPlaces(53.35, -6.26, 'test-key')
    expect(results).toEqual([
      {
        name: 'Guinness Storehouse',
        category: 'tourist_attraction',
        source: 'places',
        rating: 4.5,
        address: 'St James Gate',
      },
    ])
  })

  it('returns an empty array on a non-ok response instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await searchPlaces(0, 0, 'k')).toEqual([])
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- functions/lib/places`
Expected: FAIL — `Cannot find module './places'`

- [ ] **Step 11: Implement `functions/lib/places.ts`**

```ts
import type { ThingToDo } from './mergeThingsToDo'
import { logger } from '../../src/lib/logger'

export async function searchPlaces(lat: number, lng: number, apiKey: string): Promise<ThingToDo[]> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=8000&type=tourist_attraction&key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn('places search non-ok response', { status: res.status })
      return []
    }
    const body = (await res.json()) as {
      results: Array<{ name: string; types: string[]; rating?: number; vicinity?: string }>
    }
    return (body.results ?? []).map((item) => ({
      name: item.name,
      category: item.types[0] ?? 'attraction',
      source: 'places' as const,
      rating: item.rating,
      address: item.vicinity,
    }))
  } catch (err) {
    logger.error('places search failed', err)
    return []
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- functions/lib/places`
Expected: PASS — 2 tests passed

- [ ] **Step 13: Write the failing test for `functions/lib/mergeThingsToDo.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mergeThingsToDo, type ThingToDo } from './mergeThingsToDo'

describe('mergeThingsToDo', () => {
  it('dedupes by lowercased name, preferring the tripadvisor entry', () => {
    const tripadvisor: ThingToDo[] = [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 }]
    const places: ThingToDo[] = [{ name: 'trinity college', category: 'tourist_attraction', source: 'places', rating: 4.4 }]
    const merged = mergeThingsToDo(tripadvisor, places)
    expect(merged).toEqual([{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor', rating: 4.6 }])
  })

  it('keeps non-overlapping entries from both sources', () => {
    const tripadvisor: ThingToDo[] = [{ name: 'A', category: 'x', source: 'tripadvisor' }]
    const places: ThingToDo[] = [{ name: 'B', category: 'y', source: 'places' }]
    expect(mergeThingsToDo(tripadvisor, places)).toEqual([...tripadvisor, ...places])
  })
})
```

- [ ] **Step 14: Run test to verify it fails**

Run: `npm test -- functions/lib/mergeThingsToDo`
Expected: FAIL — `Cannot find module './mergeThingsToDo'`

- [ ] **Step 15: Implement `functions/lib/mergeThingsToDo.ts`**

```ts
export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
}

export function mergeThingsToDo(tripadvisor: ThingToDo[], places: ThingToDo[]): ThingToDo[] {
  const seen = new Set(tripadvisor.map((t) => t.name.toLowerCase()))
  const extra = places.filter((p) => !seen.has(p.name.toLowerCase()))
  return [...tripadvisor, ...extra]
}
```

- [ ] **Step 16: Run test to verify it passes**

Run: `npm test -- functions/lib/mergeThingsToDo`
Expected: PASS — 2 tests passed

- [ ] **Step 17: Write the failing tests for `functions/api/location.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { onRequestGet } from './location'

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
  RATE_LIMIT_SALT: 'salt',
  TRIPADVISOR_API_KEY: 'ta-key',
  GOOGLE_PLACES_API_KEY: 'gp-key',
}

function req(url: string, ip = '203.0.113.5') {
  return new Request(url, { headers: { 'CF-Connecting-IP': ip } })
}

describe('GET /api/location', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns 400 for a missing query', async () => {
    const res = await onRequestGet({ env, request: req('https://x/api/location') } as never)
    expect(res.status).toBe(400)
  })

  it('returns the cached payload on a cache hit without calling external APIs', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/rest/v1/locations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              slug: 'dublin-ireland',
              lat: 53.35,
              lng: -6.26,
              display_name: 'Dublin, Ireland',
              things_to_do: [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor' }],
            },
          ],
        })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Dublin') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toBe('dublin-ireland')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('tripadvisor'))).toBe(false)
  })

  it('returns 429 when the rate limit is exceeded on a cache miss', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/rest/v1/locations')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/rest/v1/request_log')) {
        return Promise.resolve({ ok: true, headers: new Headers({ 'content-range': '*/25' }), json: async () => [] })
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    const res = await onRequestGet({ env, request: req('https://x/api/location?q=Nowhereville') } as never)
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 18: Run tests to verify they fail**

Run: `npm test -- functions/api/location`
Expected: FAIL — `Cannot find module './location'`

- [ ] **Step 19: Implement `functions/api/location.ts`**

```ts
import type { Env } from '../lib/supabaseAdmin'
import {
  getLocationBySlug,
  upsertLocation,
  countRecentRequests,
  insertRequestLog,
} from '../lib/supabaseAdmin'
import { normalizeLocationSlug } from '../../src/lib/slug'
import { isUnderRateLimit, hashIp } from '../../src/lib/rateLimit'
import { locationQuerySchema } from '../../src/lib/validation/schemas'
import { geocode } from '../lib/geocode'
import { searchThingsToDo } from '../lib/tripadvisor'
import { searchPlaces } from '../lib/places'
import { mergeThingsToDo } from '../lib/mergeThingsToDo'
import { logger } from '../../src/lib/logger'

const RATE_LIMIT_PER_HOUR = 20

type LocationEnv = Env & { TRIPADVISOR_API_KEY: string; GOOGLE_PLACES_API_KEY: string }

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function onRequestGet({
  env,
  request,
}: {
  env: LocationEnv
  request: Request
}): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const parsed = locationQuerySchema.safeParse(q)
  if (!parsed.success) return json({ error: 'invalid query' }, 400)

  const slug = normalizeLocationSlug(parsed.data)
  const cached = await getLocationBySlug(env, slug)
  if (cached) {
    return json(
      {
        slug: cached.slug,
        lat: cached.lat,
        lng: cached.lng,
        displayName: cached.display_name,
        thingsToDo: cached.things_to_do ?? [],
      },
      200,
    )
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const ipHash = await hashIp(ip, env.RATE_LIMIT_SALT)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recentCount = await countRecentRequests(env, ipHash, oneHourAgo)
  if (!isUnderRateLimit(recentCount, RATE_LIMIT_PER_HOUR)) {
    return json({ error: 'rate limit exceeded, try again later' }, 429)
  }
  await insertRequestLog(env, ipHash, 'location')

  const geo = await geocode(parsed.data)
  if (!geo) return json({ error: 'location not found' }, 404)

  const [tripadvisorResults, placesResults] = await Promise.all([
    searchThingsToDo(slug, geo.lat, geo.lng, env.TRIPADVISOR_API_KEY),
    searchPlaces(geo.lat, geo.lng, env.GOOGLE_PLACES_API_KEY),
  ])
  const thingsToDo = mergeThingsToDo(tripadvisorResults, placesResults)

  await upsertLocation(env, {
    slug,
    lat: geo.lat,
    lng: geo.lng,
    display_name: geo.displayName,
    things_to_do: thingsToDo,
  })
  logger.info('generated new location', { slug })

  return json({ slug, lat: geo.lat, lng: geo.lng, displayName: geo.displayName, thingsToDo }, 200)
}
```

- [ ] **Step 20: Run tests to verify they pass**

Run: `npm test -- functions/api/location`
Expected: PASS — 3 tests passed

- [ ] **Step 21: Commit**

```bash
git add functions/lib/geocode.ts functions/lib/geocode.test.ts \
        functions/lib/tripadvisor.ts functions/lib/tripadvisor.test.ts \
        functions/lib/places.ts functions/lib/places.test.ts \
        functions/lib/mergeThingsToDo.ts functions/lib/mergeThingsToDo.test.ts \
        functions/api/location.ts functions/api/location.test.ts
git commit -m "Add /api/location: geocode, cache, rate-limit, Tripadvisor+Places merge"
```

---

## Task 9: `/api/trips` CRUD Function

**Files:**
- Create: `functions/api/trips/index.ts`
- Create: `functions/api/trips/index.test.ts`
- Create: `functions/api/trips/[id].ts`
- Create: `functions/api/trips/[id].test.ts`

**Interfaces:**
- Consumes: `createTrip`, `getTrip`, `updateTrip` (Task 6); `itineraryItemSchema` (Task 2).
- Produces: `POST /api/trips` → `{ id, location_slug, itinerary,
  design_style, created_at }`; `GET /api/trips/:id` → same shape or 404;
  `PATCH /api/trips/:id` → updated row. Consumed by Task 12's frontend API client.

- [ ] **Step 1: Write the failing tests — `functions/api/trips/index.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { onRequestPost } from './index'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_LIMIT_SALT: 's' }

describe('POST /api/trips', () => {
  it('creates a trip with a valid location_slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento', created_at: '2026-01-01' }],
      }),
    )
    const request = new Request('https://x/api/trips', {
      method: 'POST',
      body: JSON.stringify({ location_slug: 'dublin-ireland' }),
    })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('abc-123')
  })

  it('rejects a missing location_slug', async () => {
    const request = new Request('https://x/api/trips', { method: 'POST', body: JSON.stringify({}) })
    const res = await onRequestPost({ env, request } as never)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- functions/api/trips/index`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Implement `functions/api/trips/index.ts`**

```ts
import type { Env } from '../../lib/supabaseAdmin'
import { createTrip } from '../../lib/supabaseAdmin'
import { z } from 'zod'

const createTripSchema = z.object({ location_slug: z.string().min(1) })

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function onRequestPost({ env, request }: { env: Env; request: Request }): Promise<Response> {
  const parsed = createTripSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'location_slug is required' }, 400)

  const trip = await createTrip(env, {
    location_slug: parsed.data.location_slug,
    itinerary: [],
    design_style: 'bento',
  })
  return json(trip, 201)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- functions/api/trips/index`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Write the failing tests — `functions/api/trips/[id].test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { onRequestGet, onRequestPatch } from './[id]'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RATE_LIMIT_SALT: 's' }
const trip = { id: 'abc-123', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento', created_at: '2026-01-01' }

describe('GET /api/trips/:id', () => {
  it('returns the trip when found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [trip] }))
    const res = await onRequestGet({ env, params: { id: 'abc-123' } } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('abc-123')
  })

  it('returns 404 when not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const res = await onRequestGet({ env, params: { id: 'missing' } } as never)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/trips/:id', () => {
  it('updates the itinerary and design_style', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ ...trip, design_style: 'chronicle' }] }),
    )
    const request = new Request('https://x/api/trips/abc-123', {
      method: 'PATCH',
      body: JSON.stringify({ design_style: 'chronicle' }),
    })
    const res = await onRequestPatch({ env, request, params: { id: 'abc-123' } } as never)
    expect((await res.json()).design_style).toBe('chronicle')
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- "functions/api/trips/\[id\]"`
Expected: FAIL — `Cannot find module './[id]'`

- [ ] **Step 7: Implement `functions/api/trips/[id].ts`**

```ts
import type { Env } from '../../lib/supabaseAdmin'
import { getTrip, updateTrip } from '../../lib/supabaseAdmin'
import { itineraryItemSchema } from '../../../src/lib/validation/schemas'
import { z } from 'zod'

const patchSchema = z.object({
  itinerary: z.array(itineraryItemSchema).optional(),
  design_style: z.enum(['bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger']).optional(),
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function onRequestGet({ env, params }: { env: Env; params: { id: string } }): Promise<Response> {
  const trip = await getTrip(env, params.id)
  if (!trip) return json({ error: 'not found' }, 404)
  return json(trip, 200)
}

export async function onRequestPatch({
  env,
  request,
  params,
}: {
  env: Env
  request: Request
  params: { id: string }
}): Promise<Response> {
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return json({ error: 'invalid patch body' }, 400)
  const updated = await updateTrip(env, params.id, parsed.data)
  return json(updated, 200)
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- "functions/api/trips/\[id\]"`
Expected: PASS — 3 tests passed

- [ ] **Step 9: Commit**

```bash
git add functions/api/trips
git commit -m "Add /api/trips CRUD Functions"
```

---

## Task 10: Zustand trip/itinerary store

**Files:**
- Create: `src/store/tripStore.ts`
- Create: `src/store/tripStore.test.ts`

**Interfaces:**
- Consumes: `ItineraryItem` type (Task 2).
- Produces: `useTripStore` hook with state `{ tripId: string | null,
  locationSlug: string | null, itinerary: ItineraryItem[], designStyle:
  DesignStyle }` and actions `setTrip(tripId, locationSlug, itinerary,
  designStyle)`, `addItem(item: ItineraryItem)`, `removeItem(index:
  number)`, `reorderItems(fromIndex: number, toIndex: number)`,
  `setDesignStyle(style: DesignStyle)`. `DesignStyle = 'bento' |
  'chronicle' | 'field-guide' | 'liquid-glass' | 'trail-ledger'` is exported
  from this file — Plan B's theme components and Task 15 both import it.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTripStore } from './tripStore'

describe('useTripStore', () => {
  beforeEach(() => {
    useTripStore.setState({ tripId: null, locationSlug: null, itinerary: [], designStyle: 'bento' })
  })

  it('setTrip populates all fields', () => {
    useTripStore.getState().setTrip('t1', 'dublin-ireland', [], 'chronicle')
    expect(useTripStore.getState()).toMatchObject({ tripId: 't1', locationSlug: 'dublin-ireland', designStyle: 'chronicle' })
  })

  it('addItem appends to the itinerary', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'Breakfast', type: 'fixed' })
    expect(useTripStore.getState().itinerary).toHaveLength(1)
  })

  it('removeItem removes by index', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'A', type: 'fixed' })
    useTripStore.getState().addItem({ time: '10:00', text: 'B', type: 'fixed' })
    useTripStore.getState().removeItem(0)
    expect(useTripStore.getState().itinerary).toEqual([{ time: '10:00', text: 'B', type: 'fixed' }])
  })

  it('reorderItems moves an item from one index to another', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'A', type: 'fixed' })
    useTripStore.getState().addItem({ time: '10:00', text: 'B', type: 'fixed' })
    useTripStore.getState().reorderItems(0, 1)
    expect(useTripStore.getState().itinerary.map((i) => i.text)).toEqual(['B', 'A'])
  })

  it('setDesignStyle updates the style', () => {
    useTripStore.getState().setDesignStyle('trail-ledger')
    expect(useTripStore.getState().designStyle).toBe('trail-ledger')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tripStore`
Expected: FAIL — `Cannot find module './tripStore'`

- [ ] **Step 3: Implement `src/store/tripStore.ts`**

```ts
import { create } from 'zustand'
import type { ItineraryItem } from '../lib/validation/schemas'

export type DesignStyle = 'bento' | 'chronicle' | 'field-guide' | 'liquid-glass' | 'trail-ledger'

interface TripState {
  tripId: string | null
  locationSlug: string | null
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
  setTrip: (tripId: string, locationSlug: string, itinerary: ItineraryItem[], designStyle: DesignStyle) => void
  addItem: (item: ItineraryItem) => void
  removeItem: (index: number) => void
  reorderItems: (fromIndex: number, toIndex: number) => void
  setDesignStyle: (style: DesignStyle) => void
}

export const useTripStore = create<TripState>((set) => ({
  tripId: null,
  locationSlug: null,
  itinerary: [],
  designStyle: 'bento',
  setTrip: (tripId, locationSlug, itinerary, designStyle) => set({ tripId, locationSlug, itinerary, designStyle }),
  addItem: (item) => set((s) => ({ itinerary: [...s.itinerary, item] })),
  removeItem: (index) => set((s) => ({ itinerary: s.itinerary.filter((_, i) => i !== index) })),
  reorderItems: (fromIndex, toIndex) =>
    set((s) => {
      const next = [...s.itinerary]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return { itinerary: next }
    }),
  setDesignStyle: (style) => set({ designStyle: style }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tripStore`
Expected: PASS — 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/store/tripStore.ts src/store/tripStore.test.ts
git commit -m "Add Zustand trip/itinerary store"
```

---

## Task 11: ErrorBoundary component

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/components/ErrorBoundary.test.tsx`

**Interfaces:**
- Produces: `<ErrorBoundary label={string}>{children}</ErrorBoundary>` — Task
  15 wraps each of the 5 major views (Overview, Itinerary, Map, ThingsToDo,
  Search) with one instance each, `label` identifying which view failed.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary label="Test">
        <div>fine</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('renders a scoped fallback and does not crash the page when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary label="Itinerary">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/Itinerary/i)).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ErrorBoundary`
Expected: FAIL — `Cannot find module './ErrorBoundary'`

- [ ] **Step 3: Implement `src/components/ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react'
import { logger } from '../lib/logger'

interface Props {
  label: string
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    logger.error(`${this.props.label} view crashed`, error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert">
          <p>{this.props.label}: something went wrong loading this section.</p>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ErrorBoundary`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/components/ErrorBoundary.test.tsx
git commit -m "Add per-view ErrorBoundary component"
```

---

## Task 12: Frontend API client

**Files:**
- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: nothing beyond global `fetch`.
- Produces: `fetchLocation(query: string): Promise<LocationResult>`,
  `createTrip(locationSlug: string): Promise<Trip>`, `getTrip(id: string):
  Promise<Trip>`, `updateTrip(id: string, patch: Partial<{ itinerary:
  ItineraryItem[]; designStyle: DesignStyle }>): Promise<Trip>`. Types
  `LocationResult = { slug: string; lat: number; lng: number; displayName:
  string; thingsToDo: ThingToDo[] }` and `Trip = { id: string;
  locationSlug: string; itinerary: ItineraryItem[]; designStyle: DesignStyle
  }` are exported here and used by Task 15's theme screens.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchLocation, createTrip, getTrip, updateTrip } from './client'

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetchLocation calls /api/location with the query and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slug: 'dublin-ireland', lat: 53.35, lng: -6.26, displayName: 'Dublin, Ireland', thingsToDo: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchLocation('Dublin, Ireland')
    expect(fetchMock).toHaveBeenCalledWith('/api/location?q=Dublin%2C%20Ireland')
    expect(result.slug).toBe('dublin-ireland')
  })

  it('fetchLocation throws with the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'not found' }) }))
    await expect(fetchLocation('nowhere')).rejects.toThrow('not found')
  })

  it('createTrip posts the location slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const trip = await createTrip('dublin-ireland')
    expect(trip.id).toBe('t1')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })

  it('getTrip fetches by id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'bento' }),
      }),
    )
    const trip = await getTrip('t1')
    expect(trip.locationSlug).toBe('dublin-ireland')
  })

  it('updateTrip patches by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', location_slug: 'dublin-ireland', itinerary: [], design_style: 'chronicle' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const trip = await updateTrip('t1', { designStyle: 'chronicle' })
    expect(trip.designStyle).toBe('chronicle')
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/api/client`
Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 3: Implement `src/lib/api/client.ts`**

```ts
import type { ItineraryItem } from '../validation/schemas'
import type { DesignStyle } from '../../store/tripStore'

export interface ThingToDo {
  name: string
  category: string
  source: 'tripadvisor' | 'places'
  rating?: number
  address?: string
}

export interface LocationResult {
  slug: string
  lat: number
  lng: number
  displayName: string
  thingsToDo: ThingToDo[]
}

export interface Trip {
  id: string
  locationSlug: string
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
}

function fromRow(row: {
  id: string
  location_slug: string
  itinerary: ItineraryItem[]
  design_style: DesignStyle
}): Trip {
  return { id: row.id, locationSlug: row.location_slug, itinerary: row.itinerary, designStyle: row.design_style }
}

export async function fetchLocation(query: string): Promise<LocationResult> {
  const res = await fetch(`/api/location?q=${encodeURIComponent(query)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to fetch location')
  return body
}

export async function createTrip(locationSlug: string): Promise<Trip> {
  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_slug: locationSlug }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to create trip')
  return fromRow(body)
}

export async function getTrip(id: string): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to load trip')
  return fromRow(body)
}

export async function updateTrip(
  id: string,
  patch: Partial<{ itinerary: ItineraryItem[]; designStyle: DesignStyle }>,
): Promise<Trip> {
  const res = await fetch(`/api/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(patch.itinerary ? { itinerary: patch.itinerary } : {}),
      ...(patch.designStyle ? { design_style: patch.designStyle } : {}),
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'failed to update trip')
  return fromRow(body)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/api/client`
Expected: PASS — 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/client.ts src/lib/api/client.test.ts
git commit -m "Add frontend API client for location and trips endpoints"
```

---

## Task 13: Weather hook (Open-Meteo)

**Files:**
- Create: `src/features/weather/useForecast.ts`
- Create: `src/features/weather/useForecast.test.ts`

**Interfaces:**
- Produces: `useForecast(lat: number, lng: number): { data: Forecast | null,
  error: string | null, loading: boolean }` where `Forecast = {
  temperatureC: number; condition: string; isFallback: boolean }`. Used by
  Task 15's Overview screen.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useForecast } from './useForecast'

describe('useForecast', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns parsed current weather on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ current: { temperature_2m: 14.2, weather_code: 3 } }),
      }),
    )
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ temperatureC: 14.2, condition: 'Overcast', isFallback: false })
  })

  it('falls back to a seasonal estimate when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useForecast(53.35, -6.26))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data?.isFallback).toBe(true)
    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- useForecast`
Expected: FAIL — `Cannot find module './useForecast'`

- [ ] **Step 3: Implement `src/features/weather/useForecast.ts`**

```ts
import { useEffect, useState } from 'react'
import { logger } from '../../lib/logger'

export interface Forecast {
  temperatureC: number
  condition: string
  isFallback: boolean
}

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  61: 'Rain',
  71: 'Snow',
  95: 'Thunderstorm',
}

function seasonalFallback(): Forecast {
  const month = new Date().getMonth()
  const isSummer = month >= 4 && month <= 8
  return { temperatureC: isSummer ? 22 : 8, condition: isSummer ? 'Mild (estimate)' : 'Cool (estimate)', isFallback: true }
}

export function useForecast(lat: number, lng: number) {
  const [data, setData] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return
        setData({
          temperatureC: body.current.temperature_2m,
          condition: WMO_CONDITIONS[body.current.weather_code] ?? 'Unknown',
          isFallback: false,
        })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('weather fetch failed, using seasonal fallback', { error: String(err) })
        setData(seasonalFallback())
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng])

  return { data, error, loading }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- useForecast`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/features/weather
git commit -m "Add Open-Meteo forecast hook with seasonal fallback"
```

---

## Task 14: Map view (Leaflet + static fallback)

**Files:**
- Create: `src/features/map/MapView.tsx`
- Create: `src/features/map/MapView.test.tsx`
- Create: `src/features/map/StaticMap.tsx`
- Create: `src/features/map/StaticMap.test.tsx`

**Interfaces:**
- Produces: `<MapView lat={number} lng={number} label={string} />` — renders
  a Leaflet map with a single marker; `<StaticMap lat={number} lng={number}
  label={string} />` — an offline-safe SVG placeholder used when Leaflet's
  tile fetch is undesirable (e.g. print view). Used by Task 15.

- [ ] **Step 1: Write the failing test for `StaticMap` (simpler, no Leaflet mock needed)**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaticMap } from './StaticMap'

describe('StaticMap', () => {
  it('renders the location label', () => {
    render(<StaticMap lat={53.35} lng={-6.26} label="Dublin, Ireland" />)
    expect(screen.getByText('Dublin, Ireland')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StaticMap`
Expected: FAIL — `Cannot find module './StaticMap'`

- [ ] **Step 3: Implement `src/features/map/StaticMap.tsx`**

```tsx
interface Props {
  lat: number
  lng: number
  label: string
}

export function StaticMap({ lat, lng, label }: Props) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={`Map placeholder for ${label}`}>
      <rect width="200" height="120" fill="#e8f1ff" />
      <circle cx="100" cy="60" r="6" fill="#0a84ff" />
      <text x="100" y="90" textAnchor="middle" fontSize="10">
        {label}
      </text>
      <text x="100" y="104" textAnchor="middle" fontSize="7" fill="#666">
        {lat.toFixed(2)}, {lng.toFixed(2)}
      </text>
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- StaticMap`
Expected: PASS — 1 test passed

- [ ] **Step 5: Write the failing test for `MapView`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapView } from './MapView'

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({ setView: vi.fn(), remove: vi.fn() })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindPopup: vi.fn().mockReturnThis() })),
  },
}))

describe('MapView', () => {
  it('renders a container with an accessible label', () => {
    render(<MapView lat={53.35} lng={-6.26} label="Dublin, Ireland" />)
    expect(screen.getByLabelText(/map of dublin, ireland/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- MapView`
Expected: FAIL — `Cannot find module './MapView'`

- [ ] **Step 7: Implement `src/features/map/MapView.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lng: number
  label: string
}

export function MapView({ lat, lng, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current).setView([lat, lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    L.marker([lat, lng]).addTo(map).bindPopup(label)
    return () => map.remove()
  }, [lat, lng, label])

  return <div ref={containerRef} aria-label={`Map of ${label}`} style={{ height: '300px', width: '100%' }} />
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- MapView`
Expected: PASS — 1 test passed

- [ ] **Step 9: Commit**

```bash
git add src/features/map
git commit -m "Add Leaflet MapView with offline-safe StaticMap fallback"
```

---

## Task 15: Bento theme screens + routing

**Files:**
- Create: `src/themes/bento/SearchScreen.tsx` + `.test.tsx`
- Create: `src/themes/bento/OverviewScreen.tsx` + `.test.tsx`
- Create: `src/themes/bento/ItineraryScreen.tsx` + `.test.tsx`
- Create: `src/themes/bento/ThingsToDoScreen.tsx` + `.test.tsx`
- Create: `src/themes/bento/bento.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `fetchLocation`, `createTrip`, `getTrip`, `updateTrip` (Task 12),
  `useTripStore` (Task 10), `ErrorBoundary` (Task 11), `useForecast` (Task
  13), `MapView` (Task 14).
- Produces: the routed screens mounted at `/`, `/trip/:id`,
  `/trip/:id/itinerary`, `/trip/:id/things-to-do` — Plan B's other 4 themes
  implement the same four screens against this same routing contract.

- [ ] **Step 1: Write the failing test for `SearchScreen`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SearchScreen } from './SearchScreen'
import * as client from '../../lib/api/client'

describe('SearchScreen', () => {
  it('creates a trip and navigates on submit', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [],
    })
    vi.spyOn(client, 'createTrip').mockResolvedValue({
      id: 't1',
      locationSlug: 'dublin-ireland',
      itinerary: [],
      designStyle: 'bento',
    })
    render(
      <MemoryRouter>
        <SearchScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/where to/i), { target: { value: 'Dublin, Ireland' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => expect(client.createTrip).toHaveBeenCalledWith('dublin-ireland'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SearchScreen`
Expected: FAIL — `Cannot find module './SearchScreen'`

- [ ] **Step 3: Implement `src/themes/bento/SearchScreen.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLocation, createTrip } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'
import { logger } from '../../lib/logger'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const setTrip = useTripStore((s) => s.setTrip)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const location = await fetchLocation(query)
      const trip = await createTrip(location.slug)
      setTrip(trip.id, trip.locationSlug, trip.itinerary, trip.designStyle)
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      logger.error('failed to create trip from search', err)
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bento-search">
      <label htmlFor="location-query">Where to?</label>
      <input
        id="location-query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="US state, city, or country"
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Loading…' : 'Go'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SearchScreen`
Expected: PASS — 1 test passed

- [ ] **Step 5: Write the failing test for `OverviewScreen`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OverviewScreen } from './OverviewScreen'
import * as client from '../../lib/api/client'
import * as forecastHook from '../../features/weather/useForecast'

describe('OverviewScreen', () => {
  it('loads the trip and shows the location name', async () => {
    vi.spyOn(client, 'getTrip').mockResolvedValue({ id: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    vi.spyOn(forecastHook, 'useForecast').mockReturnValue({ data: { temperatureC: 14, condition: 'Overcast', isFallback: false }, error: null, loading: false })
    render(
      <MemoryRouter initialEntries={['/trip/t1']}>
        <Routes>
          <Route path="/trip/:id" element={<OverviewScreen />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/dublin-ireland/i)).toBeInTheDocument())
    expect(screen.getByText(/14/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- OverviewScreen`
Expected: FAIL — `Cannot find module './OverviewScreen'`

- [ ] **Step 7: Implement `src/themes/bento/OverviewScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrip, type Trip } from '../../lib/api/client'
import { useForecast } from '../../features/weather/useForecast'
import { ErrorBoundary } from '../../components/ErrorBoundary'

function OverviewContent({ trip }: { trip: Trip }) {
  const { data: forecast } = useForecast(0, 0)
  return (
    <div className="bento-grid">
      <div className="bento-tile">
        <h1>{trip.locationSlug}</h1>
      </div>
      {forecast && (
        <div className="bento-tile">
          <p>{forecast.temperatureC}°C — {forecast.condition}</p>
        </div>
      )}
    </div>
  )
}

export function OverviewScreen() {
  const { id } = useParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    if (id) getTrip(id).then(setTrip)
  }, [id])

  if (!trip) return <p>Loading…</p>

  return (
    <ErrorBoundary label="Overview">
      <OverviewContent trip={trip} />
    </ErrorBoundary>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- OverviewScreen`
Expected: PASS — 1 test passed

- [ ] **Step 9: Write the failing test for `ItineraryScreen`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryScreen } from './ItineraryScreen'
import { useTripStore } from '../../store/tripStore'

describe('ItineraryScreen', () => {
  it('adds an item to the store when the form is submitted', () => {
    useTripStore.setState({ tripId: 't1', locationSlug: 'dublin-ireland', itinerary: [], designStyle: 'bento' })
    render(<ItineraryScreen />)
    fireEvent.change(screen.getByLabelText(/time/i), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText(/what/i), { target: { value: 'Breakfast' } })
    fireEvent.click(screen.getByRole('button', { name: /add stop/i }))
    expect(useTripStore.getState().itinerary).toHaveLength(1)
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- ItineraryScreen`
Expected: FAIL — `Cannot find module './ItineraryScreen'`

- [ ] **Step 11: Implement `src/themes/bento/ItineraryScreen.tsx`**

```tsx
import { useState } from 'react'
import { useTripStore } from '../../store/tripStore'

export function ItineraryScreen() {
  const [time, setTime] = useState('')
  const [text, setText] = useState('')
  const itinerary = useTripStore((s) => s.itinerary)
  const addItem = useTripStore((s) => s.addItem)
  const removeItem = useTripStore((s) => s.removeItem)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!time || !text) return
    addItem({ time, text, type: 'option' })
    setTime('')
    setText('')
  }

  return (
    <div className="bento-itinerary">
      <form onSubmit={handleSubmit}>
        <label htmlFor="stop-time">Time</label>
        <input id="stop-time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label htmlFor="stop-text">What</label>
        <input id="stop-text" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add stop</button>
      </form>
      <ul>
        {itinerary.map((item, i) => (
          <li key={`${item.time}-${item.text}-${i}`}>
            {item.time} — {item.text}
            <button type="button" onClick={() => removeItem(i)} aria-label={`Remove ${item.text}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- ItineraryScreen`
Expected: PASS — 1 test passed

- [ ] **Step 13: Write the failing test for `ThingsToDoScreen`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThingsToDoScreen } from './ThingsToDoScreen'
import * as client from '../../lib/api/client'

describe('ThingsToDoScreen', () => {
  it('shows cached things-to-do for the trip location', async () => {
    vi.spyOn(client, 'fetchLocation').mockResolvedValue({
      slug: 'dublin-ireland',
      lat: 53.35,
      lng: -6.26,
      displayName: 'Dublin, Ireland',
      thingsToDo: [{ name: 'Trinity College', category: 'attraction', source: 'tripadvisor' }],
    })
    render(
      <MemoryRouter initialEntries={['/trip/t1/things-to-do']}>
        <Routes>
          <Route path="/trip/:id/things-to-do" element={<ThingsToDoScreen locationSlug="dublin-ireland" />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Trinity College')).toBeInTheDocument())
  })
})
```

- [ ] **Step 14: Run test to verify it fails**

Run: `npm test -- ThingsToDoScreen`
Expected: FAIL — `Cannot find module './ThingsToDoScreen'`

- [ ] **Step 15: Implement `src/themes/bento/ThingsToDoScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchLocation, type ThingToDo } from '../../lib/api/client'
import { useTripStore } from '../../store/tripStore'

export function ThingsToDoScreen({ locationSlug }: { locationSlug: string }) {
  const [items, setItems] = useState<ThingToDo[]>([])
  const addItem = useTripStore((s) => s.addItem)

  useEffect(() => {
    fetchLocation(locationSlug).then((loc) => setItems(loc.thingsToDo))
  }, [locationSlug])

  return (
    <ul className="bento-things-to-do">
      {items.map((item) => (
        <li key={item.name}>
          {item.name} ({item.category})
          <button
            type="button"
            onClick={() => addItem({ time: '', text: item.name, type: 'option', q: item.name })}
          >
            Add to itinerary
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 16: Run test to verify it passes**

Run: `npm test -- ThingsToDoScreen`
Expected: PASS — 1 test passed

- [ ] **Step 17: Create `src/themes/bento/bento.css`** (dense 2-column tile
  grid per the spec's Bento description — real, applied styles, not a stub)

```css
.bento-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}
.bento-tile {
  background: #f4f1e8;
  border-radius: 12px;
  padding: 16px;
}
@media (max-width: 480px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 18: Wire routing in `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SearchScreen } from './themes/bento/SearchScreen'
import { OverviewScreen } from './themes/bento/OverviewScreen'
import { ItineraryScreen } from './themes/bento/ItineraryScreen'
import { ThingsToDoScreen } from './themes/bento/ThingsToDoScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import './themes/bento/bento.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ErrorBoundary label="Search">
              <SearchScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id"
          element={
            <ErrorBoundary label="Overview">
              <OverviewScreen />
            </ErrorBoundary>
          }
        />
        <Route
          path="/trip/:id/itinerary"
          element={
            <ErrorBoundary label="Itinerary">
              <ItineraryScreen />
            </ErrorBoundary>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 19: Update `src/App.test.tsx` for the router** (the Task 1 test
  rendered raw text; now the root route renders `SearchScreen`)

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the search screen at the root route', () => {
    render(<App />)
    expect(screen.getByLabelText(/where to/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 20: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green

- [ ] **Step 21: Commit**

```bash
git add src/themes/bento src/App.tsx src/App.test.tsx
git commit -m "Wire Bento theme screens into app routing"
```

---

## Task 16: Local end-to-end verification + first deploy

**Files:** none created — verification task only.

- [ ] **Step 1: Create a Supabase project** in the dashboard, note its URL,
  anon key, and service-role key.

- [ ] **Step 2: Apply the Task 5 migration** against it (see Task 5, Step 3).

- [ ] **Step 3: Set Cloudflare Pages secrets** (production):

```bash
npx wrangler pages secret put SUPABASE_URL --project-name=trip-one
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name=trip-one
npx wrangler pages secret put RATE_LIMIT_SALT --project-name=trip-one
npx wrangler pages secret put TRIPADVISOR_API_KEY --project-name=trip-one
npx wrangler pages secret put GOOGLE_PLACES_API_KEY --project-name=trip-one
```

- [ ] **Step 4: Build and deploy**

```bash
npm run build
npx wrangler pages deploy dist --project-name=trip-one --branch=main
```

- [ ] **Step 5: Verify the deploy**

Run: `curl -s https://trip-one.pages.dev/api/health`
Expected: `{"status":"ok"}`

- [ ] **Step 6: Manual smoke test** — visit the production URL, search "Dublin,
  Ireland", confirm a trip is created, weather/map/things-to-do render, and
  the itinerary add/remove works. Check the browser console is clean.

- [ ] **Step 7: Commit any fixes found during manual verification**, each
  with its own test per the TDD steps above — do not commit untested fixes.
