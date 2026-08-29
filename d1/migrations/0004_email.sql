-- Transactional email: confirmation, password reset, and contact delivery.
--
-- An account whose password cannot be reset is a trap — the visitor typed a
-- real address, we stored a hash, and then we provided no way back in. These
-- tables exist so a forgotten password is recoverable, and so a Contact Us
-- message survives a mail outage instead of vanishing into a 500.
--
-- Confirmation tokens and reset tokens live in SEPARATE tables on purpose. A
-- confirm-your-email link sits in an inbox for a day; if it lived in the same
-- table as a password-reset token, that link could be replayed as a password
-- change. Different tables make that mix-up a schema error, not a review miss.
--
-- Only the SHA-256 hash of each token is stored. The token itself is a capability
-- (possession of it confirms the address, or changes the password). A stolen
-- database dump must not contain live links.
--
-- `email_verified` is a flag, not a login gate. The account works immediately
-- on register; confirmation is proof the address can receive mail, which is
-- what makes a later reset actually arrive. Existing rows default to 0 so we
-- never pretend an address was confirmed just because the column appeared.
--
-- `contact_messages.delivered` is updated only after a successful send. The
-- row is written first, so a Brevo outage queues the message instead of
-- losing it.

alter table users add column email_verified integer not null default 0;

create table if not exists email_verifications (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at integer not null,
  used_at integer
);

create index if not exists email_verifications_user_id_idx
  on email_verifications (user_id);

create table if not exists password_resets (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at integer not null,
  used_at integer
);

create index if not exists password_resets_user_id_idx
  on password_resets (user_id);

create table if not exists contact_messages (
  id text primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  user_id text references users(id) on delete set null,
  created_at integer not null,
  delivered integer not null default 0
);
