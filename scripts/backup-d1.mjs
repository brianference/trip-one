/**
 * Local D1 backup for trip-one.
 *
 * Pulls every user table from the production Cloudflare D1 database via the
 * REST query API and writes a plain JSON dump to a gitignored local directory.
 *
 * WHY local-only (no GitHub Actions, no artifacts, no encryption):
 * This repository is PUBLIC. On a public repo, workflow artifacts are
 * downloadable by anyone signed into GitHub (and the REST artifacts endpoint
 * needs no auth). The `users` table holds email + password_hash. An
 * unencrypted dump uploaded as a CI artifact would publish credential
 * material on a schedule. Encryption was dropped by request; therefore dumps
 * MUST never leave the machine — do NOT re-add `.github/workflows/backup.yml`
 * or any Actions artifact upload of this dump.
 *
 * Credentials come from `.env` (gitignored) or the process environment:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN   (Account.D1:Read is enough for SELECT)
 *   CLOUDFLARE_D1_DATABASE_ID
 *
 * Optional:
 *   BACKUP_OUT_DIR              default: backups/local
 *   BACKUP_MIN_ROWS             default: 100  (total-row floor)
 *   BACKUP_MIN_ROWS_BY_TABLE    JSON object of per-table minimums
 *
 * Usage:
 *   npm run backup
 *   node scripts/backup-d1.mjs
 *
 * Never logs the API token or dump contents.
 */
import { mkdirSync, writeFileSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root (parent of scripts/). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Total-row floor. Catches empty/partial exports; not satisfiable by a single row. */
const DEFAULT_MIN_ROWS = 100

/**
 * Per-table floors for tables that must not silently go empty.
 * Caches (place_details, interest_places) and request_log can legitimately
 * fluctuate; core catalog/trip data should not vanish.
 */
const DEFAULT_MIN_ROWS_BY_TABLE = Object.freeze({
  locations: 10,
  trips: 10,
})

/** Page size for SELECT pagination (D1 REST responses have size limits). */
const PAGE_SIZE = 1000

/** Default output directory — gitignored; never committed. */
const DEFAULT_OUT_DIR = 'backups/local'

/** SQLite/D1 system tables we never dump. */
const SYSTEM_TABLE_PREFIXES = ['sqlite_', '_cf_']

/** Safe SQL identifier: letters, digits, underscore; must start with letter/underscore. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * @typedef {object} BackupConfig
 * @property {string} accountId
 * @property {string} apiToken
 * @property {string} databaseId
 * @property {string} outDir
 * @property {number} minRows
 * @property {Record<string, number>} minRowsByTable
 */

/**
 * Loads KEY=VALUE pairs from a local env file into process.env without
 * overwriting variables already set. Never logs file contents or values.
 * Supports optional surrounding single/double quotes on values.
 *
 * @param {string} filePath
 */
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch {
    // Unreadable .env is not fatal — credentials may already be in the environment.
    return
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

/**
 * Reads and validates configuration from the environment (after optional .env).
 * Fails closed on missing Cloudflare credentials.
 *
 * @returns {BackupConfig}
 */
function readConfig() {
  // Prefer project .env, then .dev.vars (Cloudflare local). Never print them.
  loadEnvFile(join(ROOT, '.env'))
  loadEnvFile(join(ROOT, '.dev.vars'))

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim()
  if (!accountId || !apiToken || !databaseId) {
    throw new Error(
      'Missing required env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID ' +
        '(set in .env or the environment). Never commit these values.',
    )
  }

  const outDirRaw = process.env.BACKUP_OUT_DIR?.trim() || DEFAULT_OUT_DIR
  // Resolve relative paths from repo root so `npm run backup` is cwd-independent.
  const outDir = join(ROOT, outDirRaw)

  const minRowsRaw = process.env.BACKUP_MIN_ROWS?.trim()
  const minRows = minRowsRaw ? Number.parseInt(minRowsRaw, 10) : DEFAULT_MIN_ROWS
  if (!Number.isFinite(minRows) || minRows < 1) {
    throw new Error(`BACKUP_MIN_ROWS must be a positive integer, got: ${minRowsRaw}`)
  }

  const minRowsByTable = parseMinRowsByTable(process.env.BACKUP_MIN_ROWS_BY_TABLE)

  return {
    accountId,
    apiToken,
    databaseId,
    outDir,
    minRows,
    minRowsByTable,
  }
}

/**
 * Merges optional JSON overrides with built-in per-table minimums.
 *
 * @param {string | undefined} raw
 * @returns {Record<string, number>}
 */
function parseMinRowsByTable(raw) {
  /** @type {Record<string, number>} */
  const merged = { ...DEFAULT_MIN_ROWS_BY_TABLE }
  if (!raw || !raw.trim()) return merged

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('BACKUP_MIN_ROWS_BY_TABLE must be valid JSON object of table -> min rows')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BACKUP_MIN_ROWS_BY_TABLE must be a JSON object of table -> min rows')
  }
  for (const [table, value] of Object.entries(parsed)) {
    if (!IDENTIFIER_RE.test(table)) {
      throw new Error(`BACKUP_MIN_ROWS_BY_TABLE has invalid table name: ${table}`)
    }
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error(
        `BACKUP_MIN_ROWS_BY_TABLE[${table}] must be a non-negative integer, got: ${value}`,
      )
    }
    merged[table] = n
  }
  return merged
}

/**
 * Runs a single SQL statement against D1 via the Cloudflare REST API.
 * Fails loudly on HTTP errors, API success:false, or empty result envelope.
 * Never logs the Authorization header or token.
 *
 * @param {{ accountId: string, apiToken: string, databaseId: string }} cfg
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown>[]>}
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
    throw new Error(`D1 query network error: ${message}`)
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(`D1 query returned non-JSON (HTTP ${response.status})`)
  }

  if (!response.ok || body.success !== true) {
    const apiErrors = Array.isArray(body?.errors)
      ? body.errors.map((e) => e?.message ?? JSON.stringify(e)).join('; ')
      : 'unknown API error'
    throw new Error(`D1 query failed (HTTP ${response.status}): ${apiErrors}`)
  }

  const result = Array.isArray(body.result) ? body.result[0] : null
  if (!result || result.success === false) {
    throw new Error(`D1 query returned no successful result envelope for: ${sql.slice(0, 80)}`)
  }

  return Array.isArray(result.results) ? result.results : []
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isUserTable(name) {
  if (typeof name !== 'string' || name === '') return false
  if (!IDENTIFIER_RE.test(name)) return false
  return !SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/**
 * Lists every user table in the database (dynamic so new caches are included).
 *
 * @param {{ accountId: string, apiToken: string, databaseId: string }} cfg
 * @returns {Promise<string[]>}
 */
async function listTables(cfg) {
  const rows = await d1Query(
    cfg,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  const tables = rows
    .map((row) => (typeof row.name === 'string' ? row.name : ''))
    .filter(isUserTable)
  if (tables.length === 0) {
    throw new Error('D1 export found zero user tables — refusing empty backup')
  }
  return tables
}

/**
 * Resolves a deterministic ORDER BY clause for stable pagination.
 * Prefers rowid when the table has one; for WITHOUT ROWID tables, uses the
 * PRIMARY KEY column(s). Fails loudly if no stable order can be established.
 *
 * @param {{ accountId: string, apiToken: string, databaseId: string }} cfg
 * @param {string} table
 * @returns {Promise<string>} Comma-separated validated column list (or "rowid")
 */
async function resolveOrderByClause(cfg, table) {
  if (!IDENTIFIER_RE.test(table)) {
    throw new Error(`Refusing to inspect non-identifier table name: ${table}`)
  }

  const masterRows = await d1Query(
    cfg,
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  )
  const createSql = masterRows[0] && typeof masterRows[0].sql === 'string' ? masterRows[0].sql : null
  if (!createSql) {
    throw new Error(
      `Cannot read CREATE SQL for table ${table} — refusing unstable pagination`,
    )
  }

  const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(createSql)
  if (!withoutRowid) {
    return 'rowid'
  }

  // WITHOUT ROWID: rowid does not exist; PRIMARY KEY is required by SQLite.
  const infoRows = await d1Query(cfg, `PRAGMA table_info(${table})`)
  const pkCols = infoRows
    .filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => (typeof row.name === 'string' ? row.name : ''))

  if (pkCols.length === 0 || pkCols.some((name) => !name)) {
    throw new Error(
      `WITHOUT ROWID table ${table} has no usable PRIMARY KEY columns — ` +
        'cannot establish stable ORDER BY for pagination',
    )
  }
  for (const col of pkCols) {
    if (!IDENTIFIER_RE.test(col)) {
      throw new Error(
        `PRIMARY KEY column on ${table} is not a safe identifier: ${col}`,
      )
    }
  }
  return pkCols.join(', ')
}

/**
 * Selects all rows from a table with deterministic pagination.
 * Always ORDER BY a stable key so LIMIT/OFFSET pages cannot skip or duplicate.
 *
 * @param {{ accountId: string, apiToken: string, databaseId: string }} cfg
 * @param {string} table
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function selectAllRows(cfg, table) {
  if (!IDENTIFIER_RE.test(table)) {
    throw new Error(`Refusing to query non-identifier table name: ${table}`)
  }
  const orderBy = await resolveOrderByClause(cfg, table)
  /** @type {Record<string, unknown>[]} */
  const all = []
  let offset = 0
  for (;;) {
    // Table name and orderBy columns are validated against IDENTIFIER_RE;
    // limit/offset are bound parameters.
    const page = await d1Query(
      cfg,
      `SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [PAGE_SIZE, offset],
    )
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

/**
 * @returns {string} UTC timestamp like 20260725T061700Z
 */
function utcTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Enforces total-row and per-table minimums. Fails closed on under-threshold exports.
 *
 * @param {Record<string, number>} counts
 * @param {number} totalRows
 * @param {number} minRows
 * @param {Record<string, number>} minRowsByTable
 */
function assertRowSanity(counts, totalRows, minRows, minRowsByTable) {
  if (totalRows < minRows) {
    throw new Error(
      `D1 export is empty or below threshold: totalRows=${totalRows}, minRows=${minRows}. ` +
        `Per-table counts: ${JSON.stringify(counts)}. Refusing to write a silent empty backup.`,
    )
  }

  /** @type {string[]} */
  const failures = []
  for (const [table, minimum] of Object.entries(minRowsByTable)) {
    if (minimum <= 0) continue
    const actual = counts[table]
    if (actual === undefined) {
      failures.push(`${table}: missing (required >= ${minimum})`)
      continue
    }
    if (actual < minimum) {
      failures.push(`${table}: ${actual} row(s) (required >= ${minimum})`)
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `D1 export failed per-table sanity checks: ${failures.join('; ')}. ` +
        `Full counts: ${JSON.stringify(counts)}. A previously-populated table ` +
        'coming back empty is treated as a failed backup.',
    )
  }
}

async function main() {
  const cfg = readConfig()
  const { outDir, minRows, minRowsByTable, ...apiCfg } = cfg

  console.log('Listing D1 tables…')
  const tables = await listTables(apiCfg)
  console.log(`Found ${tables.length} table(s): ${tables.join(', ')}`)

  /** @type {Record<string, Record<string, unknown>[]>} */
  const dump = {}
  /** @type {Record<string, number>} */
  const counts = {}
  let totalRows = 0

  for (const table of tables) {
    console.log(`Exporting ${table}…`)
    const rows = await selectAllRows(apiCfg, table)
    dump[table] = rows
    counts[table] = rows.length
    totalRows += rows.length
    console.log(`  ${table}: ${rows.length} row(s)`)
  }

  assertRowSanity(counts, totalRows, minRows, minRowsByTable)

  const payload = {
    exported_at: new Date().toISOString(),
    database_id: apiCfg.databaseId,
    table_counts: counts,
    total_rows: totalRows,
    tables: dump,
  }

  const plaintext = JSON.stringify(payload, null, 0)
  if (plaintext.length < 32) {
    throw new Error(
      `Dump payload is trivially small (${plaintext.length} bytes) — refusing write`,
    )
  }

  mkdirSync(outDir, { recursive: true })
  const filename = `d1-${utcTimestamp()}.json`
  const outPath = join(outDir, filename)
  writeFileSync(outPath, plaintext, 'utf8')
  const size = statSync(outPath).size

  console.log('Per-table row counts:')
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table}: ${n}`)
  }
  console.log(`Total rows: ${totalRows}`)
  console.log(`Wrote ${outPath} (${size} bytes, plain JSON)`)
  console.log(
    'OK: local dump only — do not upload to GitHub Actions artifacts (public repo + users credentials).',
  )
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`BACKUP FAILED: ${message}`)
  process.exit(1)
})
