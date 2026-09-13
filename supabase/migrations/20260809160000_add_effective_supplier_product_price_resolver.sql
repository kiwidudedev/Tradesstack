begin;

create or replace function public.resolve_material_supplier_product_prices(
  p_organization_id uuid,
  p_evaluation_time timestamptz default now(),
  p_supplier_product_ids uuid[] default null
)
returns table (
  supplier_product_id uuid,
  price_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_conflicting_supplier_product_id uuid;
begin
  if p_organization_id is null then
    raise exception 'materials_phase1h:organization_required';
  end if;

  if p_evaluation_time is null then
    raise exception 'materials_phase1h:evaluation_time_required';
  end if;

  select price.supplier_product_id
  into v_conflicting_supplier_product_id
  from public.organization_material_supplier_prices price
  where price.organization_id = p_organization_id
    and price.supplier_product_id is not null
    and (p_supplier_product_ids is null or price.supplier_product_id = any(p_supplier_product_ids))
    and price.effective_from <= p_evaluation_time
    and (price.effective_to is null or price.effective_to > p_evaluation_time)
  group by price.supplier_product_id
  having count(*) > 1
  order by price.supplier_product_id
  limit 1;

  if v_conflicting_supplier_product_id is not null then
    raise exception 'materials_phase1h:effective_price_interval_conflict:%',
      v_conflicting_supplier_product_id;
  end if;

  return query
  select price.supplier_product_id, price.id
  from public.organization_material_supplier_prices price
  where price.organization_id = p_organization_id
    and price.supplier_product_id is not null
    and (p_supplier_product_ids is null or price.supplier_product_id = any(p_supplier_product_ids))
    and price.effective_from <= p_evaluation_time
    and (price.effective_to is null or price.effective_to > p_evaluation_time)
  order by price.supplier_product_id;
end;
$$;

comment on function public.resolve_material_supplier_product_prices(uuid, timestamptz, uuid[])
  is 'Canonical Phase 1H half-open [effective_from, effective_to) price resolver. Raises instead of choosing when more than one price is effective for a Supplier Product.';

revoke all on function public.resolve_material_supplier_product_prices(uuid, timestamptz, uuid[]) from public;
grant execute on function public.resolve_material_supplier_product_prices(uuid, timestamptz, uuid[]) to authenticated;
grant execute on function public.resolve_material_supplier_product_prices(uuid, timestamptz, uuid[]) to service_role;

commit;
