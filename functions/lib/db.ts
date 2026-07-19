// Import ONLY the D1 type (module-scoped) rather than a global
// `/// <reference types="@cloudflare/workers-types" />`: the global form
// replaces the DOM `Response`/`fetch` types across the whole compilation and
// breaks every `res.json()` call in the app.
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Data layer for trip-one, backed by Cloudflare D1 (SQLite).
 *
 * D1 binds directly into Pages Functions as `env.DB`, so — unlike the previous
 * Supabase/PostgREST backend — there is no external HTTP hop, no API keys, and
 * nothing that pauses after a week of inactivity. The browser never touches the
 * database; every access goes through an /api/* Function, which is why D1's
 * Functions-only reachability is a fit rather than a limitation.
 *
 * JSON columns (things_to_do, weather_baseline, itinerary, detail, places,
 * queries) are stored as TEXT and parsed/serialized at this boundary, so
 * callers still see and pass plain objects exactly as they did before.
 */

export interface Env {
  DB: D1Database
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
  trip_length_days?: number | null
  /** Optional trip start date (YYYY-MM-DD), for date labels and date-aligned weather. */
  start_date?: string | null
  /**
   * Owner, or null for an anonymous trip. Nullable on purpose: every trip made
   * before accounts existed, and every trip made by a signed-out visitor, stays
   * reachable by its link.
   */
  user_id?: string | null
  /** User-supplied name for a saved trip; anonymous trips don't need one. */
  title?: string | null
}

/** A row in `users`. `password_hash` never leaves the data layer. */
export interface UserRow {
  id: string
  email: string
  password_hash: string
  display_name: string | null
  created_at: string
  token_version: number
}

export interface PlaceDetailRow {
  place_id: string
  detail: unknown
  last_refreshed?: string
}

export interface InterestPlacesRow {
  cache_key: string
  places: unknown
  queries: unknown
  last_refreshed?: string
}

/** Current instant as an ISO-8601 string — the format every timestamp column stores. */
function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Parses a JSON TEXT column back into a value, tolerating the already-parsed
 * case (so a value that somehow arrives as an object passes through) and
 * null/empty. Returns `fallback` when there is nothing usable to parse, so a
 * caller never has to guard against a raw string leaking through.
 */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value !== 'string') return value as T
  if (value === '') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// --- locations ---

export async function getLocationBySlug(env: Env, slug: string): Promise<LocationRow | null> {
  const row = await env.DB.prepare('SELECT * FROM locations WHERE slug = ?').bind(slug).first<Record<string, unknown>>()
  if (!row) return null
  return {
    slug: row.slug as string,
    lat: row.lat as number,
    lng: row.lng as number,
    display_name: row.display_name as string,
    weather_baseline: parseJson(row.weather_baseline, null),
    things_to_do: parseJson(row.things_to_do, []),
    last_refreshed: row.last_refreshed as string | undefined,
  }
}

export async function upsertLocation(env: Env, row: LocationRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO locations (slug, lat, lng, display_name, weather_baseline, things_to_do, last_refreshed)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       lat = excluded.lat,
       lng = excluded.lng,
       display_name = excluded.display_name,
       weather_baseline = excluded.weather_baseline,
       things_to_do = excluded.things_to_do,
       last_refreshed = excluded.last_refreshed`,
  )
    .bind(
      row.slug,
      row.lat,
      row.lng,
      row.display_name,
      JSON.stringify(row.weather_baseline ?? null),
      JSON.stringify(row.things_to_do ?? []),
      row.last_refreshed ?? nowIso(),
    )
    .run()
}

// --- place_details cache ---

/** Reads a cached Place Details row (null if not cached yet). */
export async function getPlaceDetailCache(env: Env, placeId: string): Promise<PlaceDetailRow | null> {
  const row = await env.DB.prepare('SELECT * FROM place_details WHERE place_id = ?')
    .bind(placeId)
    .first<Record<string, unknown>>()
  if (!row) return null
  return {
    place_id: row.place_id as string,
    detail: parseJson(row.detail, null),
    last_refreshed: row.last_refreshed as string | undefined,
  }
}

/** Upserts a Place Details cache row so the paid Google call is made once per place, not per view. */
export async function upsertPlaceDetailCache(env: Env, row: PlaceDetailRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO place_details (place_id, detail, last_refreshed)
     VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET
       detail = excluded.detail,
       last_refreshed = excluded.last_refreshed`,
  )
    .bind(row.place_id, JSON.stringify(row.detail ?? null), nowIso())
    .run()
}

// --- interest_places cache ---

/** Reads a cached interest-search row (null if not cached yet). */
export async function getInterestPlacesCache(env: Env, cacheKey: string): Promise<InterestPlacesRow | null> {
  const row = await env.DB.prepare('SELECT * FROM interest_places WHERE cache_key = ?')
    .bind(cacheKey)
    .first<Record<string, unknown>>()
  if (!row) return null
  return {
    cache_key: row.cache_key as string,
    places: parseJson(row.places, []),
    queries: parseJson(row.queries, []),
    last_refreshed: row.last_refreshed as string | undefined,
  }
}

/** Upserts an interest-search cache row so the AI + Places calls are made once per destination+interests. */
export async function upsertInterestPlacesCache(env: Env, row: InterestPlacesRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO interest_places (cache_key, places, queries, last_refreshed)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       places = excluded.places,
       queries = excluded.queries,
       last_refreshed = excluded.last_refreshed`,
  )
    .bind(row.cache_key, JSON.stringify(row.places ?? []), JSON.stringify(row.queries ?? []), nowIso())
    .run()
}

// --- rate limiting ---

export async function countRecentRequests(
  env: Env,
  ipHash: string,
  sinceIso: string,
  endpoint?: string,
): Promise<number> {
  // Fail closed: a throw here (which propagates) is correct, because the rate
  // limiter must not treat a DB error as "zero recent requests" and wave the
  // caller through. D1 throws on query failure, so this needs no extra guard.
  //
  // `endpoint` scopes the count to one route. Without it every per-route limit
  // shared a single budget, so the effective limit was the SMALLEST one across
  // all routes: planning a trip spends dozens of calls, which used up
  // registration's allowance of 10 and made it impossible to sign up.
  const row = endpoint
    ? await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM request_log WHERE ip_hash = ? AND endpoint = ? AND created_at >= ?',
      )
        .bind(ipHash, endpoint, sinceIso)
        .first<{ n: number }>()
    : await env.DB.prepare('SELECT COUNT(*) AS n FROM request_log WHERE ip_hash = ? AND created_at >= ?')
        .bind(ipHash, sinceIso)
        .first<{ n: number }>()
  return row?.n ?? 0
}

export async function insertRequestLog(env: Env, ipHash: string, endpoint: string): Promise<void> {
  await env.DB.prepare('INSERT INTO request_log (ip_hash, endpoint, created_at) VALUES (?, ?, ?)')
    .bind(ipHash, endpoint, nowIso())
    .run()
}

// --- trips ---

export async function createTrip(
  env: Env,
  row: Pick<TripRow, 'location_slug' | 'itinerary' | 'design_style'> & { user_id?: string | null; title?: string | null },
): Promise<TripRow> {
  // SQLite has no gen_random_uuid(); the id and created_at that Postgres
  // defaulted are generated here instead.
  const id = crypto.randomUUID()
  const created_at = nowIso()
  await env.DB.prepare(
    'INSERT INTO trips (id, location_slug, itinerary, design_style, created_at, user_id, title) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      row.location_slug,
      JSON.stringify(row.itinerary ?? []),
      row.design_style,
      created_at,
      row.user_id ?? null,
      row.title ?? null,
    )
    .run()
  return {
    id,
    location_slug: row.location_slug,
    itinerary: row.itinerary,
    design_style: row.design_style,
    created_at,
    trip_length_days: null,
    start_date: null,
    user_id: row.user_id ?? null,
    title: row.title ?? null,
  }
}

export async function getTrip(env: Env, id: string): Promise<TripRow | null> {
  const row = await env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!row) return null
  return {
    id: row.id as string,
    location_slug: row.location_slug as string,
    itinerary: parseJson(row.itinerary, []),
    design_style: row.design_style as string,
    created_at: row.created_at as string,
    trip_length_days: (row.trip_length_days as number | null) ?? null,
    start_date: (row.start_date as string | null) ?? null,
  }
}

export async function updateTrip(
  env: Env,
  id: string,
  patch: Partial<Pick<TripRow, 'itinerary' | 'design_style' | 'trip_length_days' | 'start_date' | 'user_id' | 'title'>>,
): Promise<TripRow> {
  // Build the SET clause from only the fields actually present, so a patch of
  // one column never clobbers the others with undefined.
  const sets: string[] = []
  const values: unknown[] = []
  if (patch.itinerary !== undefined) {
    sets.push('itinerary = ?')
    values.push(JSON.stringify(patch.itinerary))
  }
  if (patch.design_style !== undefined) {
    sets.push('design_style = ?')
    values.push(patch.design_style)
  }
  if (patch.trip_length_days !== undefined) {
    sets.push('trip_length_days = ?')
    values.push(patch.trip_length_days)
  }
  if (patch.start_date !== undefined) {
    sets.push('start_date = ?')
    values.push(patch.start_date)
  }

  if (sets.length > 0) {
    await env.DB.prepare(`UPDATE trips SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...values, id)
      .run()
  }

  const updated = await getTrip(env, id)
  if (!updated) throw new Error(`updateTrip: trip ${id} not found`)
  return updated
}

/** Normalizes an email for storage and lookup: trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Creates a user. The caller must have already validated and hashed.
 * @throws If the email is already registered (SQLite unique constraint)
 */
export async function createUser(
  env: Env,
  row: { email: string; password_hash: string; display_name?: string | null },
): Promise<UserRow> {
  const id = crypto.randomUUID()
  const created_at = nowIso()
  const email = normalizeEmail(row.email)
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, created_at, token_version) VALUES (?, ?, ?, ?, ?, 0)',
  )
    .bind(id, email, row.password_hash, row.display_name ?? null, created_at)
    .run()
  return { id, email, password_hash: row.password_hash, display_name: row.display_name ?? null, created_at, token_version: 0 }
}

/** Looks up a user by email (normalized), or null. */
export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(normalizeEmail(email)).first<UserRow>()
  return row ?? null
}

/** Looks up a user by id, or null. */
export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  return row ?? null
}

/** Replaces a user's password hash (used by the transparent rehash on login). */
export async function updateUserPasswordHash(env: Env, id: string, passwordHash: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, id).run()
}

/** Trips owned by a user, newest first. */
export async function listTripsForUser(env: Env, userId: string): Promise<TripRow[]> {
  const res = await env.DB.prepare(
    'SELECT t.*, l.display_name AS location_name FROM trips t LEFT JOIN locations l ON l.slug = t.location_slug WHERE t.user_id = ? ORDER BY t.created_at DESC',
  )
    .bind(userId)
    .all<TripRow & { itinerary: string; location_name?: string }>()
  return (res.results ?? []).map((r) => ({ ...r, itinerary: parseJson<unknown[]>(r.itinerary, []) }))
}

/**
 * Deletes a trip, but only if it belongs to this user.
 *
 * Ownership is part of the WHERE clause rather than a separate read-then-check:
 * a check-then-delete can race, and more importantly it makes it impossible to
 * forget the ownership test at a call site.
 *
 * @returns True if a row was deleted, false if it didn't exist or wasn't theirs
 */
export async function deleteTripOwnedBy(env: Env, tripId: string, userId: string): Promise<boolean> {
  const res = await env.DB.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').bind(tripId, userId).run()
  return (res.meta?.changes ?? 0) > 0
}

/**
 * Attaches an anonymous trip to a user, but never steals one that already has
 * an owner — `user_id IS NULL` is part of the WHERE clause.
 * @returns True if the trip was claimed
 */
export async function claimTripForUser(env: Env, tripId: string, userId: string): Promise<boolean> {
  const res = await env.DB.prepare('UPDATE trips SET user_id = ? WHERE id = ? AND user_id IS NULL')
    .bind(userId, tripId)
    .run()
  return (res.meta?.changes ?? 0) > 0
}
