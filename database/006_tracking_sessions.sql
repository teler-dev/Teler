-- TELER live tracking state machine built on the existing work_sessions model.
-- Safe to run repeatedly after 003_desktop_auth.sql and 005_backend_integrity.sql.

begin;

alter table app.work_sessions
  add column if not exists user_profile_id uuid references app.user_profiles(id) on delete set null;
alter table app.work_sessions
  add column if not exists role_at_time text not null default 'general';
alter table app.work_sessions
  add column if not exists tracking_status text;
alter table app.work_sessions
  add column if not exists total_duration_seconds bigint not null default 0;
alter table app.work_sessions
  add column if not exists total_paused_seconds bigint not null default 0;
alter table app.work_sessions
  add column if not exists updated_at timestamptz not null default now();

update app.work_sessions ws
set role_at_time = coalesce(nullif(e.job_role, ''), 'general')
from app.employees e
where e.organization_id = ws.organization_id
  and e.id = ws.employee_id
  and (ws.role_at_time is null or ws.role_at_time = 'general');

alter table app.work_sessions drop constraint if exists work_sessions_tracking_status_check;
alter table app.work_sessions
  add constraint work_sessions_tracking_status_check
  check (tracking_status is null or tracking_status in ('running','paused','stopped'));

create table if not exists app.session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null,
  user_profile_id uuid references app.user_profiles(id) on delete set null,
  event_type text not null check (event_type in ('start','pause','resume','stop')),
  event_ts timestamptz not null,
  client_event_id text,
  client_source text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, session_id)
    references app.work_sessions(organization_id, id) on delete cascade
);

create unique index if not exists session_events_client_event_unique_idx
  on app.session_events (session_id, client_event_id)
  where client_event_id is not null;
create index if not exists session_events_session_time_idx
  on app.session_events (organization_id, session_id, event_ts, created_at);
create unique index if not exists tracking_sessions_user_active_idx
  on app.work_sessions (user_profile_id)
  where user_profile_id is not null and tracking_status in ('running','paused');
create index if not exists tracking_sessions_employee_started_idx
  on app.work_sessions (organization_id, employee_id, started_at desc)
  where tracking_status is not null;

commit;