export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
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
}

function headers(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/**
 * Throws a clear error when a Supabase/PostgREST response is not ok, so that
 * a failed request never gets silently interpreted as an empty/default result.
 */
async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    throw new Error(`Supabase request failed (${context}): ${res.status}`)
  }
}

export async function getLocationBySlug(env: Env, slug: string): Promise<LocationRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/locations?slug=eq.${encodeURIComponent(slug)}&select=*`,
    { headers: headers(env) },
  )
  await assertOk(res, 'getLocationBySlug')
  const rows = (await res.json()) as LocationRow[]
  return rows[0] ?? null
}

export async function upsertLocation(env: Env, row: LocationRow): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/locations`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(row),
  })
  await assertOk(res, 'upsertLocation')
}

export interface PlaceDetailRow {
  place_id: string
  detail: unknown
  last_refreshed?: string
}

/** Reads a cached Place Details row (null if not cached yet). */
export async function getPlaceDetailCache(env: Env, placeId: string): Promise<PlaceDetailRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/place_details?place_id=eq.${encodeURIComponent(placeId)}&select=*`,
    { headers: headers(env) },
  )
  await assertOk(res, 'getPlaceDetailCache')
  const rows = (await res.json()) as PlaceDetailRow[]
  return rows[0] ?? null
}

/** Upserts a Place Details cache row so the paid Google call is made once per place, not per view. */
export async function upsertPlaceDetailCache(env: Env, row: PlaceDetailRow): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/place_details`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ ...row, last_refreshed: new Date().toISOString() }),
  })
  await assertOk(res, 'upsertPlaceDetailCache')
}

export async function countRecentRequests(
  env: Env,
  ipHash: string,
  sinceIso: string,
): Promise<number> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/request_log?ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`,
    { headers: headers(env, { Prefer: 'count=exact' }) },
  )
  // Must throw (fail closed) rather than default to 0 (fail open) -- the
  // rate limiter relies on this count to decide whether to block requests.
  await assertOk(res, 'countRecentRequests')
  const range = res.headers.get('content-range') ?? '*/0'
  return Number(range.split('/')[1] ?? 0)
}

export async function insertRequestLog(env: Env, ipHash: string, endpoint: string): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/request_log`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ ip_hash: ipHash, endpoint }),
  })
  await assertOk(res, 'insertRequestLog')
}

export async function createTrip(
  env: Env,
  row: Pick<TripRow, 'location_slug' | 'itinerary' | 'design_style'>,
): Promise<TripRow> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  await assertOk(res, 'createTrip')
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}

export async function getTrip(env: Env, id: string): Promise<TripRow | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`, {
    headers: headers(env),
  })
  await assertOk(res, 'getTrip')
  const rows = (await res.json()) as TripRow[]
  return rows[0] ?? null
}

export async function updateTrip(
  env: Env,
  id: string,
  patch: Partial<Pick<TripRow, 'itinerary' | 'design_style' | 'trip_length_days' | 'start_date'>>,
): Promise<TripRow> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  await assertOk(res, 'updateTrip')
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}
