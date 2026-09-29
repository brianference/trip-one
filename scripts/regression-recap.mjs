/**
 * End-to-end regression suite for the recap/photos/money features, against a
 * DEPLOYED (or local) trip-one build.
 *
 * Engine: Chromium desktop (1440x900) and Chromium at 375 px, both from one
 * `chromium.launch()` — two separate `BrowserContext`s, not two browsers. If a
 * WebKit project is ever added here, it must be labelled WebKit explicitly
 * (see reference_playwright_project_engine.md: devices['iPhone 13'] runs
 * WebKit, not Chromium, and silently changes focus-order behavior).
 *
 * Spends the paid AI trip planner (/api/plan-intent + /api/plan, both backed
 * by OpenAI) at most TWICE per run: once for "3 days in Lisbon" (Money/Phrases
 * visible — international, non-English-speaking, non-USD) and once for
 * "4 days in Miami" (Money/Phrases hidden — domestic). Never loop or retry
 * the planner call.
 *
 * Local proof mode (--trip, a boolean switch): the AI planner needs a live
 * OPENAI_API_KEY, and /api/location needs live GOOGLE_PLACES_API_KEY/
 * TRIPADVISOR_API_KEY to cache a `locations` row (trips.location_slug is a
 * foreign key against it) — neither may be valid in a local sandbox. When
 * --trip is passed, the script skips the browser-driven "plan from the home
 * page" step for BOTH trips and instead creates two BRAND-NEW trips directly
 * through the local REST API with a fixed, real-place fixture itinerary
 * (Lisbon and Miami landmarks with real coordinates), so every other check
 * (nav gating, Money table, photo upload, recap share, axe, console) still
 * runs against a real render. This mode proves the script's *checks* work; it
 * does not prove the home-page AI planning flow, which is production-only
 * (Task 14) and is recorded as a SKIPPED line, never a silent pass.
 *
 * --trip refuses to run at all unless BASE resolves to a loopback host — see
 * the host guard right after argument parsing, and the "why" note there.
 *
 * Usage:
 *   node scripts/regression-recap.mjs https://trip-one.pages.dev
 *   node scripts/regression-recap.mjs http://127.0.0.1:5199 --trip
 *
 * `--trip` is a boolean switch, not an id. An earlier version accepted
 * `--trip <existing-id>`, GET+PATCHed that trip's itinerary to seed a fixture,
 * and reused it if it already existed — pointed at a real deploy with a real
 * trip id, that would silently overwrite a real user's trip. Reuse-by-id has
 * been removed entirely: `--trip` mode always creates a brand-new trip via
 * the API, and every PATCH/DELETE this script issues targets only a
 * trip/photo it created in THIS run (see `createTripFixtureViaApi` and the
 * photo and recap-link cleanup in `main`). `--trip` also refuses to run at all unless BASE
 * resolves to a loopback host (localhost/127.0.0.1/[::1]) — see the guard
 * right below the arg parsing.
 *
 * Exits non-zero on any failure. Prints one line per check. Saves a Playwright
 * trace per context under scripts/.traces/ (gitignored — never test-results/,
 * which `playwright test` deletes on every run; this script does not use the
 * `playwright test` runner at all).
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// ---------------------------------------------------------------- timing
/** Default timeout for a single element/locator to become visible. */
const ELEMENT_VISIBLE_TIMEOUT_MS = 20000
/** Timeout for a specific network response to arrive (photo upload, itinerary PATCH). */
const NETWORK_RESPONSE_TIMEOUT_MS = 30000
/** The AI planner (geocode + Places/Tripadvisor + OpenAI, twice) is slow; give it real room. */
const PLANNER_NAVIGATION_TIMEOUT_MS = 120000
/** Default budget and poll interval for `pollUntil`. */
const DEFAULT_POLL_TIMEOUT_MS = 15000
const DEFAULT_POLL_INTERVAL_MS = 250
/** The Money table's rows render after an async currency-rate fetch; give it its own budget. */
const MONEY_TABLE_POLL_TIMEOUT_MS = 20000

// ------------------------------------------------------------------- theme
/** Must match STORAGE_KEY in src/lib/theme.ts — the app reads its theme from
 *  this localStorage key (via an early inline script in index.html) and sets
 *  `data-theme` on <html> BEFORE first paint, independent of the OS's
 *  prefers-color-scheme. `page.emulateMedia({ colorScheme })` does not drive
 *  this app's theme at all, so axe's "dark" pass must set this key instead. */
const THEME_STORAGE_KEY = 'trip-one-theme'
const THEME_CHOICES = ['light', 'dark']

// --------------------------------------------------------------- host guard
/** Hostnames `--trip` (local-proof mode) is allowed to target — see the file header. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

// ---------------------------------------------------------------- CLI args
const rawArgs = process.argv.slice(2)
const BASE = (rawArgs[0] ?? '').replace(/\/$/, '')
if (!BASE || BASE.startsWith('--')) {
  console.error('usage: node scripts/regression-recap.mjs <base-url> [--trip]')
  process.exit(2)
}
/** Skip the AI-planner UI flow and build trips through the local API instead (see file header). */
const LOCAL_MODE = rawArgs.includes('--trip')

if (LOCAL_MODE) {
  let hostname = ''
  try {
    hostname = new URL(BASE).hostname.toLowerCase()
  } catch {
    hostname = ''
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    console.error(
      `refusing to run: --trip (local-proof mode) creates real trips through the REST API and must only ` +
        `ever target a loopback host (localhost, 127.0.0.1 or [::1]). Got base URL "${BASE}" ` +
        `(hostname "${hostname || '(unparseable)'}"). Run WITHOUT --trip against a real deploy — the script ` +
        'will drive the production home-page AI planner instead of creating trips directly.',
    )
    process.exit(1)
  }
}

// ---------------------------------------------------------------- fixtures
const LISBON_QUERY = 'Lisbon, Portugal'
const LISBON_SLUG = 'lisbon-portugal'
const LISBON_PLANNER_PROMPT = '3 days in Lisbon'
/** Real Lisbon landmarks with real coordinates — used only in --trip local mode, never invented. */
const LISBON_FIXTURE_STOPS = [
  { time: '', text: 'Belem Tower', type: 'fixed', day: 1, lat: 38.6916, lng: -9.216, category: 'tourist_attraction' },
  { time: '', text: 'Jeronimos Monastery', type: 'fixed', day: 1, lat: 38.6979, lng: -9.2068, category: 'tourist_attraction' },
  { time: '', text: 'Praca do Comercio', type: 'fixed', day: 2, lat: 38.7075, lng: -9.1364, category: 'tourist_attraction' },
  { time: '', text: 'Alfama', type: 'fixed', day: 2, lat: 38.7139, lng: -9.1292, category: 'neighborhood' },
  { time: '', text: 'LX Factory', type: 'fixed', day: 3, lat: 38.7043, lng: -9.1783, category: 'shopping' },
  { time: '', text: 'Time Out Market Lisboa', type: 'fixed', day: 3, lat: 38.7069, lng: -9.1457, category: 'restaurant' },
]
const LISBON_TRIP_LENGTH_DAYS = 3

const MIAMI_QUERY = 'Miami, Florida'
const MIAMI_SLUG = 'miami-florida'
const MIAMI_PLANNER_PROMPT = '4 days in Miami'
/** Real Miami landmarks with real coordinates — used only in --trip local mode. */
const MIAMI_FIXTURE_STOPS = [
  { time: '', text: 'South Beach', type: 'fixed', day: 1, lat: 25.7825, lng: -80.134, category: 'beach' },
  { time: '', text: 'Wynwood Walls', type: 'fixed', day: 1, lat: 25.801, lng: -80.199, category: 'tourist_attraction' },
  { time: '', text: 'Vizcaya Museum and Gardens', type: 'fixed', day: 2, lat: 25.7443, lng: -80.2103, category: 'museum' },
  { time: '', text: 'Bayside Marketplace', type: 'fixed', day: 2, lat: 25.7786, lng: -80.1866, category: 'shopping' },
]
const MIAMI_TRIP_LENGTH_DAYS = 4

/**
 * Real, non-synthesized image uploaded to prove the photo pipeline. This is a
 * real PNG, not a JPEG: no JPEG exists anywhere in this repo, and the upload
 * pipeline resizes/re-encodes every photo to JPEG client-side before it ever
 * reaches the server (see photosApi.ts's `resizeImage` call), so the
 * server-stored bytes are JPEG regardless of the source format. Using a real
 * repo asset here still matters — it rules out any codec-specific bug in the
 * client's canvas resize/encode step that a synthesized 1x1 pixel would miss.
 */
const REAL_PHOTO_PATH = path.join(REPO_ROOT, 'public', 'og.png')

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const MOBILE_VIEWPORT = { width: 375, height: 812 }

/** Money table body rows expected for ANY international, non-USD destination — fixed by `PRESET_USD_AMOUNTS`, not data-dependent. */
const EXPECTED_MONEY_ROWS = 6
/** The last preset row's US-dollar cell, formatted the same way `MoneyPage` formats it. */
const EXPECTED_LAST_ROW_USD = '$1,000'

const TRACE_DIR = path.join(__dirname, '.traces')
const AXE_SCRIPT_PATH = path.join(REPO_ROOT, 'node_modules', 'axe-core', 'axe.min.js')

// ---------------------------------------------------------------- reporting
const results = []
/**
 * Records one check's outcome and prints it immediately.
 * @param {string} name - Stable, greppable check name
 * @param {boolean} pass - Whether the check passed
 * @param {string} [detail] - Extra context, always printed (pass or fail) so a regression is visible even on a pass
 */
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/**
 * Records an informational line that is neither a pass nor a fail — used only
 * for "this step is production-only and was skipped in local mode", never to
 * paper over an unverified assertion.
 * @param {string} message
 */
function note(message) {
  console.log(`NOTE  ${message}`)
}

// ---------------------------------------------------------------- helpers
/** Fetches JSON and throws loudly on a non-JSON body (an HTML error page must not read as {}). */
async function getJson(pathname, init) {
  const res = await fetch(`${BASE}${pathname}`, init)
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${pathname} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}`)
  }
  return { status: res.status, body }
}

/**
 * Polls `fn` until it returns a truthy value or the timeout elapses — the
 * hand-rolled equivalent of `expect.poll`, since `@playwright/test`'s `expect`
 * is not a dependency here (this script runs under plain Node, not the
 * `playwright test` runner).
 * @param {() => Promise<unknown> | unknown} fn
 * @param {{ timeoutMs?: number, intervalMs?: number }} [opts]
 * @returns {Promise<unknown>} the last value `fn` returned (truthy on success, falsy/undefined on timeout)
 */
async function pollUntil(fn, { timeoutMs = DEFAULT_POLL_TIMEOUT_MS, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    last = await fn()
    if (last) return last
    if (Date.now() >= deadline) return last
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Creates a BRAND-NEW trip fixture via direct API calls (no browser), with a
 * real-place itinerary, skipping the (paid, key-dependent) AI planner. Always
 * creates a fresh trip — never looks up or reuses an existing id — so this
 * function can only ever PATCH a trip it just created itself in this same
 * call. That is deliberate: an earlier version accepted a caller-supplied id
 * and PATCHed whatever trip already existed at that id, which would silently
 * overwrite a real trip if ever pointed at a real deploy (see the `--trip`
 * host guard in the file header for the other half of that fix).
 *
 * Primes the location cache first, since `trips.location_slug` is a foreign
 * key against `locations.slug` — in production this cache write happens
 * naturally inside `/api/location`; locally it only succeeds if Places/
 * Tripadvisor return real data, which the caller must ensure out of band when
 * running against a sandbox with invalid keys (see file header).
 * @param {{ query: string, slug: string, stops: object[], tripLengthDays: number }} args
 * @returns {Promise<string>} the newly created trip's id
 */
async function createTripFixtureViaApi({ query, slug, stops, tripLengthDays }) {
  await getJson(`/api/location?q=${encodeURIComponent(query)}`)
  const created = await getJson('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_slug: slug }),
  })
  if (created.status !== 201 || !created.body.id) {
    throw new Error(`local trip creation failed for slug ${slug}: HTTP ${created.status} ${JSON.stringify(created.body)}`)
  }
  const tripId = created.body.id
  const patched = await getJson(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itinerary: stops, trip_length_days: tripLengthDays }),
  })
  if (patched.status !== 200) throw new Error(`itinerary PATCH failed for trip ${tripId}: HTTP ${patched.status}`)
  return tripId
}

/**
 * Plans a trip from the home page's AI planner (production-only path — see
 * file header; NOT exercised in local-proof mode, and not exercised in this
 * task's local runs since this sandbox's Places/Tripadvisor keys can't
 * complete it — it runs for real starting in Task 14). Spends one call to the
 * paid /api/plan-intent + /api/plan pair.
 * @param {import('playwright').Page} page
 * @param {string} promptText - Free-text request, e.g. "3 days in Lisbon"
 * @returns {Promise<string>} the created trip's id, read back from the URL
 */
async function planFromHomePage(page, promptText) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const box = page.getByPlaceholder(/San Diego/i)
  await box.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  await box.fill(promptText)
  await page.getByRole('button', { name: /plan my trip/i }).click()
  await page.waitForURL(/\/trip\/[^/]+$/, { timeout: PLANNER_NAVIGATION_TIMEOUT_MS })
  await page.getByRole('link', { name: 'Plan' }).first().waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
  const match = /\/trip\/([^/]+)/.exec(new URL(page.url()).pathname)
  if (!match) throw new Error(`landed on an unexpected URL after planning: ${page.url()}`)
  return match[1]
}

/**
 * Injects the pinned axe-core build (a repo devDependency, never an
 * out-of-repo path) and runs it, recording one check per REAL app theme.
 *
 * Deliberately does NOT use `page.emulateMedia({ colorScheme })` — this app
 * ignores the OS preference once a choice exists and picks its theme from
 * `localStorage[THEME_STORAGE_KEY]`, applied to `<html data-theme>` by an
 * early inline script in index.html before React even mounts (see
 * `src/lib/theme.ts`). `emulateMedia('dark')` changes what the OS reports to
 * `prefers-color-scheme`, which this app never reads once a stored choice
 * exists — so it could silently re-test the SAME (light) theme twice. Instead
 * this sets the storage key via `addInitScript` (so it runs before index.html's
 * own script on the next navigation) and reloads, then asserts
 * `data-theme` actually landed as its OWN check before trusting the axe run
 * that follows — an axe pass proves nothing if it silently ran against the
 * wrong theme.
 *
 * `addInitScript` calls accumulate on a page for its lifetime and run in
 * registration order before every navigation; calling this once per (page,
 * theme) pair across multiple pages (Money, Plan, recap-public) means several
 * stale scripts run before each goto, but the one added most recently always
 * runs last, so the final `data-theme` is always the one this call intended —
 * verified by the explicit assertion below, not assumed.
 *
 * Fails on any `serious`/`critical` violation; `moderate`/`minor` are logged
 * but not gated, matching the playwright-qa skill's contrast/a11y guidance
 * (use the standard implementation, never a hand-rolled contrast check).
 * @param {import('playwright').Page} page
 * @param {string} pageLabel - Short label for check names, e.g. "money"
 * @param {string} url - Full URL to load
 */
async function runAxeBothThemes(page, pageLabel, url) {
  const axeSource = readFileSync(AXE_SCRIPT_PATH, 'utf8')
  for (const theme of THEME_CHOICES) {
    await page.addInitScript(
      ({ key, value }) => {
        try {
          window.localStorage.setItem(key, value)
        } catch {
          /* private mode: index.html's own script guards this the same way and just falls back to the light default */
        }
      },
      { key: THEME_STORAGE_KEY, value: theme },
    )
    await page.goto(url, { waitUntil: 'networkidle' })
    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    record(`axe/${pageLabel} (${theme}): data-theme applied before axe runs`, appliedTheme === theme, `got "${appliedTheme}"`)

    await page.addScriptTag({ content: axeSource })
    const axeResult = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
    const severe = axeResult.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    record(
      `axe/${pageLabel} (${theme}): zero serious/critical violations`,
      severe.length === 0,
      severe.length > 0 ? severe.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node(s))`).join('; ') : `${axeResult.violations.length} lower-impact`,
    )
  }
}

/** Accessible name of the public/owner recap route's slideshow landmark (see RecapSlideshow.tsx). */
const SLIDESHOW_REGION_NAME = 'Photo slideshow'

/**
 * Verifies the recap route at `url` renders REAL content (a heading and a
 * loaded slideshow photo) BEFORE trusting any "trip id is absent" assertion —
 * an absence check passes vacuously on an empty or broken page body, which
 * proves nothing. Once real content is confirmed, checks that the trip id
 * appears in neither the rendered HTML NOR any network request URL captured
 * during this navigation (a leak could live in an API call the DOM itself
 * never shows, e.g. a stray `/api/trips/:id` fetch).
 *
 * Factored out as a named function (rather than inlined) so Step 2's "prove
 * it can fail" copy can point the SAME function at the owner's
 * `/trip/:id/recap` URL, which DOES embed the id (in TripNav's hrefs, and in
 * its own `/api/trips/:id` fetches), and confirm both assertions actually
 * fail there.
 * @param {import('playwright').Page} page
 * @param {string} url - The recap URL to load (public `/recap/:token` in the real run)
 * @param {string} tripId - The owner's trip id, which must never appear
 */
async function verifyRecapDoesNotLeakTripId(page, url, tripId) {
  /** @type {string[]} */
  const requestUrls = []
  const onRequest = (req) => requestUrls.push(req.url())
  page.on('request', onRequest)
  try {
    await page.goto(url, { waitUntil: 'networkidle' })

    const heading = page.getByRole('heading', { level: 1 })
    await heading.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    record('recap: page renders a real heading (positive anchor before the leak check)', true, await heading.textContent())

    const slideshowImg = page.getByRole('region', { name: SLIDESHOW_REGION_NAME }).locator('img')
    await slideshowImg.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    const naturalWidth = await pollUntil(async () =>
      slideshowImg.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0)),
    )
    record('recap: slideshow image loads (naturalWidth > 0, positive anchor)', Boolean(naturalWidth) && naturalWidth > 0, `naturalWidth=${naturalWidth}`)

    const html = await page.content()
    record('recap: page HTML does not leak the trip id', !html.includes(tripId), html.includes(tripId) ? 'trip id found in page HTML' : 'trip id absent')

    const leakyRequest = requestUrls.find((u) => u.includes(tripId))
    record(
      'recap: network requests do not leak the trip id',
      !leakyRequest,
      leakyRequest ?? `${requestUrls.length} request(s) checked, none leaked`,
    )
  } finally {
    page.off('request', onRequest)
  }
}

let browser
/** @type {import('playwright').BrowserContext[]} */
const contextsToTrace = []

async function main() {
  browser = await chromium.launch()
  // bypassCSP: true — the deployed CSP only allows a hashed inline script, so
  // injecting axe-core (a run-time-generated <script>) would otherwise be
  // blocked by the page's own Content-Security-Policy.
  const desktopCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT, bypassCSP: true })
  await desktopCtx.tracing.start({ screenshots: true, snapshots: true, sources: true })
  contextsToTrace.push({ ctx: desktopCtx, label: 'desktop' })
  // Clipboard permission for the Share button's fallback path (headless
  // Chromium has no navigator.share; ShareRecap falls back to
  // navigator.clipboard.writeText, then to a visible read-only input).
  await desktopCtx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })

  const consoleErrors = []
  /** @param {import('playwright').Page} page */
  function trackConsole(page) {
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`)
    })
    page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: ${String(e)}`))
  }

  const page = await desktopCtx.newPage()
  trackConsole(page)

  let uploadedPhotoId = null
  let lisbonTripId = null
  let miamiTripId = null
  // Set only just before THIS run presses Share on the trip THIS run created,
  // so the cleanup below never revokes a recap link on anyone else's trip.
  let recapLinkTripId = null

  try {
    // ------------------------------------------------------- Step 1.1 / 1.6
    if (LOCAL_MODE) {
      note('SKIPPED (production only): planning a trip from the home page via the AI planner — see Task 14')
      lisbonTripId = await createTripFixtureViaApi({
        query: LISBON_QUERY,
        slug: LISBON_SLUG,
        stops: LISBON_FIXTURE_STOPS,
        tripLengthDays: LISBON_TRIP_LENGTH_DAYS,
      })
      record('trip: Lisbon fixture created via local API', true, `id ${lisbonTripId}`)
      miamiTripId = await createTripFixtureViaApi({
        query: MIAMI_QUERY,
        slug: MIAMI_SLUG,
        stops: MIAMI_FIXTURE_STOPS,
        tripLengthDays: MIAMI_TRIP_LENGTH_DAYS,
      })
      record('trip: Miami fixture created via local API', true, `id ${miamiTripId}`)
    } else {
      lisbonTripId = await planFromHomePage(page, LISBON_PLANNER_PROMPT)
      record('plan: "3 days in Lisbon" lands on /trip/<id> with Plan tab visible', true, `id ${lisbonTripId}`)
    }

    // ------------------------------------------------------------- Step 1.2
    await page.goto(`${BASE}/trip/${lisbonTripId}/phrasebook`, { waitUntil: 'networkidle' })
    const phraseRows = page.locator('.chronicle-phrase-row')
    const firstPhraseVisible = await pollUntil(async () => (await phraseRows.count()) > 0)
    record('phrasebook: at least one phrase row visible', Boolean(firstPhraseVisible), `${await phraseRows.count()} row(s)`)
    const phrasebookHtml = await page.content()
    record('phrasebook: no "English-speaking" text for Lisbon', !phrasebookHtml.includes('English-speaking'))

    // ------------------------------------------------------------- Step 1.3
    await page.goto(`${BASE}/trip/${lisbonTripId}/money`, { waitUntil: 'networkidle' })
    const moneyRows = page.locator('table.chronicle-money-table tbody tr')
    await pollUntil(async () => (await moneyRows.count()) > 0, { timeoutMs: MONEY_TABLE_POLL_TIMEOUT_MS })
    const moneyRowCount = await moneyRows.count()
    record('money: table has 6 body rows', moneyRowCount === EXPECTED_MONEY_ROWS, `${moneyRowCount} row(s)`)
    const lastRowFirstCell = moneyRowCount > 0 ? (await moneyRows.nth(moneyRowCount - 1).locator('td').first().textContent())?.trim() : null
    record(
      `money: last row starts with ${EXPECTED_LAST_ROW_USD}`,
      lastRowFirstCell === EXPECTED_LAST_ROW_USD,
      `got "${lastRowFirstCell}"`,
    )
    const attributionLink = page.getByRole('link', { name: 'Rates By Exchange Rate API' })
    record('money: attribution link present', await attributionLink.count().then((n) => n > 0))

    // ------------------------------------------------------------- Step 1.4
    const tripDetail = await getJson(`/api/trips/${lisbonTripId}`)
    const firstStop = tripDetail.body.itinerary?.[0]
    if (!firstStop?.text) throw new Error('fixture trip has no first stop to attach a photo to')
    const stopName = firstStop.text

    await page.goto(`${BASE}/trip/${lisbonTripId}/plan`, { waitUntil: 'networkidle' })
    const addPhotoBtn = page.getByRole('button', { name: `Add photo to ${stopName}` })
    await addPhotoBtn.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    // The hidden file input now carries its own aria-label ("Choose a photo
    // for {stop}"), distinct from the visible button's "Add photo to {stop}"
    // (Task 13b fixed the axe `label` violation) — a real accessible-name
    // locator, not a CSS/sibling reach-around.
    const fileInput = page.getByLabel(`Choose a photo for ${stopName}`)

    const uploadResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/api/trips/${lisbonTripId}/photos`) && res.request().method() === 'POST',
      { timeout: NETWORK_RESPONSE_TIMEOUT_MS },
    )
    await fileInput.setInputFiles(REAL_PHOTO_PATH)
    const uploadResponse = await uploadResponsePromise
    record('photos: POST /api/trips/:id/photos returns 201', uploadResponse.status() === 201, `got ${uploadResponse.status()}`)
    const uploadedPhoto = await uploadResponse.json().catch(() => null)
    // Only ever the id THIS run's own upload just returned — cleanup below
    // can therefore never delete a photo this run did not create.
    uploadedPhotoId = uploadedPhoto?.id ?? null

    const thumbnail = page.getByAltText(new RegExp(`at ${stopName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    await thumbnail.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    record('photos: thumbnail with the stop\'s name in its alt renders', true, await thumbnail.getAttribute('alt'))

    // ------------------------------------------------------------- Step 1.5
    await page.goto(`${BASE}/trip/${lisbonTripId}/recap`, { waitUntil: 'networkidle' })
    recapLinkTripId = lisbonTripId
    await page.getByRole('button', { name: 'Share recap' }).click()

    const shareOutcome = await pollUntil(async () => {
      const status = await page.locator('p.chronicle-save-hint').first().textContent().catch(() => '')
      if (status?.includes('copied')) {
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
        if (clipboardText) return { url: clipboardText }
      }
      const manualInput = page.locator('.chronicle-recap-share-manual input')
      if (await manualInput.count()) {
        const value = await manualInput.inputValue().catch(() => null)
        if (value) return { url: value }
      }
      return null
    })
    if (!shareOutcome?.url) throw new Error('Share recap produced neither a clipboard URL nor a manual fallback URL')
    const recapUrl = shareOutcome.url
    record('recap: Share recap produces a /recap/ link (clipboard or fallback input)', recapUrl.includes('/recap/'), recapUrl)

    const viewerCtx = await browser.newContext() // no cookies from the owner's session
    await viewerCtx.tracing.start({ screenshots: true, snapshots: true, sources: true })
    contextsToTrace.push({ ctx: viewerCtx, label: 'recap-viewer' })
    const viewerPage = await viewerCtx.newPage()
    trackConsole(viewerPage)

    await verifyRecapDoesNotLeakTripId(viewerPage, recapUrl, lisbonTripId)

    const nextTripLink = viewerPage.getByRole('link', { name: 'Plan your next trip with us' })
    record('recap: "Plan your next trip with us" link exists', await nextTripLink.count().then((n) => n > 0))

    // viewerCtx is stopped and closed with every other context in the
    // `finally` block below, so its trace is saved rather than discarded.

    // ------------------------------------------------------------- Step 1.6
    if (!LOCAL_MODE) {
      miamiTripId = await planFromHomePage(page, MIAMI_PLANNER_PROMPT)
      record('plan: "4 days in Miami" lands on /trip/<id>', true, `id ${miamiTripId}`)
    } else {
      await page.goto(`${BASE}/trip/${miamiTripId}`, { waitUntil: 'networkidle' })
    }
    // Positive anchor FIRST: prove the trip's nav actually rendered (the Plan
    // tab is unconditional — see TripNav.tsx's tripPages()) before trusting
    // that Phrases/Money are absent. An absence check with no positive anchor
    // passes vacuously on a blank or broken nav.
    // exact + .first(): "Plan" (unscoped, substring) also matches the
    // Overview page's "Open trip plan →" link and the footer nav's own
    // "Plan" link — .first() picks the pill nav's, matching planFromHomePage's
    // existing anchor above.
    const planTab = page.getByRole('link', { name: 'Plan', exact: true }).first()
    await planTab.waitFor({ state: 'visible', timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    record('nav: Miami trip nav renders (Plan tab visible, positive anchor)', true)
    const phrasesTab = page.getByRole('link', { name: 'Phrases' })
    const moneyTab = page.getByRole('link', { name: 'Money' })
    record('nav: Miami (domestic) hides the Phrases tab', (await phrasesTab.count()) === 0, `${await phrasesTab.count()} match(es)`)
    record('nav: Miami (domestic) hides the Money tab', (await moneyTab.count()) === 0, `${await moneyTab.count()} match(es)`)

    // ------------------------------------------------------------- Step 1.7
    await runAxeBothThemes(page, 'money', `${BASE}/trip/${lisbonTripId}/money`)
    await runAxeBothThemes(page, 'plan', `${BASE}/trip/${lisbonTripId}/plan`)
    await runAxeBothThemes(page, 'recap-public', recapUrl)

    // ------------------------------------------------------ engine: mobile
    // Same Chromium binary, a second context at 375px — never a WebKit
    // project (devices['iPhone 13'].defaultBrowserType === 'webkit').
    const mobileCtx = await browser.newContext({ viewport: MOBILE_VIEWPORT })
    await mobileCtx.tracing.start({ screenshots: true, snapshots: true, sources: true })
    contextsToTrace.push({ ctx: mobileCtx, label: 'mobile-375' })
    const mobilePage = await mobileCtx.newPage()
    trackConsole(mobilePage)

    for (const [label, url] of [
      ['money', `${BASE}/trip/${lisbonTripId}/money`],
      ['plan', `${BASE}/trip/${lisbonTripId}/plan`],
      ['recap-public', recapUrl],
    ]) {
      await mobilePage.goto(url, { waitUntil: 'networkidle' })
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      record(`engine/Chromium 375px — ${label}: no horizontal overflow`, overflow <= 0, `${overflow}px`)
    }

    // ------------------------------------------------------------- Step 1.8
    // Checked last so every page visited above (including the mobile pass
    // and both axe reloads) has had a chance to log a console error.
    record('console: zero errors across every page visited', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } finally {
    // ------------------------------------------------------------- Step 1.9
    if (uploadedPhotoId && lisbonTripId) {
      const deleted = await getJson(`/api/trips/${lisbonTripId}/photos/${uploadedPhotoId}`, { method: 'DELETE' })
      record('cleanup: test photo deleted', deleted.status === 200, `got ${deleted.status}`)
    }
    if (recapLinkTripId) {
      // Caught so a failed revoke is recorded without skipping the trace saves below.
      try {
        const revoked = await getJson(`/api/trips/${recapLinkTripId}/recap-link`, { method: 'DELETE' })
        record('cleanup: test recap link revoked', revoked.status === 200, `got ${revoked.status}`)
      } catch (err) {
        record('cleanup: test recap link revoked', false, err instanceof Error ? err.message : String(err))
      }
    }

    mkdirSync(TRACE_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    for (const { ctx, label } of contextsToTrace) {
      try {
        await ctx.tracing.stop({ path: path.join(TRACE_DIR, `${stamp}-${label}.zip`) })
      } catch (err) {
        console.error(`trace save failed for ${label}:`, err instanceof Error ? err.message : err)
      }
      await ctx.close().catch(() => {})
    }
    await browser.close().catch(() => {})
  }
}

main()
  .catch((err) => {
    record('suite ran to completion', false, err instanceof Error ? err.message : String(err))
  })
  .finally(() => {
    const failed = results.filter((r) => !r.pass)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    if (failed.length > 0) {
      console.log('FAILED:')
      for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
    }
    process.exit(failed.length > 0 ? 1 : 0)
  })
