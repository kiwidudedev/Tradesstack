begin;

-- Keep the tighter variations.write permission check, but preserve the
-- original parent-variation consistency guard so child rows can only be
-- written when they point at a variation in the same project + organization.

drop policy if exists "Privileged members can create variation line items" on public.project_variation_line_items;
create policy "Privileged members can create variation line items"
on public.project_variation_line_items
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_line_items.variation_id
      and v.project_id = project_variation_line_items.project_id
      and v.organization_id = project_variation_line_items.organization_id
  )
);

drop policy if exists "Privileged members can update variation line items" on public.project_variation_line_items;
create policy "Privileged members can update variation line items"
on public.project_variation_line_items
for update
to authenticated
using (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_line_items.variation_id
      and v.project_id = project_variation_line_items.project_id
      and v.organization_id = project_variation_line_items.organization_id
  )
);

drop policy if exists "Privileged members can create variation attachments" on public.project_variation_attachments;
create policy "Privileged members can create variation attachments"
on public.project_variation_attachments
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_attachments.variation_id
      and v.project_id = project_variation_attachments.project_id
      and v.organization_id = project_variation_attachments.organization_id
  )
);

drop policy if exists "Privileged members can update variation attachments" on public.project_variation_attachments;
create policy "Privileged members can update variation attachments"
on public.project_variation_attachments
for update
to authenticated
using (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_attachments.variation_id
      and v.project_id = project_variation_attachments.project_id
      and v.organization_id = project_variation_attachments.organization_id
  )
);

drop policy if exists "Privileged members can create variation status events" on public.project_variation_status_events;
create policy "Privileged members can create variation status events"
on public.project_variation_status_events
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_status_events.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_status_events.variation_id
      and v.project_id = project_variation_status_events.project_id
      and v.organization_id = project_variation_status_events.organization_id
  )
);

drop policy if exists "Privileged members can create variation invoice items" on public.project_variation_invoice_items;
create policy "Privileged members can create variation invoice items"
on public.project_variation_invoice_items
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_invoice_items.variation_id
      and v.project_id = project_variation_invoice_items.project_id
      and v.organization_id = project_variation_invoice_items.organization_id
  )
);

drop policy if exists "Privileged members can update variation invoice items" on public.project_variation_invoice_items;
create policy "Privileged members can update variation invoice items"
on public.project_variation_invoice_items
for update
to authenticated
using (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_invoice_items.variation_id
      and v.project_id = project_variation_invoice_items.project_id
      and v.organization_id = project_variation_invoice_items.organization_id
  )
);

commit;
