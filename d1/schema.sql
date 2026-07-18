-- D1 (SQLite) schema for trip-one.
--
-- Ported from the Supabase Postgres migrations (supabase/migrations/*.sql),
-- which are retained only as history. Differences from Postgres, all forced by
-- SQLite:
--   * jsonb columns become TEXT holding a JSON string; the data layer
--     JSON.stringify/parse at the boundary.
--   * double precision -> REAL, timestamptz -> TEXT (ISO-8601 strings set by
--     the app), uuid -> TEXT (the app generates it with crypto.randomUUID()).
--   * request_log's identity column -> INTEGER PRIMARY KEY AUTOINCREMENT.
--   * No row-level security or anon policies: D1 is reachable only from Pages
--     Functions, never from the browser, so there is no untrusted direct
--     caller to guard against.

create table if not exists locations (
  slug text primary key,
  lat real not null,
  lng real not null,
  display_name text not null,
  weather_baseline text,
  things_to_do text,
  last_refreshed text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists trips (
  id text primary key,
  location_slug text not null references locations(slug),
  itinerary text not null default '[]',
  design_style text not null default 'chronicle'
    check (design_style in ('bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger')),
  trip_length_days integer,
  start_date text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists place_details (
  place_id text primary key,
  detail text not null,
  last_refreshed text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists interest_places (
  cache_key text primary key,
  places text not null,
  queries text not null,
  last_refreshed text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists request_log (
  id integer primary key autoincrement,
  ip_hash text not null,
  endpoint text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists request_log_ip_hash_created_at_idx
  on request_log (ip_hash, created_at);
