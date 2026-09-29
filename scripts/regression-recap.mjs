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
 * Local proof mode (--trip <id>): the AI planner needs a live OPENAI_API_KEY,
 * and /api/location needs live GOOGLE_PLACES_API_KEY/TRIPADVISOR_API_KEY to
 * cache a `locations` row (trips.location_slug is a foreign key against it) —
 * neither may be valid in a local sandbox. When --trip is passed, the script
 * skips the browser-driven "plan from the home page" step for BOTH trips and
 * instead creates them directly through the local REST API with a fixed,
 * real-place fixture itinerary (Lisbon and Miami landmarks with real
 * coordinates), so every other check (nav gating, Money table, photo upload,
 * recap share, axe, console) still runs against a real render. The requested
 * id is reused if it already names a trip; otherwise a fresh trip is created
 * and the new id is logged. This mode proves the script's *checks* work; it
 * does not prove the home-page AI planning flow, which is production-only
 * (Task 14) and is recorded as a SKIPPED line, never a silent pass.
 *
 * Usage:
 *   node scripts/regression-recap.mjs https://trip-one.pages.dev
 *   node scripts/regression-recap.mjs http://127.0.0.1:5199 --trip <existing-trip-id>
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

// ---------------------------------------------------------------- CLI args
const rawArgs = process.argv.slice(2)
const BASE = (rawArgs[0] ?? '').replace(/\/$/, '')
if (!BASE || BASE.startsWith('--')) {
  console.error('usage: node scripts/regression-recap.mjs <base-url> [--trip <existing-trip-id>]')
  process.exit(2)
}
const tripFlagIndex = rawArgs.indexOf('--trip')
/** When set, skip the AI-planner UI flow and build trips through the local API instead (see file header). */
const LOCAL_TRIP_ID = tripFlagIndex !== -1 ? rawArgs[tripFlagIndex + 1] : null
if (tripFlagIndex !== -1 && !LOCAL_TRIP_ID) {
  console.error('--trip requires an id argument')
  process.exit(2)
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

/** Real, non-synthesized image uploaded to prove the photo pipeline (client resizes/re-encodes it before upload). */
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
async function pollUntil(fn, { timeoutMs = 15000, intervalMs = 250 } = {}) {
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
 * Ensures a trip fixture exists via direct API calls (no browser), building a
 * real-place itinerary and skipping the (paid, key-dependent) AI planner.
 * Primes the location cache first, since `trips.location_slug` is a foreign
 * key against `locations.slug` — in production this cache write happens
 * naturally inside `/api/location`; locally it only succeeds if Places/
 * Tripadvisor return real data, which the caller must ensure out of band when
 * running against a sandbox with invalid keys (see file header).
 * @param {{ query: string, slug: string, stops: object[], tripLengthDays: number, requestedId: string | null }} args
 * @returns {Promise<string>} the trip id actually used
 */
async function ensureTripViaApi({ query, slug, stops, tripLengthDays, requestedId }) {
  if (requestedId) {
    const existing = await getJson(`/api/trips/${encodeURIComponent(requestedId)}`)
    if (existing.status === 200) {
      const patched = await getJson(`/api/trips/${requestedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: stops, trip_length_days: tripLengthDays }),
      })
      if (patched.status !== 200) throw new Error(`reused trip ${requestedId} but itinerary PATCH failed: HTTP ${patched.status}`)
      note(`local mode: reused existing trip ${requestedId}`)
      return requestedId
    }
  }

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
  if (requestedId && requestedId !== tripId) {
    note(`local mode: --trip ${requestedId} did not exist; created a new trip ${tripId} instead`)
  }
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
 * file header). Spends one call to the paid /api/plan-intent + /api/plan pair.
 * @param {import('playwright').Page} page
 * @param {string} promptText - Free-text request, e.g. "3 days in Lisbon"
 * @returns {Promise<string>} the created trip's id, read back from the URL
 */
async function planFromHomePage(page, promptText) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const box = page.getByPlaceholder(/San Diego/i)
  await box.waitFor({ state: 'visible', timeout: 20000 })
  await box.fill(promptText)
  await page.getByRole('button', { name: /plan my trip/i }).click()
  await page.waitForURL(/\/trip\/[^/]+$/, { timeout: 120000 })
  await page.getByRole('link', { name: 'Plan' }).first().waitFor({ state: 'visible', timeout: 20000 })
  const match = /\/trip\/([^/]+)/.exec(new URL(page.url()).pathname)
  if (!match) throw new Error(`landed on an unexpected URL after planning: ${page.url()}`)
  return match[1]
}

/**
 * Injects the pinned axe-core build (a repo devDependency, never an
 * out-of-repo path) and runs it, recording one check per color scheme.
 * Fails on any `serious`/`critical` violation; `moderate`/`minor` are logged
 * but not gated, matching the playwright-qa skill's contrast/a11y guidance
 * (use the standard implementation, never a hand-rolled contrast check).
 * @param {import('playwright').Page} page
 * @param {string} pageLabel - Short label for check names, e.g. "money"
 * @param {string} url - Full URL to load
 */
async function runAxeBothThemes(page, pageLabel, url) {
  const axeSource = readFileSync(AXE_SCRIPT_PATH, 'utf8')
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.addScriptTag({ content: axeSource })
    const axeResult = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }))
    const severe = axeResult.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    record(
      `axe/${pageLabel} (${scheme}): zero serious/critical violations`,
      severe.length === 0,
      severe.length > 0 ? severe.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} node(s))`).join('; ') : `${axeResult.violations.length} lower-impact`,
    )
  }
}

/**
 * Checks that a page's rendered HTML does not contain a literal trip id — the
 * public recap route must never leak the owner's editable trip id (see
 * `NonRecapUrlError`/`recapUrlFor` in ShareRecap.tsx). Factored out as a named
 * function (rather than inlined) so Step 2's "prove it can fail" copy can
 * point the SAME check at the owner's `/trip/:id/recap` URL, which DOES embed
 * the id in its nav links, and confirm the assertion actually fails there.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {string} tripId
 * @param {string} checkName
 */
async function checkNoTripIdLeak(page, url, tripId, checkName) {
  await page.goto(url, { waitUntil: 'networkidle' })
  const html = await page.content()
  record(checkName, !html.includes(tripId), html.includes(tripId) ? 'trip id found in page HTML' : 'trip id absent')
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

  try {
    // ------------------------------------------------------- Step 1.1 / 1.6
    if (LOCAL_TRIP_ID) {
      note('SKIPPED (production only): planning a trip from the home page via the AI planner — see Task 14')
      lisbonTripId = await ensureTripViaApi({
        query: LISBON_QUERY,
        slug: LISBON_SLUG,
        stops: LISBON_FIXTURE_STOPS,
        tripLengthDays: LISBON_TRIP_LENGTH_DAYS,
        requestedId: LOCAL_TRIP_ID,
      })
      record('trip: Lisbon fixture created/reused via local API', true, `id ${lisbonTripId}`)
      miamiTripId = await ensureTripViaApi({
        query: MIAMI_QUERY,
        slug: MIAMI_SLUG,
        stops: MIAMI_FIXTURE_STOPS,
        tripLengthDays: MIAMI_TRIP_LENGTH_DAYS,
        requestedId: null,
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
    await pollUntil(async () => (await moneyRows.count()) > 0, { timeoutMs: 20000 })
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
    await addPhotoBtn.waitFor({ state: 'visible', timeout: 20000 })
    // The file input is deliberately hidden and unlabeled (StopPhotoButton
    // opens it via a ref, never by direct user focus) — it is the button's
    // sibling inside the same .chronicle-photo-row, not a nested descendant.
    const photoRow = page.locator('.chronicle-photo-row', { has: page.getByRole('button', { name: `Add photo to ${stopName}` }) })
    const fileInput = photoRow.locator('input[type="file"]')

    const uploadResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/api/trips/${lisbonTripId}/photos`) && res.request().method() === 'POST',
      { timeout: 30000 },
    )
    await fileInput.setInputFiles(REAL_PHOTO_PATH)
    const uploadResponse = await uploadResponsePromise
    record('photos: POST /api/trips/:id/photos returns 201', uploadResponse.status() === 201, `got ${uploadResponse.status()}`)
    const uploadedPhoto = await uploadResponse.json().catch(() => null)
    uploadedPhotoId = uploadedPhoto?.id ?? null

    const thumbnail = page.getByAltText(new RegExp(`at ${stopName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    await thumbnail.waitFor({ state: 'visible', timeout: 20000 })
    record('photos: thumbnail with the stop\'s name in its alt renders', true, await thumbnail.getAttribute('alt'))

    // ------------------------------------------------------------- Step 1.5
    await page.goto(`${BASE}/trip/${lisbonTripId}/recap`, { waitUntil: 'networkidle' })
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

    await checkNoTripIdLeak(viewerPage, recapUrl, lisbonTripId, 'recap: public page HTML does not leak the trip id')

    const slideshowImg = viewerPage.getByRole('region', { name: 'Photo slideshow' }).locator('img')
    await slideshowImg.waitFor({ state: 'visible', timeout: 20000 })
    const naturalWidth = await pollUntil(
      async () => slideshowImg.evaluate((el) => (el instanceof HTMLImageElement ? el.naturalWidth : 0)),
      { timeoutMs: 15000 },
    )
    record('recap: public slideshow image loads (naturalWidth > 0)', Boolean(naturalWidth) && naturalWidth > 0, `naturalWidth=${naturalWidth}`)

    const nextTripLink = viewerPage.getByRole('link', { name: 'Plan your next trip with us' })
    record('recap: "Plan your next trip with us" link exists', await nextTripLink.count().then((n) => n > 0))

    // viewerCtx is stopped and closed with every other context in the
    // `finally` block below, so its trace is saved rather than discarded.

    // ------------------------------------------------------------- Step 1.6
    if (!LOCAL_TRIP_ID) {
      miamiTripId = await planFromHomePage(page, MIAMI_PLANNER_PROMPT)
      record('plan: "4 days in Miami" lands on /trip/<id>', true, `id ${miamiTripId}`)
    } else {
      await page.goto(`${BASE}/trip/${miamiTripId}`, { waitUntil: 'networkidle' })
    }
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
