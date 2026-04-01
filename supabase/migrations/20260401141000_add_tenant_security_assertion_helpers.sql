-- Tenant-isolation verification helpers.
-- Use in CI/ops to fail fast if critical tenant boundaries drift.

create or replace function public.security_tenant_posture_checks()
returns table (
  check_name text,
  passed boolean,
  details text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  core_table text;
  has_rel boolean;
  has_rls boolean;
  has_force_rls boolean;
  has_membership_violations boolean;
  has_signup_guard boolean;
  fn_def text;
begin
  -- 1) Core tables must exist and enforce RLS + FORCE RLS.
  foreach core_table in array array[
    'organizations',
    'organization_members',
    'organization_invites',
    'organization_projects',
    'organization_clients',
    'organization_opportunities',
    'project_drawing_sets',
    'trade_packs',
    'scope_runs',
    'project_trade_pack_page_index',
    'project_trade_pack_reason_snapshots',
    'ai_chat_usage',
    'ai_chat_messages'
  ]
  loop
    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = core_table
        and c.relkind = 'r'
    )
    into has_rel;

    if not has_rel then
      check_name := format('table_exists:%s', core_table);
      passed := false;
      details := 'Missing table in public schema.';
      return next;
      continue;
    end if;

    select c.relrowsecurity, c.relforcerowsecurity
    into has_rls, has_force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = core_table
      and c.relkind = 'r';

    check_name := format('rls_enabled:%s', core_table);
    passed := coalesce(has_rls, false);
    details := case when passed then 'OK' else 'RLS is not enabled.' end;
    return next;

    check_name := format('force_rls_enabled:%s', core_table);
    passed := coalesce(has_force_rls, false);
    details := case when passed then 'OK' else 'FORCE RLS is not enabled.' end;
    return next;
  end loop;

  -- 2) Every user must belong to at most one organization in this tenant model.
  select exists (
    select 1
    from public.organization_members m
    group by m.user_id
    having count(*) > 1
  )
  into has_membership_violations;

  check_name := 'single_org_membership_per_user';
  passed := not coalesce(has_membership_violations, false);
  details := case when passed then 'OK' else 'Found users with memberships in multiple organizations.' end;
  return next;

  -- 3) Signup trigger guard must require explicit invite token path.
  select pg_get_functiondef('public.handle_new_user()'::regprocedure)
  into fn_def;

  has_signup_guard := position('supplied_invite_token' in coalesce(fn_def, '')) > 0
    and position('i.token = supplied_invite_token' in coalesce(fn_def, '')) > 0;

  check_name := 'signup_requires_explicit_invite_token';
  passed := has_signup_guard;
  details := case when passed then 'OK' else 'handle_new_user() does not enforce explicit invite token join path.' end;
  return next;
end;
$$;

create or replace function public.security_assert_tenant_posture()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  failures jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'check', c.check_name,
        'details', c.details
      )
    ) filter (where c.passed = false),
    '[]'::jsonb
  )
  into failures
  from public.security_tenant_posture_checks() c;

  if jsonb_array_length(failures) > 0 then
    raise exception 'Tenant posture checks failed: %', failures::text;
  end if;
end;
$$;

revoke all on function public.security_tenant_posture_checks() from public;
revoke all on function public.security_assert_tenant_posture() from public;

grant execute on function public.security_tenant_posture_checks() to authenticated;
grant execute on function public.security_assert_tenant_posture() to authenticated;
