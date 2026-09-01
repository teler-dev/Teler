-- TELER email/password authentication used by the desktop client.
-- Run after 001_initial_multitenant.sql in the Neon SQL editor.

begin;

create table if not exists app.user_credentials (
  user_profile_id uuid primary key references app.user_profiles(id) on delete cascade,
  email_normalized text not null unique check (email_normalized = lower(email_normalized)),
  password_hash text not null,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.user_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references app.user_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx
  on app.user_auth_sessions (user_profile_id, expires_at desc);
create index if not exists auth_sessions_active_idx
  on app.user_auth_sessions (expires_at)
  where revoked_at is null;

commit;
