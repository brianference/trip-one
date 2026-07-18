-- Cache of interest-driven place searches, so the expensive step of building a
-- themed trip (one AI call to expand interests into queries, then up to six
-- paid Google Places text searches) is paid once per destination+interests
-- rather than on every trip. Keyed by "<location slug>:<sha256 of interests>".
create table if not exists interest_places (
  cache_key text primary key,
  places jsonb not null,
  queries jsonb not null,
  last_refreshed timestamptz not null default now()
);
