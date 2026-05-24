alter table if exists public.opportunity_pricing_worksheets
  drop constraint if exists opportunity_pricing_worksheets_org_opportunity_unique;

alter table if exists public.opportunity_pricing_worksheets
  add column if not exists trade_package text null,
  add column if not exists sort_order integer null,
  add column if not exists archived_at timestamptz null;

create index if not exists opportunity_pricing_worksheets_org_opportunity_updated_idx
  on public.opportunity_pricing_worksheets (organization_id, opportunity_id, updated_at desc);

drop policy if exists "Privileged members can update opportunity pricing worksheets"
  on public.opportunity_pricing_worksheets;

create policy "Privileged members can update opportunity pricing worksheets"
on public.opportunity_pricing_worksheets
for update
using (
  public.is_member_of_organization(opportunity_pricing_worksheets.organization_id)
  and public.has_org_permission(opportunity_pricing_worksheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = opportunity_pricing_worksheets.opportunity_id
      and o.organization_id = opportunity_pricing_worksheets.organization_id
  )
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
