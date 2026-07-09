-- Cache of Google Place Details responses, so the paid Details call is made
-- once per place rather than on every panel open. Keyed by Google place_id.
create table if not exists place_details (
  place_id text primary key,
  detail jsonb not null,
  last_refreshed timestamptz not null default now()
);
