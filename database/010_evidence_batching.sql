begin;

alter table app.screenshots add column if not exists visual_hash varchar(64);
create index if not exists screenshots_visual_hash_idx
  on app.screenshots (organization_id, session_id, visual_hash, captured_at asc);

alter table app.session_ai_reports add column if not exists highlights jsonb not null default '[]'::jsonb;

commit;
