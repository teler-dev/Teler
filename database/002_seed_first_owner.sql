-- Seed the first TELER organization owner.
-- Prerequisite: create the identity in Neon Auth, then copy its User ID.
-- Replace only the three values in the configuration section before running.

begin;

do $$
declare
  -- ── Configuration ────────────────────────────────────────────────────────
  v_auth_user_id text := 'REPLACE_WITH_NEON_AUTH_USER_ID';
  v_display_name text := 'TELER Owner';
  v_organization_name text := 'TELER';
  v_organization_slug text := 'teler';

  -- ── Internal IDs ─────────────────────────────────────────────────────────
  v_profile_id uuid;
  v_organization_id uuid;
begin
  if v_auth_user_id = 'REPLACE_WITH_NEON_AUTH_USER_ID' or trim(v_auth_user_id) = '' then
    raise exception 'Replace REPLACE_WITH_NEON_AUTH_USER_ID before running this seed';
  end if;

  insert into app.user_profiles (auth_user_id, display_name)
  values (v_auth_user_id, v_display_name)
  on conflict (auth_user_id) do update
    set display_name = excluded.display_name,
        updated_at = now()
  returning id into v_profile_id;

  insert into app.organizations (slug, name)
  values (v_organization_slug, v_organization_name)
  on conflict (slug) do update
    set name = excluded.name,
        updated_at = now()
  returning id into v_organization_id;

  insert into app.organization_memberships (
    organization_id,
    user_profile_id,
    role,
    status
  )
  values (
    v_organization_id,
    v_profile_id,
    'owner',
    'active'
  )
  on conflict (organization_id, user_profile_id) do update
    set role = 'owner',
        status = 'active';

  insert into app.organization_settings (organization_id)
  values (v_organization_id)
  on conflict (organization_id) do nothing;

  insert into app.subscriptions (organization_id, plan_code, status, seats)
  values (v_organization_id, 'free', 'active', 5)
  on conflict (organization_id) do nothing;

  insert into app.audit_logs (
    organization_id,
    actor_user_profile_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_organization_id,
    v_profile_id,
    'organization.owner_seeded',
    'organization',
    v_organization_id::text,
    jsonb_build_object('source', '002_seed_first_owner.sql')
  );

  raise notice 'Seeded owner profile %, organization %', v_profile_id, v_organization_id;
end
$$;

commit;

-- Verification: this must return exactly one active owner row.
select
  o.id as organization_id,
  o.name as organization_name,
  o.slug,
  p.auth_user_id,
  p.display_name,
  m.role,
  m.status
from app.organization_memberships m
join app.organizations o on o.id = m.organization_id
join app.user_profiles p on p.id = m.user_profile_id
where o.slug = 'teler'
  and m.role = 'owner'
  and m.status = 'active';
