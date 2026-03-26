create table if not exists public.organization_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  company_name text null,
  email text null,
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_clients_name_not_blank check (char_length(trim(name)) > 0)
);

create index if not exists organization_clients_org_idx
on public.organization_clients (organization_id);

create index if not exists organization_clients_org_name_idx
on public.organization_clients (organization_id, name);

drop trigger if exists set_organization_clients_updated_at on public.organization_clients;
create trigger set_organization_clients_updated_at
before update on public.organization_clients
for each row
execute function public.set_updated_at();

alter table public.organization_clients enable row level security;
alter table public.organization_clients force row level security;

drop policy if exists "Members can view organization clients" on public.organization_clients;
create policy "Members can view organization clients"
on public.organization_clients
for select
using (
  public.is_member_of_organization(organization_clients.organization_id)
);

drop policy if exists "Members can create organization clients" on public.organization_clients;
create policy "Members can create organization clients"
on public.organization_clients
for insert
with check (
  organization_clients.created_by = auth.uid()
  and public.is_member_of_organization(organization_clients.organization_id)
);

drop policy if exists "Members can update organization clients" on public.organization_clients;
create policy "Members can update organization clients"
on public.organization_clients
for update
using (
  public.is_member_of_organization(organization_clients.organization_id)
)
with check (
  public.is_member_of_organization(organization_clients.organization_id)
);

drop policy if exists "Admins can delete organization clients" on public.organization_clients;
create policy "Admins can delete organization clients"
on public.organization_clients
for delete
using (
  public.is_admin_of_organization(organization_clients.organization_id)
);

grant select, insert, update, delete on public.organization_clients to authenticated;

alter table public.organization_projects
add column if not exists client_id uuid null references public.organization_clients (id) on delete set null;

create index if not exists organization_projects_org_client_idx
on public.organization_projects (organization_id, client_id);
