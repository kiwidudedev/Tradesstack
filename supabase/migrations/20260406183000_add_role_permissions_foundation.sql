begin;

-- Move to 5-role membership model.
alter table public.organization_members
drop constraint if exists organization_members_role_check;

alter table public.organization_members
add constraint organization_members_role_check
check (role in ('owner', 'admin', 'qs', 'project_manager', 'worker'));

alter table public.organization_invites
drop constraint if exists organization_invites_role_check;

alter table public.organization_invites
add constraint organization_invites_role_check
check (role in ('owner', 'admin', 'qs', 'project_manager', 'worker'));

update public.organization_members m
set role = 'owner'
from public.organizations o
where o.id = m.organization_id
  and o.created_by = m.user_id;

update public.organization_members
set role = 'worker'
where role = 'member';

update public.organization_invites
set role = 'worker'
where role = 'member';

alter table public.organization_members
alter column role set default 'worker';

alter table public.organization_invites
alter column role set default 'worker';

-- Ownership/admin helpers for RLS and access checks.
create or replace function public.is_owner_of_organization(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.is_admin_of_organization(target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_owner_of_organization(uuid) to authenticated;
grant execute on function public.is_admin_of_organization(uuid) to authenticated;

-- Keep bootstrap policy aligned to creator-owner model.
drop policy if exists "Creators can self bootstrap membership" on public.organization_members;
create policy "Creators can self bootstrap membership"
on public.organization_members
for insert
with check (
  organization_members.user_id = auth.uid()
  and organization_members.role = 'owner'
  and exists (
    select 1
    from public.organizations o
    where o.id = organization_members.organization_id
      and o.created_by = auth.uid()
  )
);

-- Ensure signup creator is owner rather than admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_name text;
  member_name text;
  new_org_id uuid;
  invite_row public.organization_invites%rowtype;
begin
  org_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), '');
  member_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  if org_name is null then
    org_name := split_part(new.email, '@', 1) || ' Organization';
  end if;

  if member_name is null then
    member_name := split_part(new.email, '@', 1);
  end if;

  select i.*
  into invite_row
  from public.organization_invites i
  where lower(i.invited_email) = lower(new.email)
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at asc
  limit 1;

  if found then
    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (invite_row.organization_id, new.id, invite_row.role, member_name)
    on conflict (organization_id, user_id) do update
    set
      role = excluded.role,
      display_name = excluded.display_name,
      updated_at = now();

    update public.organization_invites
    set status = 'accepted', accepted_at = now(), updated_at = now()
    where id = invite_row.id;

    return new;
  end if;

  insert into public.organizations (name, created_by)
  values (org_name, new.id)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org_id, new.id, 'owner', member_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;

-- Permission model.
create table if not exists public.app_permissions (
  permission_key text primary key,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text not null,
  permission_key text not null references public.app_permissions (permission_key) on delete cascade,
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role, permission_key),
  constraint role_permissions_role_check check (role in ('owner', 'admin', 'qs', 'project_manager', 'worker'))
);

create table if not exists public.member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_member_id uuid not null references public.organization_members (id) on delete cascade,
  permission_key text not null references public.app_permissions (permission_key) on delete cascade,
  is_allowed boolean not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_permission_overrides_member_permission_unique unique (organization_member_id, permission_key)
);

create index if not exists member_permission_overrides_member_idx
on public.member_permission_overrides (organization_member_id);

create index if not exists member_permission_overrides_permission_idx
on public.member_permission_overrides (permission_key);

drop trigger if exists set_role_permissions_updated_at on public.role_permissions;
create trigger set_role_permissions_updated_at
before update on public.role_permissions
for each row
execute function public.set_updated_at();

drop trigger if exists set_member_permission_overrides_updated_at on public.member_permission_overrides;
create trigger set_member_permission_overrides_updated_at
before update on public.member_permission_overrides
for each row
execute function public.set_updated_at();

alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_permission_overrides enable row level security;

drop policy if exists "Authenticated can view app permissions" on public.app_permissions;
create policy "Authenticated can view app permissions"
on public.app_permissions
for select
using (auth.uid() is not null);

drop policy if exists "Authenticated can view role permissions" on public.role_permissions;
create policy "Authenticated can view role permissions"
on public.role_permissions
for select
using (auth.uid() is not null);

drop policy if exists "Members can view permission overrides in org" on public.member_permission_overrides;
create policy "Members can view permission overrides in org"
on public.member_permission_overrides
for select
using (
  exists (
    select 1
    from public.organization_members self_member
    join public.organization_members target_member on target_member.id = member_permission_overrides.organization_member_id
    where self_member.user_id = auth.uid()
      and self_member.organization_id = target_member.organization_id
  )
);

drop policy if exists "Owners can create permission overrides" on public.member_permission_overrides;
create policy "Owners can create permission overrides"
on public.member_permission_overrides
for insert
with check (
  member_permission_overrides.created_by = auth.uid()
  and exists (
    select 1
    from public.organization_members owner_member
    join public.organization_members target_member on target_member.id = member_permission_overrides.organization_member_id
    where owner_member.user_id = auth.uid()
      and owner_member.organization_id = target_member.organization_id
      and owner_member.role = 'owner'
  )
);

drop policy if exists "Owners can update permission overrides" on public.member_permission_overrides;
create policy "Owners can update permission overrides"
on public.member_permission_overrides
for update
using (
  exists (
    select 1
    from public.organization_members owner_member
    join public.organization_members target_member on target_member.id = member_permission_overrides.organization_member_id
    where owner_member.user_id = auth.uid()
      and owner_member.organization_id = target_member.organization_id
      and owner_member.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organization_members owner_member
    join public.organization_members target_member on target_member.id = member_permission_overrides.organization_member_id
    where owner_member.user_id = auth.uid()
      and owner_member.organization_id = target_member.organization_id
      and owner_member.role = 'owner'
  )
);

drop policy if exists "Owners can delete permission overrides" on public.member_permission_overrides;
create policy "Owners can delete permission overrides"
on public.member_permission_overrides
for delete
using (
  exists (
    select 1
    from public.organization_members owner_member
    join public.organization_members target_member on target_member.id = member_permission_overrides.organization_member_id
    where owner_member.user_id = auth.uid()
      and owner_member.organization_id = target_member.organization_id
      and owner_member.role = 'owner'
  )
);

grant select on public.app_permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select, insert, update, delete on public.member_permission_overrides to authenticated;

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

insert into public.app_permissions (permission_key, description)
values
  ('settings.users_permissions.view', 'View users and permissions screen'),
  ('settings.users_permissions.manage', 'Invite users, change roles, and manage permission overrides'),
  ('settings.organization.view', 'View organization settings'),
  ('settings.organization.update', 'Update organization settings')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'settings.users_permissions.view', true),
  ('owner', 'settings.users_permissions.manage', true),
  ('owner', 'settings.organization.view', true),
  ('owner', 'settings.organization.update', true),
  ('admin', 'settings.users_permissions.view', true),
  ('admin', 'settings.users_permissions.manage', false),
  ('admin', 'settings.organization.view', true),
  ('admin', 'settings.organization.update', true),
  ('qs', 'settings.users_permissions.view', false),
  ('qs', 'settings.users_permissions.manage', false),
  ('qs', 'settings.organization.view', true),
  ('qs', 'settings.organization.update', false),
  ('project_manager', 'settings.users_permissions.view', false),
  ('project_manager', 'settings.users_permissions.manage', false),
  ('project_manager', 'settings.organization.view', true),
  ('project_manager', 'settings.organization.update', false),
  ('worker', 'settings.users_permissions.view', false),
  ('worker', 'settings.users_permissions.manage', false),
  ('worker', 'settings.organization.view', false),
  ('worker', 'settings.organization.update', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

commit;
