begin;

-- Phase 1A is intentionally additive. Existing price and import rows are not
-- backfilled or rewritten by this migration.

alter table public.organization_materials
  add constraint organization_materials_organization_id_id_key
  unique (organization_id, id);

alter table public.organization_suppliers
  add constraint organization_suppliers_organization_id_id_key
  unique (organization_id, id);

alter table public.organization_material_import_batches
  add constraint organization_material_import_batches_organization_id_id_key
  unique (organization_id, id);

alter table public.organization_material_import_rows
  add constraint organization_material_import_rows_organization_id_id_key
  unique (organization_id, id);

alter table public.organization_material_supplier_prices
  add constraint organization_material_supplier_prices_organization_id_id_key
  unique (organization_id, id);

create table public.organization_material_supplier_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  material_id uuid not null,
  supplier_id uuid not null,
  supplier_sku text null,
  normalized_supplier_sku text generated always as (
    nullif(lower(regexp_replace(btrim(supplier_sku), '\s+', ' ', 'g')), '')
  ) stored,
  supplier_description text null,
  normalized_supplier_description text generated always as (
    nullif(lower(regexp_replace(btrim(supplier_description), '\s+', ' ', 'g')), '')
  ) stored,
  supplier_unit text not null,
  normalized_supplier_unit text generated always as (
    lower(regexp_replace(btrim(supplier_unit), '\s+', ' ', 'g'))
  ) stored,
  identity_variant text not null default 'default',
  identity_status text not null default 'confirmed',
  is_preferred boolean not null default false,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references auth.users (id) on delete set null,
  created_source text not null default 'manual',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  pack_quantity numeric(14,4) null,
  pack_unit text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_material_supplier_products_org_material_fkey
    foreign key (organization_id, material_id)
    references public.organization_materials (organization_id, id),
  constraint organization_material_supplier_products_org_supplier_fkey
    foreign key (organization_id, supplier_id)
    references public.organization_suppliers (organization_id, id),
  constraint organization_material_supplier_products_supplier_unit_not_blank
    check (char_length(btrim(supplier_unit)) > 0),
  constraint organization_material_supplier_products_identity_variant_not_blank
    check (char_length(btrim(identity_variant)) > 0),
  constraint organization_material_supplier_products_identity_status_check
    check (identity_status in ('confirmed', 'migrated_unverified', 'needs_review')),
  constraint organization_material_supplier_products_created_source_not_blank
    check (char_length(btrim(created_source)) > 0),
  constraint organization_material_supplier_products_confirmed_identity_check
    check (
      identity_status <> 'confirmed'
      or normalized_supplier_sku is not null
      or normalized_supplier_description is not null
    ),
  constraint organization_material_supplier_products_seen_window_check
    check (last_seen_at >= first_seen_at),
  constraint organization_material_supplier_products_pack_quantity_check
    check (pack_quantity is null or pack_quantity > 0),
  constraint organization_material_supplier_products_pack_unit_check
    check (pack_unit is null or char_length(btrim(pack_unit)) > 0),
  constraint organization_material_supplier_products_archive_state_check
    check (archived_at is null or is_active = false),
  constraint organization_material_supplier_products_preferred_state_check
    check (is_preferred = false or (is_active = true and archived_at is null)),
  constraint organization_material_supplier_products_organization_id_id_key
    unique (organization_id, id),
  constraint organization_material_supplier_products_price_identity_key
    unique (organization_id, id, material_id, supplier_id)
);

create index organization_material_supplier_products_sku_lookup_idx
  on public.organization_material_supplier_products (
    organization_id,
    material_id,
    supplier_id,
    normalized_supplier_sku,
    normalized_supplier_unit,
    identity_variant
  )
  where normalized_supplier_sku is not null;

create index organization_material_supplier_products_description_lookup_idx
  on public.organization_material_supplier_products (
    organization_id,
    material_id,
    supplier_id,
    normalized_supplier_description,
    normalized_supplier_unit,
    identity_variant
  )
  where normalized_supplier_sku is null
    and normalized_supplier_description is not null;

create unique index organization_material_supplier_products_confirmed_sku_key
  on public.organization_material_supplier_products (
    organization_id,
    material_id,
    supplier_id,
    normalized_supplier_sku,
    normalized_supplier_unit,
    identity_variant
  )
  where identity_status = 'confirmed'
    and normalized_supplier_sku is not null
    and archived_at is null;

create unique index organization_material_supplier_products_confirmed_description_key
  on public.organization_material_supplier_products (
    organization_id,
    material_id,
    supplier_id,
    normalized_supplier_description,
    normalized_supplier_unit,
    identity_variant
  )
  where identity_status = 'confirmed'
    and normalized_supplier_sku is null
    and normalized_supplier_description is not null
    and archived_at is null;

create unique index organization_material_supplier_products_preferred_key
  on public.organization_material_supplier_products (organization_id, material_id)
  where is_preferred = true;

create index organization_material_supplier_products_org_supplier_active_idx
  on public.organization_material_supplier_products (
    organization_id,
    supplier_id,
    is_active,
    updated_at desc
  );

drop trigger if exists set_organization_material_supplier_products_updated_at
  on public.organization_material_supplier_products;
create trigger set_organization_material_supplier_products_updated_at
before update on public.organization_material_supplier_products
for each row execute function public.set_updated_at();

create table public.organization_material_supplier_product_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_product_id uuid not null,
  previous_material_id uuid null,
  new_material_id uuid not null,
  reason text not null,
  source_import_row_id uuid null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint organization_material_supplier_product_assignments_product_fkey
    foreign key (organization_id, supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id),
  constraint organization_material_supplier_product_assignments_previous_material_fkey
    foreign key (organization_id, previous_material_id)
    references public.organization_materials (organization_id, id),
  constraint organization_material_supplier_product_assignments_new_material_fkey
    foreign key (organization_id, new_material_id)
    references public.organization_materials (organization_id, id),
  constraint organization_material_supplier_product_assignments_import_row_fkey
    foreign key (organization_id, source_import_row_id)
    references public.organization_material_import_rows (organization_id, id),
  constraint organization_material_supplier_product_assignments_reason_not_blank
    check (char_length(btrim(reason)) > 0),
  constraint organization_material_supplier_product_assignments_material_change_check
    check (previous_material_id is null or previous_material_id <> new_material_id)
);

create index organization_material_supplier_product_assignments_product_created_idx
  on public.organization_material_supplier_product_assignments (
    organization_id,
    supplier_product_id,
    created_at desc
  );

create or replace function public.reject_material_supplier_product_assignment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Supplier Product assignment history is append-only.' using errcode = '55000';
end;
$$;

revoke all on function public.reject_material_supplier_product_assignment_mutation() from public;

create trigger organization_material_supplier_product_assignments_append_only
before update or delete on public.organization_material_supplier_product_assignments
for each row execute function public.reject_material_supplier_product_assignment_mutation();

alter table public.organization_material_supplier_prices
  add column supplier_product_id uuid null,
  add column import_row_id uuid null,
  add column supersedes_price_id uuid null,
  add column idempotency_key text null,
  add column observation_metadata jsonb null;

alter table public.organization_material_supplier_prices
  add constraint organization_material_supplier_prices_supplier_product_fkey
    foreign key (organization_id, supplier_product_id, material_id, supplier_id)
    references public.organization_material_supplier_products (
      organization_id,
      id,
      material_id,
      supplier_id
    ),
  add constraint organization_material_supplier_prices_import_row_fkey
    foreign key (organization_id, import_row_id)
    references public.organization_material_import_rows (organization_id, id),
  add constraint organization_material_supplier_prices_supersedes_price_fkey
    foreign key (organization_id, supersedes_price_id)
    references public.organization_material_supplier_prices (organization_id, id),
  add constraint organization_material_supplier_prices_no_self_supersession_check
    check (supersedes_price_id is null or supersedes_price_id <> id),
  add constraint organization_material_supplier_prices_idempotency_key_not_blank
    check (idempotency_key is null or char_length(btrim(idempotency_key)) > 0);

create index organization_material_supplier_prices_supplier_product_effective_idx
  on public.organization_material_supplier_prices (
    organization_id,
    supplier_product_id,
    effective_from desc
  )
  where supplier_product_id is not null;

create index organization_material_supplier_prices_import_row_idx
  on public.organization_material_supplier_prices (organization_id, import_row_id)
  where import_row_id is not null;

create index organization_material_supplier_prices_supersedes_idx
  on public.organization_material_supplier_prices (organization_id, supersedes_price_id)
  where supersedes_price_id is not null;

create unique index organization_material_supplier_prices_idempotency_key
  on public.organization_material_supplier_prices (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.organization_material_import_rows
  add column approved_supplier_product_id uuid null,
  add column approved_supplier_price_id uuid null;

alter table public.organization_material_import_rows
  add constraint organization_material_import_rows_approved_product_fkey
    foreign key (organization_id, approved_supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id),
  add constraint organization_material_import_rows_approved_price_fkey
    foreign key (organization_id, approved_supplier_price_id)
    references public.organization_material_supplier_prices (organization_id, id);

create index organization_material_import_rows_approved_product_idx
  on public.organization_material_import_rows (organization_id, approved_supplier_product_id)
  where approved_supplier_product_id is not null;

create index organization_material_import_rows_approved_price_idx
  on public.organization_material_import_rows (organization_id, approved_supplier_price_id)
  where approved_supplier_price_id is not null;

alter table public.organization_material_supplier_products enable row level security;
alter table public.organization_material_supplier_products force row level security;
alter table public.organization_material_supplier_product_assignments enable row level security;
alter table public.organization_material_supplier_product_assignments force row level security;

create policy "Members can view material supplier products"
on public.organization_material_supplier_products
for select
to authenticated
using (public.has_org_permission(organization_material_supplier_products.organization_id, 'materials.view'));

create policy "Privileged members can create material supplier products"
on public.organization_material_supplier_products
for insert
to authenticated
with check (public.has_org_permission(organization_material_supplier_products.organization_id, 'materials.write'));

create policy "Privileged members can update material supplier products"
on public.organization_material_supplier_products
for update
to authenticated
using (public.has_org_permission(organization_material_supplier_products.organization_id, 'materials.write'))
with check (public.has_org_permission(organization_material_supplier_products.organization_id, 'materials.write'));

create policy "Members can view material supplier product assignments"
on public.organization_material_supplier_product_assignments
for select
to authenticated
using (public.has_org_permission(organization_material_supplier_product_assignments.organization_id, 'materials.view'));

create policy "Privileged members can create material supplier product assignments"
on public.organization_material_supplier_product_assignments
for insert
to authenticated
with check (public.has_org_permission(organization_material_supplier_product_assignments.organization_id, 'materials.write'));

grant select, insert, update on public.organization_material_supplier_products to authenticated;
grant select, insert on public.organization_material_supplier_product_assignments to authenticated;

commit;
