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
}

function headers(env: Env, extra: Record<string, string> = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export async function getLocationBySlug(env: Env, slug: string): Promise<LocationRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/locations?slug=eq.${encodeURIComponent(slug)}&select=*`,
    { headers: headers(env) },
  )
  const rows = (await res.json()) as LocationRow[]
  return rows[0] ?? null
}

export async function upsertLocation(env: Env, row: LocationRow): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/locations`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify(row),
  })
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
  const range = res.headers.get('content-range') ?? '*/0'
  return Number(range.split('/')[1] ?? 0)
}

export async function insertRequestLog(env: Env, ipHash: string, endpoint: string): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/request_log`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ ip_hash: ipHash, endpoint }),
  })
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
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}

export async function getTrip(env: Env, id: string): Promise<TripRow | null> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}&select=*`, {
    headers: headers(env),
  })
  const rows = (await res.json()) as TripRow[]
  return rows[0] ?? null
}

export async function updateTrip(
  env: Env,
  id: string,
  patch: Partial<Pick<TripRow, 'itinerary' | 'design_style'>>,
): Promise<TripRow> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/trips?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  const rows = (await res.json()) as TripRow[]
  return rows[0]
}
