begin;

-- Enforce a single owner per organization (long-term safety baseline).
create unique index if not exists organization_members_single_owner_per_org_idx
on public.organization_members (organization_id)
where role = 'owner';

-- Do not allow inviting someone directly as owner.
update public.organization_invites
set role = 'worker'
where role = 'owner';

alter table public.organization_invites
drop constraint if exists organization_invites_non_owner_role_check;

alter table public.organization_invites
add constraint organization_invites_non_owner_role_check
check (role <> 'owner');

-- Owner-only member administration (role edits / removals).
drop policy if exists "Admins can update members" on public.organization_members;
drop policy if exists "Owners can update members" on public.organization_members;
create policy "Owners can update members"
on public.organization_members
for update
using (
  public.is_owner_of_organization(organization_members.organization_id)
)
with check (
  public.is_owner_of_organization(organization_members.organization_id)
);

drop policy if exists "Admins can remove members" on public.organization_members;
drop policy if exists "Owners can remove members" on public.organization_members;
create policy "Owners can remove members"
on public.organization_members
for delete
using (
  public.is_owner_of_organization(organization_members.organization_id)
);

-- Owner-only invite administration (add users path).
drop policy if exists "Admins can view invites" on public.organization_invites;
drop policy if exists "Owners can view invites" on public.organization_invites;
create policy "Owners can view invites"
on public.organization_invites
for select
using (
  public.is_owner_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can create invites" on public.organization_invites;
drop policy if exists "Owners can create invites" on public.organization_invites;
create policy "Owners can create invites"
on public.organization_invites
for insert
with check (
  organization_invites.invited_by = auth.uid()
  and public.is_owner_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can update invites" on public.organization_invites;
drop policy if exists "Owners can update invites" on public.organization_invites;
create policy "Owners can update invites"
on public.organization_invites
for update
using (
  public.is_owner_of_organization(organization_invites.organization_id)
)
with check (
  public.is_owner_of_organization(organization_invites.organization_id)
);

drop policy if exists "Admins can delete invites" on public.organization_invites;
drop policy if exists "Owners can delete invites" on public.organization_invites;
create policy "Owners can delete invites"
on public.organization_invites
for delete
using (
  public.is_owner_of_organization(organization_invites.organization_id)
);

-- Defense-in-depth: sensitive permissions are owner-only regardless of overrides/defaults.
create or replace function public.has_permission(p_permission_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_id uuid;
  current_role text;
  override_value boolean;
  role_default boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_permission_key is null or btrim(p_permission_key) = '' then
    return false;
  end if;

  select m.id, m.role
  into current_member_id, current_role
  from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if current_member_id is null then
    return false;
  end if;

  if p_permission_key in ('settings.users_permissions.manage') then
    return current_role = 'owner';
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

  return coalesce(role_default, false);
end;
$$;

grant execute on function public.has_permission(text) to authenticated;

commit;
