begin;

create or replace function public.search_pricing_worksheet_materials(
  p_workbook_id uuid,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_evaluation_time timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_search text := lower(regexp_replace(btrim(coalesce(p_search, '')), '\\s+', ' ', 'g'));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_evaluated_at timestamptz := coalesce(p_evaluation_time, statement_timestamp());
  v_result jsonb;
begin
  select workbook.organization_id into v_organization_id
  from public.opportunity_pricing_worksheets workbook
  where workbook.id = p_workbook_id and workbook.archived_at is null;

  if v_organization_id is null
    or not public.is_member_of_organization(v_organization_id) then
    raise exception 'pricing_material_picker:invalid_workbook_scope' using errcode = '42501';
  end if;
  if not public.has_org_permission(v_organization_id, 'materials.view') then
    raise exception 'pricing_material_picker:materials_view_permission_required' using errcode = '42501';
  end if;

  with candidates as materialized (
    select
      material.id as material_id, material.name as material_name,
      material.description as material_description, material.category,
      material.default_unit, product.id as supplier_product_id,
      product.supplier_id, supplier.name as supplier_name,
      product.supplier_description, product.supplier_sku,
      product.supplier_unit, product.is_preferred,
      case
        when v_search = '' then 2
        when material.normalized_name = v_search then 0
        when material.normalized_name like v_search || '%' then 1
        else 2
      end as relevance
    from public.organization_material_supplier_products product
    join public.organization_materials material
      on material.organization_id = product.organization_id and material.id = product.material_id
    join public.organization_suppliers supplier
      on supplier.organization_id = product.organization_id and supplier.id = product.supplier_id
    where product.organization_id = v_organization_id
      and product.is_active and product.archived_at is null
      and material.is_active and material.archived_at is null
      and supplier.is_active
      and (
        v_search = ''
        or material.normalized_name like '%' || v_search || '%'
        or lower(coalesce(material.description, '')) like '%' || v_search || '%'
        or lower(coalesce(material.category, '')) like '%' || v_search || '%'
        or lower(supplier.name) like '%' || v_search || '%'
        or coalesce(product.normalized_supplier_description, '') like '%' || v_search || '%'
        or coalesce(product.normalized_supplier_sku, '') like '%' || v_search || '%'
      )
  ), paged as materialized (
    select candidate.*, count(*) over () as total_count
    from candidates candidate
    order by relevance, lower(material_name), is_preferred desc, lower(supplier_name),
      lower(coalesce(supplier_description, '')), lower(coalesce(supplier_sku, '')), supplier_product_id
    limit v_page_size offset ((v_page - 1) * v_page_size)
  ), effective as materialized (
    select resolved.supplier_product_id, resolved.price_id
    from public.resolve_material_supplier_product_prices(
      v_organization_id,
      v_evaluated_at,
      coalesce(
        (select array_agg(paged.supplier_product_id order by paged.supplier_product_id) from paged),
        array[]::uuid[]
      )
    ) resolved
  ), rows as (
    select paged.*, price.id as price_id, price.unit_cost, price.unit as price_unit,
      price.currency, price.source_tax_basis, price.source_tax_rate,
      price.tax_jurisdiction_code, price.effective_from
    from paged
    left join effective on effective.supplier_product_id = paged.supplier_product_id
    left join public.organization_material_supplier_prices price
      on price.organization_id = v_organization_id and price.id = effective.price_id
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'materialId', rows.material_id, 'materialName', rows.material_name,
      'materialDescription', rows.material_description, 'category', rows.category,
      'defaultUnit', rows.default_unit, 'supplierId', rows.supplier_id,
      'supplierName', rows.supplier_name, 'supplierProductId', rows.supplier_product_id,
      'supplierProductDescription', rows.supplier_description, 'supplierSku', rows.supplier_sku,
      'supplierUnit', rows.supplier_unit, 'isPreferred', rows.is_preferred,
      'price', case when rows.price_id is null then null else jsonb_build_object(
        'id', rows.price_id, 'unitCost', rows.unit_cost, 'unit', rows.price_unit,
        'currency', rows.currency, 'sourceTaxBasis', rows.source_tax_basis,
        'sourceTaxRate', rows.source_tax_rate, 'taxJurisdictionCode', rows.tax_jurisdiction_code,
        'effectiveFrom', rows.effective_from, 'evaluatedAt', v_evaluated_at
      ) end
    ) order by relevance, lower(material_name), is_preferred desc, lower(supplier_name),
      lower(coalesce(supplier_description, '')), lower(coalesce(supplier_sku, '')), supplier_product_id), '[]'::jsonb),
    'page', v_page, 'pageSize', v_page_size,
    'total', coalesce(max(rows.total_count), 0),
    'hasMore', coalesce(max(rows.total_count), 0) > v_page * v_page_size,
    'evaluatedAt', v_evaluated_at
  ) into v_result from rows;

  return v_result;
end;
$$;

revoke all on function public.search_pricing_worksheet_materials(uuid, text, integer, integer, timestamptz) from public, anon;
grant execute on function public.search_pricing_worksheet_materials(uuid, text, integer, integer, timestamptz) to authenticated;
comment on function public.search_pricing_worksheet_materials(uuid, text, integer, integer, timestamptz) is
  'Bounded, workbook-authorized Material Library read model for the pricing worksheet picker. Uses the canonical effective-price resolver once per page.';

commit;
