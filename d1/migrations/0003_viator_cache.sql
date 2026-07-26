-- Viator Partner API caches: destination taxonomy + per-destination search.
--
-- Destinations is a large static-ish list with real `center` coordinates. We
-- fetch it once and refresh monthly (Viator's own caching guidance for location
-- data). Experiences are keyed by destination id + currency so a repeat trip
-- near the same destination reuses results without spending rate-limit budget
-- or Partner API quota.
--
-- Free-text search is intentionally not used as the primary path: it returned
-- Alaska and Finland for a Minnesota trip. Destination-anchoring makes that
-- failure mode impossible; these tables support that design.

create table if not exists viator_destinations_cache (
  cache_key text primary key,
  destinations text not null,
  last_refreshed text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists viator_experiences_cache (
  cache_key text primary key,
  experiences text not null,
  last_refreshed text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
