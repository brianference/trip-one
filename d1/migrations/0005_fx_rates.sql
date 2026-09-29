-- 0005: cached USD exchange rates (one row per base currency).
-- open.er-api.com refreshes once per 24h; we cache for 6h.
create table if not exists fx_rates (
  base text primary key,
  rates text not null,          -- JSON object { "EUR": 0.92, ... }
  provider_updated text not null, -- provider's time_last_update_utc
  fetched_at integer not null     -- epoch ms when we fetched it
);
