create table if not exists public.platform_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admin_users_role_check check (role in ('owner', 'admin', 'viewer'))
);

create unique index if not exists platform_admin_users_user_id_uidx
  on public.platform_admin_users (user_id);

create unique index if not exists platform_admin_users_email_lower_uidx
  on public.platform_admin_users (lower(email));

create trigger set_platform_admin_users_updated_at
before update on public.platform_admin_users
for each row execute function public.set_updated_at();

alter table public.platform_admin_users enable row level security;
alter table public.platform_admin_users force row level security;

create or replace function public._platform_admin_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_role, ''))
    when 'viewer' then 1
    when 'admin' then 2
    when 'owner' then 3
    else 0
  end
$$;

create or replace function public.is_platform_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return true;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.platform_admin_users pau
    where pau.user_id = auth.uid()
      and pau.is_active
  );
end;
$$;

create or replace function public.has_platform_admin_role(required_role text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  current_role text;
  required_rank integer;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return true;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  required_rank := public._platform_admin_role_rank(required_role);
  if required_rank = 0 then
    return false;
  end if;

  select pau.role
  into current_role
  from public.platform_admin_users pau
  where pau.user_id = auth.uid()
    and pau.is_active
  limit 1;

  if current_role is null then
    return false;
  end if;

  return public._platform_admin_role_rank(current_role) >= required_rank;
end;
$$;

create policy "Platform admins can read active platform admin users"
on public.platform_admin_users
for select
to authenticated
using (
  public.is_platform_admin()
  and platform_admin_users.is_active
);

create policy "Platform owners can read all platform admin users"
on public.platform_admin_users
for select
to authenticated
using (
  public.has_platform_admin_role('owner')
);

create policy "Platform owners can insert platform admin users"
on public.platform_admin_users
for insert
to authenticated
with check (
  public.has_platform_admin_role('owner')
);

create policy "Platform owners can update platform admin users"
on public.platform_admin_users
for update
to authenticated
using (
  public.has_platform_admin_role('owner')
)
with check (
  public.has_platform_admin_role('owner')
);

create policy "Platform owners can delete platform admin users"
on public.platform_admin_users
for delete
to authenticated
using (
  public.has_platform_admin_role('owner')
);

revoke all on public.platform_admin_users from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admin_users to authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_platform_admin_role(text) to authenticated;

insert into public.platform_admin_users (user_id, email, role, is_active)
select
  u.id,
  lower(u.email),
  'owner',
  true
from auth.users u
where lower(coalesce(u.email, '')) = 'hi@tradesstack.com'
on conflict (user_id) do update
set
  email = excluded.email,
  role = excluded.role,
  is_active = true,
  updated_at = now();

create or replace function public._intelligence_can_view_analytics(
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return true;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  return public.has_platform_admin_role('viewer');
end;
$$;
