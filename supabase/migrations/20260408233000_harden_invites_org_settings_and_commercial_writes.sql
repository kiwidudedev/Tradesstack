begin;

-- Security hardening:
-- 1) restore explicit invite-token signup joins
-- 2) lock organization settings + logo writes to privileged members
-- 3) narrow commercial/CRM write access without changing read access

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_name text;
  member_name text;
  new_org_id uuid;
  invite_row public.organization_invites%rowtype;
  supplied_invite_token uuid;
begin
  org_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), '');
  member_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  begin
    supplied_invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '')::uuid;
  exception
    when invalid_text_representation then
      supplied_invite_token := null;
  end;

  -- Invited-user join path: only honor a matching, non-expired token.
  if supplied_invite_token is not null then
    select i.*
    into invite_row
    from public.organization_invites i
    where i.token = supplied_invite_token
      and lower(i.invited_email) = lower(new.email)
      and i.status = 'pending'
      and i.expires_at > now()
    limit 1;

    if not found then
      raise exception 'Invite token is invalid, expired, or does not match this email address.';
    end if;

    if member_name is null then
      member_name := nullif(trim(coalesce(invite_row.invited_name, '')), '');
    end if;

    if member_name is null then
      member_name := split_part(new.email, '@', 1);
    end if;

    insert into public.organization_members (organization_id, user_id, role, display_name)
    values (invite_row.organization_id, new.id, invite_row.role, member_name)
    on conflict (organization_id, user_id) do update
    set
      role = excluded.role,
      display_name = excluded.display_name,
      updated_at = now();

    update public.organization_invites
    set status = 'accepted', accepted_at = now(), updated_at = now()
    where id = invite_row.id;

    return new;
  end if;

  -- Normal self-signup path: create a fresh organization and owner membership.
  if member_name is null then
    member_name := split_part(new.email, '@', 1);
  end if;

  if org_name is null then
    org_name := split_part(new.email, '@', 1) || ' Organization';
  end if;

  insert into public.organizations (name, created_by)
  values (org_name, new.id)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, display_name)
  values (new_org_id, new.id, 'owner', member_name)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;

comment on function public.handle_new_user() is
'Signup hardening: invited users only join an organization when signup carries a matching invite_token. Non-invited users still create a fresh owner workspace.';

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

  return coalesce(role_default, false);
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

drop policy if exists "Members can update organization" on public.organizations;
create policy "Privileged members can update organization"
on public.organizations
for update
to authenticated
using (
  public.has_org_permission(organizations.id, 'settings.organization.update')
)
with check (
  public.has_org_permission(organizations.id, 'settings.organization.update')
);

update storage.buckets
set
  public = true,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[]
where id = 'organization-logos';

drop policy if exists "Members can upload organization logo storage objects" on storage.objects;
drop policy if exists "Admins can upload organization logo storage objects" on storage.objects;
create policy "Privileged members can upload organization logo storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

drop policy if exists "Members can update organization logo storage objects" on storage.objects;
drop policy if exists "Admins can update organization logo storage objects" on storage.objects;
create policy "Privileged members can update organization logo storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
)
with check (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

drop policy if exists "Members can delete organization logo storage objects" on storage.objects;
drop policy if exists "Admins can delete organization logo storage objects" on storage.objects;
create policy "Privileged members can delete organization logo storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-logos'
  and array_length(string_to_array(name, '/'), 1) >= 2
  and exists (
    select 1
    from public.organizations o
    where o.id::text = split_part(name, '/', 1)
      and public.has_org_permission(o.id, 'settings.organization.update')
  )
);

drop function if exists public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
);

create or replace function public.update_organization_settings(
  p_organization_id uuid,
  p_name text default null,
  p_logo_path text default null,
  p_brand_primary_color text default null,
  p_brand_accent_color text default null,
  p_business_number text default null,
  p_bank_account_details text default null,
  p_gst_number text default null,
  p_address_line_1 text default null,
  p_address_line_2 text default null,
  p_city text default null,
  p_postcode text default null,
  p_country text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_default_currency text default null,
  p_timezone text default null,
  p_default_tax_mode text default null,
  p_default_tax_rate numeric default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.organizations;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_org_permission(p_organization_id, 'settings.organization.update') then
    raise exception 'Not authorized for this organization';
  end if;

  normalized_name := nullif(trim(coalesce(p_name, '')), '');

  if p_logo_path is not null and p_logo_path <> '' and p_logo_path not like p_organization_id::text || '/%' then
    raise exception 'Logo path must be scoped to organization';
  end if;

  update public.organizations o
  set
    name = coalesce(normalized_name, o.name),
    logo_path = coalesce(p_logo_path, o.logo_path),
    brand_primary_color = coalesce(p_brand_primary_color, o.brand_primary_color),
    brand_accent_color = coalesce(p_brand_accent_color, o.brand_accent_color),
    business_number = coalesce(p_business_number, o.business_number),
    bank_account_details = coalesce(p_bank_account_details, o.bank_account_details),
    gst_number = coalesce(p_gst_number, o.gst_number),
    address_line_1 = coalesce(p_address_line_1, o.address_line_1),
    address_line_2 = coalesce(p_address_line_2, o.address_line_2),
    city = coalesce(p_city, o.city),
    postcode = coalesce(p_postcode, o.postcode),
    country = coalesce(p_country, o.country),
    contact_name = coalesce(p_contact_name, o.contact_name),
    contact_email = coalesce(p_contact_email, o.contact_email),
    contact_phone = coalesce(p_contact_phone, o.contact_phone),
    default_currency = coalesce(p_default_currency, o.default_currency),
    timezone = coalesce(p_timezone, o.timezone),
    default_tax_mode = coalesce(p_default_tax_mode, o.default_tax_mode),
    default_tax_rate = coalesce(p_default_tax_rate, o.default_tax_rate),
    updated_at = now()
  where o.id = p_organization_id
  returning o.* into updated_row;

  if updated_row.id is null then
    raise exception 'Organization not found';
  end if;

  return updated_row;
end;
$$;

grant execute on function public.update_organization_settings(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
) to authenticated;

drop policy if exists "Members can create organization clients" on public.organization_clients;
create policy "Privileged members can create organization clients"
on public.organization_clients
for insert
to authenticated
with check (
  organization_clients.created_by = auth.uid()
  and public.has_org_permission(organization_clients.organization_id, 'leads.clients.write')
);

drop policy if exists "Members can update organization clients" on public.organization_clients;
create policy "Privileged members can update organization clients"
on public.organization_clients
for update
to authenticated
using (
  public.has_org_permission(organization_clients.organization_id, 'leads.clients.write')
)
with check (
  public.has_org_permission(organization_clients.organization_id, 'leads.clients.write')
);

drop policy if exists "Admins can delete organization clients" on public.organization_clients;
create policy "Privileged members can delete organization clients"
on public.organization_clients
for delete
to authenticated
using (
  public.has_org_permission(organization_clients.organization_id, 'leads.clients.write')
);

drop policy if exists "Members can create organization opportunities" on public.organization_opportunities;
create policy "Privileged members can create organization opportunities"
on public.organization_opportunities
for insert
to authenticated
with check (
  organization_opportunities.created_by = auth.uid()
  and public.has_org_permission(organization_opportunities.organization_id, 'leads.opportunities.write')
);

drop policy if exists "Members can update organization opportunities" on public.organization_opportunities;
create policy "Privileged members can update organization opportunities"
on public.organization_opportunities
for update
to authenticated
using (
  public.has_org_permission(organization_opportunities.organization_id, 'leads.opportunities.write')
)
with check (
  public.has_org_permission(organization_opportunities.organization_id, 'leads.opportunities.write')
);

drop policy if exists "Admins can delete organization opportunities" on public.organization_opportunities;
create policy "Privileged members can delete organization opportunities"
on public.organization_opportunities
for delete
to authenticated
using (
  public.has_org_permission(organization_opportunities.organization_id, 'leads.opportunities.write')
);

drop policy if exists "Members can create project quotes" on public.project_quotes;
create policy "Privileged members can create project quotes"
on public.project_quotes
for insert
to authenticated
with check (
  project_quotes.created_by = auth.uid()
  and public.has_org_permission(project_quotes.organization_id, 'quotes.write')
);

drop policy if exists "Members can update project quotes" on public.project_quotes;
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
create policy "Privileged members can delete project quotes"
on public.project_quotes
for delete
to authenticated
using (
  public.has_org_permission(project_quotes.organization_id, 'quotes.write')
);

drop policy if exists "Members can create quote line items" on public.project_quote_line_items;
create policy "Privileged members can create quote line items"
on public.project_quote_line_items
for insert
to authenticated
with check (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
);

drop policy if exists "Members can update quote line items" on public.project_quote_line_items;
create policy "Privileged members can update quote line items"
on public.project_quote_line_items
for update
to authenticated
using (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
)
with check (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
);

drop policy if exists "Admins can delete quote line items" on public.project_quote_line_items;
create policy "Privileged members can delete quote line items"
on public.project_quote_line_items
for delete
to authenticated
using (
  public.has_org_permission(project_quote_line_items.organization_id, 'quotes.write')
);

drop policy if exists "Members can create project variations" on public.project_variations;
create policy "Privileged members can create project variations"
on public.project_variations
for insert
to authenticated
with check (
  project_variations.created_by = auth.uid()
  and public.has_org_permission(project_variations.organization_id, 'variations.write')
);

drop policy if exists "Members can update project variations" on public.project_variations;
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
create policy "Privileged members can delete project variations"
on public.project_variations
for delete
to authenticated
using (
  public.has_org_permission(project_variations.organization_id, 'variations.write')
);

drop policy if exists "Members can create variation line items" on public.project_variation_line_items;
create policy "Privileged members can create variation line items"
on public.project_variation_line_items
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
);

drop policy if exists "Members can update variation line items" on public.project_variation_line_items;
create policy "Privileged members can update variation line items"
on public.project_variation_line_items
for update
to authenticated
using (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
);

drop policy if exists "Admins can delete variation line items" on public.project_variation_line_items;
create policy "Privileged members can delete variation line items"
on public.project_variation_line_items
for delete
to authenticated
using (
  public.has_org_permission(project_variation_line_items.organization_id, 'variations.write')
);

drop policy if exists "Members can create variation attachments" on public.project_variation_attachments;
create policy "Privileged members can create variation attachments"
on public.project_variation_attachments
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
);

drop policy if exists "Members can update variation attachments" on public.project_variation_attachments;
create policy "Privileged members can update variation attachments"
on public.project_variation_attachments
for update
to authenticated
using (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
);

drop policy if exists "Admins can delete variation attachments" on public.project_variation_attachments;
create policy "Privileged members can delete variation attachments"
on public.project_variation_attachments
for delete
to authenticated
using (
  public.has_org_permission(project_variation_attachments.organization_id, 'variations.write')
);

drop policy if exists "Members can create variation status events" on public.project_variation_status_events;
create policy "Privileged members can create variation status events"
on public.project_variation_status_events
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_status_events.organization_id, 'variations.write')
);

drop policy if exists "Admins can delete variation status events" on public.project_variation_status_events;
create policy "Privileged members can delete variation status events"
on public.project_variation_status_events
for delete
to authenticated
using (
  public.has_org_permission(project_variation_status_events.organization_id, 'variations.write')
);

drop policy if exists "Members can create variation invoice items" on public.project_variation_invoice_items;
create policy "Privileged members can create variation invoice items"
on public.project_variation_invoice_items
for insert
to authenticated
with check (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
);

drop policy if exists "Members can update variation invoice items" on public.project_variation_invoice_items;
create policy "Privileged members can update variation invoice items"
on public.project_variation_invoice_items
for update
to authenticated
using (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
)
with check (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
);

drop policy if exists "Admins can delete variation invoice items" on public.project_variation_invoice_items;
create policy "Privileged members can delete variation invoice items"
on public.project_variation_invoice_items
for delete
to authenticated
using (
  public.has_org_permission(project_variation_invoice_items.organization_id, 'variations.write')
);

drop policy if exists "Members can create purchase orders" on public.project_purchase_orders;
create policy "Privileged members can create purchase orders"
on public.project_purchase_orders
for insert
to authenticated
with check (
  project_purchase_orders.created_by = auth.uid()
  and public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can update purchase orders" on public.project_purchase_orders;
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
create policy "Privileged members can delete purchase orders"
on public.project_purchase_orders
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_orders.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can create purchase order line items" on public.project_purchase_order_line_items;
create policy "Privileged members can create purchase order line items"
on public.project_purchase_order_line_items
for insert
to authenticated
with check (
  public.has_org_permission(project_purchase_order_line_items.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can update purchase order line items" on public.project_purchase_order_line_items;
create policy "Privileged members can update purchase order line items"
on public.project_purchase_order_line_items
for update
to authenticated
using (
  public.has_org_permission(project_purchase_order_line_items.organization_id, 'purchase_orders.write')
)
with check (
  public.has_org_permission(project_purchase_order_line_items.organization_id, 'purchase_orders.write')
);

drop policy if exists "Admins can delete purchase order line items" on public.project_purchase_order_line_items;
create policy "Privileged members can delete purchase order line items"
on public.project_purchase_order_line_items
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_order_line_items.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can create purchase order attachments" on public.project_purchase_order_attachments;
create policy "Privileged members can create purchase order attachments"
on public.project_purchase_order_attachments
for insert
to authenticated
with check (
  public.has_org_permission(project_purchase_order_attachments.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can update purchase order attachments" on public.project_purchase_order_attachments;
create policy "Privileged members can update purchase order attachments"
on public.project_purchase_order_attachments
for update
to authenticated
using (
  public.has_org_permission(project_purchase_order_attachments.organization_id, 'purchase_orders.write')
)
with check (
  public.has_org_permission(project_purchase_order_attachments.organization_id, 'purchase_orders.write')
);

drop policy if exists "Admins can delete purchase order attachments" on public.project_purchase_order_attachments;
create policy "Privileged members can delete purchase order attachments"
on public.project_purchase_order_attachments
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_order_attachments.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can create purchase order status events" on public.project_purchase_order_status_events;
create policy "Privileged members can create purchase order status events"
on public.project_purchase_order_status_events
for insert
to authenticated
with check (
  public.has_org_permission(project_purchase_order_status_events.organization_id, 'purchase_orders.write')
);

drop policy if exists "Admins can delete purchase order status events" on public.project_purchase_order_status_events;
create policy "Privileged members can delete purchase order status events"
on public.project_purchase_order_status_events
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_order_status_events.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can create purchase order invoice items" on public.project_purchase_order_invoice_items;
create policy "Privileged members can create purchase order invoice items"
on public.project_purchase_order_invoice_items
for insert
to authenticated
with check (
  public.has_org_permission(project_purchase_order_invoice_items.organization_id, 'purchase_orders.write')
);

drop policy if exists "Members can update purchase order invoice items" on public.project_purchase_order_invoice_items;
create policy "Privileged members can update purchase order invoice items"
on public.project_purchase_order_invoice_items
for update
to authenticated
using (
  public.has_org_permission(project_purchase_order_invoice_items.organization_id, 'purchase_orders.write')
)
with check (
  public.has_org_permission(project_purchase_order_invoice_items.organization_id, 'purchase_orders.write')
);

drop policy if exists "Admins can delete purchase order invoice items" on public.project_purchase_order_invoice_items;
create policy "Privileged members can delete purchase order invoice items"
on public.project_purchase_order_invoice_items
for delete
to authenticated
using (
  public.has_org_permission(project_purchase_order_invoice_items.organization_id, 'purchase_orders.write')
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

create or replace function public.save_project_purchase_order_draft(
  p_organization_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_expected_updated_at timestamptz,
  p_purchase_order_title text,
  p_purchase_order_number text,
  p_status text,
  p_origin text,
  p_supplier_id uuid,
  p_issued_to_label text,
  p_supplier_contact text,
  p_supplier_name_snapshot text,
  p_supplier_email_snapshot text,
  p_supplier_phone_snapshot text,
  p_requested_by text,
  p_requested_date date,
  p_due_date date,
  p_sent_to_client_at timestamptz,
  p_approved_at timestamptz,
  p_invoice_ready boolean,
  p_notes text,
  p_margin_percent numeric,
  p_discount_amount numeric,
  p_contingency_amount numeric,
  p_gst_percent numeric,
  p_include_margin_in_export boolean,
  p_include_discount_in_export boolean,
  p_include_contingency_in_export boolean,
  p_line_items jsonb,
  p_attachments jsonb
)
returns table (
  updated_at timestamptz,
  subtotal numeric,
  gst_total numeric,
  total_purchase_order_price numeric,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_row public.project_purchase_orders%rowtype;
  updated_row public.project_purchase_orders%rowtype;
  computed_subtotal numeric := 0;
  computed_margin numeric := 0;
  computed_discount numeric := 0;
  computed_contingency numeric := 0;
  pre_gst_total numeric := 0;
  computed_gst_total numeric := 0;
  computed_grand_total numeric := 0;
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

  if p_supplier_id is not null and not exists (
    select 1
    from public.organization_suppliers s
    where s.id = p_supplier_id
      and s.organization_id = p_organization_id
  ) then
    raise exception 'Supplier does not belong to this organization';
  end if;

  select *
  into existing_row
  from public.project_purchase_orders po
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  if p_expected_updated_at is not null and existing_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'This purchase order was updated by another user. Refresh and try again.'
      using errcode = '40001';
  end if;

  select coalesce(sum(round(coalesce((line.item->>'quantity')::numeric, 0) * coalesce((line.item->>'rate')::numeric, 0), 2)), 0)
  into computed_subtotal
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) as line(item);

  computed_margin := computed_subtotal * (coalesce(p_margin_percent, 0) / 100);
  computed_discount := coalesce(p_discount_amount, 0);
  computed_contingency := coalesce(p_contingency_amount, 0);
  pre_gst_total := greatest(0, computed_subtotal + computed_margin + computed_contingency - computed_discount);
  computed_gst_total := pre_gst_total * (coalesce(p_gst_percent, 0) / 100);
  computed_grand_total := pre_gst_total + computed_gst_total;

  update public.project_purchase_orders po
  set
    purchase_order_title = coalesce(nullif(btrim(p_purchase_order_title), ''), po.purchase_order_number),
    purchase_order_number = coalesce(nullif(btrim(p_purchase_order_number), ''), po.purchase_order_number),
    status = p_status,
    origin = p_origin,
    supplier_id = p_supplier_id,
    issued_to_label = coalesce(p_issued_to_label, ''),
    supplier_contact = coalesce(p_supplier_contact, ''),
    supplier_name_snapshot = coalesce(p_supplier_name_snapshot, ''),
    supplier_email_snapshot = coalesce(p_supplier_email_snapshot, ''),
    supplier_phone_snapshot = coalesce(p_supplier_phone_snapshot, ''),
    requested_by = coalesce(p_requested_by, ''),
    requested_date = p_requested_date,
    due_date = p_due_date,
    sent_to_client_at = p_sent_to_client_at,
    approved_at = p_approved_at,
    invoice_ready = coalesce(p_invoice_ready, false),
    notes = coalesce(p_notes, ''),
    subtotal = round(computed_subtotal, 2),
    margin_percent = round(coalesce(p_margin_percent, 0), 3),
    discount_amount = round(coalesce(p_discount_amount, 0), 2),
    contingency_amount = round(coalesce(p_contingency_amount, 0), 2),
    gst_percent = round(coalesce(p_gst_percent, 0), 3),
    include_margin_in_export = coalesce(p_include_margin_in_export, true),
    include_discount_in_export = coalesce(p_include_discount_in_export, false),
    include_contingency_in_export = coalesce(p_include_contingency_in_export, false),
    gst_total = round(computed_gst_total, 2),
    total_purchase_order_price = round(computed_grand_total, 2)
  where po.id = p_purchase_order_id
    and po.organization_id = p_organization_id
    and po.project_id = p_project_id
  returning * into updated_row;

  delete from public.project_purchase_order_line_items li
  where li.organization_id = p_organization_id
    and li.project_id = p_project_id
    and li.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_line_items (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    section,
    description,
    quantity,
    unit,
    rate,
    total,
    sort_order,
    source_time_sheet_entry_id
  )
  select
    case
      when nullif(line.item->>'id', '') is null then gen_random_uuid()
      else (line.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    case
      when line.item->>'section' in ('Labour', 'Materials', 'Subcontractors', 'Plant', 'Margin') then line.item->>'section'
      else 'Labour'
    end,
    coalesce(line.item->>'description', ''),
    coalesce((line.item->>'quantity')::numeric, 0),
    coalesce(line.item->>'unit', ''),
    coalesce((line.item->>'rate')::numeric, 0),
    round(coalesce((line.item->>'quantity')::numeric, 0) * coalesce((line.item->>'rate')::numeric, 0), 2),
    (line.ordinality - 1)::integer,
    case
      when nullif(line.item->>'source_time_sheet_entry_id', '') is null then null
      else (line.item->>'source_time_sheet_entry_id')::uuid
    end
  from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb)) with ordinality as line(item, ordinality);

  delete from public.project_purchase_order_attachments a
  where a.organization_id = p_organization_id
    and a.project_id = p_project_id
    and a.purchase_order_id = p_purchase_order_id;

  insert into public.project_purchase_order_attachments (
    id,
    organization_id,
    project_id,
    purchase_order_id,
    file_kind,
    file_name,
    external_url,
    uploaded_by
  )
  select
    case
      when nullif(att.item->>'id', '') is null then gen_random_uuid()
      else (att.item->>'id')::uuid
    end,
    p_organization_id,
    p_project_id,
    p_purchase_order_id,
    case
      when att.item->>'type' in ('Drawing', 'Email', 'Site Instruction', 'Other') then att.item->>'type'
      else 'Other'
    end,
    coalesce(nullif(att.item->>'name', ''), 'Attachment'),
    coalesce(nullif(att.item->>'external_url', ''), 'manual://' || coalesce(nullif(att.item->>'name', ''), 'attachment')),
    auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) as att(item);

  if existing_row.status is distinct from updated_row.status then
    insert into public.project_purchase_order_status_events (
      organization_id,
      project_id,
      purchase_order_id,
      from_status,
      to_status,
      changed_by
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      existing_row.status,
      updated_row.status,
      auth.uid()
    );
  end if;

  if updated_row.invoice_ready then
    insert into public.project_purchase_order_invoice_items (
      organization_id,
      project_id,
      purchase_order_id,
      amount,
      status
    ) values (
      p_organization_id,
      p_project_id,
      p_purchase_order_id,
      round(computed_grand_total, 2),
      'Ready'
    )
    on conflict (purchase_order_id)
    do update set
      amount = excluded.amount,
      status = excluded.status,
      updated_at = now();
  else
    delete from public.project_purchase_order_invoice_items ii
    where ii.organization_id = p_organization_id
      and ii.project_id = p_project_id
      and ii.purchase_order_id = p_purchase_order_id;
  end if;

  return query
  select updated_row.updated_at, updated_row.subtotal, updated_row.gst_total, updated_row.total_purchase_order_price, updated_row.status;
end;
$$;

commit;
