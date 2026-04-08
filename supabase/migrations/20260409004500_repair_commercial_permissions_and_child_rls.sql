begin;

-- Repair migration:
-- reapply the commercial permission helper + policy set in a way that does
-- not depend on the earlier all-in-one migration having committed cleanly.

create or replace function public.has_org_permission(
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  current_member_id uuid;
  current_role text;
  override_value boolean;
  role_default boolean;
begin
  if auth.uid() is null or p_organization_id is null then
    return false;
  end if;

  select m.id, m.role
  into current_member_id, current_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if current_member_id is null then
    return false;
  end if;

  select o.is_allowed
  into override_value
  from public.member_permission_overrides o
  where o.organization_member_id = current_member_id
    and o.permission_key = p_permission_key
  limit 1;

  if found then
    return coalesce(override_value, false);
  end if;

  select rp.is_allowed
  into role_default
  from public.role_permissions rp
  where rp.role = current_role
    and rp.permission_key = p_permission_key
  limit 1;

  if found then
    return coalesce(role_default, false);
  end if;

  case p_permission_key
    when 'settings.organization.update' then
      return current_role in ('owner', 'admin');
    when 'leads.clients.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'leads.opportunities.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'quotes.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'variations.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    when 'purchase_orders.write' then
      return current_role in ('owner', 'admin', 'qs', 'project_manager');
    else
      return false;
  end case;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;

insert into public.app_permissions (permission_key, description)
values
  ('leads.clients.write', 'Create, update, and delete clients'),
  ('leads.opportunities.write', 'Create, update, and delete opportunities'),
  ('quotes.write', 'Create, update, and delete project quotes'),
  ('variations.write', 'Create, update, and delete project variations'),
  ('purchase_orders.write', 'Create, update, and delete purchase orders')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'leads.clients.write', true),
  ('owner', 'leads.opportunities.write', true),
  ('owner', 'quotes.write', true),
  ('owner', 'variations.write', true),
  ('owner', 'purchase_orders.write', true),
  ('admin', 'leads.clients.write', true),
  ('admin', 'leads.opportunities.write', true),
  ('admin', 'quotes.write', true),
  ('admin', 'variations.write', true),
  ('admin', 'purchase_orders.write', true),
  ('qs', 'leads.clients.write', true),
  ('qs', 'leads.opportunities.write', true),
  ('qs', 'quotes.write', true),
  ('qs', 'variations.write', true),
  ('qs', 'purchase_orders.write', true),
  ('project_manager', 'leads.clients.write', true),
  ('project_manager', 'leads.opportunities.write', true),
  ('project_manager', 'quotes.write', true),
  ('project_manager', 'variations.write', true),
  ('project_manager', 'purchase_orders.write', true),
  ('worker', 'leads.clients.write', false),
  ('worker', 'leads.opportunities.write', false),
  ('worker', 'quotes.write', false),
  ('worker', 'variations.write', false),
  ('worker', 'purchase_orders.write', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

drop policy if exists "Members can create project quotes" on public.project_quotes;
drop policy if exists "Privileged members can create project quotes" on public.project_quotes;
create policy "Privileged members can create project quotes"
on public.project_quotes
for insert
to authenticated
with check (
  project_quotes.created_by = auth.uid()
  and public.has_org_permission(project_quotes.organization_id, 'quotes.write')
);

drop policy if exists "Members can update project quotes" on public.project_quotes;
drop policy if exists "Privileged members can update project quotes" on public.project_quotes;
create policy "Privileged members can update project quotes"
on public.project_quotes
for update
to authenticated
using (
  public.has_org_permission(project_quotes.organization_id, 'quotes.write')
)
with check (
  public.has_org_permission(project_quotes.organization_id, 'quotes.write')
);

drop policy if exists "Admins can delete project quotes" on public.project_quotes;
drop policy if exists "Privileged members can delete project quotes" on public.project_quotes;
create policy "Privileged members can delete project quotes"
on public.project_quotes
for delete
to authenticated
using (
  public.has_org_permission(project_quotes.organization_id, 'quotes.write')
);

drop policy if exists "Members can create quote line items" on public.project_quote_line_items;
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

drop policy if exists "Members can update quote line items" on public.project_quote_line_items;
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

drop policy if exists "Admins can delete quote line items" on public.project_quote_line_items;
drop policy if exists "Privileged members can delete quote line items" on public.project_quote_line_items;
create policy "Privileged members can delete quote line items"
on public.project_quote_line_items
for delete
to authenticated
using (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
);

drop policy if exists "Members can create project variations" on public.project_variations;
drop policy if exists "Privileged members can create project variations" on public.project_variations;
create policy "Privileged members can create project variations"
on public.project_variations
for insert
to authenticated
with check (
  project_variations.created_by = auth.uid()
  and public.has_org_permission(project_variations.organization_id, 'variations.write')
);

drop policy if exists "Members can update project variations" on public.project_variations;
drop policy if exists "Privileged members can update project variations" on public.project_variations;
create policy "Privileged members can update project variations"
on public.project_variations
for update
to authenticated
using (
  public.has_org_permission(project_variations.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variations.organization_id, 'variations.write')
);

drop policy if exists "Admins can delete project variations" on public.project_variations;
drop policy if exists "Privileged members can delete project variations" on public.project_variations;
create policy "Privileged members can delete project variations"
on public.project_variations
for delete
to authenticated
using (
  public.has_org_permission(project_variations.organization_id, 'variations.write')
);

drop policy if exists "Members can create variation line items" on public.project_variation_line_items;
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

drop policy if exists "Members can update variation line items" on public.project_variation_line_items;
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

drop policy if exists "Admins can delete variation line items" on public.project_variation_line_items;
drop policy if exists "Privileged members can delete variation line items" on public.project_variation_line_items;
create policy "Privileged members can delete variation line items"
on public.project_variation_line_items
for delete
to authenticated
using (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
);

drop policy if exists "Members can create purchase orders" on public.project_purchase_orders;
drop policy if exists "Privileged members can create purchase orders" on public.project_purchase_orders;
create policy "Privileged members can create purchase orders"
on public.project_purchase_orders
for insert
to authenticated
with check (
  project_purchase_orders.created_by = auth.uid()
  and public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can update purchase orders" on public.project_purchase_orders;
drop policy if exists "Privileged members can update purchase orders" on public.project_purchase_orders;
create policy "Privileged members can update purchase orders"
on public.project_purchase_orders
for update
to authenticated
using (
  public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
)
with check (
  public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
);

drop policy if exists "Admins can delete purchase orders" on public.project_purchase_orders;
drop policy if exists "Privileged members can delete purchase orders" on public.project_purchase_orders;
create policy "Privileged members can delete purchase orders"
on public.project_purchase_orders
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
);

create or replace function public.create_project_variation_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Variation'
)
returns table (
  id uuid,
  variation_number text,
  variation_title text,
  status text,
  origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_variations%rowtype;
  resolved_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'variations.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Variation');

  insert into public.project_variations (
    organization_id,
    project_id,
    created_by,
    variation_title,
    variation_number,
    status,
    origin,
    source_reference,
    requested_by
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    resolved_title,
    '',
    'Draft',
    'Unknown',
    '',
    ''
  )
  returning * into created_row;

  return query
  select created_row.id, created_row.variation_number, created_row.variation_title, created_row.status, created_row.origin;
end;
$$;

create or replace function public.create_project_purchase_order_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_title text default 'New Purchase Order',
  p_origin text default 'Material Supply'
)
returns table (
  id uuid,
  purchase_order_number text,
  purchase_order_title text,
  status text,
  origin text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.project_purchase_orders%rowtype;
  resolved_title text;
  resolved_origin text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_org_permission(p_organization_id, 'purchase_orders.write') then
    raise exception 'Not authorized for this organization';
  end if;

  if not exists (
    select 1
    from public.organization_projects p
    where p.id = p_project_id
      and p.organization_id = p_organization_id
  ) then
    raise exception 'Project not found for organization';
  end if;

  resolved_title := coalesce(nullif(btrim(p_title), ''), 'New Purchase Order');
  resolved_origin := case
    when p_origin in ('Material Supply', 'Subcontract Work', 'Plant / Equipment Hire', 'Site Expense', 'Freight / Delivery', 'Variation Order', 'General Purchase', 'Other')
      then p_origin
    else 'Material Supply'
  end;

  insert into public.project_purchase_orders (
    organization_id,
    project_id,
    created_by,
    purchase_order_title,
    purchase_order_number,
    status,
    origin,
    requested_by
  ) values (
    p_organization_id,
    p_project_id,
    auth.uid(),
    resolved_title,
    '',
    'Draft',
    resolved_origin,
    ''
  )
  returning * into created_row;

  return query
  select created_row.id, created_row.purchase_order_number, created_row.purchase_order_title, created_row.status, created_row.origin;
end;
$$;

commit;
