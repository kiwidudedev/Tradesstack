begin;

alter table public.organization_suppliers
  add column if not exists legal_name text null,
  add column if not exists website text null,
  add column if not exists default_tax_rate_id uuid null,
  add column if not exists default_payment_terms text not null default '',
  add column if not exists is_active boolean not null default true,
  add column if not exists source text not null default 'manual';

update public.organization_suppliers
set
  default_payment_terms = coalesce(default_payment_terms, ''),
  is_active = coalesce(is_active, true),
  source = coalesce(nullif(btrim(source), ''), 'manual')
where true;

alter table public.organization_suppliers
  alter column default_payment_terms set default '',
  alter column is_active set default true,
  alter column source set default 'manual';

alter table public.organization_suppliers
  drop constraint if exists organization_suppliers_source_check;

alter table public.organization_suppliers
  add constraint organization_suppliers_source_check check (
    source in ('manual', 'purchase_order_inline', 'csv', 'import', 'api')
  );

create index if not exists organization_suppliers_org_active_idx
  on public.organization_suppliers (organization_id, is_active, updated_at desc);

create index if not exists organization_suppliers_org_normalized_name_idx
  on public.organization_suppliers (
    organization_id,
    lower(
      regexp_replace(
        coalesce(nullif(btrim(company_name), ''), nullif(btrim(name), ''), ''),
        '\s+',
        ' ',
        'g'
      )
    )
  );

create index if not exists organization_suppliers_org_email_idx
  on public.organization_suppliers (organization_id, lower(email))
  where email is not null;

drop policy if exists "Members can create organization suppliers" on public.organization_suppliers;
drop policy if exists "Members can update organization suppliers" on public.organization_suppliers;
drop policy if exists "Admins can delete organization suppliers" on public.organization_suppliers;

create policy "Privileged members can create organization suppliers"
on public.organization_suppliers
for insert
to authenticated
with check (
  organization_suppliers.created_by = auth.uid()
  and public.has_org_permission(organization_suppliers.organization_id, 'suppliers.write')
);

create policy "Privileged members can update organization suppliers"
on public.organization_suppliers
for update
to authenticated
using (
  public.has_org_permission(organization_suppliers.organization_id, 'suppliers.write')
)
with check (
  public.has_org_permission(organization_suppliers.organization_id, 'suppliers.write')
);

create policy "Privileged members can delete organization suppliers"
on public.organization_suppliers
for delete
to authenticated
using (
  public.has_org_permission(organization_suppliers.organization_id, 'suppliers.write')
);

insert into public.app_permissions (permission_key, description)
values ('suppliers.write', 'Create, update, archive, and manage suppliers')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.role_permissions (role, permission_key, is_allowed)
values
  ('owner', 'suppliers.write', true),
  ('admin', 'suppliers.write', true),
  ('qs', 'suppliers.write', true),
  ('project_manager', 'suppliers.write', true),
  ('worker', 'suppliers.write', false)
on conflict (role, permission_key) do update
set
  is_allowed = excluded.is_allowed,
  updated_at = now();

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
  has_explicit_allow boolean := false;
  has_explicit_deny boolean := false;
  has_role_allow boolean := false;
  has_fallback_allow boolean := false;
begin
  if auth.uid() is null or p_organization_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = true
  )
  into has_explicit_allow;

  if has_explicit_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.member_permission_overrides o
      on o.organization_member_id = m.id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and o.permission_key = p_permission_key
      and o.is_allowed = false
  )
  into has_explicit_deny;

  if has_explicit_deny then
    return false;
  end if;

  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp
      on rp.role = m.role
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and rp.permission_key = p_permission_key
      and rp.is_allowed = true
  )
  into has_role_allow;

  if has_role_allow then
    return true;
  end if;

  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        (p_permission_key = 'settings.organization.update' and m.role in ('owner', 'admin'))
        or
        (p_permission_key = 'leads.clients.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'leads.opportunities.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'quotes.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'variations.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'purchase_orders.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
        or
        (p_permission_key = 'suppliers.write' and m.role in ('owner', 'admin', 'qs', 'project_manager'))
      )
  )
  into has_fallback_allow;

  return has_fallback_allow;
end;
$$;

grant execute on function public.has_org_permission(uuid, text) to authenticated;

commit;
