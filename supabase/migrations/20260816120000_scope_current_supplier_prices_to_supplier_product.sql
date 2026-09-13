begin;

-- Supplier Product is the durable commercial identity. Before replacing the
-- legacy Material/supplier/unit current-price key, fail closed if any existing
-- history would violate the product-scoped timeline invariants.
do $$
declare
  v_rows text;
begin
  select pg_catalog.string_agg(id::text, ', ' order by id::text) into v_rows
  from (
    select price.id
    from public.organization_material_supplier_prices price
    where price.effective_to is not null
      and price.effective_to <= price.effective_from
    order by price.id
    limit 20
  ) invalid_windows;
  if v_rows is not null then
    raise exception 'materials_current_price_scope:invalid_effective_windows:%', v_rows;
  end if;

  select pg_catalog.string_agg(grouped.supplier_product_id::text, ', ' order by grouped.supplier_product_id::text)
  into v_rows
  from (
    select price.supplier_product_id
    from public.organization_material_supplier_prices price
    where price.is_current
    group by price.organization_id, price.supplier_product_id
    having pg_catalog.count(*) > 1
    order by price.supplier_product_id
    limit 20
  ) grouped;
  if v_rows is not null then
    raise exception 'materials_current_price_scope:multiple_current_prices:%', v_rows;
  end if;

  select pg_catalog.string_agg(pair, ', ' order by pair) into v_rows
  from (
    select left_price.id::text || '/' || right_price.id::text as pair
    from public.organization_material_supplier_prices left_price
    join public.organization_material_supplier_prices right_price
      on right_price.organization_id = left_price.organization_id
     and right_price.supplier_product_id = left_price.supplier_product_id
     and right_price.id > left_price.id
     and pg_catalog.tstzrange(left_price.effective_from, left_price.effective_to, '[)')
         && pg_catalog.tstzrange(right_price.effective_from, right_price.effective_to, '[)')
    order by left_price.id, right_price.id
    limit 20
  ) overlapping_pairs;
  if v_rows is not null then
    raise exception 'materials_current_price_scope:overlapping_intervals:%', v_rows;
  end if;

  select pg_catalog.string_agg(price.id::text, ', ' order by price.id::text) into v_rows
  from public.organization_material_supplier_prices price
  left join public.organization_material_supplier_prices predecessor
    on predecessor.organization_id = price.organization_id
   and predecessor.supplier_product_id = price.supplier_product_id
   and predecessor.id = price.supersedes_price_id
  where price.supersedes_price_id is not null
    and predecessor.id is null;
  if v_rows is not null then
    raise exception 'materials_current_price_scope:broken_supersession:%', v_rows;
  end if;

  select pg_catalog.string_agg(price.id::text, ', ' order by price.id::text) into v_rows
  from public.organization_material_supplier_prices price
  left join public.organization_material_supplier_products product
    on product.organization_id = price.organization_id
   and product.id = price.supplier_product_id
  where product.id is null;
  if v_rows is not null then
    raise exception 'materials_current_price_scope:orphan_supplier_product:%', v_rows;
  end if;
end;
$$;

-- This legacy key predates first-class Supplier Products and incorrectly
-- conflates distinct products that happen to share a Material, supplier, and
-- unit. organization_id is retained in the replacement key so its ownership
-- boundary is explicit and consistent with every product-scoped lookup.
drop index if exists public.organization_material_supplier_prices_current_key;

create unique index organization_material_supplier_prices_current_product_key
  on public.organization_material_supplier_prices (organization_id, supplier_product_id)
  where is_current = true;

-- Keep one canonical immutable price-version engine for manual and import
-- writes, while returning stable errors before a zero-length handoff or an
-- unrelated unique constraint can be mislabeled as an interval overlap.
create or replace function public.materials_phase1f_add_price_internal(
  p_organization_id uuid,
  p_supplier_product_id uuid,
  p_unit_cost numeric,
  p_currency text,
  p_effective_from timestamptz,
  p_effective_was_explicit boolean,
  p_source text,
  p_idempotency_key text,
  p_import_batch_id uuid,
  p_import_row_id uuid,
  p_observation_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.organization_material_supplier_products%rowtype;
  v_existing public.organization_material_supplier_prices%rowtype;
  v_current public.organization_material_supplier_prices%rowtype;
  v_new public.organization_material_supplier_prices%rowtype;
  v_currency text := pg_catalog.upper(pg_catalog.btrim(p_currency));
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_now timestamptz := statement_timestamp();
  v_constraint_name text;
begin
  if p_unit_cost is null or p_unit_cost < 0 then
    perform public.materials_phase1f_error('invalid_price');
  end if;
  if v_currency is null or v_currency = '' then
    perform public.materials_phase1f_error('invalid_currency');
  end if;
  if v_key is null or v_key = '' then
    perform public.materials_phase1f_error('idempotency_key_required');
  end if;
  if p_source not in ('manual', 'import', 'supplier_invoice', 'purchase_order', 'api') then
    perform public.materials_phase1f_error('invalid_source');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = p_organization_id and id = p_supplier_product_id
  for update;
  if not found then
    perform public.materials_phase1f_error('supplier_product_not_found');
  end if;
  if not v_product.is_active or v_product.archived_at is not null then
    perform public.materials_phase1f_error('supplier_product_inactive');
  end if;

  select * into v_existing
  from public.organization_material_supplier_prices
  where organization_id = p_organization_id
    and supplier_product_id = p_supplier_product_id
    and idempotency_key = v_key;

  if v_existing.id is not null then
    if v_existing.unit_cost is distinct from p_unit_cost
      or v_existing.currency is distinct from v_currency
      or (p_effective_was_explicit and v_existing.effective_from is distinct from p_effective_from)
      or v_existing.source is distinct from p_source
      or v_existing.import_batch_id is distinct from p_import_batch_id
      or v_existing.import_row_id is distinct from p_import_row_id then
      perform public.materials_phase1f_error('idempotency_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', p_supplier_product_id,
      'price_id', v_existing.id,
      'idempotent_replay', true
    );
  end if;

  if p_effective_from > v_now + interval '1 second' then
    perform public.materials_phase1f_error('future_price_requires_read_cutover');
  end if;

  if p_import_batch_id is not null and not exists (
    select 1 from public.organization_material_import_batches
    where organization_id = p_organization_id and id = p_import_batch_id
  ) then
    perform public.materials_phase1f_error('organization_mismatch');
  end if;
  if p_import_row_id is not null and not exists (
    select 1 from public.organization_material_import_rows
    where organization_id = p_organization_id
      and id = p_import_row_id
      and (p_import_batch_id is null or import_batch_id = p_import_batch_id)
  ) then
    perform public.materials_phase1f_error('organization_mismatch');
  end if;

  select * into v_current
  from public.organization_material_supplier_prices
  where organization_id = p_organization_id
    and supplier_product_id = p_supplier_product_id
    and is_current = true
  order by effective_from desc, id
  limit 1
  for update;

  if v_current.id is not null and p_effective_from = v_current.effective_from then
    perform public.materials_phase1f_error('price_effective_start_conflict');
  end if;
  if v_current.id is not null and p_effective_from < v_current.effective_from then
    perform public.materials_phase1f_error('unsupported_backdated_price');
  end if;
  if v_current.id is null and exists (
    select 1 from public.organization_material_supplier_prices
    where organization_id = p_organization_id
      and supplier_product_id = p_supplier_product_id
      and effective_from > p_effective_from
  ) then
    perform public.materials_phase1f_error('unsupported_backdated_price');
  end if;

  if v_current.id is not null then
    begin
      update public.organization_material_supplier_prices
      set is_current = false,
          is_preferred = false,
          effective_to = p_effective_from
      where organization_id = p_organization_id and id = v_current.id;
    exception when exclusion_violation then
      perform public.materials_phase1f_error('price_interval_conflict');
    end;
  end if;

  if v_product.is_preferred then
    update public.organization_material_supplier_prices
    set is_preferred = false
    where organization_id = p_organization_id
      and material_id = v_product.material_id
      and is_current = true
      and is_preferred = true;
  end if;

  begin
    insert into public.organization_material_supplier_prices (
      organization_id, material_id, supplier_id, supplier_product_id,
      import_batch_id, import_row_id, supersedes_price_id, idempotency_key,
      supplier_sku, supplier_description, unit, unit_cost, currency,
      is_preferred, is_current, source, effective_from, effective_to,
      created_by, observation_metadata
    ) values (
      p_organization_id, v_product.material_id, v_product.supplier_id, v_product.id,
      p_import_batch_id, p_import_row_id, v_current.id, v_key,
      v_product.supplier_sku, v_product.supplier_description, v_product.supplier_unit,
      p_unit_cost, v_currency, v_product.is_preferred, true, p_source,
      p_effective_from, null, auth.uid(), p_observation_metadata
    ) returning * into v_new;
  exception
    when exclusion_violation then
      perform public.materials_phase1f_error('price_interval_conflict');
    when unique_violation then
      get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
      if v_constraint_name = 'organization_material_supplier_prices_current_product_key' then
        perform public.materials_phase1f_error('current_price_identity_conflict');
      end if;
      perform public.materials_phase1f_error('constraint_failure');
  end;

  return pg_catalog.jsonb_build_object(
    'supplier_product_id', v_product.id,
    'price_id', v_new.id,
    'supersedes_price_id', v_new.supersedes_price_id,
    'idempotent_replay', false
  );
end;
$$;

-- The unique current row and no-overlap trigger are complementary. Verify the
-- latter still exists and retains half-open [) range semantics.
do $$
declare
  v_trigger_definition text;
  v_function_definition text;
begin
  select pg_catalog.pg_get_triggerdef(trigger.oid), pg_catalog.pg_get_functiondef(proc.oid)
  into v_trigger_definition, v_function_definition
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_proc proc on proc.oid = trigger.tgfoid
  join pg_catalog.pg_class relation on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'organization_material_supplier_prices'
    and trigger.tgname = 'organization_material_supplier_prices_interval_guard'
    and not trigger.tgisinternal;

  if v_trigger_definition is null
    or v_function_definition is null
    or pg_catalog.strpos(v_function_definition, 'tstzrange') = 0
    or pg_catalog.strpos(v_function_definition, '''[)''') = 0 then
    raise exception 'materials_current_price_scope:interval_guard_missing_or_changed';
  end if;
end;
$$;

-- Rollback-isolated live contract proof. When an organization has catalogue
-- seed data, exercise the real table, replacement index, interval trigger, and
-- canonical version engine. The deliberate P0002 exception rolls every proof
-- row back before the migration continues.
do $$
declare
  v_organization_id uuid;
  v_material_id uuid;
  v_supplier_id uuid;
  v_product_a uuid;
  v_product_b uuid;
  v_product_c uuid;
  v_price_b uuid;
  v_suffix text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_t1 timestamptz := statement_timestamp() - interval '3 days';
  v_t2 timestamptz := statement_timestamp() - interval '2 days';
  v_t3 timestamptz := statement_timestamp() - interval '1 day';
  v_constraint_name text;
  v_rejected boolean := false;
begin
  select material.organization_id, material.id, supplier.id
  into v_organization_id, v_material_id, v_supplier_id
  from public.organization_materials material
  join public.organization_suppliers supplier
    on supplier.organization_id = material.organization_id
  order by material.created_at, supplier.created_at
  limit 1;

  if v_organization_id is null then
    raise notice 'materials_current_price_scope:live_contract_skipped_empty_catalogue';
    return;
  end if;

  begin
    insert into public.organization_material_supplier_products (
      organization_id, material_id, supplier_id, supplier_description,
      supplier_unit, identity_status, created_source
    ) values (
      v_organization_id, v_material_id, v_supplier_id,
      'GIB Standard 13mm [scope proof ' || v_suffix || ']', 'm2', 'confirmed', 'api'
    ) returning id into v_product_a;
    insert into public.organization_material_supplier_products (
      organization_id, material_id, supplier_id, supplier_description,
      supplier_unit, identity_status, created_source
    ) values (
      v_organization_id, v_material_id, v_supplier_id,
      'GIB Fyreline 13mm [scope proof ' || v_suffix || ']', 'm2', 'confirmed', 'api'
    ) returning id into v_product_b;
    insert into public.organization_material_supplier_products (
      organization_id, material_id, supplier_id, supplier_description,
      supplier_unit, identity_status, created_source
    ) values (
      v_organization_id, v_material_id, v_supplier_id,
      'scope-proof-boundary-' || v_suffix, 'm2', 'confirmed', 'api'
    ) returning id into v_product_c;

    insert into public.organization_material_supplier_prices (
      organization_id, material_id, supplier_id, supplier_product_id,
      unit, unit_cost, currency, is_current, source, effective_from,
      idempotency_key
    ) values
      (v_organization_id, v_material_id, v_supplier_id, v_product_a, 'm2', 10, 'NZD', true, 'api', v_t1, 'scope-proof-a-' || v_suffix),
      (v_organization_id, v_material_id, v_supplier_id, v_product_b, 'm2', 12, 'NZD', true, 'api', v_t1, 'scope-proof-b-' || v_suffix);

    if (
      select pg_catalog.count(*)
      from public.organization_material_supplier_prices
      where supplier_product_id in (v_product_a, v_product_b) and is_current
    ) <> 2 then
      raise exception 'materials_current_price_scope:distinct_product_contract_failed';
    end if;

    update public.organization_material_supplier_prices
    set effective_to = v_t2
    where supplier_product_id = v_product_a and is_current;
    begin
      insert into public.organization_material_supplier_prices (
        organization_id, material_id, supplier_id, supplier_product_id,
        unit, unit_cost, currency, is_current, source, effective_from,
        idempotency_key
      ) values (
        v_organization_id, v_material_id, v_supplier_id, v_product_a,
        'm2', 11, 'NZD', true, 'api', v_t2, 'scope-proof-a-next-' || v_suffix
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;
      if v_constraint_name <> 'organization_material_supplier_prices_current_product_key' then
        raise;
      end if;
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception 'materials_current_price_scope:same_product_current_not_rejected';
    end if;

    v_rejected := false;
    begin
      insert into public.organization_material_supplier_prices (
        organization_id, material_id, supplier_id, supplier_product_id,
        unit, unit_cost, currency, is_current, source, effective_from,
        idempotency_key
      ) values (
        v_organization_id, v_material_id, v_supplier_id, v_product_b,
        'm2', 12.5, 'NZD', false, 'api', v_t2, 'scope-proof-overlap-' || v_suffix
      );
    exception when exclusion_violation then
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception 'materials_current_price_scope:true_overlap_not_rejected';
    end if;

    insert into public.organization_material_supplier_prices (
      organization_id, material_id, supplier_id, supplier_product_id,
      unit, unit_cost, currency, is_current, source, effective_from,
      effective_to, idempotency_key
    ) values
      (v_organization_id, v_material_id, v_supplier_id, v_product_c, 'm2', 20, 'NZD', false, 'api', v_t1, v_t2, 'scope-proof-boundary-old-' || v_suffix),
      (v_organization_id, v_material_id, v_supplier_id, v_product_c, 'm2', 21, 'NZD', true, 'api', v_t2, null, 'scope-proof-boundary-new-' || v_suffix);

    select id into v_price_b
    from public.organization_material_supplier_prices
    where supplier_product_id = v_product_b and is_current;
    perform public.materials_phase1f_add_price_internal(
      v_organization_id, v_product_b, 13, 'NZD', v_t3, true, 'api',
      'scope-proof-version-' || v_suffix, null, null, '{}'::jsonb
    );
    if not exists (
      select 1 from public.organization_material_supplier_prices
      where id = v_price_b and not is_current and effective_to = v_t3
    ) or not exists (
      select 1 from public.organization_material_supplier_prices
      where supplier_product_id = v_product_b
        and is_current and effective_from = v_t3 and supersedes_price_id = v_price_b
    ) then
      raise exception 'materials_current_price_scope:version_handoff_failed';
    end if;

    raise exception 'materials_current_price_scope:rollback_live_contract' using errcode = 'P0002';
  exception when sqlstate 'P0002' then
    null;
  end;
end;
$$;

commit;
