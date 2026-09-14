-- Move an existing self-service signup into the shared TELER workspace so the
-- owner/admin sees them in one portal.
--
-- Background: before single-tenant signup, every account created its own
-- isolated organization. This script re-homes one such account (by email) into
-- the shared org identified by slug, as an active 'viewer', and deactivates its
-- old solo membership so ACCOUNT_QUERY resolves to the shared org on next login.
--
-- Safe to re-run. Set the two values below before running.
--   psql "$DATABASE_URL" -f database/009_move_account_to_default_org.sql

begin;

do $$
declare
  -- ── Configuration ────────────────────────────────────────────────────────
  v_email    text := 'essa@accountibles.com';
  v_org_slug text := 'teler';

  -- ── Internal ─────────────────────────────────────────────────────────────
  v_profile_id uuid;
  v_org_id     uuid;
  v_job_role   text;
  v_name       text;
begin
  select user_profile_id into v_profile_id
    from app.user_credentials
   where email_normalized = lower(v_email);
  if v_profile_id is null then
    raise exception 'No account found for email %', v_email;
  end if;

  select id into v_org_id
    from app.organizations
   where slug = lower(v_org_slug) and status = 'active';
  if v_org_id is null then
    raise exception 'No active organization with slug % (run the admin bootstrap first)', v_org_slug;
  end if;

  select display_name into v_name from app.user_profiles where id = v_profile_id;
  select job_role into v_job_role
    from app.employees
   where external_key = v_profile_id::text
   order by created_at asc
   limit 1;

  -- Deactivate memberships in every other org so the shared workspace wins.
  update app.organization_memberships
     set status = 'suspended'
   where user_profile_id = v_profile_id
     and organization_id <> v_org_id;

  -- Ensure an active viewer membership in the shared org.
  insert into app.organization_memberships (organization_id, user_profile_id, role, status)
  values (v_org_id, v_profile_id, 'viewer', 'active')
  on conflict (organization_id, user_profile_id)
    do update set role = 'viewer', status = 'active';

  -- Ensure an employee row in the shared org (external_key must equal profile id).
  insert into app.employees (organization_id, external_key, display_name, email_normalized, job_role)
  values (v_org_id, v_profile_id::text, coalesce(v_name, v_email), lower(v_email), coalesce(v_job_role, 'general'))
  on conflict (organization_id, external_key) do nothing;

  raise notice 'Moved % into organization % (%)', v_email, v_org_slug, v_org_id;
end
$$;

commit;

-- Verification: should show the account active in the shared org.
select o.slug, o.name, m.role, m.status, e.display_name, e.email_normalized
  from app.organization_memberships m
  join app.organizations o on o.id = m.organization_id
  join app.user_credentials c on c.user_profile_id = m.user_profile_id
  left join app.employees e
    on e.organization_id = m.organization_id and e.external_key = m.user_profile_id::text
 where c.email_normalized = lower('essa@accountibles.com')
 order by m.status;
