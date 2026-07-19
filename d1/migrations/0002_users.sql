-- User accounts and trip ownership.
--
-- Trips were anonymous: anyone with the URL could open one, and there was no
-- owner. Accounts add ownership WITHOUT breaking that — `trips.user_id` is
-- nullable, so every trip created before this migration (and every trip made
-- by a signed-out visitor) keeps working exactly as it did, reachable by its
-- link. A trip with a user_id is additionally listed on that user's dashboard
-- and is the only kind that can be renamed or deleted from the account.
--
-- Password hashes are PBKDF2-SHA256, not bcrypt: Cloudflare Workers has no
-- native module support, so bcrypt cannot run there. The hash column stores a
-- self-describing string (algorithm, iterations, salt, digest) so the work
-- factor can be raised later without invalidating existing passwords.

create table if not exists users (
  id text primary key,
  -- Stored lowercase and trimmed; uniqueness is enforced on that normalized
  -- form so "A@b.com" and "a@b.com " cannot both register.
  email text not null unique,
  password_hash text not null,
  display_name text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Bumped to invalidate every existing token for this user (password change,
  -- or a "sign out everywhere" action). Tokens carry the value they were
  -- issued with and are rejected when it no longer matches.
  token_version integer not null default 0
);

create index if not exists users_email_idx on users (email);

-- Nullable on purpose: see the note above about anonymous trips.
alter table trips add column user_id text references users(id);

create index if not exists trips_user_id_idx on trips (user_id);

-- A user-facing name for a saved trip. Anonymous trips don't need one (they're
-- identified by their destination), but a dashboard listing ten trips does.
alter table trips add column title text;
