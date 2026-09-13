begin;

create or replace function public.search_pricing_worksheet_materials(
  p_workbook_id uuid,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_evaluation_time timestamptz default statement_timestamp()
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_organization jsonb;
  v_organization_currency text;
  v_search text := lower(regexp_replace(btrim(coalesce(p_search, '')), '\s+', ' ', 'g'));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_evaluated_at timestamptz := coalesce(p_evaluation_time, statement_timestamp());
  v_result jsonb;
begin
  select workbook.organization_id, to_jsonb(organization)
  into v_organization_id, v_organization
  from public.opportunity_pricing_worksheets workbook
  join public.organizations organization on organization.id = workbook.organization_id
  where workbook.id = p_workbook_id and workbook.archived_at is null;

  if v_organization_id is null or not public.is_member_of_organization(v_organization_id) then
    raise exception 'pricing_material_picker:invalid_workbook_scope' using errcode = '42501';
  end if;
  if not public.has_org_permission(v_organization_id, 'materials.view') then
    raise exception 'pricing_material_picker:materials_view_permission_required' using errcode = '42501';
  end if;
  v_organization_currency := public.resolve_material_estimating_currency(v_organization);

  with candidates as materialized (
    select material.id as material_id, material.name as material_name,
      material.description as material_description, material.category, material.default_unit,
      product.id as supplier_product_id, product.supplier_id,
      coalesce(
        nullif(btrim(supplier.company_name), ''),
        nullif(btrim(supplier.name), ''),
        'Unknown supplier'
      ) as supplier_name,
      product.supplier_description, product.supplier_sku, product.supplier_unit, product.is_preferred,
      case when v_search = '' then 2 when material.normalized_name = v_search then 0
        when material.normalized_name like v_search || '%' then 1 else 2 end as relevance
    from public.organization_material_supplier_products product
    join public.organization_materials material
      on material.organization_id = product.organization_id and material.id = product.material_id
    join public.organization_suppliers supplier
      on supplier.organization_id = product.organization_id and supplier.id = product.supplier_id
    where product.organization_id = v_organization_id
      and product.is_active and product.archived_at is null
      and material.is_active and material.archived_at is null and supplier.is_active
      and (v_search = '' or material.normalized_name like '%' || v_search || '%'
        or lower(coalesce(material.description, '')) like '%' || v_search || '%'
        or lower(coalesce(material.category, '')) like '%' || v_search || '%'
        or lower(coalesce(supplier.company_name, '')) like '%' || v_search || '%'
        or lower(coalesce(supplier.name, '')) like '%' || v_search || '%'
        or coalesce(product.normalized_supplier_description, '') like '%' || v_search || '%'
        or coalesce(product.normalized_supplier_sku, '') like '%' || v_search || '%')
  ), paged as materialized (
    select candidate.*, count(*) over () as total_count from candidates candidate
    order by relevance, lower(material_name), is_preferred desc, lower(supplier_name),
      lower(coalesce(supplier_description, '')), lower(coalesce(supplier_sku, '')), supplier_product_id
    limit v_page_size offset ((v_page - 1) * v_page_size)
  ), effective_prices as materialized (
    select resolved.supplier_product_id, resolved.price_id
    from public.resolve_material_supplier_product_prices(
      v_organization_id, v_evaluated_at,
      coalesce((select array_agg(supplier_product_id order by supplier_product_id) from paged), array[]::uuid[])
    ) resolved
  ), rows as materialized (
    select paged.*, price.id as price_id, price.unit_cost, price.unit as price_unit, price.currency,
      price.source_tax_basis, price.source_tax_rate, price.tax_jurisdiction_code,
      price.comparison_tax_basis, price.comparison_tax_rate, price.tax_policy_snapshot,
      price.effective_from as price_effective_from,
      conversion.id as conversion_id, conversion.supplier_quantity as conversion_supplier_quantity,
      conversion.supplier_unit as conversion_supplier_unit,
      conversion.material_quantity as conversion_material_quantity,
      conversion.material_unit as conversion_material_unit, conversion.source as conversion_source,
      conversion.contract_version as conversion_contract_version,
      conversion.effective_from as conversion_effective_from, conversion.confirmed_at as conversion_confirmed_at
    from paged
    left join effective_prices on effective_prices.supplier_product_id = paged.supplier_product_id
    left join public.organization_material_supplier_prices price
      on price.organization_id = v_organization_id and price.id = effective_prices.price_id
    left join public.organization_material_supplier_product_unit_conversions conversion
      on conversion.organization_id = v_organization_id
      and conversion.supplier_product_id = paged.supplier_product_id
      and public.normalize_material_estimating_unit(conversion.supplier_unit) = public.normalize_material_estimating_unit(coalesce(price.unit, paged.supplier_unit))
      and public.normalize_material_estimating_unit(conversion.material_unit) = public.normalize_material_estimating_unit(paged.default_unit)
      and conversion.effective_from <= v_evaluated_at
      and (conversion.effective_to is null or conversion.effective_to > v_evaluated_at)
  ), derived as materialized (
    select rows.*,
      case when rows.price_id is null then null else public.derive_material_estimating_price(
        rows.price_id, rows.unit_cost, rows.price_unit, rows.currency, rows.source_tax_basis,
        rows.source_tax_rate, rows.tax_jurisdiction_code, rows.comparison_tax_basis,
        rows.comparison_tax_rate, rows.tax_policy_snapshot, rows.price_effective_from,
        rows.default_unit, v_organization_currency, v_evaluated_at,
        rows.conversion_id, rows.conversion_supplier_quantity, rows.conversion_supplier_unit,
        rows.conversion_material_quantity, rows.conversion_material_unit, rows.conversion_source,
        rows.conversion_contract_version, rows.conversion_effective_from, rows.conversion_confirmed_at
      ) end as pricing
    from rows
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'materialId', material_id, 'materialName', material_name,
      'materialDescription', material_description, 'category', category,
      'defaultUnit', default_unit, 'supplierId', supplier_id, 'supplierName', supplier_name,
      'supplierProductId', supplier_product_id, 'supplierProductDescription', supplier_description,
      'supplierSku', supplier_sku, 'supplierUnit', supplier_unit,
      'isPreferred', is_preferred, 'pricing', pricing
    ) order by relevance, lower(material_name), is_preferred desc, lower(supplier_name),
      lower(coalesce(supplier_description, '')), lower(coalesce(supplier_sku, '')), supplier_product_id), '[]'::jsonb),
    'page', v_page, 'pageSize', v_page_size, 'total', coalesce(max(total_count), 0),
    'hasMore', coalesce(max(total_count), 0) > v_page * v_page_size, 'evaluatedAt', v_evaluated_at
  ) into v_result from derived;
  return v_result;
end;
$$;

revoke all on function public.search_pricing_worksheet_materials(uuid,text,integer,integer,timestamptz)
  from public, anon;
grant execute on function public.search_pricing_worksheet_materials(uuid,text,integer,integer,timestamptz)
  to authenticated;

comment on function public.search_pricing_worksheet_materials(uuid,text,integer,integer,timestamptz) is
  'Bounded conversion-aware Material estimating-rate picker using the canonical company-name-first Supplier display convention.';

commit;
