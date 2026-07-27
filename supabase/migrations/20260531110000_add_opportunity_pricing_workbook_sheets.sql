create table if not exists public.opportunity_pricing_workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.opportunity_pricing_worksheets (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  opportunity_id uuid not null references public.organization_opportunities (id) on delete cascade,
  name text not null default 'Pricing Worksheet',
  sheet_order integer not null default 0,
  is_default boolean not null default false,
  worksheet_data jsonb not null default '{}'::jsonb,
  pricing_summary jsonb not null default '{}'::jsonb,
  extracted_pricing_data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_pricing_workbook_sheets_name_not_blank
    check (char_length(trim(name)) > 0)
);

create unique index if not exists opportunity_pricing_workbook_sheets_workbook_sheet_order_idx
  on public.opportunity_pricing_workbook_sheets (workbook_id, sheet_order);

create unique index if not exists opportunity_pricing_workbook_sheets_default_sheet_idx
  on public.opportunity_pricing_workbook_sheets (workbook_id)
  where is_default = true;

create index if not exists opportunity_pricing_workbook_sheets_org_workbook_idx
  on public.opportunity_pricing_workbook_sheets (organization_id, workbook_id, sheet_order);

create index if not exists opportunity_pricing_workbook_sheets_org_opportunity_idx
  on public.opportunity_pricing_workbook_sheets (organization_id, opportunity_id, workbook_id);

drop trigger if exists set_opportunity_pricing_workbook_sheets_updated_at on public.opportunity_pricing_workbook_sheets;
create trigger set_opportunity_pricing_workbook_sheets_updated_at
before update on public.opportunity_pricing_workbook_sheets
for each row execute function public.set_updated_at();

alter table public.opportunity_pricing_workbook_sheets enable row level security;
alter table public.opportunity_pricing_workbook_sheets force row level security;

drop policy if exists "Members can view opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Members can view opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for select
using (public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id));

drop policy if exists "Privileged members can create opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Privileged members can create opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for insert
with check (
  opportunity_pricing_workbook_sheets.created_by = auth.uid()
  and opportunity_pricing_workbook_sheets.updated_by = auth.uid()
  and public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
  )
);

drop policy if exists "Privileged members can update opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Privileged members can update opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for update
using (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
  )
)
with check (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and opportunity_pricing_workbook_sheets.updated_by = auth.uid()
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
  )
);

drop policy if exists "Admins can delete opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
create policy "Admins can delete opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for delete
using (public.is_admin_of_organization(opportunity_pricing_workbook_sheets.organization_id));

grant select, insert, update, delete
on public.opportunity_pricing_workbook_sheets
to authenticated;

insert into public.opportunity_pricing_workbook_sheets (
  workbook_id,
  organization_id,
  opportunity_id,
  name,
  sheet_order,
  is_default,
  worksheet_data,
  pricing_summary,
  extracted_pricing_data,
  version,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  workbook.id as workbook_id,
  workbook.organization_id,
  workbook.opportunity_id,
  coalesce(nullif(trim(workbook.name), ''), 'Pricing Worksheet') as name,
  0 as sheet_order,
  true as is_default,
  workbook.worksheet_data,
  workbook.pricing_summary,
  workbook.extracted_pricing_data,
  workbook.version,
  workbook.created_by,
  workbook.updated_by,
  workbook.created_at,
  workbook.updated_at
from public.opportunity_pricing_worksheets workbook
where not exists (
  select 1
  from public.opportunity_pricing_workbook_sheets sheet
  where sheet.workbook_id = workbook.id
);
