begin;

alter table app.screenshots add column if not exists browser_tabs jsonb not null default '[]'::jsonb;

commit;
