-- TELER multi-tenant metadata schema for Neon PostgreSQL.
-- Neon Auth owns identities/sessions in its managed neon_auth schema.

begin;

create extension if not exists pgcrypto;
create schema if not exists app;

create type app.member_role as enum ('owner', 'admin', 'manager', 'viewer');
create type app.member_status as enum ('invited', 'active', 'suspended');
create type app.employee_status as enum ('active', 'inactive', 'archived');
create type app.device_status as enum ('pending', 'active', 'revoked');
create type app.session_status as enum ('open', 'processing', 'complete', 'failed');
create type app.artifact_kind as enum ('screenshot', 'events', 'ocr', 'keystroke', 'ai_report', 'other');

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 160),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.organization_memberships (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_profile_id uuid not null references app.user_profiles(id) on delete cascade,
  role app.member_role not null default 'viewer',
  status app.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_profile_id)
);

create table app.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(email_normalized)),
  role app.member_role not null,
  token_hash text not null unique,
  invited_by uuid references app.user_profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table app.organization_settings (
  organization_id uuid primary key references app.organizations(id) on delete cascade,
  timezone text not null default 'UTC',
  raw_retention_days integer not null default 90 check (raw_retention_days between 1 and 3650),
  screenshot_retention_days integer not null default 30 check (screenshot_retention_days between 1 and 3650),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table app.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  external_key text not null,
  display_name text not null,
  email_normalized text,
  job_role text not null default 'general',
  department text,
  status app.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_key),
  unique (organization_id, id)
);

create table app.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  device_name text not null,
  fingerprint text,
  token_hash text not null unique,
  status app.device_status not null default 'pending',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table app.employee_device_assignments (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  device_id uuid not null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  primary key (organization_id, employee_id, device_id, assigned_at),
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade,
  foreign key (organization_id, device_id)
    references app.devices(organization_id, id) on delete cascade
);

create table app.work_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  device_id uuid,
  external_session_id text not null,
  status app.session_status not null default 'open',
  started_at timestamptz not null,
  ended_at timestamptz,
  total_minutes numeric(10,2) check (total_minutes >= 0),
  claimed_task text,
  storage_prefix text not null,
  source_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_session_id),
  unique (organization_id, id),
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id),
  foreign key (organization_id, device_id)
    references app.devices(organization_id, id)
);

create table app.session_metrics (
  organization_id uuid not null,
  session_id uuid not null,
  focus_score numeric(5,2),
  workflow_structure_score numeric(5,2),
  tool_usage_score numeric(5,2),
  context_switching_score numeric(5,2),
  productivity_score numeric(5,2),
  active_minutes numeric(10,2),
  idle_minutes numeric(10,2),
  deep_work_minutes numeric(10,2),
  distraction_ratio numeric(6,3),
  key_count bigint,
  mouse_clicks bigint,
  top_apps jsonb not null default '[]'::jsonb,
  main_tasks jsonb not null default '[]'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  model_used text,
  calculated_at timestamptz not null default now(),
  primary key (organization_id, session_id),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);

create table app.artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  kind app.artifact_kind not null,
  storage_provider text not null default 'oracle',
  storage_path text not null,
  content_type text,
  byte_size bigint check (byte_size >= 0),
  sha256 text,
  captured_at timestamptz,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);

create table app.subscriptions (
  organization_id uuid primary key references app.organizations(id) on delete cascade,
  plan_code text not null default 'free',
  status text not null default 'active',
  provider_customer_id text,
  provider_subscription_id text,
  seats integer not null default 5 check (seats >= 0),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table app.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references app.organizations(id) on delete set null,
  actor_user_profile_id uuid references app.user_profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on app.organization_memberships (user_profile_id, status);
create index employees_org_status_idx on app.employees (organization_id, status);
create index devices_org_status_idx on app.devices (organization_id, status);
create index sessions_org_started_idx on app.work_sessions (organization_id, started_at desc);
create index sessions_employee_started_idx on app.work_sessions (organization_id, employee_id, started_at desc);
create index artifacts_session_idx on app.artifacts (organization_id, session_id, kind);
create index audit_org_created_idx on app.audit_logs (organization_id, created_at desc);

commit;
