/**
 * Seeds the demo trips (Yellowstone, Tokyo) into Cloudflare D1.
 *
 * Uses the D1 REST query API with the same account secrets as `npm run backup`
 * — never hardcode tokens.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN   (D1:Edit for writes)
 *   CLOUDFLARE_D1_DATABASE_ID
 */
import { DEMO_TRIP_IDS } from '../src/lib/api/demoIds.ts'

/**
 * @returns {{ accountId: string, apiToken: string, databaseId: string }}
 */
function readConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim()
  if (!accountId || !apiToken || !databaseId) {
    console.error(
      'Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_D1_DATABASE_ID first.',
    )
    process.exit(1)
  }
  return { accountId, apiToken, databaseId }
}

/**
 * @param {{ accountId: string, apiToken: string, databaseId: string }} cfg
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<void>}
 */
async function d1Query(cfg, sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`D1 network error: ${message}`)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) {
    const apiErrors = Array.isArray(body?.errors)
      ? body.errors.map((e) => e?.message ?? JSON.stringify(e)).join('; ')
      : `HTTP ${response.status}`
    throw new Error(`D1 query failed: ${apiErrors}`)
  }
}

const demos = [
  {
    id: DEMO_TRIP_IDS.yellowstone,
    module: '../src/data/demo-yellowstone.ts',
    exportName: 'DEMO_YELLOWSTONE',
  },
  {
    id: DEMO_TRIP_IDS.tokyo,
    module: '../src/data/demo-tokyo.ts',
    exportName: 'DEMO_TOKYO',
  },
]

async function main() {
  const cfg = readConfig()

  for (const demo of demos) {
    const mod = await import(demo.module)
    const data = mod[demo.exportName]
    if (!data) throw new Error(`Missing export ${demo.exportName} from ${demo.module}`)

    await d1Query(
      cfg,
      `INSERT INTO locations (slug, lat, lng, display_name, things_to_do, last_refreshed)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(slug) DO UPDATE SET
         lat = excluded.lat,
         lng = excluded.lng,
         display_name = excluded.display_name,
         things_to_do = excluded.things_to_do,
         last_refreshed = excluded.last_refreshed`,
      [data.slug, data.lat, data.lng, data.displayName, JSON.stringify([])],
    )

    await d1Query(
      cfg,
      `INSERT INTO trips (id, location_slug, itinerary, design_style, created_at)
       VALUES (?, ?, ?, 'bento', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(id) DO UPDATE SET
         location_slug = excluded.location_slug,
         itinerary = excluded.itinerary,
         design_style = excluded.design_style`,
      [demo.id, data.slug, JSON.stringify(data.itinerary)],
    )

    console.log(`Seeded ${data.slug} at trip id ${demo.id}`)
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`seed-demos failed: ${message}`)
  process.exit(1)
})
