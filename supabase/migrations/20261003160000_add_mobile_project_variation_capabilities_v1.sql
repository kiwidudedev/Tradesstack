begin;

create or replace function public.get_mobile_project_variation_capabilities_v1(
  p_project_id uuid
)
returns table (
  project_id uuid,
  can_create boolean,
  can_edit boolean,
  can_change_status boolean
)
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  current_context record;
  can_write boolean;
begin
  select * into current_context
  from public.resolve_mobile_project_member_context_v2(p_project_id);

  can_write := public.has_org_permission(current_context.organization_id, 'variations.write');

  return query
  select p_project_id, can_write, can_write, can_write;
end;
$$;

revoke all on function public.get_mobile_project_variation_capabilities_v1(uuid)
  from public, anon;

grant execute on function public.get_mobile_project_variation_capabilities_v1(uuid)
  to authenticated;

commit;
