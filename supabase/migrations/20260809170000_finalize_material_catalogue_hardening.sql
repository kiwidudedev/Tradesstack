begin;

-- Phase 1I closes the temporary Supplier Product compatibility window. Every
-- price must now carry durable Supplier Product lineage before any constraints
-- or privileges are changed.
do $$
begin
  if exists (
    select 1 from public.organization_material_supplier_prices
    where supplier_product_id is null
  ) then
    raise exception 'materials_phase1i:unattached_price_rows';
  end if;

  if exists (
    select 1
    from public.organization_material_supplier_prices price
    join public.organization_material_supplier_products product
      on product.organization_id = price.organization_id
     and product.id = price.supplier_product_id
    where price.material_id <> product.material_id
       or price.supplier_id <> product.supplier_id
  ) then
    raise exception 'materials_phase1i:price_product_identity_mismatch';
  end if;

  if exists (
    select 1
    from public.organization_material_supplier_prices left_price
    join public.organization_material_supplier_prices right_price
      on right_price.organization_id = left_price.organization_id
     and right_price.supplier_product_id = left_price.supplier_product_id
     and right_price.id > left_price.id
     and tstzrange(left_price.effective_from, left_price.effective_to, '[)')
         && tstzrange(right_price.effective_from, right_price.effective_to, '[)')
  ) then
    raise exception 'materials_phase1i:effective_price_interval_overlap';
  end if;
end;
$$;

alter table public.organization_material_supplier_prices
  alter column supplier_product_id set not null;

alter table public.organization_material_supplier_prices
  drop constraint organization_material_supplier_prices_effective_window_check,
  add constraint organization_material_supplier_prices_effective_window_check
    check (effective_to is null or effective_to > effective_from);

-- Price observations are historical evidence. Lifecycle changes may close an
-- interval or maintain legacy compatibility flags, but commercial facts and
-- source identity cannot be rewritten after insertion.
create or replace function public.reject_material_supplier_price_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.material_id is distinct from old.material_id
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_product_id is distinct from old.supplier_product_id
    or new.import_batch_id is distinct from old.import_batch_id
    or new.import_row_id is distinct from old.import_row_id
    or new.supersedes_price_id is distinct from old.supersedes_price_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.supplier_sku is distinct from old.supplier_sku
    or new.supplier_description is distinct from old.supplier_description
    or new.unit is distinct from old.unit
    or new.unit_cost is distinct from old.unit_cost
    or new.currency is distinct from old.currency
    or new.source is distinct from old.source
    or new.effective_from is distinct from old.effective_from
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.observation_metadata is distinct from old.observation_metadata then
    raise exception 'materials_phase1i:price_fact_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_material_supplier_price_fact_mutation() from public;

drop trigger if exists organization_material_supplier_prices_immutable_facts
  on public.organization_material_supplier_prices;
create trigger organization_material_supplier_prices_immutable_facts
before update on public.organization_material_supplier_prices
for each row execute function public.reject_material_supplier_price_fact_mutation();

-- Serialize interval mutations on the owning Supplier Product and reject any
-- overlapping half-open range. This avoids an extension dependency.
create or replace function public.enforce_material_supplier_price_interval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.organization_material_supplier_products
  where organization_id = new.organization_id
    and id = new.supplier_product_id
  for update;

  if not found then
    raise exception 'materials_phase1i:supplier_product_not_found' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.organization_material_supplier_prices price
    where price.organization_id = new.organization_id
      and price.supplier_product_id = new.supplier_product_id
      and price.id <> new.id
      and tstzrange(price.effective_from, price.effective_to, '[)')
          && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'materials_phase1i:effective_price_interval_overlap' using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_material_supplier_price_interval() from public;

drop trigger if exists organization_material_supplier_prices_interval_guard
  on public.organization_material_supplier_prices;
create trigger organization_material_supplier_prices_interval_guard
before insert or update of organization_id, supplier_product_id, effective_from, effective_to
on public.organization_material_supplier_prices
for each row execute function public.enforce_material_supplier_price_interval();

-- Commercial Product/Price writes are exclusively exposed through the Phase
-- 1F security-definer RPCs. SELECT grants and read RLS remain intact.
revoke insert, update, delete
  on public.organization_material_supplier_products from authenticated;
revoke insert, update, delete
  on public.organization_material_supplier_prices from authenticated;
revoke insert, update, delete
  on public.organization_material_supplier_product_assignments from authenticated;

drop policy if exists "Privileged members can create material supplier products"
  on public.organization_material_supplier_products;
drop policy if exists "Privileged members can update material supplier products"
  on public.organization_material_supplier_products;
drop policy if exists "Privileged members can create material supplier prices"
  on public.organization_material_supplier_prices;
drop policy if exists "Privileged members can update material supplier prices"
  on public.organization_material_supplier_prices;
drop policy if exists "Privileged members can delete material supplier prices"
  on public.organization_material_supplier_prices;
drop policy if exists "Privileged members can create material supplier product assignments"
  on public.organization_material_supplier_product_assignments;

comment on column public.organization_material_supplier_prices.supplier_product_id is
  'Required durable Supplier Product identity for every Phase 1 price observation.';
comment on column public.organization_material_supplier_prices.is_current is
  'Legacy compatibility cache maintained by atomic writers; never authoritative for reads.';
comment on column public.organization_material_supplier_prices.is_preferred is
  'Legacy compatibility cache synchronized from Supplier Product preference; never authoritative for reads.';

do $$
begin
  if has_table_privilege('authenticated', 'public.organization_material_supplier_products', 'INSERT')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_products', 'UPDATE')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_products', 'DELETE')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_prices', 'INSERT')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_prices', 'UPDATE')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_prices', 'DELETE')
    or has_table_privilege('authenticated', 'public.organization_material_supplier_product_assignments', 'INSERT') then
    raise exception 'materials_phase1i:authenticated_direct_mutation_grant_remains';
  end if;
end;
$$;

commit;
