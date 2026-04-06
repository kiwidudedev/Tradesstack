begin;

create or replace function public.get_organization_member_emails(p_organization_id uuid)
returns table (
  user_id uuid,
  email text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    m.user_id,
    u.email::text as email
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and public.is_owner_of_organization(p_organization_id);
$$;

revoke all on function public.get_organization_member_emails(uuid) from public;
grant execute on function public.get_organization_member_emails(uuid) to authenticated;

commit;
