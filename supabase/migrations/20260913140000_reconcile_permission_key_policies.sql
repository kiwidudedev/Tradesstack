-- Approved permission-key contract. Dropping policies does not delete table data.

begin;

drop policy if exists "Admins can delete organization client locations" on public.organization_client_locations;

drop policy if exists "Members can create organization client locations" on public.organization_client_locations;

drop policy if exists "Members can update organization client locations" on public.organization_client_locations;

drop policy if exists "Members can view organization client locations" on public.organization_client_locations;

drop policy if exists "Admins can delete organization clients" on public.organization_clients;

drop policy if exists "Members can create organization clients" on public.organization_clients;

drop policy if exists "Members can update organization clients" on public.organization_clients;

drop policy if exists "Admins can delete organization opportunities" on public.organization_opportunities;

drop policy if exists "Members can create organization opportunities" on public.organization_opportunities;

drop policy if exists "Members can update organization opportunities" on public.organization_opportunities;

drop policy if exists "Members can update organization" on public.organizations;

drop policy if exists "Admins can delete purchase order attachments" on public.project_purchase_order_attachments;

drop policy if exists "Members can create purchase order attachments" on public.project_purchase_order_attachments;

drop policy if exists "Members can update purchase order attachments" on public.project_purchase_order_attachments;

drop policy if exists "Admins can delete purchase order invoice items" on public.project_purchase_order_invoice_items;

drop policy if exists "Members can create purchase order invoice items" on public.project_purchase_order_invoice_items;

drop policy if exists "Members can update purchase order invoice items" on public.project_purchase_order_invoice_items;

drop policy if exists "Admins can delete purchase order line items" on public.project_purchase_order_line_items;

drop policy if exists "Members can create purchase order line items" on public.project_purchase_order_line_items;

drop policy if exists "Members can update purchase order line items" on public.project_purchase_order_line_items;

drop policy if exists "Admins can delete purchase order status events" on public.project_purchase_order_status_events;

drop policy if exists "Members can create purchase order status events" on public.project_purchase_order_status_events;

drop policy if exists "Admins can delete purchase orders" on public.project_purchase_orders;

drop policy if exists "Members can create purchase orders" on public.project_purchase_orders;

drop policy if exists "Members can update purchase orders" on public.project_purchase_orders;

drop policy if exists "Admins can delete quote line items" on public.project_quote_line_items;

drop policy if exists "Members can create quote line items" on public.project_quote_line_items;

drop policy if exists "Members can update quote line items" on public.project_quote_line_items;

drop policy if exists "Admins can delete project quotes" on public.project_quotes;

drop policy if exists "Members can create project quotes" on public.project_quotes;

drop policy if exists "Members can update project quotes" on public.project_quotes;

drop policy if exists "Admins can delete variation attachments" on public.project_variation_attachments;

drop policy if exists "Members can create variation attachments" on public.project_variation_attachments;

drop policy if exists "Members can update variation attachments" on public.project_variation_attachments;

drop policy if exists "Admins can delete variation invoice items" on public.project_variation_invoice_items;

drop policy if exists "Members can create variation invoice items" on public.project_variation_invoice_items;

drop policy if exists "Members can update variation invoice items" on public.project_variation_invoice_items;

drop policy if exists "Admins can delete variation line items" on public.project_variation_line_items;

drop policy if exists "Members can create variation line items" on public.project_variation_line_items;

drop policy if exists "Members can update variation line items" on public.project_variation_line_items;

drop policy if exists "Admins can delete variation status events" on public.project_variation_status_events;

drop policy if exists "Members can create variation status events" on public.project_variation_status_events;

drop policy if exists "Admins can delete project variations" on public.project_variations;

drop policy if exists "Members can create project variations" on public.project_variations;

drop policy if exists "Members can update project variations" on public.project_variations;

drop policy if exists "Workers can view own project assignments" on public.worker_project_assignments;

CREATE POLICY "Workers can view own project assignments" ON "public"."worker_project_assignments" FOR SELECT USING (("public"."is_member_of_organization"("organization_id") AND ("worker_user_id" = "auth"."uid"())));

drop policy if exists "Workers can view own purchase order assignments" on public.worker_purchase_order_assignments;

CREATE POLICY "Workers can view own purchase order assignments" ON "public"."worker_purchase_order_assignments" FOR SELECT USING (("public"."is_member_of_organization"("organization_id") AND ("worker_user_id" = "auth"."uid"())));

create policy "Members can view client locations" on public.organization_client_locations for select to authenticated using (public.is_member_of_organization(organization_id));

create policy "Permission holders can create client locations" on public.organization_client_locations for insert to authenticated with check (public.has_org_permission(organization_id, 'leads.clients.write') and exists (select 1 from public.organization_clients client where client.id=organization_client_locations.client_id and client.organization_id=organization_client_locations.organization_id));

create policy "Permission holders can update client locations" on public.organization_client_locations for update to authenticated using (public.has_org_permission(organization_id, 'leads.clients.write')) with check (public.has_org_permission(organization_id, 'leads.clients.write') and exists (select 1 from public.organization_clients client where client.id=organization_client_locations.client_id and client.organization_id=organization_client_locations.organization_id));

create policy "Permission holders can delete client locations" on public.organization_client_locations for delete to authenticated using (public.has_org_permission(organization_id, 'leads.clients.write'));

commit;
