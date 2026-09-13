begin;

-- Phase 1D attaches lineage without changing the historical observation's
-- updated_at value. Normal price-fact mutations continue to advance it.
create or replace function public.set_material_supplier_price_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.id,
    new.organization_id,
    new.material_id,
    new.supplier_id,
    new.import_batch_id,
    new.supplier_sku,
    new.supplier_description,
    new.unit,
    new.unit_cost,
    new.currency,
    new.is_preferred,
    new.is_current,
    new.source,
    new.effective_from,
    new.effective_to,
    new.created_by,
    new.created_at,
    new.idempotency_key,
    new.observation_metadata
  ) is not distinct from row(
    old.id,
    old.organization_id,
    old.material_id,
    old.supplier_id,
    old.import_batch_id,
    old.supplier_sku,
    old.supplier_description,
    old.unit,
    old.unit_cost,
    old.currency,
    old.is_preferred,
    old.is_current,
    old.source,
    old.effective_from,
    old.effective_to,
    old.created_by,
    old.created_at,
    old.idempotency_key,
    old.observation_metadata
  ) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.set_material_supplier_price_updated_at() from public;

drop trigger if exists set_organization_material_supplier_prices_updated_at
  on public.organization_material_supplier_prices;
create trigger set_organization_material_supplier_prices_updated_at
before update on public.organization_material_supplier_prices
for each row execute function public.set_material_supplier_price_updated_at();

commit;
