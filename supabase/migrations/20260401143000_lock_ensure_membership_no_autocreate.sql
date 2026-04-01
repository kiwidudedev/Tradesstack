-- Tenant isolation hardening:
-- Ensure helper no longer auto-creates organization/member records.
-- It now strictly returns existing membership or errors.

create or replace function public.ensure_organization_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_member_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select m.organization_id
  into existing_member_org_id
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if existing_member_org_id is null then
    raise exception 'Organization membership not found for this user.';
  end if;

  return existing_member_org_id;
end;
$$;

grant execute on function public.ensure_organization_membership() to authenticated;
