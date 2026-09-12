begin;

create table if not exists app.screenshot_ai_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  session_id uuid not null references app.work_sessions(id) on delete cascade,
  screenshot_id uuid not null references app.screenshots(id) on delete cascade,
  model text not null,
  status text not null check (status in ('ready','insufficient_evidence','failed')),
  summary text not null,
  confidence numeric(4,3),
  observed_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, screenshot_id)
);

create table if not exists app.session_ai_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  session_id uuid not null references app.work_sessions(id) on delete cascade,
  report_date date not null,
  model text not null,
  status text not null check (status in ('pending','processing','ready','insufficient_evidence','failed')),
  summary text,
  confidence numeric(4,3),
  evidence_coverage jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, session_id)
);

create table if not exists app.daily_ai_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  employee_id uuid not null,
  report_date date not null,
  status text not null check (status in ('ready','insufficient_evidence','failed')),
  summary text not null,
  session_count integer not null default 0,
  evidence_coverage jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, report_date)
);

create index if not exists screenshot_ai_findings_session_idx on app.screenshot_ai_findings (organization_id, session_id);
create index if not exists session_ai_reports_employee_date_idx on app.session_ai_reports (organization_id, employee_id, report_date desc);
commit;
