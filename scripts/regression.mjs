/**
 * End-to-end regression suite for a DEPLOYED trip-one build.
 *
 * Every check here corresponds to something that actually broke, or that was
 * nearly missed because a check was written against a guessed selector or a
 * guessed field name. The guiding rule: assert against the REAL contract, and
 * fail loudly rather than silently degrading to a passing "0 of 0".
 *
 * Usage:
 *   node scripts/regression.mjs https://trip-one.pages.dev
 *   node scripts/regression.mjs https://<preview>.trip-one.pages.dev
 *
 * Exits non-zero on any failure. Prints one line per check.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? '').replace(/\/$/, '')
if (!BASE) {
  console.error('usage: node scripts/regression.mjs <deployed-base-url>')
  process.exit(2)
}

/** A city with reliably rich data, used to build the fixture trip. */
const CITY = 'Porto, Portugal'
const CITY_SLUG = 'porto-portugal'
/** Trip length for the fixture; must be > 1 so day tabs are expected to render. */
const TRIP_DAYS = 4
/** Desktop viewport used for the width assertion. */
const DESKTOP = { width: 1440, height: 900 }
/** Mobile viewport — must never introduce horizontal overflow. */
const MOBILE = { width: 375, height: 812 }
/** Main content wrapper must occupy at least this share of the desktop
 *  *viewport* (window.innerWidth). Measuring against a padded inner column is
 *  unfalsifiable — content at width:100% of a 376px-guttered column always
 *  reads ~100% while only ~77% of the real desktop width (measured 1373/1780). */
const MIN_MAIN_WIDTH_PCT = 90
/**
 * Floor for *painted* structural chrome (trip header / map frame), as a share
 * of the viewport — NOT the chapter wrapper.
 *
 * WHY this number (and why it is separate from MIN_MAIN_WIDTH_PCT):
 * The 2026-07 production bug measured on Home/overview @1280px:
 *   .chronicle-chapter        1233px  96.3%  ← wrapper check PASSED
 *   .chronicle-trip-header     595px  46.5%  ← narrow centred pill
 *   .chronicle-map-frame       646px  50.5%  ← narrow map card
 *   .chronicle-preview-card    680px  53.1%  ← narrow stacked cards
 * A block-level box is full-width by default, so asserting only
 * `.chronicle-chapter` proved nothing about visible content. Layout after the
 * fix (desktop @1440, page padding 16px each side):
 *   chapter / header / map span the book column ≈ 97% of viewport;
 *   at ≥1100px overview previews sit in a 3-column row spanning that column.
 * 80% is a meaningful floor: it fails the old ~50% centred layout while
 * tolerating chapter padding and borders. Preview *span* (union of all cards)
 * uses the same floor so a single 680px centred column cannot pass.
 */
const MIN_PAINTED_WIDTH_PCT = 80
/** Map must not be overcrowded. */
const MAX_PINS = 30
/** A destination this rich must yield at least this many pins, or filtering is too aggressive. */
const MIN_PINS = 5
/**
 * Trip length used when growing the fixture via the Plan page control.
 * Larger than TRIP_DAYS so adjustItineraryForTripLength pulls more candidates.
 */
const GROWN_TRIP_DAYS = 8

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/**
 * Counts stops whose normalized name (trim + lowercase) already appeared
 * earlier in the list. Used to catch the Tokyo-demo drift class of bug
 * (Odaiba Beach / Odaiba Marine Park / Isshiki Beach exact pairs).
 * @param {Array<{ text?: string }>} stops
 * @returns {number} number of later duplicates (0 means all unique)
 */
function countDuplicateNormalizedStopNames(stops) {
  if (!Array.isArray(stops)) return -1
  const seen = new Set()
  let dups = 0
  for (const s of stops) {
    const key = String(s?.text ?? '').trim().toLowerCase()
    if (key === '') continue
    if (seen.has(key)) dups += 1
    else seen.add(key)
  }
  return dups
}

/** Fetch JSON and fail loudly on a non-JSON body (an HTML 404 must not read as {}). */
async function getJson(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 80)}`)
  }
  return { status: res.status, body }
}

/**
 * Measures wrapper + painted content widths as % of viewport.
 * Always returns measured percentages so a regression is visible in the log
 * even when the assertion passes.
 *
 * @param {import('playwright').Page} page
 * @param {{ expectPreviewCards: boolean }} opts
 */
async function measureLayout(page, opts) {
  return page.evaluate((options) => {
    const viewportW = window.innerWidth
    const pct = (px) => (viewportW > 0 ? (px / viewportW) * 100 : 0)

    /**
     * Bounding-box width of one element.
     * @param {Element | null} el
     */
    const widthOf = (el) => (el ? el.getBoundingClientRect().width : 0)

    /**
     * Horizontal span of every match (max right − min left). Catches a row of
     * cards that each look "narrow" but together fill the column — and fails
     * when a single centred 680px card is the only painted content.
     * @param {string} selector
     */
    const spanOf = (selector) => {
      const els = [...document.querySelectorAll(selector)]
      if (els.length === 0) return { spanPx: 0, count: 0, widths: [] }
      let minL = Infinity
      let maxR = -Infinity
      /** @type {number[]} */
      const widths = []
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 && r.height <= 0) continue
        minL = Math.min(minL, r.left)
        maxR = Math.max(maxR, r.right)
        widths.push(r.width)
      }
      if (!Number.isFinite(minL) || !Number.isFinite(maxR)) {
        return { spanPx: 0, count: 0, widths: [] }
      }
      return { spanPx: Math.max(0, maxR - minL), count: widths.length, widths }
    }

    const chapter = document.querySelector('.chronicle-chapter') || document.querySelector('main')
    const header = document.querySelector('.chronicle-trip-header')
    const mapFrame = document.querySelector('.chronicle-map-frame')
    // Only the Up next / Nearby / Local info row — not the Map preview card.
    // Measuring all .chronicle-preview-card would include a full-width map card
    // and hide a still-narrow centred stack of the three content cards.
    const previews = spanOf('.chronicle-overview-previews .chronicle-preview-card')

    return {
      viewportW,
      overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chapterW: widthOf(chapter),
      chapterPct: pct(widthOf(chapter)),
      headerW: widthOf(header),
      headerPct: pct(widthOf(header)),
      mapW: widthOf(mapFrame),
      mapPct: pct(widthOf(mapFrame)),
      previewSpanW: previews.spanPx,
      previewSpanPct: pct(previews.spanPx),
      previewCount: previews.count,
      previewWidths: previews.widths.map((w) => Math.round(w)),
      expectPreviewCards: options.expectPreviewCards,
    }
  }, opts)
}

/**
 * Records container + painted-content layout assertions for the current page.
 * @param {string} pageLabel  short path label for check names (e.g. "overview", "plan")
 * @param {Awaited<ReturnType<typeof measureLayout>>} layout
 */
function recordDesktopLayout(pageLabel, layout) {
  const fmt = (pct, px) => `${pct.toFixed(1)}% (${Math.round(px)}px / ${layout.viewportW}px)`

  record(
    `layout/${pageLabel}: chapter (wrapper) >= ${MIN_MAIN_WIDTH_PCT}% of viewport`,
    layout.chapterPct >= MIN_MAIN_WIDTH_PCT,
    fmt(layout.chapterPct, layout.chapterW),
  )
  record(
    `layout/${pageLabel}: trip header (painted) >= ${MIN_PAINTED_WIDTH_PCT}% of viewport`,
    layout.headerW > 0 && layout.headerPct >= MIN_PAINTED_WIDTH_PCT,
    layout.headerW > 0
      ? fmt(layout.headerPct, layout.headerW)
      : 'header not found',
  )
  record(
    `layout/${pageLabel}: map frame (painted) >= ${MIN_PAINTED_WIDTH_PCT}% of viewport`,
    layout.mapW > 0 && layout.mapPct >= MIN_PAINTED_WIDTH_PCT,
    layout.mapW > 0 ? fmt(layout.mapPct, layout.mapW) : 'map frame not found',
  )

  if (layout.expectPreviewCards) {
    // Union span of Up next / Nearby / Local info (and Map card if present).
    // Detail string always prints measured % so a silent shrink is visible.
    record(
      `layout/${pageLabel}: preview cards span (painted) >= ${MIN_PAINTED_WIDTH_PCT}% of viewport`,
      layout.previewCount > 0 && layout.previewSpanPct >= MIN_PAINTED_WIDTH_PCT,
      layout.previewCount > 0
        ? `${fmt(layout.previewSpanPct, layout.previewSpanW)}; n=${layout.previewCount}; widths=[${layout.previewWidths.join(',')}]`
        : 'no .chronicle-preview-card elements',
    )
  }

  record(
    `layout/${pageLabel}: no horizontal overflow`,
    layout.overflowPx <= 0,
    `${layout.overflowPx}px`,
  )
}

async function main() {
  // ---------------------------------------------------------------- API shape
  // A renamed field once made every reading of this endpoint look like zero
  // results, which was misdiagnosed as a production outage. Assert the exact
  // field names, not just "some data came back".
  const loc = await getJson(`/api/location?q=${encodeURIComponent(CITY)}`)
  record('location: HTTP 200', loc.status === 200, `got ${loc.status}`)
  record(
    'location: uses camelCase `thingsToDo` (not things_to_do)',
    Array.isArray(loc.body.thingsToDo) && loc.body.things_to_do === undefined,
    `keys: ${Object.keys(loc.body).join(',')}`,
  )
  record('location: has coordinates', typeof loc.body.lat === 'number' && typeof loc.body.lng === 'number')
  const things = loc.body.thingsToDo ?? []
  record('location: returns real places', things.length > 0, `${things.length} things`)
  record(
    'location: places carry coordinates',
    things.some((t) => typeof t.lat === 'number' && typeof t.lng === 'number'),
  )

  // place-details must never 404 for an unresolvable name — that produced a
  // console error and an empty panel for ~20% of pins (Tripadvisor entries
  // have no placeId and Find Place returns ZERO_RESULTS for many names).
  const unresolvable = await getJson('/api/place-details?name=PadToGo&lat=41.15014&lng=-8.61102')
  record(
    'place-details: unresolvable name returns 200, not 404',
    unresolvable.status === 200,
    `got ${unresolvable.status}`,
  )

  const withId = things.find((t) => t.placeId)
  if (withId) {
    const d = await getJson(`/api/place-details?placeId=${encodeURIComponent(withId.placeId)}`)
    record('place-details: placeId lookup returns detail', d.status === 200 && !!d.body.name)
  }

  // Experiences endpoint must fail soft, never 500, even with no key.
  const exp = await getJson('/api/experiences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 41.1579, lng: -8.6291, currency: 'USD' }),
  })
  record('experiences: returns 200 and an array', exp.status === 200 && Array.isArray(exp.body.experiences))
  for (const e of exp.body.experiences ?? []) {
    // A price without a confirmed currency is a 100x error waiting to happen.
    if (e.priceFrom != null) {
      record(`experiences: "${String(e.name).slice(0, 24)}" price has a currency`, !!e.currency)
      break
    }
  }

  // ------------------------------------------------------------ fixture trip
  const created = await getJson('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location_slug: CITY_SLUG }),
  })
  if (created.status !== 201 || !created.body.id) {
    record('trip: created', false, `HTTP ${created.status}`)
    return
  }
  const tripId = created.body.id

  // Build a real multi-day itinerary so day tabs and the route line have data.
  const stops = things
    .filter((t) => typeof t.lat === 'number' && typeof t.lng === 'number')
    .slice(0, TRIP_DAYS * 2)
    .map((t, i) => ({
      time: '',
      text: t.name,
      type: 'fixed',
      day: Math.floor(i / 2) + 1,
      lat: t.lat,
      lng: t.lng,
      category: t.category,
      placeId: t.placeId,
    }))
  const patched = await getJson(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itinerary: stops, trip_length_days: TRIP_DAYS }),
  })
  record('trip: itinerary + trip_length_days saved', patched.status === 200 && patched.body.trip_length_days === TRIP_DAYS)

  // Duplicate-stop guard (Tokyo demo drift: Odaiba Beach / Odaiba Marine Park /
  // Isshiki Beach exact pairs in a stored row). Assert after building the
  // fixture — always print the count so a silent 0-of-0 can't hide a miss.
  {
    const fixtureStops = patched.body.itinerary ?? stops
    const dupCount = countDuplicateNormalizedStopNames(fixtureStops)
    record(
      'itinerary: zero duplicate normalized stop names after fixture build',
      dupCount === 0,
      `${dupCount} duplicate(s) in ${Array.isArray(fixtureStops) ? fixtureStops.length : 0} stops`,
    )
  }

  // ------------------------------------------------------------------- UI
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: DESKTOP })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // --- Overview / home (the page that regressed: narrow centred cards) -----
  // The old suite only visited /plan, so a half-empty Home dashboard passed.
  await page.goto(`${BASE}/trip/${tripId}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.chronicle-chapter', { timeout: 20000 })
  // Map may sit inside the overview dash; wait for markers when present.
  try {
    await page.waitForSelector('.leaflet-marker-icon', { timeout: 20000 })
  } catch {
    /* overview still has chapter + preview cards without pins in edge cases */
  }
  const overviewLayout = await measureLayout(page, { expectPreviewCards: true })
  recordDesktopLayout('overview', overviewLayout)

  // --- Plan page (existing map / day-tab checks) ---------------------------
  await page.goto(`${BASE}/trip/${tripId}/plan`, { waitUntil: 'networkidle' })
  // Wait for real trip chrome (map markers), not just networkidle — a failed
  // trip load once measured main content at 38.2% of the viewport and would
  // have been a false layout failure (or worse, a vacuous pass if no main).
  await page.waitForSelector('.leaflet-marker-icon', { timeout: 20000 })

  const planLayout = await measureLayout(page, { expectPreviewCards: false })
  recordDesktopLayout('plan', planLayout)

  const map = await page.evaluate(() => {
    const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
    return {
      pins: document.querySelectorAll('.leaflet-marker-icon').length,
      dashed: paths.map((p) => p.getAttribute('stroke-dasharray')).filter(Boolean),
      routeD: paths[0]?.getAttribute('d') ?? null,
      tabs: [...document.querySelectorAll('.chronicle-day-tab')].map((t) => t.textContent.trim()),
    }
  })
  record('map: day tabs render for a multi-day trip', map.tabs.length === TRIP_DAYS, map.tabs.join(' '))
  record('map: route drawn as a dashed polyline', map.dashed.length > 0, map.dashed.join('|'))
  record('map: pins are decluttered', map.pins <= MAX_PINS, `${map.pins} pins (max ${MAX_PINS})`)
  record('map: pins not over-filtered', map.pins >= MIN_PINS, `${map.pins} pins (min ${MIN_PINS})`)

  // Chat is an overlay drawer: if open it intercepts clicks on left-side day
  // tabs. Dismiss it before map interaction (no-op when already closed).
  await page.evaluate(() => {
    document.querySelector('.chronicle-chat-dock--open [aria-label="Hide chat"]')?.click()
  })
  await page.waitForTimeout(300)

  // Grow the trip via the real trip-length control so adjustItineraryForTripLength
  // runs against live thingsToDo. Then re-fetch the row and assert zero dups.
  // WHY: growth once could select the same candidate twice when the source
  // list contained duplicates (Tokyo demo Odaiba/Isshiki pairs).
  {
    const lengthSelect = page.locator('label:has-text("Trip length") select')
    await lengthSelect.waitFor({ state: 'visible', timeout: 15000 })
    const patchPromise = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/trips/${tripId}`) &&
        res.request().method() === 'PATCH' &&
        res.status() === 200,
      { timeout: 30000 },
    )
    await lengthSelect.selectOption(String(GROWN_TRIP_DAYS))
    await patchPromise
    const grown = await getJson(`/api/trips/${tripId}`)
    const grownStops = grown.body.itinerary ?? []
    const dupAfterGrow = countDuplicateNormalizedStopNames(grownStops)
    record(
      'itinerary: zero duplicate normalized stop names after growing trip length',
      grown.status === 200 && dupAfterGrow === 0,
      `${dupAfterGrow} duplicate(s) in ${Array.isArray(grownStops) ? grownStops.length : 0} stops (trip_length_days=${grown.body.trip_length_days})`,
    )
  }

  // Switching day must re-draw the route for that day.
  await page.locator('.chronicle-day-tab').nth(2).click()
  await page.waitForTimeout(1200)
  const after = await page.evaluate(() => ({
    routeD: document.querySelector('.leaflet-overlay-pane path')?.getAttribute('d') ?? null,
    selected: [...document.querySelectorAll('.chronicle-day-tab')]
      .filter((t) => t.getAttribute('aria-selected') === 'true')
      .map((t) => t.textContent.trim()),
  }))
  record('map: clicking a day selects it', after.selected.join('') === 'Day 3', after.selected.join(''))
  record('map: route changes with the selected day', after.routeD !== map.routeD)

  // The regression the user reported: clicking a pin must open the real detail
  // panel, not a bare popup. Check several pins, including ones far down the
  // list, because the failure only hit entries without a placeId.
  let opened = 0
  const probes = [1, 4, 9]
  for (const i of probes) {
    await page.evaluate((idx) => {
      document.querySelector('[role="dialog"] [aria-label="Close details"]')?.click()
      document.querySelector('.leaflet-popup-close-button')?.click()
      const m = [...document.querySelectorAll('.leaflet-marker-icon')][idx]
      m?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }, i)
    try {
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 })
      opened += 1
    } catch {
      /* counted as a failure below */
    }
  }
  record('map: clicking a pin opens the place detail panel', opened === probes.length, `${opened}/${probes.length} pins`)

  record('console: zero errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  // Mobile must keep zero horizontal overflow (the 375px layout is full-bleed
  // map + flattened chapter chrome — a desktop width change must not leak in).
  await page.setViewportSize(MOBILE)
  await page.goto(`${BASE}/trip/${tripId}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.chronicle-chapter', { timeout: 20000 })
  const mobileOverviewOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  record(
    'layout/overview: no horizontal overflow at 375px',
    mobileOverviewOverflow <= 0,
    `${mobileOverviewOverflow}px`,
  )

  await page.goto(`${BASE}/trip/${tripId}/plan`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.leaflet-marker-icon', { timeout: 20000 })
  const mobilePlanOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  record('layout/plan: no horizontal overflow at 375px', mobilePlanOverflow <= 0, `${mobilePlanOverflow}px`)

  // Required pages must stay reachable.
  for (const p of ['/', '/about', '/terms', '/privacy']) {
    const res = await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' })
    record(`pages: ${p} reachable`, res?.status() === 200, `HTTP ${res?.status()}`)
  }

  await browser.close()
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
