import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Env } from './db'
import { fakeR2 } from './testD1'

/**
 * A D1-shaped binding over a REAL in-memory SQLite database (Node's built-in
 * `node:sqlite`), with d1/schema.sql and every d1/migrations/*.sql applied in
 * order and foreign keys on, as D1 enforces them.
 *
 * Use it where a test must prove what the SQL itself does (a WHERE clause or a
 * subquery enforcing a cap), which a hand-written fake can only restate.
 *
 * Test-only. `node:sqlite` is loaded with `createRequire` because Vite strips
 * the `node:` prefix from imports and cannot resolve the bare `sqlite` name.
 */

type SqliteModule = typeof import('node:sqlite')

/**
 * Loads `node:sqlite`, muting only its one-time ExperimentalWarning so test
 * output stays clean. Every other warning passes through.
 */
function loadSqlite(): SqliteModule {
  const original = process.emitWarning
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning.message
    if (/SQLite is an experimental feature/i.test(text)) return
    ;(original as (...args: unknown[]) => void).call(process, warning, ...rest)
  }) as typeof process.emitWarning
  try {
    return createRequire(import.meta.url)('node:sqlite') as SqliteModule
  } finally {
    process.emitWarning = original
  }
}

const D1_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'd1')

/** A real SQLite database and a D1-shaped env over it. */
export interface SqliteD1 {
  env: Env & Record<string, unknown>
  /** Runs raw SQL for test setup and inspection. */
  exec: (sql: string, ...params: (string | number | null)[]) => void
  /** Reads rows for assertions. */
  rows: <T>(sql: string, ...params: (string | number | null)[]) => T[]
}

/**
 * Creates a fresh in-memory database with the production schema.
 * @param extraEnv - Extra env fields
 */
export function sqliteD1(extraEnv: Record<string, unknown> = {}): SqliteD1 {
  const { DatabaseSync } = loadSqlite()
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(join(D1_DIR, 'schema.sql'), 'utf8'))
  const migrations = readdirSync(join(D1_DIR, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrations) db.exec(readFileSync(join(D1_DIR, 'migrations', file), 'utf8'))

  const binding = {
    prepare(sql: string) {
      let params: (string | number | null)[] = []
      const stmt = {
        bind(...args: (string | number | null)[]) {
          params = args
          return stmt
        },
        async first() {
          return (db.prepare(sql).get(...params) as Record<string, unknown> | undefined) ?? null
        },
        async all() {
          return { results: db.prepare(sql).all(...params) }
        },
        async run() {
          const result = db.prepare(sql).run(...params)
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      }
      return stmt
    },
  }

  return {
    env: { DB: binding as unknown as Env['DB'], RATE_LIMIT_SALT: 'salt', PHOTOS: fakeR2().bucket, ...extraEnv },
    exec: (sql, ...params) => {
      db.prepare(sql).run(...params)
    },
    rows: <T,>(sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
  }
}
