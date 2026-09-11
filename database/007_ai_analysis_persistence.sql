begin;

create table if not exists app.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  user_profile_id uuid not null references app.user_profiles(id) on delete cascade,
  session_id uuid references app.work_sessions(id) on delete set null,
  provider text not null,
  model text not null,
  question text not null,
  answer text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_analyses_org_created_idx
  on app.ai_analyses (organization_id, created_at desc);
create index if not exists ai_analyses_session_created_idx
  on app.ai_analyses (organization_id, session_id, created_at desc);

commit;
