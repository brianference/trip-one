-- 0006: per-stop photos and read-only recap share links.
create table if not exists trip_photos (
  id text primary key,
  trip_id text not null references trips(id),
  stop_id text not null,
  r2_key text not null,
  content_type text not null,
  width integer not null,
  height integer not null,
  bytes integer not null,
  created_at text not null
);
create index if not exists trip_photos_trip_stop_idx on trip_photos (trip_id, stop_id);

create table if not exists trip_recap_links (
  token text primary key,
  trip_id text not null references trips(id),
  created_at text not null,
  revoked_at text
);
create index if not exists trip_recap_links_trip_idx on trip_recap_links (trip_id);
