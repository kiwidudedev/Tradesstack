begin;

alter table public.opportunity_pricing_worksheets
  add constraint opportunity_pricing_worksheets_organization_id_id_key
  unique (organization_id, id);

alter table public.opportunity_pricing_workbook_sheets
  add constraint opportunity_pricing_workbook_sheets_org_workbook_id_key
  unique (organization_id, workbook_id, id);

create table public.worksheet_material_price_bindings (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  workbook_id uuid not null,
  sheet_id uuid not null,
  current_cell_address text not null,
  insertion_cell_address text not null,
  organization_material_id uuid not null,
  supplier_id uuid not null,
  supplier_product_id uuid not null,
  supplier_price_id uuid not null,
  inserted_unit_cost numeric(14,4) not null,
  unit_snapshot text not null,
  currency_snapshot text not null,
  source_tax_basis_snapshot text not null,
  source_tax_rate_snapshot numeric(12,8) null,
  tax_jurisdiction_code_snapshot text null,
  material_name_snapshot text not null,
  supplier_name_snapshot text not null,
  supplier_product_description_snapshot text null,
  supplier_sku_snapshot text null,
  price_effective_from timestamptz not null,
  effective_price_evaluated_at timestamptz not null,
  inserted_by uuid null references auth.users (id) on delete set null,
  inserted_at timestamptz not null default statement_timestamp(),
  binding_state text not null default 'active',
  state_changed_at timestamptz not null default statement_timestamp(),
  replaced_by_binding_id uuid null references public.worksheet_material_price_bindings (id)
    on delete set null deferrable initially deferred,
  constraint worksheet_material_price_bindings_org_workbook_fkey
    foreign key (organization_id, workbook_id)
    references public.opportunity_pricing_worksheets (organization_id, id) on delete cascade,
  constraint worksheet_material_price_bindings_org_sheet_fkey
    foreign key (organization_id, workbook_id, sheet_id)
    references public.opportunity_pricing_workbook_sheets (organization_id, workbook_id, id) on delete cascade,
  constraint worksheet_material_price_bindings_org_material_fkey
    foreign key (organization_id, organization_material_id)
    references public.organization_materials (organization_id, id) on delete restrict,
  constraint worksheet_material_price_bindings_org_supplier_fkey
    foreign key (organization_id, supplier_id)
    references public.organization_suppliers (organization_id, id) on delete restrict,
  constraint worksheet_material_price_bindings_org_product_fkey
    foreign key (organization_id, supplier_product_id)
    references public.organization_material_supplier_products (organization_id, id) on delete restrict,
  constraint worksheet_material_price_bindings_org_price_fkey
    foreign key (organization_id, supplier_price_id)
    references public.organization_material_supplier_prices (organization_id, id) on delete restrict,
  constraint worksheet_material_price_bindings_cell_address_check check (
    current_cell_address ~ '^[A-Z]+[1-9][0-9]*$'
    and insertion_cell_address ~ '^[A-Z]+[1-9][0-9]*$'
  ),
  constraint worksheet_material_price_bindings_state_check check (
    binding_state in ('active', 'replaced', 'detached', 'removed')
  ),
  constraint worksheet_material_price_bindings_unit_cost_check check (inserted_unit_cost >= 0),
  constraint worksheet_material_price_bindings_unit_check check (char_length(btrim(unit_snapshot)) > 0),
  constraint worksheet_material_price_bindings_currency_check check (char_length(btrim(currency_snapshot)) > 0),
  constraint worksheet_material_price_bindings_material_name_check check (char_length(btrim(material_name_snapshot)) > 0),
  constraint worksheet_material_price_bindings_supplier_name_check check (char_length(btrim(supplier_name_snapshot)) > 0),
  constraint worksheet_material_price_bindings_not_self_replaced_check check (replaced_by_binding_id is distinct from id)
);

create unique index worksheet_material_price_bindings_active_cell_key
  on public.worksheet_material_price_bindings (organization_id, workbook_id, sheet_id, current_cell_address)
  where binding_state = 'active';

create index worksheet_material_price_bindings_sheet_state_idx
  on public.worksheet_material_price_bindings (organization_id, workbook_id, sheet_id, binding_state);

create index worksheet_material_price_bindings_supplier_price_idx
  on public.worksheet_material_price_bindings (organization_id, supplier_price_id, inserted_at desc);

create index worksheet_material_price_bindings_supplier_product_idx
  on public.worksheet_material_price_bindings (organization_id, supplier_product_id, inserted_at desc);

comment on table public.worksheet_material_price_bindings is
  'Append-preserving evidence linking a saved pricing worksheet cell to the exact immutable Material Library supplier price version used.';

alter table public.worksheet_material_price_bindings enable row level security;
alter table public.worksheet_material_price_bindings force row level security;

create policy "Members can view worksheet material price bindings"
on public.worksheet_material_price_bindings
for select to authenticated
using (
  public.has_org_permission(organization_id, 'materials.view')
  and exists (
    select 1
    from public.opportunity_pricing_worksheets workbook
    where workbook.id = worksheet_material_price_bindings.workbook_id
      and workbook.organization_id = worksheet_material_price_bindings.organization_id
      and workbook.archived_at is null
  )
);

revoke all on public.worksheet_material_price_bindings from public, anon, authenticated;
grant select on public.worksheet_material_price_bindings to authenticated;

create or replace function public.reject_worksheet_material_price_binding_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.workbook_id is distinct from old.workbook_id
    or new.sheet_id is distinct from old.sheet_id
    or new.insertion_cell_address is distinct from old.insertion_cell_address
    or new.organization_material_id is distinct from old.organization_material_id
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_product_id is distinct from old.supplier_product_id
    or new.supplier_price_id is distinct from old.supplier_price_id
    or new.inserted_unit_cost is distinct from old.inserted_unit_cost
    or new.unit_snapshot is distinct from old.unit_snapshot
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
    or new.inserted_by is distinct from old.inserted_by
    or new.inserted_at is distinct from old.inserted_at then
    raise exception 'worksheet_material_pricing:binding_evidence_is_immutable' using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger worksheet_material_price_bindings_preserve_history
before update on public.worksheet_material_price_bindings
for each row execute function public.reject_worksheet_material_price_binding_history_mutation();

create or replace function public.reconcile_worksheet_material_price_bindings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_cells jsonb := coalesce(new.worksheet_data->'cells', '{}'::jsonb);
  v_cell record;
  v_metadata jsonb;
  v_binding_id uuid;
  v_material_id uuid;
  v_supplier_id uuid;
  v_supplier_product_id uuid;
  v_supplier_price_id uuid;
  v_evaluated_at timestamptz;
  v_workbook public.opportunity_pricing_worksheets%rowtype;
  v_invalid_cell_address text;
begin
  if jsonb_typeof(v_cells) is distinct from 'object' then
    raise exception 'worksheet_material_pricing:cells_must_be_an_object' using errcode = '22023';
  end if;

  if not jsonb_path_exists(v_cells, '$.*.metadata.materialPricing')
    and not exists (
      select 1 from public.worksheet_material_price_bindings binding
      where binding.organization_id = new.organization_id
        and binding.workbook_id = new.workbook_id
        and binding.sheet_id = new.id
        and binding.binding_state = 'active'
    ) then
    return new;
  end if;

  if v_actor is null or new.updated_by is distinct from v_actor then
    raise exception 'worksheet_material_pricing:actor_mismatch' using errcode = '42501';
  end if;
  if not public.has_org_permission(new.organization_id, 'materials.view') then
    raise exception 'worksheet_material_pricing:materials_view_permission_required' using errcode = '42501';
  end if;

  select * into v_workbook
  from public.opportunity_pricing_worksheets workbook
  where workbook.id = new.workbook_id
    and workbook.organization_id = new.organization_id
    and workbook.opportunity_id = new.opportunity_id
    and workbook.archived_at is null;
  if v_workbook.id is null or not public.can_write_pricing_workbook_owner(
    v_workbook.organization_id,
    v_workbook.opportunity_id,
    v_workbook.project_id,
    v_workbook.quote_id,
    v_workbook.variation_id
  ) then
    raise exception 'worksheet_material_pricing:invalid_workbook_scope' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_each(v_cells) cell
    where cell.value #> '{metadata,materialPricing}' is not null
    group by cell.value #>> '{metadata,materialPricing,bindingId}'
    having count(*) > 1
  ) then
    raise exception 'worksheet_material_pricing:duplicate_binding_id' using errcode = '22023';
  end if;

  -- Validate the complete active set before changing any lifecycle state.
  for v_cell in
    select cell.key as cell_address, cell.value as cell_data
    from jsonb_each(v_cells) cell
    where cell.value #> '{metadata,materialPricing}' is not null
  loop
    v_metadata := v_cell.cell_data #> '{metadata,materialPricing}';
    if jsonb_typeof(v_metadata) is distinct from 'object'
      or v_metadata->>'version' is distinct from '1'
      or v_cell.cell_address !~ '^[A-Z]+[1-9][0-9]*$'
      or jsonb_typeof(v_metadata->'snapshot') is distinct from 'object'
      or jsonb_typeof(v_metadata #> '{snapshot,materialName}') is distinct from 'string'
      or jsonb_typeof(v_metadata #> '{snapshot,supplierName}') is distinct from 'string'
      or coalesce(jsonb_typeof(v_metadata #> '{snapshot,supplierProductDescription}'), 'missing') not in ('string', 'null')
      or coalesce(jsonb_typeof(v_metadata #> '{snapshot,supplierSku}'), 'missing') not in ('string', 'null')
      or jsonb_typeof(v_metadata #> '{snapshot,unitCost}') is distinct from 'number'
      or jsonb_typeof(v_metadata #> '{snapshot,unit}') is distinct from 'string'
      or jsonb_typeof(v_metadata #> '{snapshot,currency}') is distinct from 'string'
      or jsonb_typeof(v_metadata #> '{snapshot,sourceTaxBasis}') is distinct from 'string'
      or coalesce(jsonb_typeof(v_metadata #> '{snapshot,sourceTaxRate}'), 'missing') not in ('number', 'null')
      or coalesce(jsonb_typeof(v_metadata #> '{snapshot,taxJurisdictionCode}'), 'missing') not in ('string', 'null')
      or jsonb_typeof(v_metadata #> '{snapshot,priceEffectiveFrom}') is distinct from 'string'
      or jsonb_typeof(v_metadata #> '{snapshot,evaluatedAt}') is distinct from 'string' then
      raise exception 'worksheet_material_pricing:malformed_metadata:%', v_cell.cell_address using errcode = '22023';
    end if;

    begin
      v_binding_id := (v_metadata->>'bindingId')::uuid;
      v_material_id := (v_metadata->>'organizationMaterialId')::uuid;
      v_supplier_id := (v_metadata->>'supplierId')::uuid;
      v_supplier_product_id := (v_metadata->>'supplierProductId')::uuid;
      v_supplier_price_id := (v_metadata->>'supplierPriceId')::uuid;
      v_evaluated_at := (v_metadata #>> '{snapshot,evaluatedAt}')::timestamptz;
    exception when others then
      raise exception 'worksheet_material_pricing:malformed_identifiers:%', v_cell.cell_address using errcode = '22023';
    end;

    if jsonb_typeof(v_cell.cell_data->'value') is distinct from 'number'
      or coalesce(v_cell.cell_data->>'type', '') <> 'number'
      or nullif(v_cell.cell_data->>'formula', '') is not null then
      raise exception 'worksheet_material_pricing:bound_cell_must_be_numeric:%', v_cell.cell_address using errcode = '22023';
    end if;

  end loop;

  with active_cells as (
    select
      cell.key as cell_address,
      cell.value as cell_data,
      cell.value #> '{metadata,materialPricing}' as metadata,
      (cell.value #>> '{metadata,materialPricing,bindingId}')::uuid as binding_id,
      (cell.value #>> '{metadata,materialPricing,organizationMaterialId}')::uuid as material_id,
      (cell.value #>> '{metadata,materialPricing,supplierId}')::uuid as supplier_id,
      (cell.value #>> '{metadata,materialPricing,supplierProductId}')::uuid as supplier_product_id,
      (cell.value #>> '{metadata,materialPricing,supplierPriceId}')::uuid as supplier_price_id,
      (cell.value #>> '{metadata,materialPricing,snapshot,evaluatedAt}')::timestamptz as evaluated_at
    from jsonb_each(v_cells) cell
    where cell.value #> '{metadata,materialPricing}' is not null
  )
  select active.cell_address into v_invalid_cell_address
  from active_cells active
  left join public.organization_materials material
    on material.organization_id = new.organization_id and material.id = active.material_id
  left join public.organization_suppliers supplier
    on supplier.organization_id = new.organization_id and supplier.id = active.supplier_id
  left join public.organization_material_supplier_products product
    on product.organization_id = new.organization_id and product.id = active.supplier_product_id
  left join public.organization_material_supplier_prices price
    on price.organization_id = new.organization_id and price.id = active.supplier_price_id
  left join public.worksheet_material_price_bindings existing
    on existing.id = active.binding_id
  left join lateral public.resolve_material_supplier_product_prices(
    new.organization_id,
    active.evaluated_at,
    array[active.supplier_product_id]
  ) effective on effective.price_id = active.supplier_price_id
  where material.id is null
    or supplier.id is null
    or product.id is null
    or price.id is null
    or product.material_id is distinct from material.id
    or product.supplier_id is distinct from supplier.id
    or price.supplier_product_id is distinct from product.id
    or price.material_id is distinct from material.id
    or price.supplier_id is distinct from supplier.id
    or effective.price_id is null
    or (active.cell_data->>'value')::numeric is distinct from price.unit_cost
    or (active.metadata #>> '{snapshot,unitCost}')::numeric is distinct from price.unit_cost
    or active.metadata #>> '{snapshot,unit}' is distinct from price.unit
    or upper(active.metadata #>> '{snapshot,currency}') is distinct from upper(price.currency)
    or (active.metadata #>> '{snapshot,priceEffectiveFrom}')::timestamptz is distinct from price.effective_from
    or (existing.id is not null and (
      existing.organization_id <> new.organization_id
      or existing.workbook_id <> new.workbook_id
      or existing.sheet_id <> new.id
      or existing.organization_material_id <> active.material_id
      or existing.supplier_id <> active.supplier_id
      or existing.supplier_product_id <> active.supplier_product_id
      or existing.supplier_price_id <> active.supplier_price_id
    ))
  limit 1;

  if v_invalid_cell_address is not null then
    raise exception 'worksheet_material_pricing:invalid_binding_evidence:%', v_invalid_cell_address using errcode = '42501';
  end if;

  -- Deactivate missing bindings first so undo can safely reactivate an older
  -- binding at an address currently occupied by a newer binding.
  update public.worksheet_material_price_bindings binding
  set binding_state = case
        when exists (
          select 1 from jsonb_each(v_cells) cell
          where cell.key = binding.current_cell_address
            and cell.value #>> '{metadata,materialPricing,bindingId}' is not null
        ) then 'replaced'
        when (v_cells -> binding.current_cell_address) is null then 'removed'
        else 'detached'
      end,
      replaced_by_binding_id = (
        select (cell.value #>> '{metadata,materialPricing,bindingId}')::uuid
        from jsonb_each(v_cells) cell
        where cell.key = binding.current_cell_address
          and cell.value #>> '{metadata,materialPricing,bindingId}' is not null
        limit 1
      ),
      state_changed_at = statement_timestamp()
  where binding.organization_id = new.organization_id
    and binding.workbook_id = new.workbook_id
    and binding.sheet_id = new.id
    and binding.binding_state = 'active'
    and not exists (
      select 1 from jsonb_each(v_cells) cell
      where cell.value #>> '{metadata,materialPricing,bindingId}' = binding.id::text
    );

  insert into public.worksheet_material_price_bindings (
    id, organization_id, workbook_id, sheet_id,
    current_cell_address, insertion_cell_address,
    organization_material_id, supplier_id, supplier_product_id, supplier_price_id,
    inserted_unit_cost, unit_snapshot, currency_snapshot,
    source_tax_basis_snapshot, source_tax_rate_snapshot, tax_jurisdiction_code_snapshot,
    material_name_snapshot, supplier_name_snapshot,
    supplier_product_description_snapshot, supplier_sku_snapshot,
    price_effective_from, effective_price_evaluated_at,
    inserted_by, inserted_at, binding_state, state_changed_at
  )
  select
    (metadata->>'bindingId')::uuid,
    new.organization_id,
    new.workbook_id,
    new.id,
    cell.cell_address,
    cell.cell_address,
    material.id,
    supplier.id,
    product.id,
    price.id,
    price.unit_cost,
    price.unit,
    price.currency,
    price.source_tax_basis,
    price.source_tax_rate,
    price.tax_jurisdiction_code,
    material.name,
    supplier.name,
    coalesce(product.supplier_description, price.supplier_description),
    coalesce(product.supplier_sku, price.supplier_sku),
    price.effective_from,
    (metadata #>> '{snapshot,evaluatedAt}')::timestamptz,
    v_actor,
    statement_timestamp(),
    'active',
    statement_timestamp()
  from (
    select
      entry.key as cell_address,
      entry.value #> '{metadata,materialPricing}' as metadata
    from jsonb_each(v_cells) entry
    where entry.value #> '{metadata,materialPricing}' is not null
  ) cell
  join public.organization_materials material
    on material.organization_id = new.organization_id
    and material.id = (cell.metadata->>'organizationMaterialId')::uuid
  join public.organization_suppliers supplier
    on supplier.organization_id = new.organization_id
    and supplier.id = (cell.metadata->>'supplierId')::uuid
  join public.organization_material_supplier_products product
    on product.organization_id = new.organization_id
    and product.id = (cell.metadata->>'supplierProductId')::uuid
  join public.organization_material_supplier_prices price
    on price.organization_id = new.organization_id
    and price.id = (cell.metadata->>'supplierPriceId')::uuid
  on conflict (id) do update
  set current_cell_address = excluded.current_cell_address,
      binding_state = 'active',
      replaced_by_binding_id = null,
      state_changed_at = statement_timestamp();

  return new;
end;
$$;

create trigger reconcile_worksheet_material_price_bindings_on_save
after insert or update of worksheet_data on public.opportunity_pricing_workbook_sheets
for each row execute function public.reconcile_worksheet_material_price_bindings();

revoke all on function public.reject_worksheet_material_price_binding_history_mutation() from public, anon, authenticated;
revoke all on function public.reconcile_worksheet_material_price_bindings() from public, anon, authenticated;

create or replace function public.regenerate_worksheet_material_binding_ids(p_worksheet_data jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_result jsonb := coalesce(p_worksheet_data, '{}'::jsonb);
  v_cell record;
begin
  for v_cell in
    select cell.key
    from jsonb_each(coalesce(v_result->'cells', '{}'::jsonb)) cell
    where cell.value #> '{metadata,materialPricing}' is not null
  loop
    v_result := jsonb_set(
      v_result,
      array['cells', v_cell.key, 'metadata', 'materialPricing', 'bindingId'],
      to_jsonb(gen_random_uuid()::text),
      false
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.regenerate_worksheet_material_binding_ids(jsonb) from public, anon;
grant execute on function public.regenerate_worksheet_material_binding_ids(jsonb) to authenticated;

create or replace function public.duplicate_opportunity_pricing_workbook(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_workbook_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_workbook public.opportunity_pricing_worksheets%rowtype;
  v_default_source_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_inserted_workbook public.opportunity_pricing_worksheets%rowtype;
  v_inserted_default_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_inserted_sheet public.opportunity_pricing_workbook_sheets%rowtype;
  v_sheet_record public.opportunity_pricing_workbook_sheets%rowtype;
  v_duplicate_name text;
  v_parent_worksheet_data jsonb;
  v_sheet_worksheet_data jsonb;
  v_parent_pricing_summary jsonb;
  v_parent_extracted_pricing_data jsonb;
  v_parent_version integer;
  v_payload_sheets jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Pricing worksheet actor mismatch.' using errcode = '42501';
  end if;

  select *
  into v_source_workbook
  from public.opportunity_pricing_worksheets
  where id = p_workbook_id
    and organization_id = p_organization_id
    and opportunity_id = p_opportunity_id
    and archived_at is null;

  if not found then
    raise exception 'Pricing worksheet not found.';
  end if;

  select *
  into v_default_source_sheet
  from public.opportunity_pricing_workbook_sheets sheet
  where sheet.workbook_id = p_workbook_id
    and sheet.organization_id = p_organization_id
    and sheet.opportunity_id = p_opportunity_id
  order by sheet.is_default desc, sheet.sheet_order asc, sheet.created_at asc
  limit 1;

  v_duplicate_name := public._normalize_opportunity_pricing_workbook_name(
    v_source_workbook.name || ' Copy',
    'Worksheet Copy'
  );

  if v_default_source_sheet.id is null then
    v_parent_worksheet_data := public.regenerate_worksheet_material_binding_ids(
      public._sync_opportunity_pricing_workbook_sheet_name(
        v_source_workbook.worksheet_data,
        coalesce(nullif(trim(v_source_workbook.name), ''), 'Pricing Worksheet')
      )
    );
    v_parent_pricing_summary := v_source_workbook.pricing_summary;
    v_parent_extracted_pricing_data := v_source_workbook.extracted_pricing_data;
    v_parent_version := greatest(coalesce(v_source_workbook.version, 1), 1);
  else
    v_parent_worksheet_data := public.regenerate_worksheet_material_binding_ids(
      public._sync_opportunity_pricing_workbook_sheet_name(
        v_default_source_sheet.worksheet_data,
        v_default_source_sheet.name
      )
    );
    v_parent_pricing_summary := v_default_source_sheet.pricing_summary;
    v_parent_extracted_pricing_data := v_default_source_sheet.extracted_pricing_data;
    v_parent_version := greatest(coalesce(v_default_source_sheet.version, 1), 1);
  end if;

  insert into public.opportunity_pricing_worksheets (
    organization_id,
    opportunity_id,
    name,
    trade_package,
    worksheet_data,
    pricing_summary,
    extracted_pricing_data,
    version,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    p_opportunity_id,
    v_duplicate_name,
    v_source_workbook.trade_package,
    v_parent_worksheet_data,
    coalesce(v_parent_pricing_summary, '{}'::jsonb),
    coalesce(v_parent_extracted_pricing_data, '{}'::jsonb),
    v_parent_version,
    p_user_id,
    p_user_id
  )
  returning * into v_inserted_workbook;

  if v_default_source_sheet.id is null then
    insert into public.opportunity_pricing_workbook_sheets (
      workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
      worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
    )
    values (
      v_inserted_workbook.id,
      p_organization_id,
      p_opportunity_id,
      coalesce(nullif(trim(v_source_workbook.name), ''), 'Pricing Worksheet'),
      0,
      true,
      v_parent_worksheet_data,
      coalesce(v_parent_pricing_summary, '{}'::jsonb),
      coalesce(v_parent_extracted_pricing_data, '{}'::jsonb),
      v_parent_version,
      p_user_id,
      p_user_id
    )
    returning * into v_inserted_default_sheet;

    v_payload_sheets := jsonb_build_array(to_jsonb(v_inserted_default_sheet));
  else
    for v_sheet_record in
      select *
      from public.opportunity_pricing_workbook_sheets sheet
      where sheet.workbook_id = p_workbook_id
        and sheet.organization_id = p_organization_id
        and sheet.opportunity_id = p_opportunity_id
      order by sheet.sheet_order asc, sheet.created_at asc
    loop
      v_sheet_worksheet_data := case
        when v_sheet_record.id = v_default_source_sheet.id then v_parent_worksheet_data
        else public.regenerate_worksheet_material_binding_ids(
          public._sync_opportunity_pricing_workbook_sheet_name(
            v_sheet_record.worksheet_data,
            v_sheet_record.name
          )
        )
      end;

      insert into public.opportunity_pricing_workbook_sheets (
        workbook_id, organization_id, opportunity_id, name, sheet_order, is_default,
        worksheet_data, pricing_summary, extracted_pricing_data, version, created_by, updated_by
      )
      values (
        v_inserted_workbook.id,
        p_organization_id,
        p_opportunity_id,
        v_sheet_record.name,
        v_sheet_record.sheet_order,
        v_sheet_record.is_default,
        v_sheet_worksheet_data,
        coalesce(v_sheet_record.pricing_summary, '{}'::jsonb),
        coalesce(v_sheet_record.extracted_pricing_data, '{}'::jsonb),
        greatest(coalesce(v_sheet_record.version, 1), 1),
        p_user_id,
        p_user_id
      )
      returning * into v_inserted_sheet;

      v_payload_sheets := v_payload_sheets || jsonb_build_array(to_jsonb(v_inserted_sheet));
    end loop;
  end if;

  return jsonb_build_object(
    'workbook', to_jsonb(v_inserted_workbook),
    'sheets', v_payload_sheets
  );
end;
$$;

grant execute on function public.duplicate_opportunity_pricing_workbook(uuid, uuid, uuid, uuid) to authenticated;

commit;
