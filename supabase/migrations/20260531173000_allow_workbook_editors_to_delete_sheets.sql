drop policy if exists "Admins can delete opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;
drop policy if exists "Privileged members can delete opportunity pricing workbook sheets" on public.opportunity_pricing_workbook_sheets;

create policy "Privileged members can delete opportunity pricing workbook sheets"
on public.opportunity_pricing_workbook_sheets
for delete
using (
  public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)
  and public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = opportunity_pricing_workbook_sheets.workbook_id
      and workbook.organization_id = opportunity_pricing_workbook_sheets.organization_id
      and workbook.opportunity_id = opportunity_pricing_workbook_sheets.opportunity_id
      and workbook.archived_at is null
  )
);
