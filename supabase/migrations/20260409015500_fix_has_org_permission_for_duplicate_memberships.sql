-- Commercial document saves currently rely on has_org_permission(...).
-- In some live orgs, users can end up with more than one membership row for the
-- same organization over time. The previous helper picked the earliest row only,
-- which can fail closed if that older row has a less-privileged role.
--
-- Claims still work because they only check membership, which is why this bug
-- shows up specifically on quotes / variations / purchase orders.
--
-- This version evaluates all memberships for auth.uid() in the target org:
-- - explicit member override wins first
-- - otherwise any role permission that allows the action is enough
-- - otherwise the built-in fallback matrix applies to any matching role

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  has_explicit_allow boolean := false;
  has_explicit_deny boolean := false;
  has_role_allow boolean := false;
  has_fallback_allow boolean := false;
begin
  if auth.uid() is null or p_organization_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = true
  )
  into has_explicit_allow;

  if has_explicit_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = false
  )
  into has_explicit_deny;

  if has_explicit_deny then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp
      on rp.role = m.role
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and rp.permission_key = p_permission_key
      and rp.is_allowed = true
  )
  into has_role_allow;

  if has_role_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        (p_permission_key = 'settings.organization.update' and m.role in ('owner', 'admin'))
        or
        (p_permission_key = 'leads.clients.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'leads.opportunities.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'quotes.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'variations.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'purchase_orders.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
      )
  )
  into has_fallback_allow;

  return has_fallback_allow;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;
