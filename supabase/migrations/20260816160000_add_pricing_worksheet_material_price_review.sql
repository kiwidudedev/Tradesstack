begin;

create index if not exists worksheet_material_price_bindings_workbook_active_review_idx
  on public.worksheet_material_price_bindings (
    organization_id,
    workbook_id,
    supplier_product_id,
    sheet_id,
    current_cell_address
  )
  where binding_state = 'active';

create or replace function public.review_pricing_worksheet_material_prices(
  p_workbook_id uuid,
  p_active_sheet_id uuid default null,
  p_local_bindings jsonb default null,
  p_sheet_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_target_binding_id uuid default null,
  p_expected_current_price_id uuid default null,
  p_require_write boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_evaluated_at timestamptz := statement_timestamp();
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_entry jsonb;
  v_binding_id uuid;
  v_material_id uuid;
  v_supplier_id uuid;
  v_product_id uuid;
  v_price_id uuid;
  v_evidence_evaluated_at timestamptz;
  v_result jsonb;
begin
  select * into v_workbook
  from public.opportunity_pricing_worksheets workbook
  where workbook.id = p_workbook_id
    and workbook.archived_at is null;

  if v_workbook.id is null
    or not public.is_member_of_organization(v_workbook.organization_id) then
    raise exception 'pricing_material_review:invalid_workbook_scope' using errcode = '42501';
  end if;
  if not public.has_org_permission(v_workbook.organization_id, 'materials.view') then
    raise exception 'pricing_material_review:materials_view_permission_required' using errcode = '42501';
  end if;
  if p_require_write and not public.can_write_pricing_workbook_owner(
    v_workbook.organization_id,
    v_workbook.opportunity_id,
    v_workbook.project_id,
    v_workbook.quote_id,
    v_workbook.variation_id
  ) then
    raise exception 'pricing_material_review:workbook_write_permission_required' using errcode = '42501';
  end if;

  if p_sheet_id is not null and not exists (
    select 1 from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = v_workbook.organization_id
      and sheet.workbook_id = v_workbook.id
      and sheet.id = p_sheet_id
  ) then
    raise exception 'pricing_material_review:invalid_sheet_scope' using errcode = '42501';
  end if;

  if p_local_bindings is not null then
    if p_active_sheet_id is null
      or jsonb_typeof(p_local_bindings) is distinct from 'array'
      or not exists (
        select 1 from public.opportunity_pricing_workbook_sheets sheet
        where sheet.organization_id = v_workbook.organization_id
          and sheet.workbook_id = v_workbook.id
          and sheet.id = p_active_sheet_id
      ) then
      raise exception 'pricing_material_review:invalid_overlay_scope' using errcode = '22023';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_local_bindings) entry
      group by entry->>'bindingId' having count(*) > 1
    ) or exists (
      select 1 from jsonb_array_elements(p_local_bindings) entry
      group by entry->>'cellAddress' having count(*) > 1
    ) then
      raise exception 'pricing_material_review:duplicate_overlay_binding' using errcode = '22023';
    end if;

    for v_entry in select value from jsonb_array_elements(p_local_bindings)
    loop
      if jsonb_typeof(v_entry) is distinct from 'object'
        or jsonb_typeof(v_entry->'provenance') is distinct from 'object'
        or jsonb_typeof(v_entry #> '{provenance,snapshot}') is distinct from 'object'
        or v_entry->>'bindingId' is distinct from v_entry #>> '{provenance,bindingId}'
        or coalesce(v_entry->>'type', '') <> 'number'
        or jsonb_typeof(v_entry->'value') is distinct from 'number'
        or coalesce(jsonb_typeof(v_entry->'formula'), 'null') <> 'null'
        or coalesce(v_entry->>'cellAddress', '') !~ '^[A-Z]+[1-9][0-9]*$' then
        raise exception 'pricing_material_review:invalid_overlay_binding' using errcode = '22023';
      end if;

      begin
        v_binding_id := (v_entry->>'bindingId')::uuid;
        v_material_id := (v_entry #>> '{provenance,organizationMaterialId}')::uuid;
        v_supplier_id := (v_entry #>> '{provenance,supplierId}')::uuid;
        v_product_id := (v_entry #>> '{provenance,supplierProductId}')::uuid;
        v_price_id := (v_entry #>> '{provenance,supplierPriceId}')::uuid;
        v_evidence_evaluated_at := (v_entry #>> '{provenance,snapshot,evaluatedAt}')::timestamptz;
      exception when others then
        raise exception 'pricing_material_review:invalid_overlay_identifiers' using errcode = '22023';
      end;

      if not exists (
        select 1
        from public.organization_materials material
        join public.organization_suppliers supplier
          on supplier.organization_id = material.organization_id and supplier.id = v_supplier_id
        join public.organization_material_supplier_products product
          on product.organization_id = material.organization_id
          and product.id = v_product_id
          and product.material_id = material.id
          and product.supplier_id = supplier.id
        join public.organization_material_supplier_prices price
          on price.organization_id = material.organization_id
          and price.id = v_price_id
          and price.supplier_product_id = product.id
          and price.material_id = material.id
          and price.supplier_id = supplier.id
        left join public.worksheet_material_price_bindings existing on existing.id = v_binding_id
        where material.organization_id = v_workbook.organization_id
          and material.id = v_material_id
          and (v_entry->>'value')::numeric = price.unit_cost
          and (v_entry #>> '{provenance,snapshot,unitCost}')::numeric = price.unit_cost
          and v_entry #>> '{provenance,snapshot,unit}' = price.unit
          and upper(v_entry #>> '{provenance,snapshot,currency}') = upper(price.currency)
          and v_entry #>> '{provenance,snapshot,sourceTaxBasis}' = price.source_tax_basis
          and (v_entry #>> '{provenance,snapshot,sourceTaxRate}')::numeric is not distinct from price.source_tax_rate
          and v_entry #>> '{provenance,snapshot,taxJurisdictionCode}' is not distinct from price.tax_jurisdiction_code
          and (v_entry #>> '{provenance,snapshot,priceEffectiveFrom}')::timestamptz = price.effective_from
          and price.effective_from <= v_evidence_evaluated_at
          and (price.effective_to is null or price.effective_to > v_evidence_evaluated_at)
          and (
            existing.id is null
            or (
              existing.organization_id = v_workbook.organization_id
              and existing.workbook_id = v_workbook.id
              and existing.sheet_id = p_active_sheet_id
              and existing.organization_material_id = material.id
              and existing.supplier_id = supplier.id
              and existing.supplier_product_id = product.id
              and existing.supplier_price_id = price.id
            )
          )
      ) then
        raise exception 'pricing_material_review:forged_overlay_binding:%', v_entry->>'cellAddress' using errcode = '42501';
      end if;
    end loop;
  elsif p_active_sheet_id is not null then
    raise exception 'pricing_material_review:overlay_required_for_active_sheet' using errcode = '22023';
  end if;

  with source_bindings as materialized (
    select
      binding.id as binding_id, binding.sheet_id, sheet.name as sheet_name,
      binding.current_cell_address as cell_address,
      binding.organization_material_id as material_id, binding.supplier_id,
      binding.supplier_product_id, binding.supplier_price_id,
      binding.inserted_unit_cost, binding.unit_snapshot, binding.currency_snapshot,
      binding.source_tax_basis_snapshot, binding.source_tax_rate_snapshot,
      binding.tax_jurisdiction_code_snapshot, binding.material_name_snapshot,
      binding.supplier_name_snapshot, binding.supplier_product_description_snapshot,
      binding.supplier_sku_snapshot, binding.price_effective_from,
      binding.effective_price_evaluated_at
    from public.worksheet_material_price_bindings binding
    join public.opportunity_pricing_workbook_sheets sheet
      on sheet.organization_id = binding.organization_id
      and sheet.workbook_id = binding.workbook_id and sheet.id = binding.sheet_id
    where binding.organization_id = v_workbook.organization_id
      and binding.workbook_id = v_workbook.id
      and binding.binding_state = 'active'
      and (p_local_bindings is null or binding.sheet_id <> p_active_sheet_id)

    union all

    select
      (entry->>'bindingId')::uuid, p_active_sheet_id, sheet.name,
      entry->>'cellAddress', material.id, supplier.id, product.id, price.id,
      price.unit_cost, price.unit, price.currency, price.source_tax_basis,
      price.source_tax_rate, price.tax_jurisdiction_code, material.name, supplier.name,
      coalesce(product.supplier_description, price.supplier_description),
      coalesce(product.supplier_sku, price.supplier_sku), price.effective_from,
      (entry #>> '{provenance,snapshot,evaluatedAt}')::timestamptz
    from jsonb_array_elements(coalesce(p_local_bindings, '[]'::jsonb)) entry
    join public.opportunity_pricing_workbook_sheets sheet
      on sheet.organization_id = v_workbook.organization_id
      and sheet.workbook_id = v_workbook.id and sheet.id = p_active_sheet_id
    join public.organization_materials material
      on material.organization_id = v_workbook.organization_id
      and material.id = (entry #>> '{provenance,organizationMaterialId}')::uuid
    join public.organization_suppliers supplier
      on supplier.organization_id = v_workbook.organization_id
      and supplier.id = (entry #>> '{provenance,supplierId}')::uuid
    join public.organization_material_supplier_products product
      on product.organization_id = v_workbook.organization_id
      and product.id = (entry #>> '{provenance,supplierProductId}')::uuid
    join public.organization_material_supplier_prices price
      on price.organization_id = v_workbook.organization_id
      and price.id = (entry #>> '{provenance,supplierPriceId}')::uuid
  ), scoped_bindings as materialized (
    select * from source_bindings source
    where (p_sheet_id is null or source.sheet_id = p_sheet_id)
      and (p_target_binding_id is null or source.binding_id = p_target_binding_id)
  ), product_ids as materialized (
    select array_agg(distinct supplier_product_id) as ids from scoped_bindings
  ), effective as materialized (
    select resolved.supplier_product_id, resolved.price_id
    from product_ids products
    cross join lateral public.resolve_material_supplier_product_prices(
      v_workbook.organization_id, v_evaluated_at, products.ids
    ) resolved
    where coalesce(cardinality(products.ids), 0) > 0
  ), enriched as materialized (
    select source.*,
      material.id as live_material_id, material.is_active as material_is_active,
      material.archived_at as material_archived_at,
      supplier.id as live_supplier_id, supplier.is_active as supplier_is_active,
      product.id as live_product_id, product.is_active as product_is_active,
      product.archived_at as product_archived_at,
      current_price.id as current_price_id, current_price.unit_cost as current_unit_cost,
      current_price.unit as current_unit, current_price.currency as current_currency,
      current_price.source_tax_basis as current_tax_basis,
      current_price.source_tax_rate as current_tax_rate,
      current_price.tax_jurisdiction_code as current_tax_jurisdiction,
      current_price.effective_from as current_effective_from
    from scoped_bindings source
    left join public.organization_materials material
      on material.organization_id = v_workbook.organization_id and material.id = source.material_id
    left join public.organization_suppliers supplier
      on supplier.organization_id = v_workbook.organization_id and supplier.id = source.supplier_id
    left join public.organization_material_supplier_products product
      on product.organization_id = v_workbook.organization_id and product.id = source.supplier_product_id
    left join effective on effective.supplier_product_id = source.supplier_product_id
    left join public.organization_material_supplier_prices current_price
      on current_price.organization_id = v_workbook.organization_id and current_price.id = effective.price_id
  ), classified as materialized (
    select enriched.*,
      case
        when live_material_id is null or live_supplier_id is null or live_product_id is null then 'source_unavailable'
        when not material_is_active or material_archived_at is not null
          or not supplier_is_active or not product_is_active or product_archived_at is not null then 'source_inactive'
        when current_price_id is null then 'no_current_price'
        when current_price_id = supplier_price_id then 'current'
        when lower(regexp_replace(btrim(unit_snapshot), '\\s+', ' ', 'g'))
              <> lower(regexp_replace(btrim(current_unit), '\\s+', ' ', 'g'))
          or upper(btrim(currency_snapshot)) <> upper(btrim(current_currency))
          or source_tax_basis_snapshot <> current_tax_basis
          or source_tax_rate_snapshot is distinct from current_tax_rate
          or tax_jurisdiction_code_snapshot is distinct from current_tax_jurisdiction
          then 'commercial_terms_changed'
        when inserted_unit_cost = current_unit_cost then 'version_changed_same_terms'
        else 'price_changed'
      end as classification,
      array_remove(array[
        case when current_price_id is not null and lower(regexp_replace(btrim(unit_snapshot), '\\s+', ' ', 'g'))
          <> lower(regexp_replace(btrim(current_unit), '\\s+', ' ', 'g')) then 'unit' end,
        case when current_price_id is not null and upper(btrim(currency_snapshot)) <> upper(btrim(current_currency)) then 'currency' end,
        case when current_price_id is not null and source_tax_basis_snapshot <> current_tax_basis then 'tax_basis' end,
        case when current_price_id is not null and source_tax_rate_snapshot is distinct from current_tax_rate then 'tax_rate' end,
        case when current_price_id is not null and tax_jurisdiction_code_snapshot is distinct from current_tax_jurisdiction then 'tax_jurisdiction' end
      ], null) as reason_codes
    from enriched
  ), grouped as materialized (
    select
      supplier_product_id::text || ':' || supplier_price_id::text || ':' || classification as group_key,
      classification, reason_codes, material_id, material_name_snapshot, supplier_id,
      supplier_name_snapshot, supplier_product_id, supplier_product_description_snapshot,
      supplier_sku_snapshot, supplier_price_id, inserted_unit_cost, unit_snapshot,
      currency_snapshot, source_tax_basis_snapshot, source_tax_rate_snapshot,
      tax_jurisdiction_code_snapshot, price_effective_from, effective_price_evaluated_at,
      current_price_id, current_unit_cost, current_unit, current_currency,
      current_tax_basis, current_tax_rate, current_tax_jurisdiction, current_effective_from,
      case when classification = 'price_changed' then current_unit_cost - inserted_unit_cost else null end as absolute_difference,
      case when classification = 'price_changed' and inserted_unit_cost <> 0
        then ((current_unit_cost - inserted_unit_cost) / inserted_unit_cost) * 100 else null end as percentage_difference,
      jsonb_agg(jsonb_build_object(
        'bindingId', binding_id, 'sheetId', sheet_id, 'sheetName', sheet_name,
        'cellAddress', cell_address
      ) order by lower(sheet_name), cell_address, binding_id) as targets
    from classified
    group by classification, reason_codes, material_id, material_name_snapshot, supplier_id,
      supplier_name_snapshot, supplier_product_id, supplier_product_description_snapshot,
      supplier_sku_snapshot, supplier_price_id, inserted_unit_cost, unit_snapshot,
      currency_snapshot, source_tax_basis_snapshot, source_tax_rate_snapshot,
      tax_jurisdiction_code_snapshot, price_effective_from, effective_price_evaluated_at,
      current_price_id, current_unit_cost, current_unit, current_currency,
      current_tax_basis, current_tax_rate, current_tax_jurisdiction, current_effective_from
  ), visible as materialized (
    select *, count(*) over () as visible_total
    from grouped
    where classification not in ('current', 'version_changed_same_terms')
    order by
      case classification when 'price_changed' then 0 else 1 end,
      lower(material_name_snapshot), lower(supplier_name_snapshot), group_key
  ), paged as materialized (
    select * from visible limit v_page_size offset ((v_page - 1) * v_page_size)
  ), summary as (
    select
      count(*) filter (where classification = 'price_changed')::integer as price_updates,
      count(*) filter (where classification in ('commercial_terms_changed', 'no_current_price', 'source_inactive', 'source_unavailable', 'invalid_binding'))::integer as needs_review,
      count(*) filter (where classification = 'current')::integer as current_count,
      count(*) filter (where classification = 'version_changed_same_terms')::integer as same_terms_count
    from grouped
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'groupKey', page.group_key, 'classification', page.classification,
      'reasonCodes', to_jsonb(page.reason_codes), 'materialId', page.material_id,
      'materialName', page.material_name_snapshot, 'supplierId', page.supplier_id,
      'supplierName', page.supplier_name_snapshot, 'supplierProductId', page.supplier_product_id,
      'supplierProductDescription', page.supplier_product_description_snapshot,
      'supplierSku', page.supplier_sku_snapshot,
      'historicalPrice', jsonb_build_object(
        'id', page.supplier_price_id, 'unitCost', page.inserted_unit_cost,
        'unit', page.unit_snapshot, 'currency', page.currency_snapshot,
        'sourceTaxBasis', page.source_tax_basis_snapshot,
        'sourceTaxRate', page.source_tax_rate_snapshot,
        'taxJurisdictionCode', page.tax_jurisdiction_code_snapshot,
        'effectiveFrom', page.price_effective_from,
        'evaluatedAt', page.effective_price_evaluated_at
      ),
      'currentPrice', case when page.current_price_id is null then null else jsonb_build_object(
        'id', page.current_price_id, 'unitCost', page.current_unit_cost,
        'unit', page.current_unit, 'currency', page.current_currency,
        'sourceTaxBasis', page.current_tax_basis, 'sourceTaxRate', page.current_tax_rate,
        'taxJurisdictionCode', page.current_tax_jurisdiction,
        'effectiveFrom', page.current_effective_from, 'evaluatedAt', v_evaluated_at
      ) end,
      'absoluteDifference', page.absolute_difference,
      'percentageDifference', page.percentage_difference,
      'targets', page.targets
    ) order by case page.classification when 'price_changed' then 0 else 1 end,
      lower(page.material_name_snapshot), lower(page.supplier_name_snapshot), page.group_key) from paged page), '[]'::jsonb),
    'summary', jsonb_build_object(
      'priceUpdates', coalesce(summary.price_updates, 0),
      'needsReview', coalesce(summary.needs_review, 0),
      'current', coalesce(summary.current_count, 0),
      'versionChangedSameTerms', coalesce(summary.same_terms_count, 0)
    ),
    'page', v_page, 'pageSize', v_page_size,
    'total', coalesce((select max(visible_total) from visible), 0),
    'hasMore', coalesce((select max(visible_total) from visible), 0) > v_page * v_page_size,
    'evaluatedAt', v_evaluated_at
  ) into v_result from summary;

  if p_target_binding_id is not null then
    if jsonb_array_length(v_result->'items') <> 1
      or v_result #>> '{items,0,classification}' <> 'price_changed'
      or (p_expected_current_price_id is not null
        and v_result #>> '{items,0,currentPrice,id}' <> p_expected_current_price_id::text) then
      raise exception 'pricing_material_review:stale_update' using errcode = '40001';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.review_pricing_worksheet_material_prices(
  uuid, uuid, jsonb, uuid, integer, integer, uuid, uuid, boolean
) from public, anon;
grant execute on function public.review_pricing_worksheet_material_prices(
  uuid, uuid, jsonb, uuid, integer, integer, uuid, uuid, boolean
) to authenticated;

comment on function public.review_pricing_worksheet_material_prices(
  uuid, uuid, jsonb, uuid, integer, integer, uuid, uuid, boolean
) is 'Workbook-authorized, set-oriented Material price review with validated dirty-sheet overlay and action-time revalidation.';

commit;
