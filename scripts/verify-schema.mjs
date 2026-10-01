/**
 * Verifies expected D1 tables are reachable via the Cloudflare REST API.
 *
 * Uses the same Cloudflare credentials as `npm run backup` — never hardcode tokens.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_D1_DATABASE_ID
 */
import { readFileSync } from 'node:fs'

/**
 * The tables, and for the newer tables every column the Functions code reads
 * or writes. A table can exist while a later `alter table ... add column`
 * migration was never applied, and then only the statements naming that
 * column fail, at runtime. The same file is checked against the local
 * migrations by functions/lib/schemaExpectations.test.ts.
 * @type {{ tables: string[], columns: Record<string, string[]> }}
 */
const EXPECTATIONS = JSON.parse(readFileSync(new URL('./schema-expectations.json', import.meta.url), 'utf8'))
const EXPECTED_TABLES = EXPECTATIONS.tables
const EXPECTED_COLUMNS = EXPECTATIONS.columns

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
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function d1Query(cfg, sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
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
    throw new Error(apiErrors)
  }

  const result = Array.isArray(body.result) ? body.result[0] : null
  return Array.isArray(result?.results) ? result.results : []
}

async function main() {
  const cfg = readConfig()
  const rows = await d1Query(
    cfg,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  const present = new Set(
    rows.map((row) => (typeof row.name === 'string' ? row.name : '')).filter(Boolean),
  )

  let failed = false
  for (const table of EXPECTED_TABLES) {
    if (!present.has(table)) {
      console.error(`FAIL: ${table} — not found in sqlite_master`)
      failed = true
      continue
    }
    try {
      // Identifier is from our fixed EXPECTED_TABLES list, not user input.
      await d1Query(cfg, `SELECT 1 AS ok FROM ${table} LIMIT 1`)
      console.log(`OK: ${table} reachable`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`FAIL: ${table} — ${message}`)
      failed = true
    }
  }

  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    try {
      // Identifier is from our fixed EXPECTED_COLUMNS map, not user input.
      const infoRows = await d1Query(cfg, `SELECT name FROM pragma_table_info('${table}')`)
      const actual = new Set(infoRows.map((row) => (typeof row.name === 'string' ? row.name : '')))
      const missing = columns.filter((column) => !actual.has(column))
      if (missing.length > 0) {
        console.error(`FAIL: ${table} — missing column(s): ${missing.join(', ')}`)
        failed = true
      } else {
        console.log(`OK: ${table} has all ${columns.length} expected columns`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`FAIL: ${table} columns — ${message}`)
      failed = true
    }
  }

  if (failed) process.exit(1)
  console.log('Schema verification passed')
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`verify-schema failed: ${message}`)
  process.exit(1)
})
