begin;

create or replace function public.get_organization_permissions_batch(
  p_organization_id uuid,
  p_permission_keys text[]
)
returns table(permission_key text, is_allowed boolean)
language sql
security definer
set search_path = public
stable
as $$
  select requested.permission_key,
         public.has_org_permission(
           p_organization_id,
           requested.permission_key
         ) as is_allowed
  from (
    select distinct nullif(trim(value), '') as permission_key
    from unnest(coalesce(p_permission_keys, array[]::text[])) as value
  ) requested
  where requested.permission_key is not null
  order by requested.permission_key;
$$;

revoke all on function public.get_organization_permissions_batch(uuid, text[])
  from public, anon;
grant execute on function public.get_organization_permissions_batch(uuid, text[])
  to authenticated;

commit;
