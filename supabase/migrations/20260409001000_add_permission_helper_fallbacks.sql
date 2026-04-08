begin;

-- Production-safe compatibility patch:
-- some environments may have live memberships before the role_permissions
-- seed landed cleanly. Keep the permission system intact, but fail over to
-- the intended default matrix for the core permission keys when no explicit
-- role_permissions row exists yet.

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
  current_member_id uuid;
  current_role text;
  override_value boolean;
  role_default boolean;
begin
  if auth.uid() is null or p_organization_id is null then
    return false;
  end if;

  select m.id, m.role
  into current_member_id, current_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if current_member_id is null then
    return false;
  end if;

  select o.is_allowed
  into override_value
  from public.member_permission_overrides o
  where o.organization_member_id = current_member_id
    and o.permission_key = p_permission_key
  limit 1;

  if found then
    return coalesce(override_value, false);
  end if;

  select rp.is_allowed
  into role_default
  from public.role_permissions rp
  where rp.role = current_role
    and rp.permission_key = p_permission_key
  limit 1;

  if found then
    return coalesce(role_default, false);
  end if;

  case p_permission_key
    when 'settings.organization.update' then
      return current_role in ('owner', 'admin');
    when 'leads.clients.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'leads.opportunities.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'quotes.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'variations.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'purchase_orders.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    else
      return false;
  end case;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;

commit;
