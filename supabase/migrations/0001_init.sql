create table if not exists locations (
  slug text primary key,
  lat double precision not null,
  lng double precision not null,
  display_name text not null,
  weather_baseline jsonb,
  things_to_do jsonb,
  last_refreshed timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null references locations(slug),
  itinerary jsonb not null default '[]',
  design_style text not null default 'bento'
    check (design_style in ('bento', 'chronicle', 'field-guide', 'liquid-glass', 'trail-ledger')),
  created_at timestamptz not null default now()
);

create table if not exists request_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_log_ip_hash_created_at_idx
  on request_log (ip_hash, created_at);

alter table locations enable row level security;
alter table trips enable row level security;
alter table request_log enable row level security;

create policy "locations readable by anon" on locations
  for select using (true);

create policy "trips readable by anon" on trips
  for select using (true);

-- request_log has no anon policy: only the service role (Functions) reads/writes it.
