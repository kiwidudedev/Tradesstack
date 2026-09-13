begin;

create or replace function public.normalize_material_estimating_unit(p_unit text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case lower(regexp_replace(btrim(coalesce(p_unit, '')), '\s+', ' ', 'g'))
    when 'ea' then 'each' when 'item' then 'each' when 'items' then 'each'
    when 'pc' then 'each' when 'pcs' then 'each' when 'piece' then 'each'
    when 'pieces' then 'each' when 'unit' then 'each' when 'units' then 'each'
    when 'sheets' then 'sheet' when 'sht' then 'sheet' when 'shts' then 'sheet'
    when 'boxes' then 'box' when 'bx' then 'box'
    when 'packs' then 'pack' when 'pkt' then 'pack' when 'pkts' then 'pack'
    when 'rolls' then 'roll' when 'bags' then 'bag' when 'pallets' then 'pallet'
    when 'cartons' then 'carton'
    when 'l/m' then 'lm' when 'l m' then 'lm' when 'lin m' then 'lm'
    when 'linear m' then 'lm' when 'linear metre' then 'lm' when 'linear metres' then 'lm'
    when 'linear meter' then 'lm' when 'linear meters' then 'lm'
    when 'lineal metre' then 'lm' when 'lineal metres' then 'lm'
    when 'lineal meter' then 'lm' when 'lineal meters' then 'lm'
    when 'metre' then 'm' when 'metres' then 'm' when 'meter' then 'm' when 'meters' then 'm'
    when 'millimetre' then 'mm' when 'millimetres' then 'mm' when 'millimeter' then 'mm' when 'millimeters' then 'mm'
    when 'centimetre' then 'cm' when 'centimetres' then 'cm' when 'centimeter' then 'cm' when 'centimeters' then 'cm'
    when 'm²' then 'm2' when 'm^2' then 'm2' when 'sqm' then 'm2' when 'sq m' then 'm2'
    when 'square metre' then 'm2' when 'square metres' then 'm2' when 'square meter' then 'm2' when 'square meters' then 'm2'
    when 'm³' then 'm3' when 'm^3' then 'm3' when 'cubic metre' then 'm3' when 'cubic metres' then 'm3'
    when 'cubic meter' then 'm3' when 'cubic meters' then 'm3'
    when 'kilogram' then 'kg' when 'kilograms' then 'kg' when 'gram' then 'g' when 'grams' then 'g'
    when 'tonnes' then 'tonne' when 'ton' then 'tonne' when 'tons' then 'tonne' when 't' then 'tonne'
    else lower(regexp_replace(btrim(coalesce(p_unit, '')), '\s+', ' ', 'g'))
  end
$$;

create or replace function public.resolve_material_estimating_currency(p_organization jsonb)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case upper(btrim(coalesce(p_organization->>'country', '')))
    when 'NEW ZEALAND' then 'NZD' when 'NZ' then 'NZD' when 'NZL' then 'NZD'
    when 'AUSTRALIA' then 'AUD' when 'AU' then 'AUD' when 'AUS' then 'AUD'
    else case when upper(btrim(coalesce(p_organization->>'default_currency', ''))) ~ '^[A-Z]{3}$'
      then upper(btrim(p_organization->>'default_currency')) else 'NZD' end
  end
$$;

create or replace function public.derive_material_estimating_price(
  p_supplier_price_id uuid,
  p_source_unit_cost numeric,
  p_source_unit text,
  p_currency text,
  p_source_tax_basis text,
  p_source_tax_rate numeric,
  p_tax_jurisdiction_code text,
  p_comparison_tax_basis text,
  p_comparison_tax_rate numeric,
  p_tax_policy_snapshot jsonb,
  p_price_effective_from timestamptz,
  p_material_unit text,
  p_organization_currency text,
  p_evaluated_at timestamptz,
  p_conversion_id uuid default null,
  p_conversion_supplier_quantity numeric default null,
  p_conversion_supplier_unit text default null,
  p_conversion_material_quantity numeric default null,
  p_conversion_material_unit text default null,
  p_conversion_source text default null,
  p_conversion_contract_version text default null,
  p_conversion_effective_from timestamptz default null,
  p_conversion_confirmed_at timestamptz default null
)
returns jsonb language plpgsql immutable parallel safe set search_path = '' as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_status text;
  v_normalized numeric;
  v_rate numeric := p_comparison_tax_rate;
  v_source_unit text := public.normalize_material_estimating_unit(p_source_unit);
  v_material_unit text := public.normalize_material_estimating_unit(p_material_unit);
  v_direct boolean;
  v_unit_cost numeric;
  v_derivation text;
  v_conversion jsonb := null;
  v_source jsonb;
begin
  v_source := jsonb_build_object(
    'supplierPriceId', p_supplier_price_id, 'unitCost', p_source_unit_cost,
    'unit', p_source_unit, 'currency', v_currency,
    'sourceTaxBasis', p_source_tax_basis, 'sourceTaxRate', p_source_tax_rate,
    'taxJurisdictionCode', p_tax_jurisdiction_code,
    'comparisonTaxBasis', p_comparison_tax_basis, 'comparisonTaxRate', p_comparison_tax_rate,
    'effectiveFrom', p_price_effective_from
  );

  if v_currency is distinct from upper(btrim(coalesce(p_organization_currency, ''))) then
    v_status := 'currency_incompatible';
  elsif p_source_tax_basis = 'unknown' then
    v_status := 'tax_incompatible';
  elsif p_tax_jurisdiction_code is null or p_comparison_tax_basis is null or p_comparison_tax_rate is null then
    v_status := 'missing_tax_policy';
  elsif coalesce((p_tax_policy_snapshot->>'supportsInclusiveExclusive')::boolean, false) is not true then
    v_status := 'tax_incompatible';
  elsif p_source_tax_basis in ('inclusive', 'exclusive') and p_source_tax_rate is not null
    and abs(p_source_tax_rate - p_comparison_tax_rate) > 0.0001 then
    v_status := 'tax_incompatible';
  else
    v_normalized := case when p_source_tax_basis = 'inclusive'
      then round(p_source_unit_cost / (1 + v_rate / 100), 6)
      else p_source_unit_cost end;
    if p_comparison_tax_basis = 'inclusive'
      and p_source_tax_basis not in ('zero_rated', 'exempt', 'no_tax') then
      v_normalized := round(v_normalized * (1 + v_rate / 100), 6);
    end if;

    v_direct := v_source_unit = v_material_unit;
    if v_direct then
      v_status := 'available'; v_derivation := 'direct_unit_match'; v_unit_cost := v_normalized;
    elsif p_conversion_id is null
      or public.normalize_material_estimating_unit(p_conversion_supplier_unit) <> v_source_unit
      or public.normalize_material_estimating_unit(p_conversion_material_unit) <> v_material_unit
      or coalesce(p_conversion_supplier_quantity, 0) <= 0
      or coalesce(p_conversion_material_quantity, 0) <= 0
      or p_conversion_source not in ('user_confirmed_ai', 'user_confirmed_manual') then
      v_status := 'conversion_required';
    else
      v_status := 'available'; v_derivation := 'confirmed_conversion';
      v_unit_cost := v_normalized * p_conversion_supplier_quantity / p_conversion_material_quantity;
      v_conversion := jsonb_build_object(
        'conversionId', p_conversion_id, 'supplierQuantity', p_conversion_supplier_quantity,
        'supplierUnit', p_conversion_supplier_unit, 'materialQuantity', p_conversion_material_quantity,
        'materialUnit', p_conversion_material_unit, 'confirmationSource', p_conversion_source,
        'contractVersion', p_conversion_contract_version, 'effectiveFrom', p_conversion_effective_from,
        'confirmedAt', p_conversion_confirmed_at
      );
    end if;
  end if;

  return jsonb_build_object(
    'sourcePricing', v_source,
    'estimatingPricing', jsonb_build_object(
      'status', v_status, 'derivationKind', v_derivation,
      'normalizedSourceUnitCost', case when v_status in ('available', 'conversion_required') then v_normalized else null end,
      'unitCost', case when v_status = 'available' then v_unit_cost else null end,
      'unit', p_material_unit, 'currency', v_currency,
      'taxBasis', p_comparison_tax_basis,
      'calculationVersion', 'material_estimating_price_v1', 'evaluatedAt', p_evaluated_at
    ),
    'conversion', case when v_status = 'available' then v_conversion else null end
  );
end;
$$;

revoke all on function public.normalize_material_estimating_unit(text) from public, anon, authenticated;
revoke all on function public.resolve_material_estimating_currency(jsonb) from public, anon, authenticated;
revoke all on function public.derive_material_estimating_price(uuid,numeric,text,text,text,numeric,text,text,numeric,jsonb,timestamptz,text,text,timestamptz,uuid,numeric,text,numeric,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;

alter table public.worksheet_material_price_bindings
  add column provenance_version smallint not null default 1,
  add column pricing_derivation_kind text null,
  add column worksheet_rate_snapshot numeric(24,12) null,
  add column worksheet_unit_snapshot text null,
  add column normalized_source_unit_cost_snapshot numeric(24,12) null,
  add column comparison_tax_basis_snapshot text null,
  add column comparison_tax_rate_snapshot numeric(12,8) null,
  add column calculation_version text null,
  add column unit_conversion_id uuid null,
  add column conversion_supplier_quantity_snapshot numeric(18,6) null,
  add column conversion_supplier_unit_snapshot text null,
  add column conversion_material_quantity_snapshot numeric(18,6) null,
  add column conversion_material_unit_snapshot text null,
  add column conversion_contract_version_snapshot text null,
  add column conversion_source_snapshot text null,
  add column conversion_effective_from_snapshot timestamptz null,
  add column conversion_confirmed_at_snapshot timestamptz null,
  add constraint worksheet_material_price_bindings_provenance_version_check check (provenance_version in (1,2)),
  add constraint worksheet_material_price_bindings_v2_shape_check check (
    (provenance_version = 1 and pricing_derivation_kind is null and worksheet_rate_snapshot is null)
    or
    (provenance_version = 2 and pricing_derivation_kind in ('direct_unit_match','confirmed_conversion')
      and worksheet_rate_snapshot is not null and worksheet_rate_snapshot >= 0
      and worksheet_unit_snapshot is not null and char_length(btrim(worksheet_unit_snapshot)) > 0
      and normalized_source_unit_cost_snapshot is not null
      and comparison_tax_basis_snapshot in ('exclusive','inclusive')
      and comparison_tax_rate_snapshot is not null
      and calculation_version = 'material_estimating_price_v1'
      and ((pricing_derivation_kind = 'direct_unit_match' and unit_conversion_id is null
          and conversion_supplier_quantity_snapshot is null and conversion_supplier_unit_snapshot is null
          and conversion_material_quantity_snapshot is null and conversion_material_unit_snapshot is null
          and conversion_contract_version_snapshot is null and conversion_source_snapshot is null
          and conversion_effective_from_snapshot is null and conversion_confirmed_at_snapshot is null)
        or (pricing_derivation_kind = 'confirmed_conversion' and unit_conversion_id is not null
          and conversion_supplier_quantity_snapshot is not null and conversion_supplier_quantity_snapshot > 0
          and conversion_supplier_unit_snapshot is not null and char_length(btrim(conversion_supplier_unit_snapshot)) > 0
          and conversion_material_quantity_snapshot is not null and conversion_material_quantity_snapshot > 0
          and conversion_material_unit_snapshot is not null and char_length(btrim(conversion_material_unit_snapshot)) > 0
          and conversion_contract_version_snapshot is not null and char_length(btrim(conversion_contract_version_snapshot)) > 0
          and conversion_source_snapshot is not null and char_length(btrim(conversion_source_snapshot)) > 0
          and conversion_effective_from_snapshot is not null and conversion_confirmed_at_snapshot is not null)))
  ),
  add constraint worksheet_material_price_bindings_conversion_fkey
    foreign key (organization_id, unit_conversion_id)
    references public.organization_material_supplier_product_unit_conversions (organization_id, id) on delete restrict;

create index worksheet_material_price_bindings_conversion_idx
  on public.worksheet_material_price_bindings (organization_id, unit_conversion_id, inserted_at desc)
  where unit_conversion_id is not null;

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
      product.id as supplier_product_id, product.supplier_id, supplier.name as supplier_name,
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
        or lower(supplier.name) like '%' || v_search || '%'
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

comment on function public.search_pricing_worksheet_materials(uuid,text,integer,integer,timestamptz) is
  'Bounded conversion-aware Material estimating-rate picker. Prices and conversions are resolved once per page.';

create or replace function public.reject_worksheet_material_price_binding_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.workbook_id is distinct from old.workbook_id or new.sheet_id is distinct from old.sheet_id
    or new.insertion_cell_address is distinct from old.insertion_cell_address
    or new.organization_material_id is distinct from old.organization_material_id
    or new.supplier_id is distinct from old.supplier_id or new.supplier_product_id is distinct from old.supplier_product_id
    or new.supplier_price_id is distinct from old.supplier_price_id
    or new.inserted_unit_cost is distinct from old.inserted_unit_cost or new.unit_snapshot is distinct from old.unit_snapshot
    or new.currency_snapshot is distinct from old.currency_snapshot
    or new.source_tax_basis_snapshot is distinct from old.source_tax_basis_snapshot
    or new.source_tax_rate_snapshot is distinct from old.source_tax_rate_snapshot
    or new.tax_jurisdiction_code_snapshot is distinct from old.tax_jurisdiction_code_snapshot
    or new.material_name_snapshot is distinct from old.material_name_snapshot
    or new.supplier_name_snapshot is distinct from old.supplier_name_snapshot
    or new.supplier_product_description_snapshot is distinct from old.supplier_product_description_snapshot
    or new.supplier_sku_snapshot is distinct from old.supplier_sku_snapshot
    or new.price_effective_from is distinct from old.price_effective_from
    or new.effective_price_evaluated_at is distinct from old.effective_price_evaluated_at
    or new.inserted_by is distinct from old.inserted_by or new.inserted_at is distinct from old.inserted_at
    or new.provenance_version is distinct from old.provenance_version
    or new.pricing_derivation_kind is distinct from old.pricing_derivation_kind
    or new.worksheet_rate_snapshot is distinct from old.worksheet_rate_snapshot
    or new.worksheet_unit_snapshot is distinct from old.worksheet_unit_snapshot
    or new.normalized_source_unit_cost_snapshot is distinct from old.normalized_source_unit_cost_snapshot
    or new.comparison_tax_basis_snapshot is distinct from old.comparison_tax_basis_snapshot
    or new.comparison_tax_rate_snapshot is distinct from old.comparison_tax_rate_snapshot
    or new.calculation_version is distinct from old.calculation_version
    or new.unit_conversion_id is distinct from old.unit_conversion_id
    or new.conversion_supplier_quantity_snapshot is distinct from old.conversion_supplier_quantity_snapshot
    or new.conversion_supplier_unit_snapshot is distinct from old.conversion_supplier_unit_snapshot
    or new.conversion_material_quantity_snapshot is distinct from old.conversion_material_quantity_snapshot
    or new.conversion_material_unit_snapshot is distinct from old.conversion_material_unit_snapshot
    or new.conversion_contract_version_snapshot is distinct from old.conversion_contract_version_snapshot
    or new.conversion_source_snapshot is distinct from old.conversion_source_snapshot
    or new.conversion_effective_from_snapshot is distinct from old.conversion_effective_from_snapshot
    or new.conversion_confirmed_at_snapshot is distinct from old.conversion_confirmed_at_snapshot then
    raise exception 'worksheet_material_pricing:binding_evidence_is_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- Forward declaration: reconciliation is compiled before the complete shared
-- evidence validator below, then both the save trigger and review use that
-- single validator at execution time.
create or replace function public.validate_worksheet_material_pricing_evidence(
  p_organization_id uuid,
  p_cell_value numeric,
  p_metadata jsonb
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return false;
end;
$$;

revoke all on function public.validate_worksheet_material_pricing_evidence(uuid,numeric,jsonb) from public, anon, authenticated;

create or replace function public.reconcile_worksheet_material_price_bindings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_cells jsonb := coalesce(new.worksheet_data->'cells', '{}'::jsonb);
  v_cell record;
  v_metadata jsonb;
  v_version integer;
  v_binding_id uuid;
  v_material_id uuid;
  v_supplier_id uuid;
  v_product_id uuid;
  v_price_id uuid;
  v_conversion_id uuid;
  v_evaluated_at timestamptz;
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_material public.organization_materials%rowtype;
  v_supplier public.organization_suppliers%rowtype;
  v_product public.organization_material_supplier_products%rowtype;
  v_price public.organization_material_supplier_prices%rowtype;
  v_conversion public.organization_material_supplier_product_unit_conversions%rowtype;
  v_existing public.worksheet_material_price_bindings%rowtype;
  v_derived jsonb;
  v_organization_currency text;
begin
  if jsonb_typeof(v_cells) is distinct from 'object' then
    raise exception 'worksheet_material_pricing:cells_must_be_an_object' using errcode = '22023';
  end if;
  if not jsonb_path_exists(v_cells, '$.*.metadata.materialPricing') and not exists (
    select 1 from public.worksheet_material_price_bindings binding
    where binding.organization_id = new.organization_id and binding.workbook_id = new.workbook_id
      and binding.sheet_id = new.id and binding.binding_state = 'active'
  ) then return new; end if;
  if v_actor is null or new.updated_by is distinct from v_actor then
    raise exception 'worksheet_material_pricing:actor_mismatch' using errcode = '42501';
  end if;
  if not public.has_org_permission(new.organization_id, 'materials.view') then
    raise exception 'worksheet_material_pricing:materials_view_permission_required' using errcode = '42501';
  end if;
  select * into v_workbook from public.opportunity_pricing_worksheets workbook
  where workbook.id = new.workbook_id and workbook.organization_id = new.organization_id
    and workbook.opportunity_id = new.opportunity_id and workbook.archived_at is null;
  if v_workbook.id is null or not public.can_write_pricing_workbook_owner(
    v_workbook.organization_id, v_workbook.opportunity_id, v_workbook.project_id,
    v_workbook.quote_id, v_workbook.variation_id
  ) then raise exception 'worksheet_material_pricing:invalid_workbook_scope' using errcode = '42501'; end if;
  select public.resolve_material_estimating_currency(to_jsonb(organization)) into v_organization_currency
  from public.organizations organization where organization.id = new.organization_id;

  if exists (
    select 1 from jsonb_each(v_cells) cell where cell.value #> '{metadata,materialPricing}' is not null
    group by cell.value #>> '{metadata,materialPricing,bindingId}' having count(*) > 1
  ) then raise exception 'worksheet_material_pricing:duplicate_binding_id' using errcode = '22023'; end if;

  -- Validate the complete set before changing any binding lifecycle state.
  for v_cell in select cell.key as cell_address, cell.value as cell_data
    from jsonb_each(v_cells) cell where cell.value #> '{metadata,materialPricing}' is not null
  loop
    v_metadata := v_cell.cell_data #> '{metadata,materialPricing}';
    begin
      v_version := (v_metadata->>'version')::integer;
      v_binding_id := (v_metadata->>'bindingId')::uuid;
      v_material_id := (v_metadata->>'organizationMaterialId')::uuid;
      v_supplier_id := (v_metadata->>'supplierId')::uuid;
      v_product_id := (v_metadata->>'supplierProductId')::uuid;
      if v_version = 1 then
        v_price_id := (v_metadata->>'supplierPriceId')::uuid;
        v_evaluated_at := (v_metadata #>> '{snapshot,evaluatedAt}')::timestamptz;
        v_conversion_id := null;
      elsif v_version = 2 then
        v_price_id := (v_metadata #>> '{sourcePricing,supplierPriceId}')::uuid;
        v_evaluated_at := (v_metadata #>> '{estimatingPricing,evaluatedAt}')::timestamptz;
        v_conversion_id := nullif(v_metadata #>> '{conversion,conversionId}', '')::uuid;
      else raise exception 'unsupported_version'; end if;
    exception when others then
      raise exception 'worksheet_material_pricing:malformed_metadata:%', v_cell.cell_address using errcode = '22023';
    end;
    if v_cell.cell_address !~ '^[A-Z]+[1-9][0-9]*$'
      or jsonb_typeof(v_cell.cell_data->'value') is distinct from 'number'
      or coalesce(v_cell.cell_data->>'type', '') <> 'number'
      or nullif(v_cell.cell_data->>'formula', '') is not null then
      raise exception 'worksheet_material_pricing:bound_cell_must_be_numeric:%', v_cell.cell_address using errcode = '22023';
    end if;

    select * into v_material from public.organization_materials
      where organization_id = new.organization_id and id = v_material_id;
    select * into v_supplier from public.organization_suppliers
      where organization_id = new.organization_id and id = v_supplier_id;
    select * into v_product from public.organization_material_supplier_products
      where organization_id = new.organization_id and id = v_product_id;
    select * into v_price from public.organization_material_supplier_prices
      where organization_id = new.organization_id and id = v_price_id;
    select * into v_existing from public.worksheet_material_price_bindings where id = v_binding_id;
    if v_material.id is null or v_supplier.id is null or v_product.id is null or v_price.id is null
      or v_product.material_id <> v_material.id or v_product.supplier_id <> v_supplier.id
      or v_price.supplier_product_id <> v_product.id or v_price.material_id <> v_material.id
      or v_price.supplier_id <> v_supplier.id
      or not exists (select 1 from public.resolve_material_supplier_product_prices(
        new.organization_id, v_evaluated_at, array[v_product.id]
      ) resolved where resolved.price_id = v_price.id)
      or (v_existing.id is not null and (v_existing.organization_id <> new.organization_id
        or v_existing.workbook_id <> new.workbook_id or v_existing.sheet_id <> new.id
        or v_existing.organization_material_id <> v_material.id or v_existing.supplier_id <> v_supplier.id
        or v_existing.supplier_product_id <> v_product.id or v_existing.supplier_price_id <> v_price.id)) then
      raise exception 'worksheet_material_pricing:invalid_binding_evidence:%', v_cell.cell_address using errcode = '42501';
    end if;
    if public.validate_worksheet_material_pricing_evidence(
      new.organization_id, (v_cell.cell_data->>'value')::numeric, v_metadata
    ) is not true then
      raise exception 'worksheet_material_pricing:invalid_binding_evidence:%', v_cell.cell_address using errcode = '42501';
    end if;

    if v_version = 1 then
      if (v_cell.cell_data->>'value')::numeric is distinct from v_price.unit_cost
        or (v_metadata #>> '{snapshot,unitCost}')::numeric is distinct from v_price.unit_cost
        or v_metadata #>> '{snapshot,unit}' is distinct from v_price.unit
        or upper(v_metadata #>> '{snapshot,currency}') is distinct from upper(v_price.currency)
        or (v_metadata #>> '{snapshot,priceEffectiveFrom}')::timestamptz is distinct from v_price.effective_from then
        raise exception 'worksheet_material_pricing:invalid_binding_evidence:%', v_cell.cell_address using errcode = '42501';
      end if;
    else
      v_conversion := null;
      if v_conversion_id is not null then
        select * into v_conversion from public.organization_material_supplier_product_unit_conversions conversion
        where conversion.organization_id = new.organization_id and conversion.id = v_conversion_id
          and conversion.supplier_product_id = v_product.id
          and conversion.effective_from <= v_evaluated_at
          and (conversion.effective_to is null or conversion.effective_to > v_evaluated_at)
          and conversion.source in ('user_confirmed_ai','user_confirmed_manual');
        if v_conversion.id is null then
          raise exception 'worksheet_material_pricing:invalid_conversion_evidence:%', v_cell.cell_address using errcode = '42501';
        end if;
      end if;
      v_derived := public.derive_material_estimating_price(
        v_price.id, v_price.unit_cost, v_price.unit, v_price.currency, v_price.source_tax_basis,
        v_price.source_tax_rate, v_price.tax_jurisdiction_code, v_price.comparison_tax_basis,
        v_price.comparison_tax_rate, v_price.tax_policy_snapshot, v_price.effective_from,
        v_material.default_unit, v_organization_currency, v_evaluated_at,
        v_conversion.id, v_conversion.supplier_quantity, v_conversion.supplier_unit,
        v_conversion.material_quantity, v_conversion.material_unit, v_conversion.source,
        v_conversion.contract_version, v_conversion.effective_from, v_conversion.confirmed_at
      );
	      if v_derived #>> '{estimatingPricing,status}' <> 'available'
	        or ((v_derived #>> '{estimatingPricing,derivationKind}') = 'direct_unit_match'
	          and v_metadata->'conversion' is distinct from 'null'::jsonb)
        or abs((v_cell.cell_data->>'value')::numeric - (v_derived #>> '{estimatingPricing,unitCost}')::numeric) > 0.0000000001
        or abs((v_metadata #>> '{estimatingPricing,unitCost}')::numeric - (v_derived #>> '{estimatingPricing,unitCost}')::numeric) > 0.0000000001
        or abs((v_metadata #>> '{estimatingPricing,normalizedSourceUnitCost}')::numeric - (v_derived #>> '{estimatingPricing,normalizedSourceUnitCost}')::numeric) > 0.0000000001
        or v_metadata #>> '{estimatingPricing,unit}' is distinct from v_derived #>> '{estimatingPricing,unit}'
        or v_metadata #>> '{estimatingPricing,currency}' is distinct from v_derived #>> '{estimatingPricing,currency}'
        or v_metadata #>> '{estimatingPricing,taxBasis}' is distinct from v_derived #>> '{estimatingPricing,taxBasis}'
        or v_metadata #>> '{estimatingPricing,derivationKind}' is distinct from v_derived #>> '{estimatingPricing,derivationKind}'
        or v_metadata #>> '{estimatingPricing,calculationVersion}' is distinct from 'material_estimating_price_v1'
        or (v_metadata #>> '{sourcePricing,unitCost}')::numeric is distinct from v_price.unit_cost
        or v_metadata #>> '{sourcePricing,unit}' is distinct from v_price.unit
        or upper(v_metadata #>> '{sourcePricing,currency}') is distinct from upper(v_price.currency)
        or v_metadata #>> '{sourcePricing,sourceTaxBasis}' is distinct from v_price.source_tax_basis
        or (v_metadata #>> '{sourcePricing,sourceTaxRate}')::numeric is distinct from v_price.source_tax_rate
        or v_metadata #>> '{sourcePricing,taxJurisdictionCode}' is distinct from v_price.tax_jurisdiction_code
        or v_metadata #>> '{sourcePricing,comparisonTaxBasis}' is distinct from v_price.comparison_tax_basis
        or (v_metadata #>> '{sourcePricing,comparisonTaxRate}')::numeric is distinct from v_price.comparison_tax_rate
        or (v_metadata #>> '{sourcePricing,priceEffectiveFrom}')::timestamptz is distinct from v_price.effective_from
        or (v_conversion_id is not null and (
          (v_metadata #>> '{conversion,supplierQuantity}')::numeric is distinct from v_conversion.supplier_quantity
          or v_metadata #>> '{conversion,supplierUnit}' is distinct from v_conversion.supplier_unit
          or (v_metadata #>> '{conversion,materialQuantity}')::numeric is distinct from v_conversion.material_quantity
          or v_metadata #>> '{conversion,materialUnit}' is distinct from v_conversion.material_unit
          or v_metadata #>> '{conversion,confirmationSource}' is distinct from v_conversion.source
          or v_metadata #>> '{conversion,contractVersion}' is distinct from v_conversion.contract_version
          or (v_metadata #>> '{conversion,effectiveFrom}')::timestamptz is distinct from v_conversion.effective_from
          or (v_metadata #>> '{conversion,confirmedAt}')::timestamptz is distinct from v_conversion.confirmed_at
        )) then
        raise exception 'worksheet_material_pricing:invalid_estimating_evidence:%', v_cell.cell_address using errcode = '42501';
      end if;
    end if;
  end loop;

  update public.worksheet_material_price_bindings binding
  set binding_state = case
      when exists (select 1 from jsonb_each(v_cells) cell where cell.key = binding.current_cell_address
        and cell.value #>> '{metadata,materialPricing,bindingId}' is not null) then 'replaced'
      when (v_cells -> binding.current_cell_address) is null then 'removed' else 'detached' end,
    replaced_by_binding_id = (select (cell.value #>> '{metadata,materialPricing,bindingId}')::uuid
      from jsonb_each(v_cells) cell where cell.key = binding.current_cell_address
        and cell.value #>> '{metadata,materialPricing,bindingId}' is not null limit 1),
    state_changed_at = statement_timestamp()
  where binding.organization_id = new.organization_id and binding.workbook_id = new.workbook_id
    and binding.sheet_id = new.id and binding.binding_state = 'active'
    and not exists (select 1 from jsonb_each(v_cells) cell
      where cell.value #>> '{metadata,materialPricing,bindingId}' = binding.id::text);

  insert into public.worksheet_material_price_bindings (
    id, organization_id, workbook_id, sheet_id, current_cell_address, insertion_cell_address,
    organization_material_id, supplier_id, supplier_product_id, supplier_price_id,
    inserted_unit_cost, unit_snapshot, currency_snapshot, source_tax_basis_snapshot,
    source_tax_rate_snapshot, tax_jurisdiction_code_snapshot, material_name_snapshot,
    supplier_name_snapshot, supplier_product_description_snapshot, supplier_sku_snapshot,
    price_effective_from, effective_price_evaluated_at, inserted_by, inserted_at,
    binding_state, state_changed_at, provenance_version, pricing_derivation_kind,
    worksheet_rate_snapshot, worksheet_unit_snapshot, normalized_source_unit_cost_snapshot,
    comparison_tax_basis_snapshot, comparison_tax_rate_snapshot, calculation_version,
    unit_conversion_id, conversion_supplier_quantity_snapshot, conversion_supplier_unit_snapshot,
    conversion_material_quantity_snapshot, conversion_material_unit_snapshot,
    conversion_contract_version_snapshot, conversion_source_snapshot,
    conversion_effective_from_snapshot, conversion_confirmed_at_snapshot
  )
  select
    (metadata->>'bindingId')::uuid, new.organization_id, new.workbook_id, new.id,
    cell_address, cell_address, (metadata->>'organizationMaterialId')::uuid,
    (metadata->>'supplierId')::uuid, (metadata->>'supplierProductId')::uuid,
    coalesce(metadata->>'supplierPriceId', metadata #>> '{sourcePricing,supplierPriceId}')::uuid,
    coalesce(metadata #>> '{snapshot,unitCost}', metadata #>> '{sourcePricing,unitCost}')::numeric,
    coalesce(metadata #>> '{snapshot,unit}', metadata #>> '{sourcePricing,unit}'),
    coalesce(metadata #>> '{snapshot,currency}', metadata #>> '{sourcePricing,currency}'),
    coalesce(metadata #>> '{snapshot,sourceTaxBasis}', metadata #>> '{sourcePricing,sourceTaxBasis}'),
    coalesce(metadata #>> '{snapshot,sourceTaxRate}', metadata #>> '{sourcePricing,sourceTaxRate}')::numeric,
    coalesce(metadata #>> '{snapshot,taxJurisdictionCode}', metadata #>> '{sourcePricing,taxJurisdictionCode}'),
    coalesce(metadata #>> '{snapshot,materialName}', metadata #>> '{labels,materialName}'),
    coalesce(metadata #>> '{snapshot,supplierName}', metadata #>> '{labels,supplierName}'),
    coalesce(metadata #>> '{snapshot,supplierProductDescription}', metadata #>> '{labels,supplierProductDescription}'),
    coalesce(metadata #>> '{snapshot,supplierSku}', metadata #>> '{labels,supplierSku}'),
    coalesce(metadata #>> '{snapshot,priceEffectiveFrom}', metadata #>> '{sourcePricing,priceEffectiveFrom}')::timestamptz,
    coalesce(metadata #>> '{snapshot,evaluatedAt}', metadata #>> '{estimatingPricing,evaluatedAt}')::timestamptz,
    v_actor, statement_timestamp(), 'active', statement_timestamp(), (metadata->>'version')::smallint,
    metadata #>> '{estimatingPricing,derivationKind}', (metadata #>> '{estimatingPricing,unitCost}')::numeric,
    metadata #>> '{estimatingPricing,unit}', (metadata #>> '{estimatingPricing,normalizedSourceUnitCost}')::numeric,
    metadata #>> '{sourcePricing,comparisonTaxBasis}', (metadata #>> '{sourcePricing,comparisonTaxRate}')::numeric,
    metadata #>> '{estimatingPricing,calculationVersion}', nullif(metadata #>> '{conversion,conversionId}', '')::uuid,
    (metadata #>> '{conversion,supplierQuantity}')::numeric, metadata #>> '{conversion,supplierUnit}',
    (metadata #>> '{conversion,materialQuantity}')::numeric, metadata #>> '{conversion,materialUnit}',
    metadata #>> '{conversion,contractVersion}', metadata #>> '{conversion,confirmationSource}',
    (metadata #>> '{conversion,effectiveFrom}')::timestamptz, (metadata #>> '{conversion,confirmedAt}')::timestamptz
  from (select entry.key as cell_address, entry.value #> '{metadata,materialPricing}' as metadata
    from jsonb_each(v_cells) entry where entry.value #> '{metadata,materialPricing}' is not null) cells
  on conflict (id) do update set current_cell_address = excluded.current_cell_address,
    binding_state = 'active', replaced_by_binding_id = null, state_changed_at = statement_timestamp();
  return new;
end;
$$;

create or replace function public.validate_worksheet_material_pricing_evidence(
  p_organization_id uuid,
  p_cell_value numeric,
  p_metadata jsonb
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_version integer;
  v_material public.organization_materials%rowtype;
  v_supplier public.organization_suppliers%rowtype;
  v_product public.organization_material_supplier_products%rowtype;
  v_price public.organization_material_supplier_prices%rowtype;
  v_conversion public.organization_material_supplier_product_unit_conversions%rowtype;
  v_evaluated_at timestamptz;
  v_derived jsonb;
  v_currency text;
begin
  v_version := (p_metadata->>'version')::integer;
  select * into v_material from public.organization_materials
    where organization_id = p_organization_id and id = (p_metadata->>'organizationMaterialId')::uuid;
  select * into v_supplier from public.organization_suppliers
    where organization_id = p_organization_id and id = (p_metadata->>'supplierId')::uuid;
  select * into v_product from public.organization_material_supplier_products
    where organization_id = p_organization_id and id = (p_metadata->>'supplierProductId')::uuid;
  if v_version = 1 then
    v_evaluated_at := (p_metadata #>> '{snapshot,evaluatedAt}')::timestamptz;
    select * into v_price from public.organization_material_supplier_prices
      where organization_id = p_organization_id and id = (p_metadata->>'supplierPriceId')::uuid;
  elsif v_version = 2 then
    v_evaluated_at := (p_metadata #>> '{estimatingPricing,evaluatedAt}')::timestamptz;
    select * into v_price from public.organization_material_supplier_prices
      where organization_id = p_organization_id and id = (p_metadata #>> '{sourcePricing,supplierPriceId}')::uuid;
  else return false; end if;
  if v_material.id is null or v_supplier.id is null or v_product.id is null or v_price.id is null
    or v_product.material_id <> v_material.id or v_product.supplier_id <> v_supplier.id
    or v_price.supplier_product_id <> v_product.id or v_price.material_id <> v_material.id
    or v_price.supplier_id <> v_supplier.id
    or not exists (select 1 from public.resolve_material_supplier_product_prices(
      p_organization_id, v_evaluated_at, array[v_product.id]
    ) resolved where resolved.price_id = v_price.id) then return false; end if;
  if v_version = 1 then
    return p_cell_value = v_price.unit_cost
      and (p_metadata #>> '{snapshot,unitCost}')::numeric = v_price.unit_cost
      and p_metadata #>> '{snapshot,unit}' = v_price.unit
      and upper(p_metadata #>> '{snapshot,currency}') = upper(v_price.currency);
  end if;
  if p_metadata #>> '{conversion,conversionId}' is not null then
    select * into v_conversion from public.organization_material_supplier_product_unit_conversions conversion
    where conversion.organization_id = p_organization_id
      and conversion.id = (p_metadata #>> '{conversion,conversionId}')::uuid
      and conversion.supplier_product_id = v_product.id
      and conversion.effective_from <= v_evaluated_at
      and (conversion.effective_to is null or conversion.effective_to > v_evaluated_at)
      and conversion.source in ('user_confirmed_ai','user_confirmed_manual');
    if v_conversion.id is null then return false; end if;
  end if;
  select public.resolve_material_estimating_currency(to_jsonb(organization)) into v_currency
    from public.organizations organization where organization.id = p_organization_id;
  v_derived := public.derive_material_estimating_price(
    v_price.id, v_price.unit_cost, v_price.unit, v_price.currency, v_price.source_tax_basis,
    v_price.source_tax_rate, v_price.tax_jurisdiction_code, v_price.comparison_tax_basis,
    v_price.comparison_tax_rate, v_price.tax_policy_snapshot, v_price.effective_from,
    v_material.default_unit, v_currency, v_evaluated_at,
    v_conversion.id, v_conversion.supplier_quantity, v_conversion.supplier_unit,
    v_conversion.material_quantity, v_conversion.material_unit, v_conversion.source,
    v_conversion.contract_version, v_conversion.effective_from, v_conversion.confirmed_at
  );
  return v_derived #>> '{estimatingPricing,status}' = 'available'
    and abs(p_cell_value - (v_derived #>> '{estimatingPricing,unitCost}')::numeric) <= 0.0000000001
    and abs((p_metadata #>> '{estimatingPricing,unitCost}')::numeric - (v_derived #>> '{estimatingPricing,unitCost}')::numeric) <= 0.0000000001
    and abs((p_metadata #>> '{estimatingPricing,normalizedSourceUnitCost}')::numeric - (v_derived #>> '{estimatingPricing,normalizedSourceUnitCost}')::numeric) <= 0.0000000001
    and p_metadata #>> '{estimatingPricing,derivationKind}' = v_derived #>> '{estimatingPricing,derivationKind}'
    and p_metadata #>> '{estimatingPricing,unit}' = v_material.default_unit
    and p_metadata #>> '{estimatingPricing,currency}' = v_derived #>> '{estimatingPricing,currency}'
    and p_metadata #>> '{estimatingPricing,taxBasis}' = v_derived #>> '{estimatingPricing,taxBasis}'
    and p_metadata #>> '{estimatingPricing,calculationVersion}' = 'material_estimating_price_v1'
    and (p_metadata #>> '{sourcePricing,unitCost}')::numeric = v_price.unit_cost
    and p_metadata #>> '{sourcePricing,unit}' = v_price.unit
    and upper(p_metadata #>> '{sourcePricing,currency}') = upper(v_price.currency)
    and p_metadata #>> '{sourcePricing,sourceTaxBasis}' = v_price.source_tax_basis
    and (p_metadata #>> '{sourcePricing,sourceTaxRate}')::numeric is not distinct from v_price.source_tax_rate
    and p_metadata #>> '{sourcePricing,taxJurisdictionCode}' is not distinct from v_price.tax_jurisdiction_code
    and p_metadata #>> '{sourcePricing,comparisonTaxBasis}' is not distinct from v_price.comparison_tax_basis
    and (p_metadata #>> '{sourcePricing,comparisonTaxRate}')::numeric is not distinct from v_price.comparison_tax_rate
    and (p_metadata #>> '{sourcePricing,priceEffectiveFrom}')::timestamptz is not distinct from v_price.effective_from
    and ((v_conversion.id is null and p_metadata->'conversion' = 'null'::jsonb) or (
      (p_metadata #>> '{conversion,conversionId}')::uuid = v_conversion.id
      and (p_metadata #>> '{conversion,supplierQuantity}')::numeric = v_conversion.supplier_quantity
      and p_metadata #>> '{conversion,supplierUnit}' = v_conversion.supplier_unit
      and (p_metadata #>> '{conversion,materialQuantity}')::numeric = v_conversion.material_quantity
      and p_metadata #>> '{conversion,materialUnit}' = v_conversion.material_unit
      and p_metadata #>> '{conversion,confirmationSource}' = v_conversion.source
      and p_metadata #>> '{conversion,contractVersion}' = v_conversion.contract_version
      and (p_metadata #>> '{conversion,effectiveFrom}')::timestamptz = v_conversion.effective_from
      and (p_metadata #>> '{conversion,confirmedAt}')::timestamptz = v_conversion.confirmed_at
    ));
exception when others then return false;
end;
$$;

revoke all on function public.validate_worksheet_material_pricing_evidence(uuid,numeric,jsonb) from public, anon, authenticated;

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
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_evaluated_at timestamptz := statement_timestamp();
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_org_currency text;
  v_result jsonb;
begin
  select * into v_workbook from public.opportunity_pricing_worksheets workbook
    where workbook.id = p_workbook_id and workbook.archived_at is null;
  if v_workbook.id is null or not public.is_member_of_organization(v_workbook.organization_id) then
    raise exception 'pricing_material_review:invalid_workbook_scope' using errcode = '42501';
  end if;
  if not public.has_org_permission(v_workbook.organization_id, 'materials.view') then
    raise exception 'pricing_material_review:materials_view_permission_required' using errcode = '42501';
  end if;
  if p_require_write and not public.can_write_pricing_workbook_owner(
    v_workbook.organization_id, v_workbook.opportunity_id, v_workbook.project_id,
    v_workbook.quote_id, v_workbook.variation_id
  ) then raise exception 'pricing_material_review:workbook_write_permission_required' using errcode = '42501'; end if;
  if p_sheet_id is not null and not exists (select 1 from public.opportunity_pricing_workbook_sheets sheet
    where sheet.organization_id = v_workbook.organization_id and sheet.workbook_id = v_workbook.id and sheet.id = p_sheet_id)
  then raise exception 'pricing_material_review:invalid_sheet_scope' using errcode = '42501'; end if;
  select public.resolve_material_estimating_currency(to_jsonb(organization)) into v_org_currency
    from public.organizations organization where organization.id = v_workbook.organization_id;

  if p_local_bindings is not null then
    if p_active_sheet_id is null or jsonb_typeof(p_local_bindings) <> 'array'
      or not exists (select 1 from public.opportunity_pricing_workbook_sheets sheet
        where sheet.organization_id = v_workbook.organization_id and sheet.workbook_id = v_workbook.id and sheet.id = p_active_sheet_id)
    then raise exception 'pricing_material_review:invalid_overlay_scope' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_local_bindings) entry group by entry->>'bindingId' having count(*) > 1)
      or exists (select 1 from jsonb_array_elements(p_local_bindings) entry group by entry->>'cellAddress' having count(*) > 1)
    then raise exception 'pricing_material_review:duplicate_overlay_binding' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_local_bindings) entry
      where jsonb_typeof(entry->'value') <> 'number' or entry->>'type' <> 'number'
        or coalesce(jsonb_typeof(entry->'formula'), 'null') <> 'null'
        or coalesce(entry->>'cellAddress','') !~ '^[A-Z]+[1-9][0-9]*$'
        or entry->>'bindingId' is distinct from entry #>> '{provenance,bindingId}'
	        or public.validate_worksheet_material_pricing_evidence(
	          v_workbook.organization_id, (entry->>'value')::numeric, entry->'provenance'
	        ) is not true
        or exists (select 1 from public.worksheet_material_price_bindings existing
          where existing.id = (entry->>'bindingId')::uuid
            and (existing.organization_id <> v_workbook.organization_id
              or existing.workbook_id <> v_workbook.id or existing.sheet_id <> p_active_sheet_id)))
    then raise exception 'pricing_material_review:forged_overlay_binding' using errcode = '42501'; end if;
  elsif p_active_sheet_id is not null then
    raise exception 'pricing_material_review:overlay_required_for_active_sheet' using errcode = '22023';
  end if;

  with source_bindings as materialized (
    select binding.id as binding_id, binding.sheet_id, sheet.name as sheet_name,
      binding.current_cell_address as cell_address, binding.organization_material_id as material_id,
      binding.supplier_id, binding.supplier_product_id, binding.supplier_price_id,
      binding.inserted_unit_cost, binding.unit_snapshot, binding.currency_snapshot,
      binding.source_tax_basis_snapshot, binding.source_tax_rate_snapshot,
      binding.tax_jurisdiction_code_snapshot, binding.material_name_snapshot,
      binding.supplier_name_snapshot, binding.supplier_product_description_snapshot,
      binding.supplier_sku_snapshot, binding.price_effective_from,
      binding.effective_price_evaluated_at, binding.provenance_version,
      binding.pricing_derivation_kind, binding.worksheet_rate_snapshot,
      binding.worksheet_unit_snapshot, binding.normalized_source_unit_cost_snapshot,
      binding.comparison_tax_basis_snapshot, binding.comparison_tax_rate_snapshot,
      binding.calculation_version, binding.unit_conversion_id,
      binding.conversion_supplier_quantity_snapshot, binding.conversion_supplier_unit_snapshot,
      binding.conversion_material_quantity_snapshot, binding.conversion_material_unit_snapshot,
      binding.conversion_contract_version_snapshot, binding.conversion_source_snapshot,
      binding.conversion_effective_from_snapshot, binding.conversion_confirmed_at_snapshot
    from public.worksheet_material_price_bindings binding
    join public.opportunity_pricing_workbook_sheets sheet on sheet.organization_id = binding.organization_id
      and sheet.workbook_id = binding.workbook_id and sheet.id = binding.sheet_id
    where binding.organization_id = v_workbook.organization_id and binding.workbook_id = v_workbook.id
      and binding.binding_state = 'active' and (p_local_bindings is null or binding.sheet_id <> p_active_sheet_id)
    union all
    select (entry->>'bindingId')::uuid, p_active_sheet_id, sheet.name, entry->>'cellAddress',
      (entry #>> '{provenance,organizationMaterialId}')::uuid,
      (entry #>> '{provenance,supplierId}')::uuid, (entry #>> '{provenance,supplierProductId}')::uuid,
      coalesce(entry #>> '{provenance,supplierPriceId}', entry #>> '{provenance,sourcePricing,supplierPriceId}')::uuid,
      coalesce(entry #>> '{provenance,snapshot,unitCost}', entry #>> '{provenance,sourcePricing,unitCost}')::numeric,
      coalesce(entry #>> '{provenance,snapshot,unit}', entry #>> '{provenance,sourcePricing,unit}'),
      coalesce(entry #>> '{provenance,snapshot,currency}', entry #>> '{provenance,sourcePricing,currency}'),
      coalesce(entry #>> '{provenance,snapshot,sourceTaxBasis}', entry #>> '{provenance,sourcePricing,sourceTaxBasis}'),
      coalesce(entry #>> '{provenance,snapshot,sourceTaxRate}', entry #>> '{provenance,sourcePricing,sourceTaxRate}')::numeric,
      coalesce(entry #>> '{provenance,snapshot,taxJurisdictionCode}', entry #>> '{provenance,sourcePricing,taxJurisdictionCode}'),
      coalesce(entry #>> '{provenance,snapshot,materialName}', entry #>> '{provenance,labels,materialName}'),
      coalesce(entry #>> '{provenance,snapshot,supplierName}', entry #>> '{provenance,labels,supplierName}'),
      coalesce(entry #>> '{provenance,snapshot,supplierProductDescription}', entry #>> '{provenance,labels,supplierProductDescription}'),
      coalesce(entry #>> '{provenance,snapshot,supplierSku}', entry #>> '{provenance,labels,supplierSku}'),
      coalesce(entry #>> '{provenance,snapshot,priceEffectiveFrom}', entry #>> '{provenance,sourcePricing,priceEffectiveFrom}')::timestamptz,
      coalesce(entry #>> '{provenance,snapshot,evaluatedAt}', entry #>> '{provenance,estimatingPricing,evaluatedAt}')::timestamptz,
      (entry #>> '{provenance,version}')::smallint, entry #>> '{provenance,estimatingPricing,derivationKind}',
      (entry #>> '{provenance,estimatingPricing,unitCost}')::numeric, entry #>> '{provenance,estimatingPricing,unit}',
      (entry #>> '{provenance,estimatingPricing,normalizedSourceUnitCost}')::numeric,
      entry #>> '{provenance,sourcePricing,comparisonTaxBasis}',
      (entry #>> '{provenance,sourcePricing,comparisonTaxRate}')::numeric,
      entry #>> '{provenance,estimatingPricing,calculationVersion}',
      nullif(entry #>> '{provenance,conversion,conversionId}', '')::uuid,
      (entry #>> '{provenance,conversion,supplierQuantity}')::numeric,
      entry #>> '{provenance,conversion,supplierUnit}',
      (entry #>> '{provenance,conversion,materialQuantity}')::numeric,
      entry #>> '{provenance,conversion,materialUnit}', entry #>> '{provenance,conversion,contractVersion}',
      entry #>> '{provenance,conversion,confirmationSource}',
      (entry #>> '{provenance,conversion,effectiveFrom}')::timestamptz,
      (entry #>> '{provenance,conversion,confirmedAt}')::timestamptz
    from jsonb_array_elements(coalesce(p_local_bindings, '[]'::jsonb)) entry
    join public.opportunity_pricing_workbook_sheets sheet on sheet.organization_id = v_workbook.organization_id
      and sheet.workbook_id = v_workbook.id and sheet.id = p_active_sheet_id
  ), scoped as materialized (
    select * from source_bindings source where (p_sheet_id is null or source.sheet_id = p_sheet_id)
      and (p_target_binding_id is null or source.binding_id = p_target_binding_id)
  ), product_ids as materialized (
    select array_agg(distinct supplier_product_id) ids from scoped
  ), effective_prices as materialized (
    select resolved.supplier_product_id, resolved.price_id from product_ids products
    cross join lateral public.resolve_material_supplier_product_prices(
      v_workbook.organization_id, v_evaluated_at, products.ids
    ) resolved where coalesce(cardinality(products.ids),0) > 0
  ), enriched as materialized (
    select scoped.*, material.id as live_material_id, material.default_unit as current_material_unit,
      material.is_active as material_is_active, material.archived_at as material_archived_at,
      supplier.id as live_supplier_id, supplier.is_active as supplier_is_active,
      product.id as live_product_id, product.is_active as product_is_active, product.archived_at as product_archived_at,
      price.id as current_price_id, price.unit_cost as current_unit_cost, price.unit as current_unit,
      price.currency as current_currency, price.source_tax_basis as current_tax_basis,
      price.source_tax_rate as current_tax_rate, price.tax_jurisdiction_code as current_tax_jurisdiction,
      price.comparison_tax_basis as current_comparison_tax_basis,
      price.comparison_tax_rate as current_comparison_tax_rate, price.tax_policy_snapshot as current_tax_policy_snapshot,
      price.effective_from as current_effective_from,
      conversion.id as current_conversion_id, conversion.supplier_quantity as current_conversion_supplier_quantity,
      conversion.supplier_unit as current_conversion_supplier_unit,
      conversion.material_quantity as current_conversion_material_quantity,
      conversion.material_unit as current_conversion_material_unit,
      conversion.source as current_conversion_source, conversion.contract_version as current_conversion_contract_version,
      conversion.effective_from as current_conversion_effective_from,
      conversion.confirmed_at as current_conversion_confirmed_at
    from scoped
    left join public.organization_materials material on material.organization_id = v_workbook.organization_id and material.id = scoped.material_id
    left join public.organization_suppliers supplier on supplier.organization_id = v_workbook.organization_id and supplier.id = scoped.supplier_id
    left join public.organization_material_supplier_products product on product.organization_id = v_workbook.organization_id and product.id = scoped.supplier_product_id
    left join effective_prices effective on effective.supplier_product_id = scoped.supplier_product_id
    left join public.organization_material_supplier_prices price on price.organization_id = v_workbook.organization_id and price.id = effective.price_id
    left join public.organization_material_supplier_product_unit_conversions conversion
      on conversion.organization_id = v_workbook.organization_id and conversion.supplier_product_id = scoped.supplier_product_id
      and public.normalize_material_estimating_unit(conversion.supplier_unit) = public.normalize_material_estimating_unit(price.unit)
      and public.normalize_material_estimating_unit(conversion.material_unit) = public.normalize_material_estimating_unit(material.default_unit)
      and conversion.effective_from <= v_evaluated_at and (conversion.effective_to is null or conversion.effective_to > v_evaluated_at)
  ), derived as materialized (
    select enriched.*, case when current_price_id is null then null else public.derive_material_estimating_price(
      current_price_id, current_unit_cost, current_unit, current_currency, current_tax_basis,
      current_tax_rate, current_tax_jurisdiction, current_comparison_tax_basis, current_comparison_tax_rate,
      current_tax_policy_snapshot, current_effective_from, current_material_unit, v_org_currency, v_evaluated_at,
      current_conversion_id, current_conversion_supplier_quantity, current_conversion_supplier_unit,
      current_conversion_material_quantity, current_conversion_material_unit, current_conversion_source,
      current_conversion_contract_version, current_conversion_effective_from, current_conversion_confirmed_at
    ) end current_pricing,
    case when provenance_version = 2 then jsonb_build_object(
      'sourcePricing', jsonb_build_object('supplierPriceId', supplier_price_id, 'unitCost', inserted_unit_cost,
        'unit', unit_snapshot, 'currency', currency_snapshot, 'sourceTaxBasis', source_tax_basis_snapshot,
        'sourceTaxRate', source_tax_rate_snapshot, 'taxJurisdictionCode', tax_jurisdiction_code_snapshot,
        'comparisonTaxBasis', comparison_tax_basis_snapshot, 'comparisonTaxRate', comparison_tax_rate_snapshot,
        'effectiveFrom', price_effective_from),
      'estimatingPricing', jsonb_build_object('status','available','derivationKind',pricing_derivation_kind,
        'normalizedSourceUnitCost',normalized_source_unit_cost_snapshot,'unitCost',worksheet_rate_snapshot,
        'unit',worksheet_unit_snapshot,'currency',currency_snapshot,'taxBasis',comparison_tax_basis_snapshot,
        'calculationVersion',calculation_version,'evaluatedAt',effective_price_evaluated_at),
      'conversion', case when unit_conversion_id is null then null else jsonb_build_object(
        'conversionId',unit_conversion_id,'supplierQuantity',conversion_supplier_quantity_snapshot,
        'supplierUnit',conversion_supplier_unit_snapshot,'materialQuantity',conversion_material_quantity_snapshot,
        'materialUnit',conversion_material_unit_snapshot,'confirmationSource',conversion_source_snapshot,
        'contractVersion',conversion_contract_version_snapshot,'effectiveFrom',conversion_effective_from_snapshot,
        'confirmedAt',conversion_confirmed_at_snapshot) end
    ) else null end historical_pricing
    from enriched
  ), classified as materialized (
    select derived.*,
      case
        when live_material_id is null or live_supplier_id is null or live_product_id is null then 'source_unavailable'
        when not material_is_active or material_archived_at is not null or not supplier_is_active
          or not product_is_active or product_archived_at is not null then 'source_inactive'
        when current_price_id is null then 'no_current_price'
        when provenance_version = 1 and public.normalize_material_estimating_unit(unit_snapshot)
          <> public.normalize_material_estimating_unit(current_material_unit)
          and current_pricing #>> '{estimatingPricing,status}' = 'available' then 'estimating_unit_mismatch'
        when provenance_version = 1 and current_price_id = supplier_price_id then 'current'
        when provenance_version = 1 and (public.normalize_material_estimating_unit(unit_snapshot)
          <> public.normalize_material_estimating_unit(current_unit) or upper(currency_snapshot) <> upper(current_currency)
          or source_tax_basis_snapshot <> current_tax_basis or source_tax_rate_snapshot is distinct from current_tax_rate
          or tax_jurisdiction_code_snapshot is distinct from current_tax_jurisdiction) then 'commercial_terms_changed'
        when provenance_version = 1 and inserted_unit_cost = current_unit_cost then 'version_changed_same_terms'
        when provenance_version = 1 then 'price_changed'
        when public.normalize_material_estimating_unit(worksheet_unit_snapshot)
          <> public.normalize_material_estimating_unit(current_material_unit) then 'commercial_terms_changed'
        when current_pricing #>> '{estimatingPricing,status}' = 'conversion_required' then 'conversion_unavailable'
        when current_pricing #>> '{estimatingPricing,status}' <> 'available' then 'commercial_terms_changed'
        when public.normalize_material_estimating_unit(unit_snapshot) <> public.normalize_material_estimating_unit(current_unit)
          or upper(currency_snapshot) <> upper(current_currency) or source_tax_basis_snapshot <> current_tax_basis
          or source_tax_rate_snapshot is distinct from current_tax_rate
          or tax_jurisdiction_code_snapshot is distinct from current_tax_jurisdiction
          or comparison_tax_basis_snapshot is distinct from current_comparison_tax_basis
          or comparison_tax_rate_snapshot is distinct from current_comparison_tax_rate then 'commercial_terms_changed'
        when inserted_unit_cost = current_unit_cost and (
          (pricing_derivation_kind = 'direct_unit_match' and current_pricing #>> '{estimatingPricing,derivationKind}' = 'direct_unit_match')
          or (pricing_derivation_kind = 'confirmed_conversion'
            and conversion_supplier_quantity_snapshot = current_conversion_supplier_quantity
            and public.normalize_material_estimating_unit(conversion_supplier_unit_snapshot) = public.normalize_material_estimating_unit(current_conversion_supplier_unit)
            and conversion_material_quantity_snapshot = current_conversion_material_quantity
            and public.normalize_material_estimating_unit(conversion_material_unit_snapshot) = public.normalize_material_estimating_unit(current_conversion_material_unit))
        ) and abs(worksheet_rate_snapshot - (current_pricing #>> '{estimatingPricing,unitCost}')::numeric) <= 0.0000000001
          then case when current_price_id = supplier_price_id and unit_conversion_id is not distinct from current_conversion_id
            then 'current' else 'version_changed_same_terms' end
        when inserted_unit_cost <> current_unit_cost and (
          (pricing_derivation_kind = 'direct_unit_match' and current_pricing #>> '{estimatingPricing,derivationKind}' = 'direct_unit_match')
          or (conversion_supplier_quantity_snapshot = current_conversion_supplier_quantity
            and public.normalize_material_estimating_unit(conversion_supplier_unit_snapshot) = public.normalize_material_estimating_unit(current_conversion_supplier_unit)
            and conversion_material_quantity_snapshot = current_conversion_material_quantity
            and public.normalize_material_estimating_unit(conversion_material_unit_snapshot) = public.normalize_material_estimating_unit(current_conversion_material_unit))
        ) then 'price_changed'
        when inserted_unit_cost = current_unit_cost then 'conversion_changed'
        else 'price_and_conversion_changed'
      end classification
    from derived
  ), grouped as materialized (
    select supplier_product_id::text || ':' || supplier_price_id::text || ':' || classification as group_key,
      classification, provenance_version, material_id, material_name_snapshot, supplier_id, supplier_name_snapshot,
      supplier_product_id, supplier_product_description_snapshot, supplier_sku_snapshot,
      supplier_price_id, inserted_unit_cost, unit_snapshot, currency_snapshot, source_tax_basis_snapshot,
      source_tax_rate_snapshot, tax_jurisdiction_code_snapshot, price_effective_from, effective_price_evaluated_at,
      current_price_id, current_unit_cost, current_unit, current_currency, current_tax_basis, current_tax_rate,
      current_tax_jurisdiction, current_effective_from, historical_pricing, current_pricing,
      case when classification = 'price_changed' then
        case when provenance_version = 2 then (current_pricing #>> '{estimatingPricing,unitCost}')::numeric - worksheet_rate_snapshot
          else current_unit_cost - inserted_unit_cost end else null end absolute_difference,
      case when classification = 'price_changed' then
        case when provenance_version = 2 and worksheet_rate_snapshot <> 0 then
          (((current_pricing #>> '{estimatingPricing,unitCost}')::numeric - worksheet_rate_snapshot) / worksheet_rate_snapshot) * 100
        when provenance_version = 1 and inserted_unit_cost <> 0 then ((current_unit_cost-inserted_unit_cost)/inserted_unit_cost)*100 else null end
      else null end percentage_difference,
      array_remove(array[
        case when classification = 'commercial_terms_changed' and public.normalize_material_estimating_unit(worksheet_unit_snapshot) <> public.normalize_material_estimating_unit(current_material_unit) then 'estimating_unit' end,
        case when classification in ('conversion_changed','price_and_conversion_changed','conversion_unavailable') then 'conversion' end
      ],null) reason_codes,
      jsonb_agg(jsonb_build_object('bindingId',binding_id,'sheetId',sheet_id,'sheetName',sheet_name,'cellAddress',cell_address)
        order by lower(sheet_name),cell_address,binding_id) targets
    from classified group by classification, provenance_version, material_id, material_name_snapshot, supplier_id,
      supplier_name_snapshot, supplier_product_id, supplier_product_description_snapshot, supplier_sku_snapshot,
      supplier_price_id, inserted_unit_cost, unit_snapshot, currency_snapshot, source_tax_basis_snapshot,
      source_tax_rate_snapshot, tax_jurisdiction_code_snapshot, price_effective_from, effective_price_evaluated_at,
      current_price_id,current_unit_cost,current_unit,current_currency,current_tax_basis,current_tax_rate,
      current_tax_jurisdiction,current_effective_from,historical_pricing,current_pricing,worksheet_rate_snapshot,
      worksheet_unit_snapshot,current_material_unit
  ), visible as materialized (
    select *, count(*) over () visible_total from grouped
    where classification not in ('current','version_changed_same_terms')
    order by case classification when 'price_changed' then 0 when 'estimating_unit_mismatch' then 1 else 2 end,
      lower(material_name_snapshot),lower(supplier_name_snapshot),group_key
  ), paged as materialized (
    select * from visible limit v_page_size offset ((v_page-1)*v_page_size)
  ), summary as (
    select count(*) filter (where classification in ('price_changed','estimating_unit_mismatch'))::integer price_updates,
      count(*) filter (where classification in ('commercial_terms_changed','conversion_changed','price_and_conversion_changed',
        'conversion_unavailable','no_current_price','source_inactive','source_unavailable','invalid_binding'))::integer needs_review,
      count(*) filter (where classification='current')::integer current_count,
      count(*) filter (where classification='version_changed_same_terms')::integer same_terms_count from grouped
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'groupKey',group_key,'classification',classification,'reasonCodes',to_jsonb(reason_codes),
      'provenanceVersion',provenance_version,'materialId',material_id,'materialName',material_name_snapshot,
      'supplierId',supplier_id,'supplierName',supplier_name_snapshot,'supplierProductId',supplier_product_id,
      'supplierProductDescription',supplier_product_description_snapshot,'supplierSku',supplier_sku_snapshot,
      'historicalPrice',jsonb_build_object('id',supplier_price_id,'unitCost',inserted_unit_cost,'unit',unit_snapshot,
        'currency',currency_snapshot,'sourceTaxBasis',source_tax_basis_snapshot,'sourceTaxRate',source_tax_rate_snapshot,
        'taxJurisdictionCode',tax_jurisdiction_code_snapshot,'effectiveFrom',price_effective_from,'evaluatedAt',effective_price_evaluated_at),
      'currentPrice',case when current_price_id is null then null else jsonb_build_object('id',current_price_id,
        'unitCost',current_unit_cost,'unit',current_unit,'currency',current_currency,'sourceTaxBasis',current_tax_basis,
        'sourceTaxRate',current_tax_rate,'taxJurisdictionCode',current_tax_jurisdiction,
        'effectiveFrom',current_effective_from,'evaluatedAt',v_evaluated_at) end,
      'historicalPricing',historical_pricing,'currentPricing',current_pricing,
      'absoluteDifference',absolute_difference,'percentageDifference',percentage_difference,'targets',targets
    ) order by lower(material_name_snapshot),lower(supplier_name_snapshot),group_key) from paged),'[]'::jsonb),
    'summary',jsonb_build_object('priceUpdates',coalesce(summary.price_updates,0),'needsReview',coalesce(summary.needs_review,0),
      'current',coalesce(summary.current_count,0),'versionChangedSameTerms',coalesce(summary.same_terms_count,0)),
    'page',v_page,'pageSize',v_page_size,'total',coalesce((select max(visible_total) from visible),0),
    'hasMore',coalesce((select max(visible_total) from visible),0)>v_page*v_page_size,'evaluatedAt',v_evaluated_at
  ) into v_result from summary;

  if p_target_binding_id is not null then
    if jsonb_array_length(v_result->'items') <> 1
      or v_result #>> '{items,0,classification}' not in ('price_changed','estimating_unit_mismatch')
      or (p_expected_current_price_id is not null and v_result #>> '{items,0,currentPrice,id}' <> p_expected_current_price_id::text)
    then raise exception 'pricing_material_review:stale_update' using errcode = '40001'; end if;
  end if;
  return v_result;
end;
$$;

comment on function public.review_pricing_worksheet_material_prices(uuid,uuid,jsonb,uuid,integer,integer,uuid,uuid,boolean) is
  'Set-oriented V1/V2 Material pricing review with conversion-aware classification and validated dirty-sheet evidence.';

commit;
