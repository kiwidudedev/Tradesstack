begin;

-- Keep the tighter quotes.write permission check, but preserve the
-- original parent-quote consistency guard so line items can only be written
-- when they point at a quote in the same project + organization.

drop policy if exists "Privileged members can create quote line items" on public.project_quote_line_items;
create policy "Privileged members can create quote line items"
on public.project_quote_line_items
for insert
to authenticated
with check (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
  and exists (
    select 1
    from public.project_quotes q
    where q.id = project_quote_line_items.quote_id
      and q.project_id = project_quote_line_items.project_id
      and q.organization_id = project_quote_line_items.organization_id
  )
);

drop policy if exists "Privileged members can update quote line items" on public.project_quote_line_items;
create policy "Privileged members can update quote line items"
on public.project_quote_line_items
for update
to authenticated
using (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
)
with check (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
  and exists (
    select 1
    from public.project_quotes q
    where q.id = project_quote_line_items.quote_id
      and q.project_id = project_quote_line_items.project_id
      and q.organization_id = project_quote_line_items.organization_id
  )
);

commit;
