-- Harden insert/update integrity checks so organization-only policies cannot
-- be used with mismatched project/opportunity foreign references.

drop policy if exists "Members can create organization opportunities" on public.organization_opportunities;
create policy "Members can create organization opportunities"
on public.organization_opportunities
for insert
to authenticated
with check (
  organization_opportunities.created_by = auth.uid()
  and public.is_member_of_organization(organization_opportunities.organization_id)
  and (
    organization_opportunities.client_id is null
    or exists (
      select 1
      from public.organization_clients c
      where c.id = organization_opportunities.client_id
        and c.organization_id = organization_opportunities.organization_id
    )
  )
  and (
    organization_opportunities.workspace_project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = organization_opportunities.workspace_project_id
        and p.organization_id = organization_opportunities.organization_id
    )
  )
  and (
    organization_opportunities.converted_project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = organization_opportunities.converted_project_id
        and p.organization_id = organization_opportunities.organization_id
    )
  )
);

drop policy if exists "Members can update organization opportunities" on public.organization_opportunities;
create policy "Members can update organization opportunities"
on public.organization_opportunities
for update
to authenticated
using (public.is_member_of_organization(organization_opportunities.organization_id))
with check (
  public.is_member_of_organization(organization_opportunities.organization_id)
  and (
    organization_opportunities.client_id is null
    or exists (
      select 1
      from public.organization_clients c
      where c.id = organization_opportunities.client_id
        and c.organization_id = organization_opportunities.organization_id
    )
  )
  and (
    organization_opportunities.workspace_project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = organization_opportunities.workspace_project_id
        and p.organization_id = organization_opportunities.organization_id
    )
  )
  and (
    organization_opportunities.converted_project_id is null
    or exists (
      select 1
      from public.organization_projects p
      where p.id = organization_opportunities.converted_project_id
        and p.organization_id = organization_opportunities.organization_id
    )
  )
);

drop policy if exists "Members can create opportunity quotes" on public.opportunity_quotes;
create policy "Members can create opportunity quotes"
on public.opportunity_quotes
for insert
to authenticated
with check (
  opportunity_quotes.created_by = auth.uid()
  and public.is_member_of_organization(opportunity_quotes.organization_id)
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = opportunity_quotes.opportunity_id
      and o.organization_id = opportunity_quotes.organization_id
  )
);

drop policy if exists "Members can update opportunity quotes" on public.opportunity_quotes;
create policy "Members can update opportunity quotes"
on public.opportunity_quotes
for update
to authenticated
using (public.is_member_of_organization(opportunity_quotes.organization_id))
with check (
  public.is_member_of_organization(opportunity_quotes.organization_id)
  and exists (
    select 1
    from public.organization_opportunities o
    where o.id = opportunity_quotes.opportunity_id
      and o.organization_id = opportunity_quotes.organization_id
  )
);

drop policy if exists "Members can create opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Members can create opportunity quote line items"
on public.opportunity_quote_line_items
for insert
to authenticated
with check (
  public.is_member_of_organization(opportunity_quote_line_items.organization_id)
  and exists (
    select 1
    from public.opportunity_quotes q
    where q.id = opportunity_quote_line_items.quote_id
      and q.organization_id = opportunity_quote_line_items.organization_id
  )
);

drop policy if exists "Members can update opportunity quote line items" on public.opportunity_quote_line_items;
create policy "Members can update opportunity quote line items"
on public.opportunity_quote_line_items
for update
to authenticated
using (public.is_member_of_organization(opportunity_quote_line_items.organization_id))
with check (
  public.is_member_of_organization(opportunity_quote_line_items.organization_id)
  and exists (
    select 1
    from public.opportunity_quotes q
    where q.id = opportunity_quote_line_items.quote_id
      and q.organization_id = opportunity_quote_line_items.organization_id
  )
);

drop policy if exists "Members can create project variations" on public.project_variations;
create policy "Members can create project variations"
on public.project_variations
for insert
with check (
  project_variations.created_by = auth.uid()
  and public.is_member_of_organization(project_variations.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_variations.project_id
      and p.organization_id = project_variations.organization_id
  )
);

drop policy if exists "Members can update project variations" on public.project_variations;
create policy "Members can update project variations"
on public.project_variations
for update
using (public.is_member_of_organization(project_variations.organization_id))
with check (
  public.is_member_of_organization(project_variations.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_variations.project_id
      and p.organization_id = project_variations.organization_id
  )
);

drop policy if exists "Members can create variation line items" on public.project_variation_line_items;
create policy "Members can create variation line items"
on public.project_variation_line_items
for insert
with check (
  public.is_member_of_organization(project_variation_line_items.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_line_items.variation_id
      and v.project_id = project_variation_line_items.project_id
      and v.organization_id = project_variation_line_items.organization_id
  )
);

drop policy if exists "Members can update variation line items" on public.project_variation_line_items;
create policy "Members can update variation line items"
on public.project_variation_line_items
for update
using (public.is_member_of_organization(project_variation_line_items.organization_id))
with check (
  public.is_member_of_organization(project_variation_line_items.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_line_items.variation_id
      and v.project_id = project_variation_line_items.project_id
      and v.organization_id = project_variation_line_items.organization_id
  )
);

drop policy if exists "Members can create variation attachments" on public.project_variation_attachments;
create policy "Members can create variation attachments"
on public.project_variation_attachments
for insert
with check (
  public.is_member_of_organization(project_variation_attachments.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_attachments.variation_id
      and v.project_id = project_variation_attachments.project_id
      and v.organization_id = project_variation_attachments.organization_id
  )
);

drop policy if exists "Members can update variation attachments" on public.project_variation_attachments;
create policy "Members can update variation attachments"
on public.project_variation_attachments
for update
using (public.is_member_of_organization(project_variation_attachments.organization_id))
with check (
  public.is_member_of_organization(project_variation_attachments.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_attachments.variation_id
      and v.project_id = project_variation_attachments.project_id
      and v.organization_id = project_variation_attachments.organization_id
  )
);

drop policy if exists "Members can create variation status events" on public.project_variation_status_events;
create policy "Members can create variation status events"
on public.project_variation_status_events
for insert
with check (
  public.is_member_of_organization(project_variation_status_events.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_status_events.variation_id
      and v.project_id = project_variation_status_events.project_id
      and v.organization_id = project_variation_status_events.organization_id
  )
);

drop policy if exists "Members can create variation invoice items" on public.project_variation_invoice_items;
create policy "Members can create variation invoice items"
on public.project_variation_invoice_items
for insert
with check (
  public.is_member_of_organization(project_variation_invoice_items.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_invoice_items.variation_id
      and v.project_id = project_variation_invoice_items.project_id
      and v.organization_id = project_variation_invoice_items.organization_id
  )
);

drop policy if exists "Members can update variation invoice items" on public.project_variation_invoice_items;
create policy "Members can update variation invoice items"
on public.project_variation_invoice_items
for update
using (public.is_member_of_organization(project_variation_invoice_items.organization_id))
with check (
  public.is_member_of_organization(project_variation_invoice_items.organization_id)
  and exists (
    select 1
    from public.project_variations v
    where v.id = project_variation_invoice_items.variation_id
      and v.project_id = project_variation_invoice_items.project_id
      and v.organization_id = project_variation_invoice_items.organization_id
  )
);

drop policy if exists "Members can create purchase orders" on public.project_purchase_orders;
create policy "Members can create purchase orders"
on public.project_purchase_orders
for insert
with check (
  project_purchase_orders.created_by = auth.uid()
  and public.is_member_of_organization(project_purchase_orders.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_purchase_orders.project_id
      and p.organization_id = project_purchase_orders.organization_id
  )
);

drop policy if exists "Members can update purchase orders" on public.project_purchase_orders;
create policy "Members can update purchase orders"
on public.project_purchase_orders
for update
using (public.is_member_of_organization(project_purchase_orders.organization_id))
with check (
  public.is_member_of_organization(project_purchase_orders.organization_id)
  and exists (
    select 1
    from public.organization_projects p
    where p.id = project_purchase_orders.project_id
      and p.organization_id = project_purchase_orders.organization_id
  )
);

drop policy if exists "Members can create purchase order line items" on public.project_purchase_order_line_items;
create policy "Members can create purchase order line items"
on public.project_purchase_order_line_items
for insert
with check (
  public.is_member_of_organization(project_purchase_order_line_items.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_line_items.purchase_order_id
      and po.project_id = project_purchase_order_line_items.project_id
      and po.organization_id = project_purchase_order_line_items.organization_id
  )
);

drop policy if exists "Members can update purchase order line items" on public.project_purchase_order_line_items;
create policy "Members can update purchase order line items"
on public.project_purchase_order_line_items
for update
using (public.is_member_of_organization(project_purchase_order_line_items.organization_id))
with check (
  public.is_member_of_organization(project_purchase_order_line_items.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_line_items.purchase_order_id
      and po.project_id = project_purchase_order_line_items.project_id
      and po.organization_id = project_purchase_order_line_items.organization_id
  )
);

drop policy if exists "Members can create purchase order attachments" on public.project_purchase_order_attachments;
create policy "Members can create purchase order attachments"
on public.project_purchase_order_attachments
for insert
with check (
  public.is_member_of_organization(project_purchase_order_attachments.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_attachments.purchase_order_id
      and po.project_id = project_purchase_order_attachments.project_id
      and po.organization_id = project_purchase_order_attachments.organization_id
  )
);

drop policy if exists "Members can update purchase order attachments" on public.project_purchase_order_attachments;
create policy "Members can update purchase order attachments"
on public.project_purchase_order_attachments
for update
using (public.is_member_of_organization(project_purchase_order_attachments.organization_id))
with check (
  public.is_member_of_organization(project_purchase_order_attachments.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_attachments.purchase_order_id
      and po.project_id = project_purchase_order_attachments.project_id
      and po.organization_id = project_purchase_order_attachments.organization_id
  )
);

drop policy if exists "Members can create purchase order status events" on public.project_purchase_order_status_events;
create policy "Members can create purchase order status events"
on public.project_purchase_order_status_events
for insert
with check (
  public.is_member_of_organization(project_purchase_order_status_events.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_status_events.purchase_order_id
      and po.project_id = project_purchase_order_status_events.project_id
      and po.organization_id = project_purchase_order_status_events.organization_id
  )
);

drop policy if exists "Members can create purchase order invoice items" on public.project_purchase_order_invoice_items;
create policy "Members can create purchase order invoice items"
on public.project_purchase_order_invoice_items
for insert
with check (
  public.is_member_of_organization(project_purchase_order_invoice_items.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_invoice_items.purchase_order_id
      and po.project_id = project_purchase_order_invoice_items.project_id
      and po.organization_id = project_purchase_order_invoice_items.organization_id
  )
);

drop policy if exists "Members can update purchase order invoice items" on public.project_purchase_order_invoice_items;
create policy "Members can update purchase order invoice items"
on public.project_purchase_order_invoice_items
for update
using (public.is_member_of_organization(project_purchase_order_invoice_items.organization_id))
with check (
  public.is_member_of_organization(project_purchase_order_invoice_items.organization_id)
  and exists (
    select 1
    from public.project_purchase_orders po
    where po.id = project_purchase_order_invoice_items.purchase_order_id
      and po.project_id = project_purchase_order_invoice_items.project_id
      and po.organization_id = project_purchase_order_invoice_items.organization_id
  )
);
