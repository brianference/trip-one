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
  /** Returns the rows an `.all()` should yield for a given statement; undefined → []. */
  all?: (sql: string, args: unknown[]) => unknown[] | undefined
  /** Returns how many rows a `.run()` changed (`meta.changes`); undefined → no meta, as before. */
  run?: (sql: string, args: unknown[]) => number | undefined
  /** When true, every statement execution throws — simulates the database being unreachable. */
  fail?: boolean
  /** Extra env fields to merge in (API keys, a `PHOTOS` fakeR2 bucket, etc.). */
  extraEnv?: Record<string, unknown>
}

/**
 * Builds a fake D1 env. `PHOTOS` defaults to an empty {@link fakeR2} bucket so
 * every env satisfies the `Env` type; pass your own through `extraEnv` to
 * inspect what a handler stored.
 * @param config - Per-statement handlers and env overrides
 */
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
          const changes = config.run ? config.run(sql, call.args) : undefined
          return changes === undefined ? { success: true } : { success: true, meta: { changes } }
        },
        async all() {
          guard()
          calls.push(call)
          return { results: config.all ? (config.all(sql, call.args) ?? []) : [] }
        },
      }
      return stmt
    },
  }
  return {
    env: {
      DB: db as unknown as Env['DB'],
      RATE_LIMIT_SALT: 'salt',
      PHOTOS: fakeR2().bucket,
      ...config.extraEnv,
    },
    calls,
  }
}

/** One object held by {@link fakeR2}. */
export interface FakeR2Object {
  bytes: Uint8Array<ArrayBuffer>
  contentType: string | undefined
}

/** A Map-backed fake of an R2 bucket, plus the Map so tests can inspect it. */
export interface FakeR2 {
  bucket: Env['PHOTOS']
  objects: Map<string, FakeR2Object>
}

/**
 * Converts whatever a handler passed to `put` into bytes. Handlers in this app
 * pass a Uint8Array or ArrayBuffer; anything else is a test bug worth failing on.
 * @param value - The value given to `put`
 */
function toBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  throw new Error('fakeR2.put: unsupported value type')
}

/**
 * A Map-backed fake of the R2 binding covering the calls this app makes:
 * `put(key, bytes, { httpMetadata })`, `get(key)` (returns `{ body }` or null)
 * and `delete(key | keys)`.
 * @param fail - When true, every call throws — simulates R2 being unreachable
 */
export function fakeR2(fail = false): FakeR2 {
  const objects = new Map<string, FakeR2Object>()
  const guard = () => {
    if (fail) throw new Error('R2 unavailable')
  }
  const bucket = {
    async put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }) {
      guard()
      objects.set(key, { bytes: toBytes(value), contentType: options?.httpMetadata?.contentType })
      return { key }
    },
    async get(key: string) {
      guard()
      const stored = objects.get(key)
      if (!stored) return null
      return { key, body: new Blob([stored.bytes]).stream() }
    },
    async delete(keys: string | string[]) {
      guard()
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    },
  }
  return { bucket: bucket as unknown as Env['PHOTOS'], objects }
}
