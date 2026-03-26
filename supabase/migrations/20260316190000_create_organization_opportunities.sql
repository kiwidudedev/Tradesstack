create table if not exists public.organization_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null,
  owner_user_id uuid null,
  client_id uuid null references public.organization_clients (id) on delete set null,
  converted_project_id uuid null references public.organization_projects (id) on delete set null,
  name text not null,
  slug text not null,
  stage text not null default 'New',
  location text not null default 'Unspecified',
  due_date date null,
  quoted_at date null,
  estimated_value numeric(12,2) not null default 0,
  notes text not null default '',
  converted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_opportunities_name_not_blank check (char_length(trim(name)) > 0),
  constraint organization_opportunities_slug_not_blank check (char_length(trim(slug)) > 0),
  constraint organization_opportunities_stage_check check (stage in ('New', 'Reviewing', 'Pricing', 'Quoted', 'Won', 'Lost')),
  constraint organization_opportunities_org_slug_unique unique (organization_id, slug)
);

create index if not exists organization_opportunities_org_idx
on public.organization_opportunities (organization_id);

create index if not exists organization_opportunities_org_stage_idx
on public.organization_opportunities (organization_id, stage);

create index if not exists organization_opportunities_org_due_date_idx
on public.organization_opportunities (organization_id, due_date);

drop trigger if exists set_organization_opportunities_updated_at on public.organization_opportunities;
create trigger set_organization_opportunities_updated_at
before update on public.organization_opportunities
for each row execute function public.set_updated_at();

alter table public.organization_opportunities enable row level security;
alter table public.organization_opportunities force row level security;

drop policy if exists "Members can view organization opportunities" on public.organization_opportunities;
create policy "Members can view organization opportunities"
on public.organization_opportunities
for select
to authenticated
using (public.is_member_of_organization(organization_opportunities.organization_id));

drop policy if exists "Members can create organization opportunities" on public.organization_opportunities;
create policy "Members can create organization opportunities"
on public.organization_opportunities
for insert
to authenticated
with check (
  organization_opportunities.created_by = auth.uid()
  and public.is_member_of_organization(organization_opportunities.organization_id)
);

drop policy if exists "Members can update organization opportunities" on public.organization_opportunities;
create policy "Members can update organization opportunities"
on public.organization_opportunities
for update
to authenticated
using (public.is_member_of_organization(organization_opportunities.organization_id))
with check (public.is_member_of_organization(organization_opportunities.organization_id));

drop policy if exists "Admins can delete organization opportunities" on public.organization_opportunities;
create policy "Admins can delete organization opportunities"
on public.organization_opportunities
for delete
to authenticated
using (public.is_admin_of_organization(organization_opportunities.organization_id));

grant select, insert, update, delete on public.organization_opportunities to authenticated;
