begin;

-- Let PostgreSQL's NOT NULL constraint remain the explicit authority for null
-- lineage. The interval guard handles only non-null Supplier Product ranges.
create or replace function public.enforce_material_supplier_price_interval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supplier_product_id is null then
    return new;
  end if;

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

commit;
