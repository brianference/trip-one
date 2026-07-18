import type { Env } from './db'

/**
 * A statement-level fake of the D1 binding for endpoint tests.
 *
 * D1 rows come back with JSON columns as TEXT, so `first` handlers here return
 * rows shaped that way (e.g. `itinerary: '[]'`), and the data layer parses them
 * the same as it would in production.
 */
export interface FakeD1 {
  env: Env & Record<string, unknown>
  calls: { sql: string; args: unknown[] }[]
}

export interface FakeD1Config {
  /** Returns the row a `.first()` should yield for a given statement; undefined → null. */
  first?: (sql: string, args: unknown[]) => unknown
  /** When true, every statement execution throws — simulates the database being unreachable. */
  fail?: boolean
  /** Extra env fields to merge in (API keys, etc.). */
  extraEnv?: Record<string, unknown>
}

export function fakeD1(config: FakeD1Config = {}): FakeD1 {
  const calls: { sql: string; args: unknown[] }[] = []
  const guard = () => {
    if (config.fail) throw new Error('D1 unavailable')
  }
  const db = {
    prepare(sql: string) {
      const call = { sql, args: [] as unknown[] }
      const stmt = {
        bind(...args: unknown[]) {
          call.args = args
          return stmt
        },
        async first() {
          guard()
          calls.push(call)
          return config.first ? (config.first(sql, call.args) ?? null) : null
        },
        async run() {
          guard()
          calls.push(call)
          return { success: true }
        },
        async all() {
          guard()
          calls.push(call)
          return { results: [] }
        },
      }
      return stmt
    },
  }
  return {
    env: { DB: db as unknown as Env['DB'], RATE_LIMIT_SALT: 'salt', ...config.extraEnv },
    calls,
  }
}
