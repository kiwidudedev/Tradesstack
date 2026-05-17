create table if not exists public.opportunity_pricing_worksheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id uuid not null references public.organization_opportunities (id) on delete cascade,
  name text not null default 'Pricing Worksheet',
  worksheet_data jsonb not null default '{}'::jsonb,
  pricing_summary jsonb not null default '{}'::jsonb,
  extracted_pricing_data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_pricing_worksheets_name_not_blank
    check (char_length(trim(name)) > 0),
  constraint opportunity_pricing_worksheets_org_opportunity_unique
    unique (organization_id, opportunity_id)
);

create index if not exists opportunity_pricing_worksheets_org_idx
  on public.opportunity_pricing_worksheets (organization_id);

create index if not exists opportunity_pricing_worksheets_org_opportunity_idx
  on public.opportunity_pricing_worksheets (organization_id, opportunity_id);

drop trigger if exists set_opportunity_pricing_worksheets_updated_at on public.opportunity_pricing_worksheets;
create trigger set_opportunity_pricing_worksheets_updated_at
before update on public.opportunity_pricing_worksheets
for each row execute function public.set_updated_at();

alter table public.opportunity_pricing_worksheets enable row level security;
alter table public.opportunity_pricing_worksheets force row level security;

drop policy if exists "Members can view opportunity pricing worksheets" on public.opportunity_pricing_worksheets;
create policy "Members can view opportunity pricing worksheets"
on public.opportunity_pricing_worksheets
for select
using (public.is_member_of_organization(opportunity_pricing_worksheets.organization_id));

drop policy if exists "Privileged members can create opportunity pricing worksheets" on public.opportunity_pricing_worksheets;
create policy "Privileged members can create opportunity pricing worksheets"
on public.opportunity_pricing_worksheets
for insert
with check (
  opportunity_pricing_worksheets.created_by = auth.uid()
  and opportunity_pricing_worksheets.updated_by = auth.uid()
  and public.is_member_of_organization(opportunity_pricing_worksheets.organization_id)
  and public.has_org_permission(opportunity_pricing_worksheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = opportunity_pricing_worksheets.opportunity_id
      and o.organization_id = opportunity_pricing_worksheets.organization_id
  )
);

drop policy if exists "Privileged members can update opportunity pricing worksheets" on public.opportunity_pricing_worksheets;
create policy "Privileged members can update opportunity pricing worksheets"
on public.opportunity_pricing_worksheets
for update
using (
  public.is_member_of_organization(opportunity_pricing_worksheets.organization_id)
)
with check (
  public.is_member_of_organization(opportunity_pricing_worksheets.organization_id)
  and public.has_org_permission(opportunity_pricing_worksheets.organization_id, 'leads.opportunities.write')
  and opportunity_pricing_worksheets.updated_by = auth.uid()
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = opportunity_pricing_worksheets.opportunity_id
      and o.organization_id = opportunity_pricing_worksheets.organization_id
  )
);

drop policy if exists "Admins can delete opportunity pricing worksheets" on public.opportunity_pricing_worksheets;
create policy "Admins can delete opportunity pricing worksheets"
on public.opportunity_pricing_worksheets
for delete
using (public.is_admin_of_organization(opportunity_pricing_worksheets.organization_id));

grant select, insert, update, delete
on public.opportunity_pricing_worksheets
to authenticated;
