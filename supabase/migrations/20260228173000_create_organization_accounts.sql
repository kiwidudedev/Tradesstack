-- Organization-first auth model with invite-only membership.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.accept_organization_invite(text);
drop function if exists public.accept_organization_invite(uuid);
drop table if exists public.organization_invites cascade;
drop table if exists public.profiles cascade;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (char_length(trim(name)) > 0),
  constraint organizations_created_by_unique unique (created_by)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_role_check check (role in ('admin', 'member')),
  constraint organization_members_display_name_not_blank check (char_length(trim(display_name)) > 0),
  constraint organization_members_org_user_unique unique (organization_id, user_id),
  constraint organization_members_user_unique unique (user_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invites_email_not_blank check (char_length(trim(invited_email)) > 0),
  constraint organization_invites_role_check check (role in ('admin', 'member')),
  constraint organization_invites_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint organization_invites_token_unique unique (token)
);

create unique index if not exists organization_invites_pending_email_idx
on public.organization_invites (organization_id, lower(invited_email))
where status = 'pending';

update public.organization_members
set role = 'admin'
where role = 'owner';

alter table public.organization_members
alter column role set default 'member';

alter table public.organization_members
drop constraint if exists organization_members_role_check;

alter table public.organization_members
add constraint organization_members_role_check check (role in ('admin', 'member'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists set_organization_members_updated_at on public.organization_members;
create trigger set_organization_members_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

drop trigger if exists set_organization_invites_updated_at on public.organization_invites;
create trigger set_organization_invites_updated_at
before update on public.organization_invites
for each row
execute function public.set_updated_at();

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

  -- If this email has a pending invite, join that organization instead of creating a new one.
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

  -- Signup creator is always admin.
  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org_id, new.id, 'admin', member_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.accept_organization_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.organization_invites%rowtype;
  current_email text;
  member_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an invite.';
  end if;

  select i.*
  into invite_row
  from public.organization_invites i
  where i.token = invite_token
    and i.status = 'pending'
  limit 1;

  if not found then
    raise exception 'Invite is invalid or no longer active.';
  end if;

  if invite_row.expires_at <= now() then
    update public.organization_invites
    set status = 'expired', updated_at = now()
    where id = invite_row.id;

    raise exception 'Invite has expired.';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if current_email = '' then
    raise exception 'Signed-in user email is missing.';
  end if;

  if lower(invite_row.invited_email) <> current_email then
    raise exception 'This invite was issued to a different email.';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.user_id = auth.uid()
      and m.organization_id <> invite_row.organization_id
  ) then
    raise exception 'This account already belongs to a different organization.';
  end if;

  member_name := nullif(trim(coalesce(auth.jwt() ->> 'full_name', '')), '');
  if member_name is null then
    member_name := split_part(current_email, '@', 1);
  end if;

  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (invite_row.organization_id, auth.uid(), invite_row.role, member_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  update public.organization_invites
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = invite_row.id;

  return invite_row.organization_id;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

drop policy if exists "Users can read own organization" on public.organizations;
create policy "Users can read own organization"
on public.organizations
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update organization" on public.organizations;
drop policy if exists "Owners and admins can update organization" on public.organizations;
create policy "Admins can update organization"
on public.organizations
for update
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Members can view organization members" on public.organization_members;
create policy "Members can view organization members"
on public.organization_members
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
  )
);

-- Join is invite-only. No insert policy on organization_members.
drop policy if exists "Owners and admins can add members" on public.organization_members;
drop policy if exists "Admins can add members" on public.organization_members;

drop policy if exists "Admins can update members" on public.organization_members;
drop policy if exists "Owners and admins can update members" on public.organization_members;
create policy "Admins can update members"
on public.organization_members
for update
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can remove members" on public.organization_members;
drop policy if exists "Owners and admins can remove members" on public.organization_members;
create policy "Admins can remove members"
on public.organization_members
for delete
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can view invites" on public.organization_invites;
create policy "Admins can view invites"
on public.organization_invites
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_invites.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can create invites" on public.organization_invites;
create policy "Admins can create invites"
on public.organization_invites
for insert
with check (
  organization_invites.invited_by = auth.uid()
  and
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_invites.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can update invites" on public.organization_invites;
create policy "Admins can update invites"
on public.organization_invites
for update
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_invites.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_invites.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

drop policy if exists "Admins can delete invites" on public.organization_invites;
create policy "Admins can delete invites"
on public.organization_invites
for delete
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_invites.organization_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
);

grant usage on schema public to anon, authenticated;
grant select, update on public.organizations to authenticated;
grant select, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.organization_invites to authenticated;
grant execute on function public.accept_organization_invite(uuid) to authenticated;
