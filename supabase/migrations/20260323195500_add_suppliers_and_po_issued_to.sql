create table if not exists public.organization_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  company_name text not null default '',
  email text null,
  phone text null,
  address text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_suppliers_name_not_blank check (char_length(trim(name)) > 0)
);

create index if not exists organization_suppliers_org_idx
  on public.organization_suppliers (organization_id);
create index if not exists organization_suppliers_org_name_idx
  on public.organization_suppliers (organization_id, name);

drop trigger if exists set_organization_suppliers_updated_at on public.organization_suppliers;
create trigger set_organization_suppliers_updated_at
before update on public.organization_suppliers
for each row execute function public.set_updated_at();

alter table public.organization_suppliers enable row level security;
alter table public.organization_suppliers force row level security;

drop policy if exists "Members can view organization suppliers" on public.organization_suppliers;
create policy "Members can view organization suppliers"
on public.organization_suppliers
for select
using (public.is_member_of_organization(organization_suppliers.organization_id));

drop policy if exists "Members can create organization suppliers" on public.organization_suppliers;
create policy "Members can create organization suppliers"
on public.organization_suppliers
for insert
with check (
  organization_suppliers.created_by = auth.uid()
  and public.is_member_of_organization(organization_suppliers.organization_id)
);

drop policy if exists "Members can update organization suppliers" on public.organization_suppliers;
create policy "Members can update organization suppliers"
on public.organization_suppliers
for update
using (public.is_member_of_organization(organization_suppliers.organization_id))
with check (public.is_member_of_organization(organization_suppliers.organization_id));

drop policy if exists "Admins can delete organization suppliers" on public.organization_suppliers;
create policy "Admins can delete organization suppliers"
on public.organization_suppliers
for delete
using (public.is_admin_of_organization(organization_suppliers.organization_id));

grant select, insert, update, delete on public.organization_suppliers to authenticated;

alter table public.project_purchase_orders
  add column if not exists supplier_id uuid null references public.organization_suppliers (id) on delete set null,
  add column if not exists issued_to_label text not null default '',
  add column if not exists supplier_contact text not null default '',
  add column if not exists supplier_name_snapshot text not null default '',
  add column if not exists supplier_email_snapshot text not null default '',
  add column if not exists supplier_phone_snapshot text not null default '';

create index if not exists project_purchase_orders_supplier_idx
  on public.project_purchase_orders (organization_id, supplier_id);
