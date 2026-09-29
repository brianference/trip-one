-- 0008: photo-only contributors, and rate-limit index.
--
-- uploader_user_id is the signed-in contributor who added a photo through the
-- recap. Photos added by whoever holds the trip link stay null. A contributor
-- may delete only photos whose uploader_user_id is their own id.
alter table trip_photos add column uploader_user_id text references users(id);

-- "Which trips has this user joined?" (GET /api/my-trips). The primary key
-- (trip_id, user_id) cannot answer a lookup by user_id alone.
create index if not exists trip_members_user_idx on trip_members (user_id);

-- The per-endpoint rate-limit count: COUNT(*) WHERE ip_hash = ? AND endpoint = ?
-- AND created_at >= ?. The older (ip_hash, created_at) index made D1 read
-- every row this IP logged in the hour on any endpoint to filter by endpoint.
create index if not exists request_log_ip_endpoint_created_idx on request_log (ip_hash, endpoint, created_at);
