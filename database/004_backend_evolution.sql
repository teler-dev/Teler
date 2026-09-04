-- TELER backend evolution: normalized telemetry + DB-backed jobs.
-- Safe to run repeatedly after 001_initial_multitenant.sql and 003_desktop_auth.sql.

begin;

create extension if not exists pgcrypto;

alter table app.organizations add column if not exists external_key text;
update app.organizations set external_key = 'COMP_DEV_001'
where slug = 'teler' and external_key is null;
create unique index if not exists organizations_external_key_idx
  on app.organizations (external_key) where external_key is not null;

alter table app.session_metrics add column if not exists app_switch_count integer not null default 0;
alter table app.session_metrics add column if not exists idle_seconds integer not null default 0;
alter table app.session_metrics add column if not exists focus_seconds integer not null default 0;
alter table app.session_metrics add column if not exists distraction_seconds integer not null default 0;
alter table app.session_metrics add column if not exists calculated_version text not null default 'v2';

create table if not exists app.app_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null,
  app_name text not null,
  category text not null check (category in ('productive','neutral','distraction','idle')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  key_count integer not null default 0,
  click_count integer not null default 0,
  switch_count integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);
create index if not exists app_usage_session_idx on app.app_usage (organization_id, session_id, started_at);
create index if not exists app_usage_org_time_idx on app.app_usage (organization_id, started_at desc);

create table if not exists app.session_metrics_minute (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null,
  employee_id uuid not null,
  minute_timestamp timestamptz not null,
  key_count integer not null default 0,
  click_count integer not null default 0,
  app_switches integer not null default 0,
  idle_seconds integer not null default 0,
  focus_seconds integer not null default 0,
  distraction_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (organization_id, session_id, minute_timestamp),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade
);
create index if not exists metrics_minute_org_time_idx on app.session_metrics_minute (organization_id, minute_timestamp desc);
create index if not exists metrics_minute_employee_time_idx on app.session_metrics_minute (organization_id, employee_id, minute_timestamp desc);

create table if not exists app.session_metrics_daily (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  metric_date date not null,
  session_count integer not null default 0,
  total_duration_seconds bigint not null default 0,
  key_count bigint not null default 0,
  click_count bigint not null default 0,
  app_switches bigint not null default 0,
  idle_seconds bigint not null default 0,
  focus_seconds bigint not null default 0,
  distraction_seconds bigint not null default 0,
  avg_productivity_score numeric(5,2),
  updated_at timestamptz not null default now(),
  primary key (organization_id, employee_id, metric_date),
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade
);
create index if not exists metrics_daily_org_date_idx on app.session_metrics_daily (organization_id, metric_date desc);

create table if not exists app.focus_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null,
  employee_id uuid not null,
  block_type text not null check (block_type in ('focus','distraction','idle')),
  app_name text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade
);
create index if not exists focus_blocks_session_idx on app.focus_blocks (organization_id, session_id, block_type);

create table if not exists app.screenshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null,
  storage_path text not null,
  thumbnail_path text,
  ocr_text text,
  active_window text,
  active_app text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);
create index if not exists screenshots_session_idx on app.screenshots (organization_id, session_id, captured_at desc);
create index if not exists screenshots_ocr_fts_idx on app.screenshots using gin (to_tsvector('simple', coalesce(ocr_text,'')));

create table if not exists app.alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  name text not null,
  rule_type text not null,
  condition jsonb not null default '{}'::jsonb,
  severity text not null default 'warning' check (severity in ('info','low','medium','high','critical','warning')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alert_rules_org_enabled_idx on app.alert_rules (organization_id, enabled);

create table if not exists app.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  session_id uuid,
  rule_id uuid references app.alert_rules(id) on delete set null,
  alert_type text not null,
  severity text not null check (severity in ('info','low','medium','high','critical','warning')),
  metric text,
  threshold numeric,
  actual_value numeric,
  description text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade,
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);
create index if not exists alerts_org_created_idx on app.alerts (organization_id, created_at desc);
create index if not exists alerts_employee_created_idx on app.alerts (organization_id, employee_id, created_at desc);
create index if not exists alerts_open_idx on app.alerts (organization_id, status, severity);
create unique index if not exists alerts_session_type_unique_idx
  on app.alerts (organization_id, session_id, alert_type)
  where session_id is not null and status <> 'dismissed';

create table if not exists app.alert_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  alert_id uuid not null references app.alerts(id) on delete cascade,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','completed')),
  error_message text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived','completed')),
  created_by uuid references app.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_org_idx on app.projects (organization_id, status);

create table if not exists app.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  project_id uuid references app.projects(id) on delete set null,
  assigned_to uuid,
  created_by uuid references app.user_profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','completed','blocked','archived')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, assigned_to)
    references app.employees(organization_id, id) on delete set null
);
create index if not exists tasks_org_status_idx on app.tasks (organization_id, status, due_at);

create table if not exists app.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  report_type text not null,
  title text not null,
  generated_by uuid references app.user_profiles(id) on delete set null,
  date_start timestamptz,
  date_end timestamptz,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sent','archived','ready','failed')),
  scheduled_recipients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_org_created_idx on app.reports (organization_id, created_at desc);

create table if not exists app.ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid,
  insight_type text not null,
  title text not null,
  description text not null,
  confidence_score numeric(4,3) check (confidence_score between 0 and 1),
  metric text,
  metric_value numeric,
  benchmark_value numeric,
  created_at timestamptz not null default now(),
  foreign key (organization_id, employee_id)
    references app.employees(organization_id, id) on delete cascade
);
create index if not exists ai_insights_org_created_idx on app.ai_insights (organization_id, created_at desc);

create table if not exists app.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  priority integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','retrying')),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists background_jobs_claim_idx
  on app.background_jobs (status, priority desc, run_after, created_at)
  where status in ('pending','retrying');
create index if not exists background_jobs_type_idx on app.background_jobs (job_type, created_at desc);

create table if not exists app.data_retention_policies (
  organization_id uuid not null references app.organizations(id) on delete cascade,
  resource_type text not null,
  retention_days integer not null check (retention_days between 1 and 3650),
  auto_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, resource_type)
);

commit;