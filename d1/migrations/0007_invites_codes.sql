-- 0007: passwordless sign-in codes, trip invites, and trip members.
--
-- email_codes holds one-time 6-digit sign-in codes. Only a SHA-256 of
-- `email + ':' + code` is stored, so a dump of this table is not a set of live
-- codes, and the hash binds each code to the address it was sent to.
-- `attempts` caps guessing per code; rows are kept (not deleted) when a newer
-- code supersedes them, so the per-email hourly and daily caps can count them.
create table if not exists email_codes (
  id text primary key,
  email text not null,
  code_hash text not null,
  expires_at integer not null,
  attempts integer not null default 0,
  used_at integer,
  created_at integer not null
);
create index if not exists email_codes_email_idx on email_codes (email);
-- The request path purges rows older than 24 hours for every email by created_at.
create index if not exists email_codes_created_at_idx on email_codes (created_at);

-- An invitation for one email address to add photos to one trip.
create table if not exists trip_invites (
  id text primary key,
  trip_id text not null references trips(id),
  email text not null,
  created_at integer not null,
  accepted_user_id text,
  accepted_at integer,
  revoked_at integer,
  unique (trip_id, email)
);

-- People who joined a trip through an invite.
create table if not exists trip_members (
  trip_id text not null references trips(id),
  user_id text not null references users(id),
  role text not null default 'contributor',
  created_at integer not null,
  primary key (trip_id, user_id)
);
