begin;

create or replace function public.create_supplier_product_with_initial_price(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := (p_input->>'organization_id')::uuid;
  v_actor uuid;
  v_material_id uuid := (p_input->>'material_id')::uuid;
  v_supplier_id uuid := (p_input->>'supplier_id')::uuid;
  v_sku text := nullif(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_input->>'supplier_sku'), '\s+', ' ', 'g')), '');
  v_description text := nullif(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_input->>'supplier_description'), '\s+', ' ', 'g')), '');
  v_unit text := pg_catalog.btrim(p_input->>'supplier_unit');
  v_normalized_unit text := pg_catalog.lower(pg_catalog.regexp_replace(v_unit, '\s+', ' ', 'g'));
  v_variant text := coalesce(nullif(pg_catalog.btrim(p_input->>'identity_variant'), ''), 'default');
  v_key text := pg_catalog.btrim(p_input->>'idempotency_key');
  v_product public.organization_material_supplier_products%rowtype;
  v_existing_price public.organization_material_supplier_prices%rowtype;
  v_result jsonb;
begin
  v_actor := public.materials_phase1f_require_writer(v_org);
  if not exists (select 1 from public.organization_materials where organization_id = v_org and id = v_material_id) then
    perform public.materials_phase1f_error('material_not_found');
  end if;
  if not exists (select 1 from public.organization_suppliers where organization_id = v_org and id = v_supplier_id) then
    perform public.materials_phase1f_error('supplier_not_found');
  end if;
  if nullif(v_unit, '') is null then
    perform public.materials_phase1f_error('invalid_unit');
  end if;
  if v_sku is null and v_description is null then
    perform public.materials_phase1f_error('identity_required');
  end if;
  if v_key is null or v_key = '' then
    perform public.materials_phase1f_error('idempotency_key_required');
  end if;

  select * into v_product
  from public.organization_material_supplier_products
  where organization_id = v_org
    and material_id = v_material_id
    and supplier_id = v_supplier_id
    and normalized_supplier_unit = v_normalized_unit
    and identity_variant = v_variant
    and identity_status = 'confirmed'
    and archived_at is null
    and (
      (v_sku is not null and normalized_supplier_sku = v_sku)
      or
      (v_sku is null and normalized_supplier_sku is null and normalized_supplier_description = v_description)
    )
  order by id
  limit 1
  for update;

  if v_product.id is not null then
    select * into v_existing_price
    from public.organization_material_supplier_prices
    where organization_id = v_org
      and supplier_product_id = v_product.id
      and idempotency_key = v_key;
    if v_existing_price.id is null then
      perform public.materials_phase1f_error('identity_conflict');
    end if;
    if v_existing_price.unit_cost is distinct from (p_input->>'unit_cost')::numeric
      or v_existing_price.currency is distinct from pg_catalog.upper(pg_catalog.btrim(coalesce(p_input->>'currency', 'NZD')))
      or v_existing_price.source is distinct from coalesce(p_input->>'source', 'manual')
      or ((p_input ? 'effective_from') and v_existing_price.effective_from is distinct from (p_input->>'effective_from')::timestamptz) then
      perform public.materials_phase1f_error('idempotency_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'supplier_product_id', v_product.id,
      'price_id', v_existing_price.id,
      'supersedes_price_id', v_existing_price.supersedes_price_id,
      'idempotent_replay', true,
      'created_product', false
    );
  end if;

  begin
    insert into public.organization_material_supplier_products (
      organization_id, material_id, supplier_id, supplier_sku,
      supplier_description, supplier_unit, identity_variant, identity_status,
      is_preferred, created_source, created_by, updated_by, metadata
    ) values (
      v_org, v_material_id, v_supplier_id,
      nullif(pg_catalog.btrim(p_input->>'supplier_sku'), ''),
      nullif(pg_catalog.btrim(p_input->>'supplier_description'), ''),
      v_unit, v_variant, 'confirmed', false,
      coalesce(p_input->>'created_source', 'manual'), v_actor, v_actor,
      coalesce(p_input->'product_metadata', '{}'::jsonb)
    ) returning * into v_product;
  exception when unique_violation then
    perform public.materials_phase1f_error('identity_conflict');
  end;

  insert into public.organization_material_supplier_product_assignments (
    organization_id, supplier_product_id, previous_material_id, new_material_id,
    reason, created_by, metadata
  ) values (
    v_org, v_product.id, null, v_material_id,
    'Initial Supplier Product assignment.', v_actor,
    pg_catalog.jsonb_build_object('operation', 'phase1f_create_product')
  );

  v_result := public.materials_phase1f_add_price_internal(
    v_org, v_product.id, (p_input->>'unit_cost')::numeric,
    coalesce(p_input->>'currency', 'NZD'),
    coalesce((p_input->>'effective_from')::timestamptz, statement_timestamp()),
    p_input ? 'effective_from', coalesce(p_input->>'source', 'manual'),
    v_key, null, null, p_input->'observation_metadata'
  );

  if coalesce((p_input->>'is_preferred')::boolean, false) then
    perform public.materials_phase1f_set_preferred_internal(v_org, v_material_id, v_product.id);
  end if;

  return v_result || pg_catalog.jsonb_build_object('created_product', true);
end;
$$;

revoke all on function public.create_supplier_product_with_initial_price(jsonb) from public, anon;
grant execute on function public.create_supplier_product_with_initial_price(jsonb) to authenticated;

do $$
declare
  v_actor uuid;
  v_org uuid;
  v_material_id uuid;
  v_supplier_id uuid;
  v_first jsonb;
  v_retry jsonb;
begin
  select member.user_id, product.organization_id, product.material_id, product.supplier_id
  into v_actor, v_org, v_material_id, v_supplier_id
  from public.organization_material_supplier_products product
  join public.organization_members member
    on member.organization_id = product.organization_id
   and member.role in ('owner', 'admin', 'qs', 'project_manager')
  order by product.id, member.user_id
  limit 1;
  if v_actor is null then
    raise notice 'Phase 1F create-idempotency probe skipped: no writable fixture.';
    return;
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
  begin
    v_first := public.create_supplier_product_with_initial_price(pg_catalog.jsonb_build_object(
      'organization_id', v_org, 'material_id', v_material_id, 'supplier_id', v_supplier_id,
      'supplier_sku', 'phase1f-create-idempotency-probe', 'supplier_unit', 'phase1f-idempotency-unit',
      'unit_cost', 1, 'currency', 'NZD', 'source', 'api',
      'idempotency_key', 'phase1f-create-idempotency-probe'
    ));
    v_retry := public.create_supplier_product_with_initial_price(pg_catalog.jsonb_build_object(
      'organization_id', v_org, 'material_id', v_material_id, 'supplier_id', v_supplier_id,
      'supplier_sku', 'phase1f-create-idempotency-probe', 'supplier_unit', 'phase1f-idempotency-unit',
      'unit_cost', 1, 'currency', 'NZD', 'source', 'api',
      'idempotency_key', 'phase1f-create-idempotency-probe'
    ));
    if (v_first->>'price_id') <> (v_retry->>'price_id')
       or (v_retry->>'idempotent_replay')::boolean is not true then
      raise exception 'Phase 1F create idempotency replay failed.';
    end if;
    begin
      perform public.create_supplier_product_with_initial_price(pg_catalog.jsonb_build_object(
        'organization_id', v_org, 'material_id', v_material_id, 'supplier_id', v_supplier_id,
        'supplier_sku', 'phase1f-create-idempotency-probe', 'supplier_unit', 'phase1f-idempotency-unit',
        'unit_cost', 2, 'currency', 'NZD', 'source', 'api',
        'idempotency_key', 'phase1f-create-idempotency-probe'
      ));
      raise exception 'Phase 1F changed create retry was accepted.';
    exception when raise_exception then
      if sqlerrm <> 'materials_phase1f:idempotency_conflict' then raise; end if;
    end;
    raise exception 'phase1f_create_idempotency_probe_rollback';
  exception when raise_exception then
    if sqlerrm = 'phase1f_create_idempotency_probe_rollback' then
      raise notice 'Phase 1F probe passed: exact create retry replays and changed retry rejects.';
    else
      raise;
    end if;
  end;
end;
$$;

commit;
